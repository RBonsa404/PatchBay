import { groupOf } from '../ios/profiles.js';
import type { InterfaceConfig, OspfConfig } from '../model/config.js';
import type { Network } from '../model/network.js';
import { ipToInt, maskToPrefix, networkOf } from '../protocols/l3/ip.js';
import { buildRoutingTable, isDefaultRoute, type NextHop, type Route } from '../protocols/l3/routing.js';
import type { L3Interface } from './l3.js';

/** AllSPFRouters (224.0.0.5) as an Ethernet multicast address. */
export const OSPF_MULTICAST_MAC = '0100.5e00.0005';

/** Default bandwidth (kbit/s) by interface type, as IOS assumes it; the OSPF cost is reference / bandwidth. */
const DEFAULT_BANDWIDTH: Record<string, number> = { FastEthernet: 100000, GigabitEthernet: 1000000, Serial: 1544, Loopback: 8000000, Vlan: 1000000 };

export type OspfInterfaceState = 'DR' | 'BDR' | 'DROTHER' | 'P2P' | 'LOOP';

export interface OspfNeighbor {
  routerId: string;
  /** Priority shown by `show ip ospf neighbor` (0 on point-to-point links, as IOS prints it). */
  priority: number;
  state: 'FULL' | '2WAY';
  /** The neighbour's role on the segment; '-' on point-to-point links. */
  role: 'DR' | 'BDR' | 'DROTHER' | '-';
  address: string;
  /** Local interface the neighbour is seen on. */
  iface: string;
}

export interface OspfInterface {
  name: string;
  ip: string;
  mask: string;
  area: number;
  cost: number;
  priority: number;
  passive: boolean;
  type: 'broadcast' | 'p2p' | 'loopback';
  state: OspfInterfaceState;
  dr?: { routerId: string; ip: string };
  bdr?: { routerId: string; ip: string };
  neighbors: OspfNeighbor[];
}

/** Everything `show ip ospf …`, `show ip protocols` and the routing table need about one router. */
export interface OspfRouterView {
  processId: number;
  /** null while no interface has an address: the process cannot start. */
  routerId: string | null;
  config: OspfConfig;
  interfaces: OspfInterface[];
  areas: number[];
  isAbr: boolean;
  isAsbr: boolean;
  routes: Route[];
}

interface Iface extends OspfInterface {
  device: string;
  l3: L3Interface;
}

interface Edge {
  to: string;
  cost: number;
  /** Local interface (edges leaving the SPF root). */
  myIf?: string;
  /** Address of the router at the far end (point-to-point edges, and network-to-router edges). */
  peerIp?: string;
}

interface Hop {
  iface: string;
  /** '' while the path is still on a segment the root is attached to (filled by the next router). */
  nextHop: string;
}

interface Reach {
  network: string;
  mask: string;
  cost: number;
  hops: Hop[];
}

const ipCompare = (a: string, b: string): number => ipToInt(a) - ipToInt(b);
const maxIp = (ips: string[]): string | undefined => [...ips].sort(ipCompare).at(-1);
const covers = (n: { network: string; wildcard: string }, ip: string): boolean =>
  (((ipToInt(ip) ^ ipToInt(n.network)) & ~ipToInt(n.wildcard)) >>> 0) === 0;
const keyOf = (network: string, mask: string): string => `${network}/${mask}`;

function mergeHops(a: Hop[], b: Hop[]): Hop[] {
  const out = [...a];
  for (const h of b) if (!out.some((x) => x.iface === h.iface && x.nextHop === h.nextHop)) out.push(h);
  return out;
}

/**
 * OSPFv2 for every router of a Network, recomputed whenever the network changes (`Network.version`).
 *
 * Neighbours are found by sending real Hello frames through the L2 engine, so cabling, VLANs, trunks and shut ports
 * all matter. Then, as OSPF does: DR/BDR election on broadcast segments, one SPF (Dijkstra) per area, inter-area routes
 * through ABRs (backbone rules), and an E2 default route from `default-information originate`.
 *
 * Simplifications: one process per router, no timers (adjacencies form at once), hello/dead intervals and
 * authentication are not modelled, the DR election is not pre-emptive-aware (highest priority, then highest router ID).
 */
