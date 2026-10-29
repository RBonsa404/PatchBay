import { injectFrame, MacTables, memberOf, type EthernetFrame, type FrameTrace } from '../engine/l2.js';
import { L3, type ServiceResult } from '../engine/l3.js';
import { Cli } from '../ios/cli.js';
import { parentOf } from '../ios/interfaces.js';
import type { LinkEnvironment, LinkState, PingResult } from '../ios/environment.js';
import { groupOf } from '../ios/profiles.js';
import { canPlug, copperLinkWorks, type CableType } from '../physical/rules.js';
import { catalog, type DeviceModel, type PortSpec } from './catalog.js';
import { cloneConfig, vlanExists, type DeviceConfig } from './config.js';

export interface CableEnd {
  device: string;
  port: string;
}

/** For serial cables, `a` is the DCE end (the one that provides the clock) and `b` the DTE end. */
export interface Cable {
  type: CableType;
  a: CableEnd;
  b: CableEnd;
}

export interface NetworkOptions {
  /** true: the cable type (straight/crossover) matters; false: auto-MDIX hardware forgives mistakes. */
  strictMdix: boolean;
}

/** IP settings of a PC or server. */
export interface HostConfig {
  ip?: string;
  mask?: string;
  gateway?: string;
  /** Ports this host answers on, e.g. a web server: `{ tcp: [80, 443] }`. */
  services?: { tcp?: number[]; udp?: number[] };
}

export interface Device {
  id: string;
  model: DeviceModel;
  /** Position in insertion order; seeds deterministic MAC addresses. */
  index: number;
  /** IOS command line; routers and switches only. */
  cli?: Cli;
  /** IP settings; PCs and servers only. */
  host?: HostConfig;
}

export type ConnectError = 'unknown-device' | 'unknown-port' | 'same-port' | 'port-busy' | 'incompatible-ports';
export type ConnectResult = { ok: true; cable: Cable } | { ok: false; error: ConnectError };

export interface NetworkSnapshot {
  options: NetworkOptions;
  devices: { id: string; model: string; running?: DeviceConfig; startup?: DeviceConfig | null; host?: HostConfig }[];
  cables: Cable[];
}

const sameEnd = (x: CableEnd, y: CableEnd): boolean => x.device === y.device && x.port === y.port;

/** Devices plus cables, with the physical link state derived from them. Fully serializable via snapshot(). */
export class Network {
  readonly devices = new Map<string, Device>();
  cables: Cable[] = [];

  /** Learned MAC addresses per switch (dynamic state, not part of snapshots). */
  readonly macTables = new MacTables();
  /** ARP, forwarding and ICMP. */
  readonly l3 = new L3(this);

  private readonly lastLinks = new Map<string, LinkState>();
  private readonly syslog = new Map<string, string[]>();

  constructor(readonly options: NetworkOptions = { strictMdix: true }) {}

  addDevice(id: string, modelId: string): Device {
    const model = catalog[modelId];
    if (!model) throw new Error(`Unknown device model: ${modelId}`);
    if (this.devices.has(id)) throw new Error(`Duplicate device id: ${id}`);

    const device: Device = { id, model, index: this.devices.size };
    if (model.profile) device.cli = new Cli({ profile: model.profile, env: this.environmentFor(device) });
    else device.host = {};
    this.devices.set(id, device);
    this.syslog.set(id, []);
    this.reconcile(); // seeds the link table; the new device has no cables so nothing is printed
    return device;
  }

  device(id: string): Device {
    const d = this.devices.get(id);
    if (!d) throw new Error(`Unknown device: ${id}`);
    return d;
  }

  portSpec(end: CableEnd): PortSpec | undefined {
    return this.devices.get(end.device)?.model.ports.find((p) => p.name === end.port);
  }

  cableAt(end: CableEnd): Cable | undefined {
    return this.cables.find((c) => sameEnd(c.a, end) || sameEnd(c.b, end));
  }

  /** The other end of the cable plugged into `end`, if any (console cables included). */
  peerOf(end: CableEnd): CableEnd | undefined {
    const cable = this.cableAt(end);
    if (!cable) return undefined;
    return sameEnd(cable.a, end) ? cable.b : cable.a;
  }

  /** Deterministic MAC address of a port: derived from the device's insertion index and the port's position. */
  macOf(deviceId: string, port: string): string {
    const device = this.device(deviceId);
    const found = device.model.ports.findIndex((p) => p.name === port);
    // SVIs are not ports: give each VLAN its own address, clear of the physical ports.
    const index = found >= 0 ? found : port.startsWith('Vlan') ? 0x1000 + Number(port.slice(4)) : 0;
    return `0001.43${device.index.toString(16).padStart(2, '0')}.${index.toString(16).padStart(4, '0')}`;
  }

  /** Put a frame on the wire at a host port and follow it through the switches. */
  sendFrame(from: CableEnd, frame: EthernetFrame): FrameTrace {
    return injectFrame(this, from, frame);
  }

