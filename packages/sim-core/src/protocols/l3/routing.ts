import type { DeviceConfig } from '../../model/config.js';
import { ipToInt, maskToPrefix, networkOf, sameSubnet } from './ip.js';

export type RouteCode = 'C' | 'S';

export interface Route {
  network: string;
  mask: string;
  prefix: number;
  code: RouteCode;
  /** Administrative distance: 0 connected, 1 static by default. */
  ad: number;
  metric: number;
  /** Next-hop address; absent for connected routes and for static routes pointing at an interface. */
  nextHop?: string;
  /** Exit interface (for next-hop routes: the connected interface that reaches the next hop). */
  iface?: string;
}

export const isDefaultRoute = (r: Route): boolean => r.prefix === 0;

/**
 * Routes that make it into the routing table, given which interfaces are up/up: connected networks, and static routes
 * whose next hop is reachable through a connected network (or whose exit interface is up). For one prefix the lowest
 * administrative distance wins, which is what makes floating static routes work.
 */
export function buildRoutingTable(config: DeviceConfig, isUp: (interfaceName: string) => boolean): Route[] {
  const connected: Route[] = [];
  for (const ifc of config.interfaces) {
    if (!ifc.ip || !isUp(ifc.name)) continue;
    const prefix = maskToPrefix(ifc.ip.mask);
    if (prefix === null) continue;
    connected.push({
      network: networkOf(ifc.ip.address, ifc.ip.mask),
      mask: ifc.ip.mask,
      prefix,
      code: 'C',
      ad: 0,
      metric: 0,
      iface: ifc.name,
    });
  }

  const candidates: Route[] = [...connected];
  for (const sr of config.staticRoutes) {
    const prefix = maskToPrefix(sr.mask);
    if (prefix === null) continue;
    const base = { network: sr.network, mask: sr.mask, prefix, code: 'S' as const, ad: sr.distance, metric: 0 };
    if (sr.iface !== undefined) {
      if (isUp(sr.iface)) candidates.push({ ...base, iface: sr.iface });
    } else if (sr.nextHop !== undefined) {
      const via = connected.find((c) => sameSubnet(sr.nextHop as string, c.network, c.mask));
      if (via) candidates.push({ ...base, nextHop: sr.nextHop, iface: via.iface });
    }
  }

  const best = new Map<string, Route>();
  for (const r of candidates) {
    const key = `${r.network}/${r.prefix}`;
    const current = best.get(key);
    if (!current || r.ad < current.ad) best.set(key, r);
  }
  return [...best.values()].sort((a, b) => ipToInt(a.network) - ipToInt(b.network) || a.prefix - b.prefix);
}

/** Longest-prefix match; among equal prefixes the lowest administrative distance. */
export function lookup(table: Route[], destination: string): Route | undefined {
  let best: Route | undefined;
  for (const r of table) {
    if (!sameSubnet(destination, r.network, r.mask)) continue;
    if (!best || r.prefix > best.prefix || (r.prefix === best.prefix && r.ad < best.ad)) best = r;
  }
  return best;
}
