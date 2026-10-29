import type { AclAddr, AclConfig, AclEntry, PortMatch } from '../../model/config.js';
import { ipToInt } from '../l3/ip.js';

export const PORT_NAMES: Record<string, number> = { ftp: 21, ssh: 22, telnet: 23, smtp: 25, domain: 53, www: 80, pop3: 110, https: 443 };
/** Names IOS prints back; the others stay numeric. */
const PRINTED_PORTS: Record<number, string> = { 21: 'ftp', 22: '22', 23: 'telnet', 25: 'smtp', 53: 'domain', 80: 'www', 110: 'pop3', 443: '443' };
const ICMP_TYPES = ['echo', 'echo-reply', 'unreachable', 'time-exceeded'];

/** What an ACL sees of a packet. */
export interface AclPacket {
  src: string;
  dst: string;
  protocol: 'icmp' | 'tcp' | 'udp';
  srcPort?: number;
  dstPort?: number;
  /** TCP segment with ACK or RST set (what the `established` keyword matches). */
  established?: boolean;
  icmpType?: string;
}

const matchesAddr = (a: AclAddr | undefined, ip: string): boolean => {
  if (!a || 'any' in a) return true;
  return (((ipToInt(ip) ^ ipToInt(a.ip)) & ~ipToInt(a.wildcard)) >>> 0) === 0;
};

const matchesPort = (m: PortMatch | undefined, port: number | undefined): boolean => {
  if (!m) return true;
  if (port === undefined) return false;
  switch (m.op) {
    case 'eq': return port === m.port;
    case 'neq': return port !== m.port;
    case 'gt': return port > m.port;
    case 'lt': return port < m.port;
    case 'range': return port >= m.port && port <= (m.port2 ?? m.port);
  }
};

function matchesEntry(acl: AclConfig, e: AclEntry, p: AclPacket): boolean {
  if (!e.action) return false; // remark
  if (!matchesAddr(e.src, p.src)) return false;
  if (acl.kind === 'standard') return true;
  if (e.protocol !== 'ip' && e.protocol !== p.protocol) return false;
  if (!matchesAddr(e.dst, p.dst)) return false;
  if (!matchesPort(e.srcPort, p.srcPort) || !matchesPort(e.dstPort, p.dstPort)) return false;
  if (e.established && !p.established) return false;
  if (e.icmpType && e.icmpType !== p.icmpType) return false;
  return true;
}

/** First matching entry wins; the end of every ACL is an implicit `deny ip any any`. */
export function evaluate(acl: AclConfig, packet: AclPacket): { action: 'permit' | 'deny'; entry?: AclEntry } {
  const entry = acl.entries.find((e) => matchesEntry(acl, e, packet));
  return entry ? { action: entry.action as 'permit' | 'deny', entry } : { action: 'deny' };
}

// ---- parsing ---------------------------------------------------------------------------------------------------

export type ParsedEntry = { entry: Omit<AclEntry, 'seq'> } | { error: number };

const isIp = (s: string | undefined): s is string => s !== undefined && /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every((o) => Number(o) <= 255);

function takeAddr(t: string[], i: number): { addr: AclAddr; next: number } | { error: number } {
  const w = t[i];
  if (w === 'any') return { addr: { any: true }, next: i + 1 };
  if (w === 'host') return isIp(t[i + 1]) ? { addr: { ip: t[i + 1] as string, wildcard: '0.0.0.0' }, next: i + 2 } : { error: i + 1 };
  if (!isIp(w)) return { error: i };
  // A wildcard only follows if it parses as an address; otherwise the address stands alone (standard ACLs).
  return isIp(t[i + 1]) ? { addr: { ip: w, wildcard: t[i + 1] as string }, next: i + 2 } : { addr: { ip: w, wildcard: '0.0.0.0' }, next: i + 1 };
}

function takePort(t: string[], i: number): { port?: PortMatch; next: number } | { error: number } {
  const op = t[i];
  if (op !== 'eq' && op !== 'neq' && op !== 'gt' && op !== 'lt' && op !== 'range') return { next: i };
  const num = (s: string | undefined): number | undefined => (s && /^\d+$/.test(s) ? Number(s) : s ? PORT_NAMES[s] : undefined);
  const a = num(t[i + 1]);
  if (a === undefined) return { error: i + 1 };
  if (op !== 'range') return { port: { op, port: a }, next: i + 2 };
  const b = num(t[i + 2]);
  return b === undefined ? { error: i + 2 } : { port: { op, port: a, port2: b }, next: i + 3 };
}

