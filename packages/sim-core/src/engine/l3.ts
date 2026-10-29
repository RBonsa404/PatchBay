import type { ArpEntry, PingResult, TraceHop } from '../ios/environment.js';
import { parentOf } from '../ios/interfaces.js';
import { groupOf } from '../ios/profiles.js';
import type { Network } from '../model/network.js';
import { evaluate, type AclPacket } from '../protocols/acl/acl.js';
import { sameSubnet } from '../protocols/l3/ip.js';
import { buildRoutingTable, lookup } from '../protocols/l3/routing.js';
import { BROADCAST_MAC, injectFromSwitch, type EthernetFrame } from './l2.js';

export type IcmpMessage =
  | { type: 'echo-request' | 'echo-reply'; id: number; seq: number }
  /** Errors carry the id/seq of the packet that caused them (for TCP/UDP: source port and 0), so probes can be matched. */
  | { type: 'time-exceeded' | 'unreachable'; id: number; seq: number };

export interface TcpSegment {
  srcPort: number;
  dstPort: number;
  flags: { syn?: boolean; ack?: boolean; rst?: boolean };
}

export interface UdpDatagram {
  srcPort: number;
  dstPort: number;
}

/** Exactly one of icmp, tcp, udp is present. */
export interface IpPacket {
  src: string;
  dst: string;
  ttl: number;
  icmp?: IcmpMessage;
  tcp?: TcpSegment;
  udp?: UdpDatagram;
}

export type L3Payload =
  | { type: 'arp'; op: 'request' | 'reply'; senderIp: string; senderMac: string; targetIp: string }
  | { type: 'ip'; packet: IpPacket };

/** An addressed interface as the L3 engine sees it: where it sits on the wire and what it answers to. */
export interface L3Interface {
  name: string;
  ip: string;
  mask: string;
  mac: string;
  /** Physical port the frames use; null for an SVI, which lives inside the switch. */
  port: string | null;
  /** VLAN: 802.1Q tag of a subinterface, or the VLAN of an SVI. null = untagged physical interface. */
  vlan: number | null;
  /** Native subinterface: untagged on the wire. */
  native: boolean;
  serial: boolean;
  svi: boolean;
}

interface Egress {
  ifc: L3Interface;
  nextHop: string;
}

type ProbeType = IcmpMessage['type'] | 'tcp-open' | 'tcp-refused' | 'udp-reply';

interface ProbeReply {
  type: ProbeType;
  from: string;
}

/** Outcome of a TCP connection attempt or UDP exchange started with `tcpConnect` / `udpSend`. */
export type ServiceResult = 'open' | 'refused' | 'unreachable' | 'timeout';

const toAclPacket = (p: IpPacket): AclPacket => {
  if (p.tcp) {
    return { src: p.src, dst: p.dst, protocol: 'tcp', srcPort: p.tcp.srcPort, dstPort: p.tcp.dstPort, established: !!(p.tcp.flags.ack || p.tcp.flags.rst) };
  }
  if (p.udp) return { src: p.src, dst: p.dst, protocol: 'udp', srcPort: p.udp.srcPort, dstPort: p.udp.dstPort };
  const type = (p.icmp as IcmpMessage).type;
  return { src: p.src, dst: p.dst, protocol: 'icmp', icmpType: type === 'echo-request' ? 'echo' : type };
};

/** Key under which an answer to this packet will be recorded. TCP/UDP probes are matched by source port. */
const probeKey = (deviceId: string, p: IpPacket): string => {
  if (p.icmp) return `${deviceId}|${p.icmp.id}|${p.icmp.seq}`;
  return `${deviceId}|${(p.tcp ?? p.udp)!.srcPort}|0`;
};

/**
 * ARP, IPv4 forwarding, ICMP, TCP/UDP service probes and ACL filtering for every device of a Network. Everything is
 * synchronous: a send returns after the whole exchange (including nested ARP replies) has happened, which keeps `ping`
 * deterministic.
 *
 * Like IOS, a device that must ARP for a next hop drops the packet that triggered the request; the next one goes out.
 * This is what produces the classic `.!!!!` of a first ping.
 */