export class Ospf {
  private version = -1;
  private views = new Map<string, OspfRouterView>();
  /** Router ID chosen when the process started; it only changes after `clear ip ospf process` or a reload. */
  private readonly latched = new Map<string, string>();
  /** FULL adjacencies at the last check, to report changes as syslog lines. */
  private readonly lastFull = new Map<string, Map<string, string>>();

  constructor(private readonly net: Network) {}

  view(deviceId: string): OspfRouterView | undefined {
    this.refresh();
    return this.views.get(deviceId);
  }

  routes(deviceId: string): Route[] {
    return this.view(deviceId)?.routes ?? [];
  }

  /** The router ID in use (null when OSPF is not running on this device). */
  activeRouterId(deviceId: string): string | null {
    this.refresh();
    return this.latched.get(deviceId) ?? null;
  }

  /** `clear ip ospf process`: pick the router ID again (and re-form adjacencies). */
  clearProcess(deviceId: string): void {
    this.latched.delete(deviceId);
    this.version = -1;
  }

  /** Reload or removal. */
  forget(deviceId: string): void {
    this.latched.delete(deviceId);
    this.version = -1;
  }

  /** Adjacencies that reached or left FULL since the last call, as IOS logs them. */
  adjacencyChanges(): Map<string, string[]> {
    this.refresh();
    const out = new Map<string, string[]>();
    const devices = new Set([...this.lastFull.keys(), ...this.views.keys()]);
    for (const device of devices) {
      const view = this.views.get(device);
      const now = new Map<string, string>();
      for (const ifc of view?.interfaces ?? []) {
        for (const n of ifc.neighbors) {
          if (n.state === 'FULL') now.set(`${n.iface}|${n.routerId}`, `Process ${view!.processId}, Nbr ${n.routerId} on ${n.iface}`);
        }
      }
      const before = this.lastFull.get(device) ?? new Map<string, string>();
      const lines: string[] = [];
      for (const [key, text] of now) if (!before.has(key)) lines.push(`%OSPF-5-ADJCHG: ${text} from LOADING to FULL, Loading Done`);
      for (const [key, text] of before) {
        if (!now.has(key)) lines.push(`%OSPF-5-ADJCHG: ${text} from FULL to DOWN, Neighbor Down: Interface down or detached`);
      }
      if (lines.length > 0) out.set(device, lines);
      this.lastFull.set(device, now);
    }
    return out;
  }

  // ---- computation -----------------------------------------------------------------------------------------------

  private refresh(): void {
    if (this.version === this.net.version) return;
    this.version = this.net.version;
    this.views = this.compute();
  }

  private compute(): Map<string, OspfRouterView> {
    const views = new Map<string, OspfRouterView>();
    const ifaces = new Map<string, Iface[]>();

    for (const device of this.net.devices.values()) {
      const config = device.cli?.config;
      if (!config?.ospf || device.model.kind !== 'router') {
        this.latched.delete(device.id);
        continue;
      }
      const ospf = config.ospf;
      const l3s = this.net.l3.interfaces(device.id);
      const routerId = this.routerId(device.id, ospf, l3s);
      const list: Iface[] = [];
      if (routerId) {
        for (const l of l3s) {
          const statement = ospf.networks.find((n) => covers(n, l.ip));
          if (!statement) continue;
          const cfg = config.interfaces.find((i) => i.name === l.name) as InterfaceConfig;
          const groupType = groupOf(device.model.profile!, l.name)?.type ?? '';
          const bandwidth = cfg.bandwidth ?? DEFAULT_BANDWIDTH[groupType] ?? 1000000;
          const type = l.loopback ? 'loopback' : l.serial ? 'p2p' : 'broadcast';
          list.push({
            device: device.id,
            l3: l,
            name: l.name,
            ip: l.ip,
            mask: l.mask,
            area: statement.area,
            cost: cfg.ospfCost ?? Math.max(1, Math.floor((ospf.referenceBandwidth * 1000) / bandwidth)),
            priority: cfg.ospfPriority ?? 1,
            passive: ospf.passiveDefault ? !ospf.notPassive.includes(l.name) : ospf.passive.includes(l.name),
            type,
            state: type === 'loopback' ? 'LOOP' : type === 'p2p' ? 'P2P' : 'DR',
            neighbors: [],
          });
        }
      }
      const areas = [...new Set(list.map((i) => i.area))].sort((a, b) => a - b);
      const up = new Set(l3s.map((l) => l.name));
      const hasDefault = buildRoutingTable(config, (n) => up.has(n)).some(isDefaultRoute);
      views.set(device.id, {
        processId: ospf.processId,
        routerId,
        config: ospf,
        interfaces: list,
        areas,
        isAbr: areas.length > 1 && areas.includes(0),
        isAsbr: routerId !== null && ospf.defaultOriginate !== undefined && (ospf.defaultOriginate.always || hasDefault),
        routes: [],
      });
      ifaces.set(device.id, list);
    }

    const pairs = this.discover(ifaces, views);
    this.elect(ifaces, pairs, views);
    for (const [device, view] of views) view.routes = this.routesFor(device, views, ifaces, pairs);
    return views;
  }

