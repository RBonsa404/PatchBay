import type { NatPool } from '../../model/config.js';
import { intToIp, ipToInt } from '../l3/ip.js';

/** One live translation. Static mappings are not stored here: they come straight from the configuration. */
export interface NatEntry {
  proto: 'icmp' | 'tcp' | 'udp' | 'ip';
  insideLocal: string;
  insideLocalPort?: number;
  insideGlobal: string;
  insideGlobalPort?: number;
  /** The outside host (address and port as seen on both sides: there is no outside NAT). */
  outside: string;
  outsidePort?: number;
}

/** Every address of a pool, first to last. */
export function poolAddresses(pool: NatPool): string[] {
  const out: string[] = [];
  for (let n = ipToInt(pool.start); n <= ipToInt(pool.end) && out.length < 4096; n++) out.push(intToIp(n));
  return out;
}

/**
 * Pick the translated source port for an overloaded address: keep the original when it is free, otherwise take the
 * first free one in the same range IOS uses (1-511, 512-1023, 1024 and up).
 */
export function allocatePort(original: number, taken: (port: number) => boolean): number {
  if (!taken(original)) return original;
  const start = original < 512 ? 1 : original < 1024 ? 512 : 1024;
  const end = original < 512 ? 511 : original < 1024 ? 1023 : 65535;
  for (let p = start; p <= end; p++) if (!taken(p)) return p;
  return original;
}

const side = (ip: string, port: number | undefined): string => (port === undefined ? ip : `${ip}:${port}`);

/** `show ip nat translations`; static mappings come first, as they are created first. */
export function formatTranslations(statics: { local: string; global: string }[], entries: NatEntry[]): string {
  const row = (proto: string, ig: string, il: string, ol: string, og: string): string =>
    `${proto} ${ig.padEnd(19)}${il.padEnd(19)}${ol.padEnd(19)}${og}`;
  return [
    'Pro Inside global      Inside local       Outside local      Outside global',
    ...statics.map((s) => row('---', s.global, s.local, '---', '---')),
    ...entries.map((e) =>
      e.proto === 'ip'
        ? row('---', e.insideGlobal, e.insideLocal, '---', '---')
        : row(e.proto, side(e.insideGlobal, e.insideGlobalPort), side(e.insideLocal, e.insideLocalPort), side(e.outside, e.outsidePort), side(e.outside, e.outsidePort)),
    ),
  ].join('\n');
}