/** Parse `permit|deny ...` (tokens start at the action). `error` is the index of the offending token. */
export function parseEntry(kind: 'standard' | 'extended', t: string[]): ParsedEntry {
  const action = t[0];
  if (action !== 'permit' && action !== 'deny') return { error: 0 };
  const entry: Omit<AclEntry, 'seq'> = { action };

  if (kind === 'standard') {
    const src = takeAddr(t, 1);
    if ('error' in src) return src;
    entry.src = src.addr;
    let i = src.next;
    if (t[i] === 'log') {
      entry.log = true;
      i++;
    }
    return i < t.length ? { error: i } : { entry };
  }

  const protocol = t[1];
  if (protocol !== 'ip' && protocol !== 'icmp' && protocol !== 'tcp' && protocol !== 'udp') return { error: 1 };
  entry.protocol = protocol;
  const l4 = protocol === 'tcp' || protocol === 'udp';

  const src = takeAddr(t, 2);
  if ('error' in src) return src;
  entry.src = src.addr;
  let i = src.next;
  if (l4) {
    const sp = takePort(t, i);
    if ('error' in sp) return sp;
    if (sp.port) entry.srcPort = sp.port;
    i = sp.next;
  }
  const dst = takeAddr(t, i);
  if ('error' in dst) return dst;
  entry.dst = dst.addr;
  i = dst.next;
  if (l4) {
    const dp = takePort(t, i);
    if ('error' in dp) return dp;
    if (dp.port) entry.dstPort = dp.port;
    i = dp.next;
  }
  for (; i < t.length; i++) {
    if (t[i] === 'established' && protocol === 'tcp') entry.established = true;
    else if (t[i] === 'log') entry.log = true;
    else if (protocol === 'icmp' && ICMP_TYPES.includes(t[i] as string)) entry.icmpType = t[i];
    else return { error: i };
  }
  return { entry };
}

// ---- rendering -------------------------------------------------------------------------------------------------

function addr(a: AclAddr | undefined, kind: 'standard' | 'extended'): string {
  if (!a || 'any' in a) return 'any';
  if (a.wildcard === '0.0.0.0') return kind === 'standard' ? a.ip : `host ${a.ip}`;
  return kind === 'standard' ? `${a.ip}, wildcard bits ${a.wildcard}` : `${a.ip} ${a.wildcard}`;
}

const port = (p: PortMatch | undefined): string => {
  if (!p) return '';
  const name = (n: number): string => PRINTED_PORTS[n] ?? String(n);
  return p.op === 'range' ? ` range ${name(p.port)} ${name(p.port2 ?? p.port)}` : ` ${p.op} ${name(p.port)}`;
};

/** The entry as `show access-lists` prints it (no sequence number, no match counter). */
export function formatEntry(kind: 'standard' | 'extended', e: AclEntry): string {
  if (!e.action) return `remark ${e.remark ?? ''}`;
  if (kind === 'standard') return `${e.action} ${addr(e.src, kind)}${e.log ? ' log' : ''}`;
  return (
    `${e.action} ${e.protocol} ${addr(e.src, kind)}${port(e.srcPort)} ${addr(e.dst, kind)}${port(e.dstPort)}` +
    `${e.established ? ' established' : ''}${e.icmpType ? ` ${e.icmpType}` : ''}${e.log ? ' log' : ''}`
  );
}

/** Same entry as a configuration line: wildcard form instead of `, wildcard bits`. */
export function formatConfigEntry(kind: 'standard' | 'extended', e: AclEntry): string {
  if (kind === 'standard' && e.action && e.src && !('any' in e.src) && e.src.wildcard !== '0.0.0.0') {
    return `${e.action} ${e.src.ip} ${e.src.wildcard}${e.log ? ' log' : ''}`;
  }
  return formatEntry(kind, e);
}

export const isStandardNumber = (n: number): boolean => (n >= 1 && n <= 99) || (n >= 1300 && n <= 1999);
export const isExtendedNumber = (n: number): boolean => (n >= 100 && n <= 199) || (n >= 2000 && n <= 2699);
