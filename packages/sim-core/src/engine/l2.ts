import { vlanExists } from '../model/config.js';
import type { CableEnd, Network } from '../model/network.js';
import type { MacEntry } from '../ios/environment.js';
import { ALL_VLANS } from '../ios/vlan-list.js';

export const BROADCAST_MAC = 'ffff.ffff.ffff';

export interface EthernetFrame {
  src: string;
  dst: string;
  /** 802.1Q tag as it is on the wire; absent on untagged frames. */
  vlanTag?: number;
  /** ARP or IP content, interpreted by engine/l3. */
  payload?: unknown;
}

export interface Delivery {
  device: string;
  port: string;
  frame: EthernetFrame;
}

export interface Drop {
  device: string;
  port: string;
  reason: 'link-down' | 'tagged-frame-on-access-port' | 'vlan-not-allowed' | 'vlan-not-active' | 'loop';
}

export interface FrameTrace {
  /** Frames accepted by end hosts and routers (a NIC keeps only broadcasts and its own unicasts). */
  deliveries: Delivery[];
  drops: Drop[];
}

export const isGroupAddress = (mac: string): boolean => (parseInt(mac.slice(0, 2), 16) & 1) === 1;

/** Per-switch learned addresses, in learning order. Lives outside the config: a reload clears it. */
export class MacTables {
  private readonly tables = new Map<string, Map<string, MacEntry>>();

  list(device: string): MacEntry[] {
    return [...(this.tables.get(device)?.values() ?? [])];
  }

  learn(device: string, entry: MacEntry): void {
    let table = this.tables.get(device);
    if (!table) this.tables.set(device, (table = new Map()));
    table.set(`${entry.vlan}|${entry.mac}`, entry);
  }

  find(device: string, vlan: number, mac: string): MacEntry | undefined {
    return this.tables.get(device)?.get(`${vlan}|${mac}`);
  }

  clear(device: string): void {
    this.tables.delete(device);
  }

  flushPort(device: string, port: string): void {
    const table = this.tables.get(device);
    if (!table) return;
    for (const [key, entry] of table) if (entry.port === port) table.delete(key);
  }
}

interface Hop {
  /** Port the frame arrives on. */
  at: CableEnd;
  frame: EthernetFrame;
}

interface Run {
  net: Network;
  queue: Hop[];
  visited: Set<string>;
  trace: FrameTrace;
}

function newRun(net: Network): Run {
  return { net, queue: [], visited: new Set(), trace: { deliveries: [], drops: [] } };
}

/**
 * Send a frame out of a port and follow it: VLAN classification (access/trunk, native, allowed list), MAC learning,
 * flooding of broadcast/unknown unicast, 802.1Q tagging on trunks. Frames reaching a host or router are handed to
 * engine/l3. No spanning tree: a (switch, port, VLAN) is visited once per injection, which cuts loops.
 */
export function injectFrame(net: Network, from: CableEnd, frame: EthernetFrame): FrameTrace {
  const run = newRun(net);
  const first = transmit(net, from, frame, run.trace);
  if (first) run.queue.push(first);
  drain(run);
  return run.trace;
}

/** A frame originated by a switch's own management stack (an SVI), sent into the VLAN. */
export function injectFromSwitch(net: Network, deviceId: string, vlan: number, frame: EthernetFrame): FrameTrace {
  const run = newRun(net);
  forward(run, deviceId, vlan, frame, null);
  drain(run);
  return run.trace;
}