export class L3 {
  /** device -> ip -> learned entry. Dynamic state, not part of snapshots. */
  private readonly arp = new Map<string, Map<string, { mac: string; iface: string }>>();
  private readonly probes = new Map<string, ProbeReply>();
  private readonly hits = new Map<string, number>();
  private nextId = 1;
  private nextPort = 49152;

  constructor(private readonly net: Network) {}

  // ---- addressing ------------------------------------------------------------------------------------------------

  /** Interfaces of a device that are addressed and up: what the device can send and receive packets on. */
  interfaces(deviceId: string): L3Interface[] {
    const device = this.net.device(deviceId);

    if (!device.cli) {
      const nic = device.model.ports.find((p) => p.kind === 'ethernet');
      const host = device.host;
      if (!nic || !host?.ip || !host.mask || !this.net.hostLinkUp({ device: deviceId, port: nic.name })) return [];
      return [{ name: nic.name, ip: host.ip, mask: host.mask, mac: this.net.macOf(deviceId, nic.name), port: nic.name, vlan: null, native: false, serial: false, svi: false }];
    }

    const profile = device.model.profile!;
    const out: L3Interface[] = [];
    for (const cfg of device.cli.config.interfaces) {
      if (!cfg.ip) continue;
      const state = this.net.linkState(deviceId, cfg.name);
      if (state.status !== 'up' || state.protocol !== 'up') continue;
      const common = { name: cfg.name, ip: cfg.ip.address, mask: cfg.ip.mask };
      const group = groupOf(profile, cfg.name);

      if (group?.kind === 'svi') {
        out.push({ ...common, mac: this.net.macOf(deviceId, cfg.name), port: null, vlan: Number(cfg.name.slice(4)), native: false, serial: false, svi: true });
        continue;
      }
      const parent = parentOf(cfg.name);
      if (parent) {
        if (!cfg.encapsulation) continue;
        out.push({ ...common, mac: this.net.macOf(deviceId, parent), port: parent, vlan: cfg.encapsulation.vlan, native: cfg.encapsulation.native, serial: false, svi: false });
      } else {
        out.push({ ...common, mac: this.net.macOf(deviceId, cfg.name), port: cfg.name, vlan: null, native: false, serial: group?.kind === 'serial', svi: false });
      }
    }
    return out;
  }

  /** Where to send a packet for `destination`: the interface and the next-hop address to ARP for. */
  routeFor(deviceId: string, destination: string): Egress | null {
    const ifs = this.interfaces(deviceId);
    if (ifs.length === 0) return null;
    const device = this.net.device(deviceId);
    const direct = ifs.find((i) => sameSubnet(destination, i.ip, i.mask));

    if (device.model.kind === 'router' && device.cli) {
      const up = new Set(ifs.map((i) => i.name));
      const route = lookup(buildRoutingTable(device.cli.config, (n) => up.has(n)), destination);
      const ifc = route && ifs.find((i) => i.name === route.iface);
      return route && ifc ? { ifc, nextHop: route.nextHop ?? destination } : null;
    }

    // Hosts and switch management stacks: same subnet, or the default gateway.
    if (direct) return { ifc: direct, nextHop: destination };
    const gateway = device.cli ? device.cli.config.defaultGateway : device.host?.gateway;
    const via = gateway ? ifs.find((i) => sameSubnet(gateway, i.ip, i.mask)) : undefined;
    return gateway && via ? { ifc: via, nextHop: gateway } : null;
  }

  arpTable(deviceId: string): ArpEntry[] {
    const own = this.interfaces(deviceId).map((i) => ({ ip: i.ip, mac: i.mac, iface: i.name, own: true }));
    const learned = [...(this.arp.get(deviceId)?.entries() ?? [])].map(([ip, e]) => ({ ip, mac: e.mac, iface: e.iface, own: false }));
    return [...own, ...learned];
  }

  clearArp(deviceId: string): void {
    this.arp.delete(deviceId);
  }

  /** How many packets matched this ACL line on this device. */
  aclHits(deviceId: string, aclName: string, seq: number): number {
    return this.hits.get(`${deviceId}|${aclName}|${seq}`) ?? 0;
  }

  clearAclHits(deviceId: string): void {
    for (const key of [...this.hits.keys()]) if (key.startsWith(`${deviceId}|`)) this.hits.delete(key);
  }

  // ---- receiving -------------------------------------------------------------------------------------------------