  /** IOS: the configured router-id, else the highest loopback address, else the highest address of an up interface. */
  private routerId(deviceId: string, ospf: OspfConfig, l3s: L3Interface[]): string | null {
    const latched = this.latched.get(deviceId);
    if (latched) return latched;
    const loopbacks = l3s.filter((l) => l.loopback).map((l) => l.ip);
    const chosen = ospf.routerId ?? maxIp(loopbacks.length > 0 ? loopbacks : l3s.map((l) => l.ip));
    if (!chosen) return null;
    this.latched.set(deviceId, chosen);
    return chosen;
  }

  /** Send a Hello out of every active OSPF interface and keep the pairs that hear each other and agree on parameters. */
  private discover(ifaces: Map<string, Iface[]>, views: Map<string, OspfRouterView>): [Iface, Iface][] {
    const heard = new Set<string>();
    const find = (device: string, name: string | undefined): Iface | undefined => ifaces.get(device)?.find((i) => i.name === name);

    for (const list of ifaces.values()) {
      for (const ifc of list) {
        if (ifc.passive || ifc.type === 'loopback' || ifc.l3.port === null) continue;
        const frame = { src: ifc.l3.mac, dst: OSPF_MULTICAST_MAC, payload: { type: 'ospf-hello' }, ...(ifc.l3.vlan !== null && !ifc.l3.native ? { vlanTag: ifc.l3.vlan } : {}) };
        const trace = this.net.sendFrame({ device: ifc.device, port: ifc.l3.port }, frame);
        for (const d of trace.deliveries) {
          if (d.device === ifc.device) continue;
          const target = find(d.device, this.net.l3.interfaceAt(d.device, d.port, d.frame.vlanTag)?.name);
          if (target) heard.add(`${ifc.device}|${ifc.name}>${target.device}|${target.name}`);
        }
      }
    }

    const pairs: [Iface, Iface][] = [];
    for (const key of heard) {
      const [from, to] = key.split('>') as [string, string];
      if (from > to || !heard.has(`${to}>${from}`)) continue;
      const [ad, an] = from.split('|') as [string, string];
      const [bd, bn] = to.split('|') as [string, string];
      const a = find(ad, an);
      const b = find(bd, bn);
      if (!a || !b || b.passive) continue;
      const compatible =
        a.area === b.area &&
        a.mask === b.mask &&
        networkOf(a.ip, a.mask) === networkOf(b.ip, b.mask) &&
        a.type === b.type &&
        views.get(ad)?.routerId !== views.get(bd)?.routerId;
      if (compatible) pairs.push([a, b]);
    }
    return pairs;
  }

