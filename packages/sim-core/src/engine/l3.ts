import type { ArpEntry, PingResult, TraceHop } from '../ios/environment.js';
import { parentOf } from '../ios/interfaces.js';
import { groupOf } from '../ios/profiles.js';
import type { Network } from '../model/network.js';
import { sameSubnet } from '../protocols/l3/ip.js';
import { buildRoutingTable, lookup } from '../protocols/l3/routing.js';
import { BROADCAST_MAC, injectFromSwitch, type EthernetFrame } from './l2.js';

export type IcmpMessage =
  | { type: 'echo-request' | 'echo-reply'; id: number; seq: number }
  /** Errors carry the id/seq of the echo request that caused them, so probes can be matched. */
  | { type: 'time-exceeded' | 'unreachable'; id: number; seq: number };

export interface IpPacket {
  src: string;
  dst: string;
  ttl: number;
  icmp: IcmpMessage;
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

interface ProbeReply {
  type: IcmpMessage['type'];
  from: string;
}

/**
 * ARP, IPv4 forwarding and ICMP echo for every device of a Network. Everything is synchronous: a send returns after
 * the whole exchange (including nested ARP replies) has happened, which keeps `ping` deterministic.
 *
 * Like IOS, a device that must ARP for a next hop drops the packet that triggered the request; the next one goes out.
 * This is what produces the classic `.!!!!` of a first ping.
 */
export class L3 {
  /** device -> ip -> learned entry. Dynamic state, not part of snapshots. */
  private readonly arp = new Map<string, Map<string, { mac: string; iface: string }>>();
  private readonly probes = new Map<string, ProbeReply>();
  private nextId = 1;

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
    else this.onIp(deviceId, ifc, payload.packet);
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
    const local = this.interfaces(deviceId).some((i) => i.ip === packet.dst);

    if (local) {
      const { icmp } = packet;
      if (icmp.type === 'echo-request') {
        this.originate(deviceId, { src: packet.dst, dst: packet.src, ttl: 255, icmp: { type: 'echo-reply', id: icmp.id, seq: icmp.seq } });
      } else {
        this.probes.set(`${deviceId}|${icmp.id}|${icmp.seq}`, { type: icmp.type, from: packet.src });
      }
      return;
    }

    if (device.model.kind !== 'router') return; // hosts and switches never forward

    const ttl = packet.ttl - 1;
    if (ttl <= 0) return this.icmpError(deviceId, ifc, packet, 'time-exceeded');
    const egress = this.routeFor(deviceId, packet.dst);
    if (!egress) return this.icmpError(deviceId, ifc, packet, 'unreachable');
    // M5 hooks: inbound ACL on `ifc`, NAT translation, outbound ACL on `egress.ifc` belong here.
    this.sendIp(deviceId, egress, { ...packet, ttl });
  }

  /** ICMP errors answer echo requests only: never errors about errors or replies. */
  private icmpError(deviceId: string, ifc: L3Interface, original: IpPacket, type: 'time-exceeded' | 'unreachable'): void {
    if (original.icmp.type !== 'echo-request') return;
    this.originate(deviceId, { src: ifc.ip, dst: original.src, ttl: 255, icmp: { type, id: original.icmp.id, seq: original.icmp.seq } });
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

  // ---- ping and traceroute ---------------------------------------------------------------------------------------

  /** Send one echo request and report what came back, if anything. */
  private probe(deviceId: string, destination: string, ttl: number): ProbeReply | 'timeout' {
    if (this.interfaces(deviceId).some((i) => i.ip === destination)) return { type: 'echo-reply', from: destination };
    const egress = this.routeFor(deviceId, destination);
    if (!egress) return 'timeout';
    const id = this.nextId++;
    const key = `${deviceId}|${id}|1`;
    this.sendIp(deviceId, egress, { src: egress.ifc.ip, dst: destination, ttl, icmp: { type: 'echo-request', id, seq: 1 } });
    const reply = this.probes.get(key);
    this.probes.delete(key);
    return reply ?? 'timeout';
  }

  ping(deviceId: string, destination: string, count = 5): PingResult {
    let symbols = '';
    let received = 0;
    for (let i = 0; i < count; i++) {
      const r = this.probe(deviceId, destination, 255);
      const symbol = r === 'timeout' ? '.' : r.type === 'echo-reply' ? '!' : r.type === 'unreachable' ? 'U' : '&';
      if (symbol === '!') received++;
      symbols += symbol;
    }
    return { symbols, sent: count, received };
  }

  traceroute(deviceId: string, destination: string, maxHops = 30): TraceHop[] {
    const hops: TraceHop[] = [];
    for (let ttl = 1; ttl <= maxHops; ttl++) {
      const replies = [0, 1, 2].map(() => this.probe(deviceId, destination, ttl));
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
}
