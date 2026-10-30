import { injectFrame, MacTables, memberOf, type EthernetFrame, type FrameTrace } from '../engine/l2.js';
import { L3, type ServiceResult } from '../engine/l3.js';
import { Ospf } from '../engine/ospf.js';
import { Cli } from '../ios/cli.js';
import { parentOf } from '../ios/interfaces.js';
import type { LinkEnvironment, LinkState, PingResult } from '../ios/environment.js';
import { groupOf } from '../ios/profiles.js';
import { isIpv4 } from '../ios/syntax.js';
import { maskToPrefix } from '../protocols/l3/ip.js';
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
  /** Set by DHCP. */
  dns?: string;
  /** The address comes from a DHCP server (`ipconfig /renew`). */
  dhcp?: boolean;
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
  devices: { id: string; model: string; index?: number; running?: DeviceConfig; startup?: DeviceConfig | null; host?: HostConfig }[];
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
  /** OSPF, recomputed lazily when `version` moves. */
  readonly ospf = new Ospf(this);
  private changes = 0;

  private readonly lastLinks = new Map<string, LinkState>();
  private readonly syslog = new Map<string, string[]>();
  /** Never reused, so MAC addresses stay unique after a device is removed. */
  private nextIndex = 0;

  constructor(readonly options: NetworkOptions = { strictMdix: true }) {}

  /** Add a device. `index` is only given when restoring a snapshot (it seeds the device's MAC addresses). */
  addDevice(id: string, modelId: string, index?: number): Device {
    const model = catalog[modelId];
    if (!model) throw new Error(`Unknown device model: ${modelId}`);
    if (this.devices.has(id)) throw new Error(`Duplicate device id: ${id}`);

    const device: Device = { id, model, index: index ?? this.nextIndex };
    this.nextIndex = Math.max(this.nextIndex, device.index + 1);
    if (model.profile) device.cli = new Cli({ profile: model.profile, env: this.environmentFor(device) });
    else device.host = {};
    this.devices.set(id, device);
    this.syslog.set(id, []);
    this.reconcile(); // seeds the link table; the new device has no cables so nothing is printed
    return device;
  }

  /** Observers of every frame crossing a cable, in order (used by the game to animate packets). */
  private readonly wireListeners = new Set<(from: CableEnd, to: CableEnd, frame: EthernetFrame) => void>();

  /** Watch frames as they cross cables; returns the function that stops watching. */
  onWire(listener: (from: CableEnd, to: CableEnd, frame: EthernetFrame) => void): () => void {
    this.wireListeners.add(listener);
    return () => this.wireListeners.delete(listener);
  }

  /** Called by the L2 engine for every frame put on a cable. */
  notifyWire(from: CableEnd, to: CableEnd, frame: EthernetFrame): void {
    for (const listener of this.wireListeners) listener(from, to, frame);
  }

  /** Bumped by every configuration or cabling change; derived state (OSPF) is recomputed when it moves. */
  get version(): number {
    return this.changes;
  }

  /** Take a device out of the network: its cables are unplugged (neighbours see their links go down). */
  removeDevice(id: string): boolean {
    if (!this.devices.has(id)) return false;
    this.cables = this.cables.filter((c) => c.a.device !== id && c.b.device !== id);
    this.devices.delete(id);
    this.syslog.delete(id);
    this.macTables.clear(id);
    this.l3.forget(id);
    this.ospf.forget(id);
    for (const key of [...this.lastLinks.keys()]) if (key.startsWith(`${id}|`)) this.lastLinks.delete(key);
    this.settle();
    return true;
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
    for (const [field, value] of [['ip', config.ip], ['mask', config.mask], ['gateway', config.gateway]] as const) {
      if (value !== undefined && !isIpv4(value)) throw new Error(`${deviceId}: invalid ${field} "${value}"`);
    }
    if (config.mask !== undefined && maskToPrefix(config.mask) === null) throw new Error(`${deviceId}: non-contiguous mask "${config.mask}"`);
    device.host = { ...config };
  }

  /** `ipconfig /renew`: the host asks for an address on the network. Returns false when no server answers. */
  dhcpRenew(deviceId: string): boolean {
    const device = this.device(deviceId);
    if (!device.host) throw new Error(`${deviceId} is not a host`);
    const nic = device.model.ports.find((p) => p.kind === 'ethernet');
    if (!nic || !this.hostLinkUp({ device: deviceId, port: nic.name })) return false;
    const lease = this.l3.dhcpRequest(deviceId, nic.name);
    const { services } = device.host;
    if (!lease) {
      device.host = { dhcp: true, ...(services ? { services } : {}) };
      return false;
    }
    device.host = { dhcp: true, ip: lease.ip, mask: lease.mask, ...(lease.gateway ? { gateway: lease.gateway } : {}), ...(lease.dns ? { dns: lease.dns } : {}), ...(services ? { services } : {}) };
    return true;
  }

  /** `ipconfig /release`. */
  dhcpRelease(deviceId: string): void {
    const device = this.device(deviceId);
    const nic = device.model.ports.find((p) => p.kind === 'ethernet');
    if (nic) this.l3.dhcpRelease(this.macOf(deviceId, nic.name));
    const { services } = device.host ?? {};
    device.host = { dhcp: true, ...(services ? { services } : {}) };
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
    const kind = device.model.profile ? groupOf(device.model.profile, port)?.kind : undefined;
    if (kind === 'loopback') return { status: 'up', protocol: 'up' };
    if (kind === 'svi') {
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
        index: d.index,
        ...(d.cli ? { running: cloneConfig(d.cli.config), startup: d.cli.startup ? cloneConfig(d.cli.startup) : null } : {}),
        ...(d.host ? { host: { ...d.host } } : {}),
      })),
      cables: this.cables.map((c) => ({ type: c.type, a: { ...c.a }, b: { ...c.b } })),
    };
  }

  static restore(snapshot: NetworkSnapshot): Network {
    const net = new Network(snapshot.options);
    for (const d of snapshot.devices) {
      const device = net.addDevice(d.id, d.model, d.index);
      if (device.cli && d.running) device.cli.config = cloneConfig(d.running);
      if (device.cli) device.cli.startup = d.startup ? cloneConfig(d.startup) : null;
      if (d.host) device.host = { ...d.host };
    }
    net.cables = snapshot.cables.map((c) => ({ type: c.type, a: { ...c.a }, b: { ...c.b } }));
    net.lastLinks.clear();
    net.reconcile();
    net.changes++;
    net.ospf.adjacencyChanges(); // the restored adjacencies are the baseline, not news
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
      dhcpBindings: () => this.l3.dhcpBindings(device.id),
      clearDhcpBindings: () => this.l3.clearDhcp(device.id),
      natCounters: () => this.l3.natCounters(device.id),
      clearNat: () => this.l3.clearNat(device.id),
      reset: () => {
        this.macTables.clear(device.id);
        this.l3.forget(device.id);
        this.ospf.forget(device.id);
      },
      ospf: () => this.ospf.view(device.id),
      ospfRouterId: () => this.ospf.activeRouterId(device.id),
      clearOspf: () => {
        this.ospf.clearProcess(device.id);
        this.changes++;
      },
      commit: () => this.settle(device.id),
      drain: () => this.drainSyslog(device.id),
    };
  }

  /** Re-evaluate every link. Lines for `localDevice` are returned; everyone else's are queued. */
  private settle(localDevice?: string): string[] {
    let local: string[] = [];
    const changes = this.reconcile();
    this.changes++;
    for (const [id, lines] of this.ospf.adjacencyChanges()) changes.set(id, [...(changes.get(id) ?? []), ...lines]);
    for (const [id, lines] of changes) {
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