  /** A frame reached `deviceId`, on a physical port (hosts, routers) or inside a switch VLAN (management SVI). */
  receive(deviceId: string, where: { port: string } | { vlan: number }, frame: EthernetFrame): void {
    const ifs = this.interfaces(deviceId);
    const ifc =
      'vlan' in where
        ? ifs.find((i) => i.svi && i.vlan === where.vlan)
        : ifs.find((i) => i.port === where.port && (frame.vlanTag !== undefined ? i.vlan === frame.vlanTag && !i.native : i.vlan === null || i.native));
    const payload = frame.payload as L3Payload | undefined;
    if (!ifc || !payload) return;

    if (payload.type === 'arp') this.onArp(deviceId, ifc, payload);
    else if (payload.type === 'ip') this.onIp(deviceId, ifc, payload.packet);
  }

  private onArp(deviceId: string, ifc: L3Interface, arp: Extract<L3Payload, { type: 'arp' }>): void {
    this.learn(deviceId, arp.senderIp, arp.senderMac, ifc.name);
    if (arp.op === 'request' && arp.targetIp === ifc.ip) {
      this.emit(deviceId, ifc, {
        src: ifc.mac,
        dst: arp.senderMac,
        payload: { type: 'arp', op: 'reply', senderIp: ifc.ip, senderMac: ifc.mac, targetIp: arp.senderIp } satisfies L3Payload,
      });
    }
  }

  private onIp(deviceId: string, ifc: L3Interface, packet: IpPacket): void {
    const device = this.net.device(deviceId);
    const router = device.model.kind === 'router' && !!device.cli;

    // Inbound ACL: sees the packet as it arrived, before NAT and routing.
    if (router && !this.permits(deviceId, ifc.name, 'aclIn', packet)) return this.icmpError(deviceId, ifc, packet, 'unreachable');

    if (this.interfaces(deviceId).some((i) => i.ip === packet.dst)) return this.deliverLocal(deviceId, packet);
    if (!router) return; // hosts and switches never forward

    const ttl = packet.ttl - 1;
    if (ttl <= 0) return this.icmpError(deviceId, ifc, packet, 'time-exceeded');
    const egress = this.routeFor(deviceId, packet.dst);
    if (!egress) return this.icmpError(deviceId, ifc, packet, 'unreachable');
    if (!this.permits(deviceId, egress.ifc.name, 'aclOut', packet)) return this.icmpError(deviceId, ifc, packet, 'unreachable');
    this.sendIp(deviceId, egress, { ...packet, ttl });
  }

  /** Apply the ACL bound to an interface in one direction. An unbound or undefined ACL permits everything. */
  private permits(deviceId: string, interfaceName: string, direction: 'aclIn' | 'aclOut', packet: IpPacket): boolean {
    const config = this.net.device(deviceId).cli!.config;
    const name = config.interfaces.find((i) => i.name === interfaceName)?.[direction];
    const acl = name === undefined ? undefined : config.acls.find((a) => a.name === name);
    if (!acl) return true;
    const verdict = evaluate(acl, toAclPacket(packet));
    if (verdict.entry) {
      const key = `${deviceId}|${acl.name}|${verdict.entry.seq}`;
      this.hits.set(key, (this.hits.get(key) ?? 0) + 1);
    }
    return verdict.action === 'permit';
  }

  /** ICMP errors answer probes only (echo requests, TCP, UDP): never errors about errors or replies. */
  private icmpError(deviceId: string, ifc: L3Interface, original: IpPacket, type: 'time-exceeded' | 'unreachable'): void {
    let id: number;
    let seq = 0;
    if (original.icmp) {
      if (original.icmp.type !== 'echo-request') return;
      id = original.icmp.id;
      seq = original.icmp.seq;
    } else {
      id = (original.tcp ?? original.udp)!.srcPort;
    }
    this.originate(deviceId, { src: ifc.ip, dst: original.src, ttl: 255, icmp: { type, id, seq } });
  }

  // ---- local delivery --------------------------------------------------------------------------------------------