  /** DR/BDR election per broadcast segment, then neighbour states. */
  private elect(ifaces: Map<string, Iface[]>, pairs: [Iface, Iface][], views: Map<string, OspfRouterView>): void {
    const rid = (i: Iface): string => views.get(i.device)?.routerId ?? '0.0.0.0';
    const segmentOf = new Map<Iface, Iface[]>();
    for (const list of ifaces.values()) for (const i of list) if (i.type === 'broadcast') segmentOf.set(i, [i]);
    for (const [a, b] of pairs) {
      if (a.type !== 'broadcast') continue;
      const sa = segmentOf.get(a) as Iface[];
      const sb = segmentOf.get(b) as Iface[];
      if (sa === sb) continue;
      sa.push(...sb);
      for (const i of sb) segmentOf.set(i, sa);
    }

    for (const segment of new Set(segmentOf.values())) {
      const ranked = segment
        .filter((i) => i.priority > 0)
        .sort((x, y) => y.priority - x.priority || ipCompare(rid(y), rid(x)));
      const dr = ranked[0];
      const bdr = ranked[1];
      for (const i of segment) {
        i.state = i === dr ? 'DR' : i === bdr ? 'BDR' : 'DROTHER';
        if (dr) i.dr = { routerId: rid(dr), ip: dr.ip };
        if (bdr) i.bdr = { routerId: rid(bdr), ip: bdr.ip };
      }
    }

    for (const [a, b] of pairs) {
      for (const [me, peer] of [[a, b], [b, a]] as const) {
        if (me.type === 'p2p') {
          me.neighbors.push({ routerId: rid(peer), priority: 0, state: 'FULL', role: '-', address: peer.ip, iface: me.name });
        } else {
          const full = me.state !== 'DROTHER' || peer.state !== 'DROTHER';
          me.neighbors.push({ routerId: rid(peer), priority: peer.priority, state: full ? 'FULL' : '2WAY', role: peer.state as 'DR' | 'BDR' | 'DROTHER', address: peer.ip, iface: me.name });
        }
      }
    }
  }

  /** Graph of one area: routers, transit networks (segments with a DR) and the prefixes each node owns. */
  private areaGraph(area: number, ifaces: Map<string, Iface[]>, pairs: [Iface, Iface][], asbrs: Set<string>) {
    const edges = new Map<string, Edge[]>();
    const owned: { node: string; network: string; mask: string; cost: number }[] = [];
    const add = (from: string, edge: Edge): void => {
      edges.set(from, [...(edges.get(from) ?? []), edge]);
    };

    for (const [a, b] of pairs) {
      if (a.area !== area || a.type !== 'p2p') continue;
      add(`R:${a.device}`, { to: `R:${b.device}`, cost: a.cost, myIf: a.name, peerIp: b.ip });
      add(`R:${b.device}`, { to: `R:${a.device}`, cost: b.cost, myIf: b.name, peerIp: a.ip });
    }

    // A broadcast segment is a transit network when its DR is fully adjacent to at least one other router.
    const transit = new Map<string, Iface[]>();
    for (const list of ifaces.values()) {
      for (const i of list) {
        if (i.area !== area || i.type !== 'broadcast' || !i.dr) continue;
        if (!i.neighbors.some((n) => n.state === 'FULL') && i.state !== 'DR') continue;
        const id = `${i.dr.ip}|${networkOf(i.ip, i.mask)}`;
        transit.set(id, [...(transit.get(id) ?? []), i]);
      }
    }
    for (const [id, members] of transit) {
      if (members.length < 2) {
        transit.delete(id);
        continue;
      }
      for (const m of members) {
        add(`R:${m.device}`, { to: `N:${id}`, cost: m.cost, myIf: m.name });
        add(`N:${id}`, { to: `R:${m.device}`, cost: 0, peerIp: m.ip });
      }
      const first = members[0] as Iface;
      owned.push({ node: `N:${id}`, network: networkOf(first.ip, first.mask), mask: first.mask, cost: 0 });
    }

    const transitMembers = new Set([...transit.values()].flat());
    for (const list of ifaces.values()) {
      for (const i of list) {
        if (i.area !== area || transitMembers.has(i)) continue;
        // Loopbacks are advertised as host routes, whatever their mask.
        if (i.type === 'loopback') owned.push({ node: `R:${i.device}`, network: i.ip, mask: '255.255.255.255', cost: i.cost });
        else owned.push({ node: `R:${i.device}`, network: networkOf(i.ip, i.mask), mask: i.mask, cost: i.cost });
      }
    }
    // Reaching an ASBR is modelled as reaching a pseudo-prefix it owns (what type-4 summaries do across areas).
    for (const device of asbrs) if ([...(ifaces.get(device) ?? [])].some((i) => i.area === area)) owned.push({ node: `R:${device}`, network: `asbr:${device}`, mask: '', cost: 0 });
    return { edges, owned };
  }