  /** Set the IP address, mask and default gateway of a PC or server. */
  configureHost(deviceId: string, config: HostConfig): void {
    const device = this.device(deviceId);
    if (!device.host) throw new Error(`${deviceId} is not a host`);
    device.host = { ...config };
  }

  /** Echo requests from any device (PCs included); IOS devices use the `ping` command instead. */
  ping(deviceId: string, destination: string, count = 5): PingResult {
    return this.l3.ping(deviceId, destination, count);
  }

  /** Open a TCP connection from any device to `destination:port` (SYN, SYN-ACK or RST, with ACLs applied on the way). */
  tcpConnect(deviceId: string, destination: string, port: number): ServiceResult {
    return this.l3.tcpConnect(deviceId, destination, port);
  }

  /** Send one UDP datagram and wait for the service's answer. */
  udpSend(deviceId: string, destination: string, port: number): ServiceResult {
    return this.l3.udpSend(deviceId, destination, port);
  }

  /** Is the link at a host port up? True when a working cable reaches a live peer. */
  hostLinkUp(end: CableEnd): boolean {
    const cable = this.cableAt(end);
    if (!cable || cable.type === 'console' || cable.type === 'serial') return false;
    const peer = this.peerOf(end) as CableEnd;
    const peerDevice = this.devices.get(peer.device);
    if (peerDevice?.cli) return this.linkState(peer.device, peer.port).status === 'up';
    return copperLinkWorks(cable.type, this.portSpec(cable.a) as PortSpec, this.portSpec(cable.b) as PortSpec, this.options.strictMdix);
  }

  /** Plug a cable. For `serial`, `a` is the DCE end. A wrong copper cable still plugs in; its link just stays down. */
  connect(type: CableType, a: CableEnd, b: CableEnd): ConnectResult {
    const pa = this.portSpec(a);
    const pb = this.portSpec(b);
    if (!this.devices.has(a.device) || !this.devices.has(b.device)) return { ok: false, error: 'unknown-device' };
    if (!pa || !pb) return { ok: false, error: 'unknown-port' };
    if (sameEnd(a, b)) return { ok: false, error: 'same-port' };
    if (this.cableAt(a) || this.cableAt(b)) return { ok: false, error: 'port-busy' };
    if (!canPlug(type, pa, pb)) return { ok: false, error: 'incompatible-ports' };

    const cable: Cable = { type, a, b };
    this.cables.push(cable);
    this.settle();
    return { ok: true, cable };
  }

  disconnect(end: CableEnd): boolean {
    const cable = this.cableAt(end);
    if (!cable) return false;
    this.cables = this.cables.filter((c) => c !== cable);
    this.settle();
    return true;
  }

  /** The router/switch whose console a PC reaches through its RS232 port, if a console cable is attached. */
  consoleTarget(pcId: string): Device | null {
    const cable = this.cableAt({ device: pcId, port: 'RS232' });
    if (!cable || cable.type !== 'console') return null;
    const other = sameEnd(cable.a, { device: pcId, port: 'RS232' }) ? cable.b : cable.a;
    const target = this.devices.get(other.device);
    return target?.cli ? target : null;
  }

  linkState(deviceId: string, port: string): LinkState {
    const device = this.devices.get(deviceId);
    const cfg = device?.cli?.config.interfaces.find((i) => i.name === port);
    if (!device?.cli || !cfg) return { status: 'down', protocol: 'down' };

    if (cfg.shutdown) return { status: 'administratively down', protocol: 'down' };
    // A subinterface follows its parent interface.
    const parent = parentOf(port);
    if (parent) return this.linkState(deviceId, parent);
    const here: CableEnd = { device: deviceId, port };
    if (device.model.profile && groupOf(device.model.profile, port)?.kind === 'svi') {
      // An SVI is up while its VLAN exists and at least one port in that VLAN has a live link.
      const vlan = Number(port.replace('Vlan', ''));
      const active =
        vlanExists(device.cli.config, vlan) && device.cli.config.interfaces.some((i) => memberOf(this, deviceId, i.name, vlan));
      return active ? { status: 'up', protocol: 'up' } : { status: 'down', protocol: 'down' };
    }

    const cable = this.cableAt(here);
    if (!cable || cable.type === 'console') return { status: 'down', protocol: 'down' };
    const peer = sameEnd(cable.a, here) ? cable.b : cable.a;
    if (this.isShutdown(peer)) return { status: 'down', protocol: 'down' };

    const pa = this.portSpec(cable.a) as PortSpec;
    const pb = this.portSpec(cable.b) as PortSpec;
    if (cable.type === 'serial') {
      // The DCE end must provide a clock; without it the line is up but the protocol stays down.
      const dce = this.devices.get(cable.a.device)?.cli?.config.interfaces.find((i) => i.name === cable.a.port);
      return { status: 'up', protocol: dce?.clockRate !== undefined ? 'up' : 'down' };
    }
    return copperLinkWorks(cable.type, pa, pb, this.options.strictMdix)
      ? { status: 'up', protocol: 'up' }
      : { status: 'down', protocol: 'down' };
  }

