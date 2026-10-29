import type { DeviceConfig } from '../model/config.js';
import type { NatEntry } from '../protocols/nat/nat.js';
import type { OspfRouterView } from '../engine/ospf.js';

export type LineStatus = 'up' | 'down' | 'administratively down';

export interface LinkState {
  status: LineStatus;
  protocol: 'up' | 'down';
}

export interface MacEntry {
  vlan: number;
  mac: string;
  port: string;
}

export interface PingResult {
  /** One symbol per echo: `!` reply, `.` timeout, `U` unreachable, `&` TTL exceeded. */
  symbols: string;
  sent: number;
  received: number;
  /** Per echo: who answered and the TTL left (absent on timeouts). Used by the PCs' `ping` output. */
  replies?: { symbol: string; from?: string; ttl?: number }[];
}

export interface TraceHop {
  ttl: number;
  /** Router (or destination) that answered, if any. */
  address?: string;
  /** Per probe: true = answered, false = timed out. */
  answers: boolean[];
  /** `unreachable`: an ICMP unreachable came back and the trace stops. */
  outcome: 'hop' | 'reached' | 'unreachable' | 'timeout';
}

export interface ArpEntry {
  ip: string;
  mac: string;
  iface: string;
  /** The device's own interface address (shown with age `-`). */
  own: boolean;
}

/** What an IOS device needs to know about the world around it. Implemented by Network; stubbed when a Cli runs alone. */
export interface LinkEnvironment {
  linkState(interfaceName: string): LinkState;
  /** Which end of a serial cable this interface is, or null when no serial cable is attached. */
  serialEnd(interfaceName: string): 'dce' | 'dte' | null;
  macAddress(interfaceName: string): string;
  /** Learned MAC addresses of this switch, in learning order. */
  macTable(): MacEntry[];
  clearMacTable(): void;
  /** Send echo requests from this device. */
  ping(destination: string, count?: number): PingResult;
  traceroute(destination: string, maxHops?: number): TraceHop[];
  arpTable(): ArpEntry[];
  clearArp(): void;
  /** Packets that matched this ACL line (see `show access-lists`). */
  aclHits(aclName: string, seq: number): number;
  clearAclHits(): void;
  /** Dynamic NAT translations, hit/miss counters, and `clear ip nat translation *`. */
  natTranslations(): NatEntry[];
  natCounters(): { hits: number; misses: number };
  clearNat(): void;
  /** OSPF as seen by this router (undefined when OSPF is not configured). */
  ospf(): OspfRouterView | undefined;
  /** Router ID the OSPF process uses right now (fixed until `clear ip ospf process` or reload). */
  ospfRouterId(): string | null;
  clearOspf(): void;
  /** Forget dynamic state (ARP, MAC table, NAT translations, ACL counters): the device has just rebooted. */
  reset(): void;
  /** Re-evaluate the links after a state change; returns the syslog lines this device must print now. */
  commit(): string[];
  /** Syslog lines queued for this device by events elsewhere (remote shutdown, cable plugged…). */
  drain(): string[];
}

export function createIsolatedEnvironment(getConfig: () => DeviceConfig): LinkEnvironment {
  return {
    linkState: (name) =>
      getConfig().interfaces.find((i) => i.name === name)?.shutdown
        ? { status: 'administratively down', protocol: 'down' }
        : { status: 'down', protocol: 'down' },
    serialEnd: () => null,
    macAddress: (name) => {
      const index = Math.max(0, getConfig().interfaces.findIndex((i) => i.name === name));
      return `0000.0000.${index.toString(16).padStart(4, '0')}`;
    },
    macTable: () => [],
    clearMacTable: () => undefined,
    ping: (_destination, count = 5) => ({ symbols: '.'.repeat(count), sent: count, received: 0 }),
    traceroute: () => [],
    arpTable: () => [],
    clearArp: () => undefined,
    aclHits: () => 0,
    clearAclHits: () => undefined,
    natTranslations: () => [],
    natCounters: () => ({ hits: 0, misses: 0 }),
    clearNat: () => undefined,
    ospf: () => undefined,
    ospfRouterId: () => null,
    clearOspf: () => undefined,
    reset: () => undefined,
    commit: () => [],
    drain: () => [],
  };
}