  /** Dijkstra from `root`, keeping every equal-cost first hop. */
  private spf(root: string, edges: Map<string, Edge[]>): { dist: Map<string, number>; hops: Map<string, Hop[]> } {
    const dist = new Map<string, number>([[root, 0]]);
    const hops = new Map<string, Hop[]>([[root, []]]);
    const done = new Set<string>();
    for (;;) {
      let u: string | undefined;
      for (const [node, d] of dist) if (!done.has(node) && (u === undefined || d < (dist.get(u) as number))) u = node;
      if (u === undefined) break;
      done.add(u);
      for (const e of edges.get(u) ?? []) {
        if (done.has(e.to)) continue;
        const alt = (dist.get(u) as number) + e.cost;
        let via: Hop[];
        if (u === root) via = [{ iface: e.myIf as string, nextHop: e.to.startsWith('R:') ? (e.peerIp as string) : '' }];
        else if ((hops.get(u) ?? []).some((h) => h.nextHop === '')) via = (hops.get(u) as Hop[]).map((h) => ({ iface: h.iface, nextHop: e.peerIp ?? '' }));
        else via = hops.get(u) as Hop[];
        const current = dist.get(e.to);
        if (current === undefined || alt < current) {
          dist.set(e.to, alt);
          hops.set(e.to, via);
        } else if (alt === current) {
          hops.set(e.to, mergeHops(hops.get(e.to) as Hop[], via));
        }
      }
    }
    return { dist, hops };
  }