function drain(run: Run): void {
  const { net, queue, trace } = run;
  for (let steps = 0; queue.length > 0 && steps < 10_000; steps++) {
    const { at, frame: f } = queue.shift() as Hop;
    const device = net.device(at.device);

    if (!device.cli || device.model.kind !== 'switch') {
      const mac = net.macOf(at.device, at.port);
      if (f.dst === BROADCAST_MAC || isGroupAddress(f.dst) || f.dst === mac) {
        trace.deliveries.push({ device: at.device, port: at.port, frame: f });
        net.l3.receive(at.device, { port: at.port }, f);
      }
      continue;
    }

    const ingress = device.cli.config.interfaces.find((i) => i.name === at.port);
    const sw = ingress?.switchport;
    let vlan: number;
    if (sw?.mode === 'trunk') {
      vlan = f.vlanTag ?? sw.trunkNative ?? 1;
      if (!(sw.trunkAllowed ?? ALL_VLANS).includes(vlan)) {
        trace.drops.push({ device: at.device, port: at.port, reason: 'vlan-not-allowed' });
        continue;
      }
    } else {
      if (f.vlanTag !== undefined) {
        trace.drops.push({ device: at.device, port: at.port, reason: 'tagged-frame-on-access-port' });
        continue;
      }
      vlan = sw?.accessVlan ?? 1;
    }
    if (!vlanExists(device.cli.config, vlan)) {
      trace.drops.push({ device: at.device, port: at.port, reason: 'vlan-not-active' });
      continue;
    }
    const key = `${at.device}|${at.port}|${vlan}`;
    if (run.visited.has(key)) {
      trace.drops.push({ device: at.device, port: at.port, reason: 'loop' });
      continue;
    }
    run.visited.add(key);

    if (!isGroupAddress(f.src)) net.macTables.learn(at.device, { vlan, mac: f.src, port: at.port });
    forward(run, at.device, vlan, f, at.port);
  }
}

/** Switching decision for a frame already classified into `vlan`. `ingressPort` is null for the switch's own CPU. */
function forward(run: Run, deviceId: string, vlan: number, f: EthernetFrame, ingressPort: string | null): void {
  const { net, trace } = run;
  const device = net.device(deviceId);
  const config = device.cli!.config;

  // The management SVI of this VLAN is a station inside the switch: it takes broadcasts and frames sent to its MAC.
  if (ingressPort !== null) {
    const svi = config.interfaces.find((i) => i.name === `Vlan${vlan}` && i.ip && !i.shutdown);
    if (svi && net.linkState(deviceId, svi.name).status === 'up') {
      const sviMac = net.macOf(deviceId, svi.name);
      if (f.dst === BROADCAST_MAC || isGroupAddress(f.dst) || f.dst === sviMac) net.l3.receive(deviceId, { vlan }, f);
      if (f.dst === sviMac) return;
    }
  }

  const known = isGroupAddress(f.dst) ? undefined : net.macTables.find(deviceId, vlan, f.dst);
  const candidates = config.interfaces.filter((i) => i.name !== ingressPort && memberOf(net, deviceId, i.name, vlan));
  const egress = known ? candidates.filter((i) => i.name === known.port) : candidates;

  for (const out of egress) {
    const tagged = out.switchport?.mode === 'trunk' && vlan !== (out.switchport.trunkNative ?? 1);
    const outFrame: EthernetFrame = { ...f };
    if (tagged) outFrame.vlanTag = vlan;
    else delete outFrame.vlanTag;
    const hop = transmit(net, { device: deviceId, port: out.name }, outFrame, trace);
    if (hop) run.queue.push(hop);
  }
}

/** Does switch port `port` carry `vlan`, and is its link up? */
export function memberOf(net: Network, deviceId: string, port: string, vlan: number): boolean {
  const device = net.device(deviceId);
  const ifc = device.cli?.config.interfaces.find((i) => i.name === port);
  if (!ifc || !device.model.ports.some((p) => p.name === port && p.kind === 'ethernet')) return false;
  if (net.linkState(deviceId, port).status !== 'up') return false;
  const sw = ifc.switchport;
  if (sw?.mode === 'trunk') return (sw.trunkAllowed ?? ALL_VLANS).includes(vlan);
  return (sw?.accessVlan ?? 1) === vlan;
}

/** Put a frame on the wire at `out`; returns where it arrives, or records a drop when the link is down. */
function transmit(net: Network, out: CableEnd, frame: EthernetFrame, trace: FrameTrace): Hop | null {
  const peer = net.peerOf(out);
  if (!peer || !isUp(net, out) || !isUp(net, peer)) {
    trace.drops.push({ device: out.device, port: out.port, reason: 'link-down' });
    return null;
  }
  return { at: peer, frame };
}

function isUp(net: Network, end: CableEnd): boolean {
  const device = net.device(end.device);
  return device.cli ? net.linkState(end.device, end.port).status === 'up' : net.hostLinkUp(end);
}