  /** Syslog lines queued for a device by events caused elsewhere; reading clears them. */
  drainSyslog(deviceId: string): string[] {
    const queue = this.syslog.get(deviceId) ?? [];
    this.syslog.set(deviceId, []);
    return queue;
  }

  snapshot(): NetworkSnapshot {
    return {
      options: { ...this.options },
      devices: [...this.devices.values()].map((d) => ({
        id: d.id,
        model: d.model.id,
        ...(d.cli ? { running: cloneConfig(d.cli.config), startup: d.cli.startup ? cloneConfig(d.cli.startup) : null } : {}),
        ...(d.host ? { host: { ...d.host } } : {}),
      })),
      cables: this.cables.map((c) => ({ type: c.type, a: { ...c.a }, b: { ...c.b } })),
    };
  }

  static restore(snapshot: NetworkSnapshot): Network {
    const net = new Network(snapshot.options);
    for (const d of snapshot.devices) {
      const device = net.addDevice(d.id, d.model);
      if (device.cli && d.running) device.cli.config = cloneConfig(d.running);
      if (device.cli) device.cli.startup = d.startup ? cloneConfig(d.startup) : null;
      if (d.host) device.host = { ...d.host };
    }
    net.cables = snapshot.cables.map((c) => ({ type: c.type, a: { ...c.a }, b: { ...c.b } }));
    net.lastLinks.clear();
    net.reconcile();
    return net;
  }

  // ---- internals -------------------------------------------------------------------------------------------------

  private isShutdown(end: CableEnd): boolean {
    return this.devices.get(end.device)?.cli?.config.interfaces.find((i) => i.name === end.port)?.shutdown === true;
  }

  private environmentFor(device: Device): LinkEnvironment {
    return {
      linkState: (name) => this.linkState(device.id, name),
      serialEnd: (name) => {
        const cable = this.cableAt({ device: device.id, port: name });
        if (cable?.type !== 'serial') return null;
        return sameEnd(cable.a, { device: device.id, port: name }) ? 'dce' : 'dte';
      },
      // SVIs are not ports: they share the switch's base address (port index 0).
      macAddress: (name) => this.macOf(device.id, name),
      macTable: () => this.macTables.list(device.id),
      clearMacTable: () => this.macTables.clear(device.id),
      ping: (destination, count) => this.l3.ping(device.id, destination, count),
      traceroute: (destination, maxHops) => this.l3.traceroute(device.id, destination, maxHops),
      arpTable: () => this.l3.arpTable(device.id),
      clearArp: () => this.l3.clearArp(device.id),
      aclHits: (aclName, seq) => this.l3.aclHits(device.id, aclName, seq),
      clearAclHits: () => this.l3.clearAclHits(device.id),
      natTranslations: () => this.l3.natTranslations(device.id),
      natCounters: () => this.l3.natCounters(device.id),
      clearNat: () => this.l3.clearNat(device.id),
      commit: () => this.settle(device.id),
      drain: () => this.drainSyslog(device.id),
    };
  }

  /** Re-evaluate every link. Lines for `localDevice` are returned; everyone else's are queued. */
  private settle(localDevice?: string): string[] {
    let local: string[] = [];
    for (const [id, lines] of this.reconcile()) {
      if (id === localDevice) local = lines;
      else this.syslog.get(id)?.push(...lines);
    }
    return local;
  }

  private reconcile(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const device of this.devices.values()) {
      if (!device.cli) continue;
      for (const ifc of device.cli.config.interfaces) {
        const key = `${device.id}|${ifc.name}`;
        const now = this.linkState(device.id, ifc.name);
        const before = this.lastLinks.get(key);
        this.lastLinks.set(key, now);
        if (!before) continue;
        if (before.status === 'up' && now.status !== 'up') this.macTables.flushPort(device.id, ifc.name);
        const lines: string[] = [];
        // IOS stays silent when an interface leaves "administratively down" without gaining a link.
        const crossedUp = (before.status === 'up') !== (now.status === 'up');
        const shutNow = now.status === 'administratively down' && before.status !== now.status;
        if (crossedUp || shutNow) lines.push(`%LINK-5-CHANGED: Interface ${ifc.name}, changed state to ${now.status}`);
        if (before.protocol !== now.protocol) {
          lines.push(`%LINEPROTO-5-UPDOWN: Line protocol on Interface ${ifc.name}, changed state to ${now.protocol}`);
        }
        if (lines.length > 0) out.set(device.id, [...(out.get(device.id) ?? []), ...lines]);
      }
    }
    return out;
  }
}
