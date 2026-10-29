import type { DeviceConfig } from '../../model/config.js';
import { buildRoutingTable, isDefaultRoute } from '../../protocols/l3/routing.js';
import type { ArpEntry, LinkEnvironment, PingResult, TraceHop } from '../environment.js';

const CODES = [
  'Codes: C - connected, S - static, R - RIP, M - mobile, B - BGP',
  '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
  '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
  '       E1 - OSPF external type 1, E2 - OSPF external type 2',
  '       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2',
  '       ia - IS-IS inter area, * - candidate default, U - per-user static route',
  '       o - ODR, P - periodic downloaded static route',
];

/** `show ip route`: layout of the course PDFs (Packet Tracer / IOS 12.4), flat list of /prefix routes. */
export function renderRoutes(config: DeviceConfig, env: LinkEnvironment): string {
  const up = (name: string): boolean => {
    const s = env.linkState(name);
    return s.status === 'up' && s.protocol === 'up';
  };
  const table = buildRoutingTable(config, up, env.ospf()?.routes ?? []);
  const gateway = table.find(isDefaultRoute);

  const lines: string[] = [];
  for (const r of table) {
    const code = isDefaultRoute(r) && r.code === 'S' ? 'S*' : isDefaultRoute(r) && r.code === 'O E2' ? 'O*E2' : r.code;
    const head = `${code.padEnd(5)}${r.network}/${r.prefix} `;
    if (r.code === 'C' || !r.nextHop) {
      lines.push(`${head}is directly connected, ${r.iface}`);
    } else if (r.code === 'S') {
      lines.push(`${head}[${r.ad}/${r.metric}] via ${r.nextHop}`);
    } else {
      // Learned routes carry an age (always 00:00:00 here: no clock yet) and every equal-cost path on its own line.
      lines.push(`${head}[${r.ad}/${r.metric}] via ${r.nextHop}, 00:00:00, ${r.iface}`);
      for (const alt of r.alternates ?? []) lines.push(`${' '.repeat(head.length)}[${r.ad}/${r.metric}] via ${alt.nextHop}, 00:00:00, ${alt.iface}`);
    }
  }

  return [
    ...CODES,
    '',
    gateway ? `Gateway of last resort is ${gateway.nextHop ?? '0.0.0.0'} to network 0.0.0.0` : 'Gateway of last resort is not set',
    '',
    ...lines,
  ].join('\n');
}

/** `show ip arp`. Ages are always 0 for learned entries: the simulator has no clock yet. */
export function renderArp(entries: ArpEntry[]): string {
  return [
    'Protocol  Address          Age (min)  Hardware Addr   Type   Interface',
    ...entries.map(
      (e) => `Internet  ${e.ip.padEnd(17)}${(e.own ? '-' : '0').padStart(8)}   ${e.mac.padEnd(16)}ARPA   ${e.iface}`,
    ),
  ].join('\n');
}

/** Round-trip times are fixed (1 ms) until the engine has a clock. */
export function renderPing(destination: string, r: PingResult): string {
  const percent = Math.floor((r.received * 100) / r.sent);
  return [
    '',
    'Type escape sequence to abort.',
    `Sending ${r.sent}, 100-byte ICMP Echos to ${destination}, timeout is 2 seconds:`,
    r.symbols,
    `Success rate is ${percent} percent (${r.received}/${r.sent})${r.received > 0 ? ', round-trip min/avg/max = 1/1/1 ms' : ''}`,
  ].join('\n');
}

export function renderTraceroute(destination: string, hops: TraceHop[]): string {
  const lines = hops.map((h) => {
    if (h.outcome === 'timeout') return `  ${h.ttl}  *  *  *`;
    const marks = h.answers.map((ok) => (ok ? (h.outcome === 'unreachable' ? '!N' : '0 msec') : '*'));
    return `  ${h.ttl} ${h.address} ${marks.join(' ')}`;
  });
  return ['', 'Type escape sequence to abort.', `Tracing the route to ${destination}`, '', ...lines].join('\n');
}