  private routesFor(device: string, views: Map<string, OspfRouterView>, ifaces: Map<string, Iface[]>, pairs: [Iface, Iface][]): Route[] {
    const me = views.get(device) as OspfRouterView;
    if (!me.routerId) return [];
    const asbrs = new Set([...views].filter(([, v]) => v.isAsbr).map(([d]) => d));
    const allAreas = [...new Set([...views.values()].flatMap((v) => v.areas))];
    const graphs = new Map(allAreas.map((a) => [a, this.areaGraph(a, ifaces, pairs, asbrs)]));

    /** Intra-area reachability of every prefix from `who` in `area` (own prefixes at their interface cost). */
    const intra = (who: string, area: number): Map<string, Reach> => {
      const out = new Map<string, Reach>();
      const graph = graphs.get(area);
      if (!graph || !views.get(who)?.areas.includes(area)) return out;
      const { dist, hops } = this.spf(`R:${who}`, graph.edges);
      for (const o of graph.owned) {
        const d = dist.get(o.node);
        if (d === undefined) continue;
        const h = hops.get(o.node) as Hop[];
        const cost = d + o.cost;
        const key = keyOf(o.network, o.mask);
        const prev = out.get(key);
        if (!prev || cost < prev.cost) out.set(key, { network: o.network, mask: o.mask, cost, hops: h });
        else if (cost === prev.cost) prev.hops = mergeHops(prev.hops, h);
      }
      return out;
    };
    const intraOf = new Map<string, Map<string, Reach>>();
    const intraCached = (who: string, area: number): Map<string, Reach> => {
      const key = `${who}|${area}`;
      if (!intraOf.has(key)) intraOf.set(key, intra(who, area));
      return intraOf.get(key) as Map<string, Reach>;
    };
    const routerDistance = (who: string, target: string, area: number): { cost: number; hops: Hop[] } | undefined => {
      const graph = graphs.get(area);
      if (!graph) return undefined;
      const { dist, hops } = this.spf(`R:${who}`, graph.edges);
      const d = dist.get(`R:${target}`);
      return d === undefined ? undefined : { cost: d, hops: hops.get(`R:${target}`) as Hop[] };
    };

    const abrs = [...views].filter(([, v]) => v.isAbr).map(([d]) => d);
    // Summaries an ABR injects into the backbone: what it reaches inside its non-backbone areas.
    const intoBackbone = (abr: string): Map<string, Reach> => {
      const out = new Map<string, Reach>();
      for (const area of views.get(abr)!.areas.filter((a) => a !== 0)) for (const [k, r] of intraCached(abr, area)) if (!out.has(k) || r.cost < out.get(k)!.cost) out.set(k, r);
      return out;
    };
    /** Inter-area routes of a backbone router (summaries from the other ABRs). */
    const backboneInter = (who: string): Map<string, Reach> => {
      const out = new Map<string, Reach>();
      if (!views.get(who)!.areas.includes(0)) return out;
      for (const abr of abrs) {
        if (abr === who) continue;
        const toAbr = routerDistance(who, abr, 0);
        if (!toAbr) continue;
        for (const [k, r] of intoBackbone(abr)) {
          const cost = toAbr.cost + r.cost;
          const prev = out.get(k);
          if (!prev || cost < prev.cost) out.set(k, { ...r, cost, hops: toAbr.hops });
          else if (cost === prev.cost) prev.hops = mergeHops(prev.hops, toAbr.hops);
        }
      }
      return out;
    };

    const routes = new Map<string, Reach & { code: 'O' | 'O IA' }>();
    const consider = (k: string, r: Reach, code: 'O' | 'O IA'): void => {
      const prev = routes.get(k);
      if (prev && prev.code === 'O' && code === 'O IA') return; // intra-area always wins
      if (!prev || (prev.code === 'O IA' && code === 'O') || r.cost < prev.cost) routes.set(k, { ...r, code });
      else if (r.cost === prev.cost && prev.code === code) prev.hops = mergeHops(prev.hops, r.hops);
    };

    for (const area of me.areas) for (const [k, r] of intraCached(device, area)) if (r.hops.length > 0) consider(k, r, 'O');

    if (me.areas.includes(0)) {
      for (const [k, r] of backboneInter(device)) consider(k, r, 'O IA');
    } else {
      // A non-backbone router hears ABRs advertise the backbone, the other areas, and what the backbone learned.
      for (const area of me.areas) {
        for (const abr of abrs) {
          if (abr === device || !views.get(abr)!.areas.includes(area)) continue;
          const toAbr = routerDistance(device, abr, area);
          if (!toAbr) continue;
          const advertised = new Map<string, Reach>([...intraCached(abr, 0), ...backboneInter(abr)]);
          for (const other of views.get(abr)!.areas) if (other !== 0 && other !== area) for (const [k, r] of intraCached(abr, other)) advertised.set(k, r);
          const local = intraCached(device, area);
          for (const [k, r] of advertised) if (!local.has(k)) consider(k, { ...r, cost: toAbr.cost + r.cost, hops: toAbr.hops }, 'O IA');
        }
      }
    }

    const out: Route[] = [];
    const myNetworks = (ifaces.get(device) ?? []).map((i) => (i.type === 'loopback' ? keyOf(i.ip, '255.255.255.255') : keyOf(networkOf(i.ip, i.mask), i.mask)));
    const sortHops = (h: Hop[]): Hop[] => [...h].filter((x) => x.nextHop !== '').sort((a, b) => ipCompare(b.nextHop, a.nextHop));
    for (const [k, r] of routes) {
      if (k.startsWith('asbr:') || myNetworks.includes(k)) continue;
      const hops = sortHops(r.hops);
      if (hops.length === 0) continue;
      out.push(this.toRoute(r.network, r.mask, r.code, r.cost, hops));
    }

    // E2 default route towards the closest ASBR (all E2 metrics are 1; the forwarding cost breaks ties).
    if (!asbrs.has(device)) {
      let best: { cost: number; hops: Hop[] } | undefined;
      for (const asbr of asbrs) {
        const reach = routes.get(keyOf(`asbr:${asbr}`, ''));
        if (!reach) continue;
        if (!best || reach.cost < best.cost) best = { cost: reach.cost, hops: reach.hops };
        else if (reach.cost === best.cost) best.hops = mergeHops(best.hops, reach.hops);
      }
      const hops = best ? sortHops(best.hops) : [];
      if (hops.length > 0) out.push(this.toRoute('0.0.0.0', '0.0.0.0', 'O E2', 1, hops));
    }
    return out;
  }

  private toRoute(network: string, mask: string, code: 'O' | 'O IA' | 'O E2', metric: number, hops: Hop[]): Route {
    const [first, ...rest] = hops as [Hop, ...Hop[]];
    const prefix = maskToPrefix(mask) ?? 0;
    const route: Route = { network, mask, prefix, code, ad: 110, metric, nextHop: first.nextHop, iface: first.iface };
    if (rest.length > 0) route.alternates = rest.map((h): NextHop => ({ nextHop: h.nextHop, iface: h.iface }));
    return route;
  }
}