  private deliverLocal(deviceId: string, packet: IpPacket): void {
    const reply = (p: Pick<IpPacket, 'icmp' | 'tcp' | 'udp'>): void => this.originate(deviceId, { src: packet.dst, dst: packet.src, ttl: 255, ...p });

    if (packet.icmp) {
      const { icmp } = packet;
      if (icmp.type === 'echo-request') reply({ icmp: { type: 'echo-reply', id: icmp.id, seq: icmp.seq } });
      else this.probes.set(`${deviceId}|${icmp.id}|${icmp.seq}`, { type: icmp.type, from: packet.src });
      return;
    }

    if (packet.tcp) {
      const seg = packet.tcp;
      if (seg.flags.syn && !seg.flags.ack) {
        const open = this.serviceOpen(deviceId, 'tcp', seg.dstPort, packet.src);
        reply({ tcp: { srcPort: seg.dstPort, dstPort: seg.srcPort, flags: open ? { syn: true, ack: true } : { rst: true, ack: true } } });
      } else {
        this.probes.set(`${deviceId}|${seg.dstPort}|0`, { type: seg.flags.syn ? 'tcp-open' : 'tcp-refused', from: packet.src });
      }
      return;
    }

    const dgram = packet.udp as UdpDatagram;
    if (this.probes.has(`${deviceId}|${dgram.dstPort}|pending`)) {
      this.probes.set(`${deviceId}|${dgram.dstPort}|0`, { type: 'udp-reply', from: packet.src });
    } else if (this.serviceOpen(deviceId, 'udp', dgram.dstPort, packet.src)) {
      reply({ udp: { srcPort: dgram.dstPort, dstPort: dgram.srcPort } });
    } else {
      this.icmpError(deviceId, { name: '', ip: packet.dst, mask: '', mac: '', port: null, vlan: null, native: false, serial: false, svi: false }, packet, 'unreachable');
    }
  }

  /** Hosts expose the ports listed in their `services`; a router accepts Telnet (23) when a VTY line can log in. */
  private serviceOpen(deviceId: string, protocol: 'tcp' | 'udp', port: number, source: string): boolean {
    const device = this.net.device(deviceId);
    if (device.host) return device.host.services?.[protocol]?.includes(port) ?? false;
    const config = device.cli!.config;
    if (protocol !== 'tcp' || port !== 23) return false;
    const vty = config.lines.find((l) => l.id.startsWith('vty') && l.login && l.password !== undefined);
    if (!vty) return false;
    const acl = vty.accessClassIn === undefined ? undefined : config.acls.find((a) => a.name === vty.accessClassIn);
    return !acl || evaluate(acl, { src: source, dst: '', protocol: 'tcp' }).action === 'permit';
  }

  // ---- sending ---------------------------------------------------------------------------------------------------

  private originate(deviceId: string, packet: IpPacket): void {
    const egress = this.routeFor(deviceId, packet.dst);
    if (egress) this.sendIp(deviceId, egress, packet);
  }

  /** Resolve the next hop and send. Returns 'arp-pending' when the packet had to be dropped to ARP first. */
  private sendIp(deviceId: string, egress: Egress, packet: IpPacket): 'sent' | 'arp-pending' {
    const { ifc, nextHop } = egress;
    const mac = ifc.serial ? this.serialPeerMac(deviceId, ifc) : this.arp.get(deviceId)?.get(nextHop)?.mac;
    if (!mac) {
      this.emit(deviceId, ifc, {
        src: ifc.mac,
        dst: BROADCAST_MAC,
        payload: { type: 'arp', op: 'request', senderIp: ifc.ip, senderMac: ifc.mac, targetIp: nextHop } satisfies L3Payload,
      });
      return 'arp-pending';
    }
    this.emit(deviceId, ifc, { src: ifc.mac, dst: mac, payload: { type: 'ip', packet } satisfies L3Payload });
    return 'sent';
  }

  /** Serial links have no ARP: the far end is the only possible receiver. */
  private serialPeerMac(deviceId: string, ifc: L3Interface): string | undefined {
    const peer = this.net.peerOf({ device: deviceId, port: ifc.port as string });
    return peer ? this.net.macOf(peer.device, peer.port) : undefined;
  }

  private emit(deviceId: string, ifc: L3Interface, frame: EthernetFrame): void {
    if (ifc.svi) {
      injectFromSwitch(this.net, deviceId, ifc.vlan as number, frame);
      return;
    }
    const tagged = ifc.vlan !== null && !ifc.native ? { ...frame, vlanTag: ifc.vlan } : frame;
    this.net.sendFrame({ device: deviceId, port: ifc.port as string }, tagged);
  }

  private learn(deviceId: string, ip: string, mac: string, iface: string): void {
    let table = this.arp.get(deviceId);
    if (!table) this.arp.set(deviceId, (table = new Map()));
    table.set(ip, { mac, iface });
  }

  // ---- ping, traceroute, TCP/UDP probes --------------------------------------------------------------------------

  /** Send one packet and report what came back, if anything. */
  private probe(deviceId: string, destination: string, build: (src: string) => IpPacket): ProbeReply | 'timeout' {
    const local = this.interfaces(deviceId).find((i) => i.ip === destination);
    if (local) return { type: 'echo-reply', from: destination };
    const egress = this.routeFor(deviceId, destination);
    if (!egress) return 'timeout';
    const packet = build(egress.ifc.ip);
    const key = probeKey(deviceId, packet);
    this.probes.delete(key);
    this.sendIp(deviceId, egress, packet);
    const reply = this.probes.get(key);
    this.probes.delete(key);
    return reply ?? 'timeout';
  }

  private echo(destination: string, ttl: number): (src: string) => IpPacket {
    const id = this.nextId++;
    return (src) => ({ src, dst: destination, ttl, icmp: { type: 'echo-request', id, seq: 1 } });
  }

  ping(deviceId: string, destination: string, count = 5): PingResult {
    let symbols = '';
    let received = 0;
    for (let i = 0; i < count; i++) {
      const r = this.probe(deviceId, destination, this.echo(destination, 255));
      const symbol = r === 'timeout' ? '.' : r.type === 'echo-reply' ? '!' : r.type === 'unreachable' ? 'U' : '&';
      if (symbol === '!') received++;
      symbols += symbol;
    }
    return { symbols, sent: count, received };
  }

  traceroute(deviceId: string, destination: string, maxHops = 30): TraceHop[] {
    const hops: TraceHop[] = [];
    for (let ttl = 1; ttl <= maxHops; ttl++) {
      const replies = [0, 1, 2].map(() => this.probe(deviceId, destination, this.echo(destination, ttl)));
      const answered = replies.filter((r): r is ProbeReply => r !== 'timeout');
      const first = answered[0];
      const hop: TraceHop = {
        ttl,
        answers: replies.map((r) => r !== 'timeout'),
        outcome: !first ? 'timeout' : first.type === 'echo-reply' ? 'reached' : first.type === 'unreachable' ? 'unreachable' : 'hop',
      };
      if (first) hop.address = first.from;
      hops.push(hop);
      if (hop.outcome === 'reached' || hop.outcome === 'unreachable') break;
    }
    return hops;
  }

  /** Open a TCP connection (SYN, like a real client: it retries once ARP has resolved the next hop). */
  tcpConnect(deviceId: string, destination: string, port: number): ServiceResult {
    for (let attempt = 0; attempt < 3; attempt++) {
      const srcPort = this.nextPort++;
      const r = this.probe(deviceId, destination, (src) => ({ src, dst: destination, ttl: 255, tcp: { srcPort, dstPort: port, flags: { syn: true } } }));
      if (r === 'timeout') continue;
      return r.type === 'tcp-open' ? 'open' : r.type === 'tcp-refused' ? 'refused' : r.type === 'unreachable' ? 'unreachable' : 'timeout';
    }
    return 'timeout';
  }

  /** Send one UDP datagram and wait for the service's answer. */
  udpSend(deviceId: string, destination: string, port: number): ServiceResult {
    for (let attempt = 0; attempt < 3; attempt++) {
      const srcPort = this.nextPort++;
      this.probes.set(`${deviceId}|${srcPort}|pending`, { type: 'udp-reply', from: '' });
      const r = this.probe(deviceId, destination, (src) => ({ src, dst: destination, ttl: 255, udp: { srcPort, dstPort: port } }));
      this.probes.delete(`${deviceId}|${srcPort}|pending`);
      if (r === 'timeout') continue;
      return r.type === 'udp-reply' ? 'open' : r.type === 'unreachable' ? 'unreachable' : 'timeout';
    }
    return 'timeout';
  }
}
