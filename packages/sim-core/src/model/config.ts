import type { DeviceProfile } from '../ios/profiles.js';

export interface IpAddress {
  address: string;
  mask: string;
}

export interface SwitchportConfig {
  /** Unset = dynamic auto, which the simulator treats as an access port (DTP is not simulated). */
  mode?: 'access' | 'trunk';
  /** Access VLAN; defaults to 1. */
  accessVlan?: number;
  /** Trunk native VLAN; defaults to 1. */
  trunkNative?: number;
  /** VLANs allowed on the trunk; undefined = all (1-4094). */
  trunkAllowed?: number[];
}

export interface InterfaceConfig {
  /** Canonical name, e.g. FastEthernet0/0, FastEthernet0/1.10 (subinterface) or Vlan99. */
  name: string;
  description?: string;
  ip?: IpAddress;
  shutdown: boolean;
  clockRate?: number;
  switchport?: SwitchportConfig;
  /** 802.1Q encapsulation of a router subinterface. */
  encapsulation?: { vlan: number; native: boolean };
  /** ACL applied to packets arriving on / leaving through this interface (name or number). */
  aclIn?: string;
  aclOut?: string;
  /** NAT role (`ip nat inside` / `ip nat outside`). */
  natRole?: 'inside' | 'outside';
  /** `bandwidth` in kbit/s; drives the OSPF cost. Unset = the hardware default. */
  bandwidth?: number;
  ospfCost?: number;
  ospfPriority?: number;
}

export interface OspfNetwork {
  network: string;
  wildcard: string;
  area: number;
}

/** One OSPF process (the simulator supports a single process per router). */
export interface OspfConfig {
  processId: number;
  routerId?: string;
  networks: OspfNetwork[];
  /** `passive-interface default`: then `notPassive` lists the exceptions. */
  passiveDefault: boolean;
  passive: string[];
  notPassive: string[];
  /** `default-information originate [always]` */
  defaultOriginate?: { always: boolean };
  /** `auto-cost reference-bandwidth`, in Mbit/s. */
  referenceBandwidth: number;
}

export interface NatStatic {
  local: string;
  global: string;
}

export interface NatPool {
  name: string;
  start: string;
  end: string;
  mask: string;
}

/** `ip nat inside source list <acl> pool <pool> | interface <if> [overload]` */
export interface NatRule {
  acl: string;
  pool?: string;
  iface?: string;
  overload: boolean;
}

export interface NatConfig {
  statics: NatStatic[];
  pools: NatPool[];
  rules: NatRule[];
}

export type AclAddr = { any: true } | { ip: string; wildcard: string };

export interface PortMatch {
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'range';
  port: number;
  port2?: number;
}

/** One line of an ACL: a remark (no action) or a permit/deny rule. */
export interface AclEntry {
  seq: number;
  remark?: string;
  action?: 'permit' | 'deny';
  /** Extended ACLs only. */
  protocol?: 'ip' | 'icmp' | 'tcp' | 'udp';
  src?: AclAddr;
  dst?: AclAddr;
  srcPort?: PortMatch;
  dstPort?: PortMatch;
  established?: boolean;
  icmpType?: string;
  log?: boolean;
}

export interface AclConfig {
  /** Number (as text) or name. */
  name: string;
  kind: 'standard' | 'extended';
  named: boolean;
  entries: AclEntry[];
}

/** `ip route <network> <mask> <next-hop | interface> [distance]` */
export interface StaticRoute {
  network: string;
  mask: string;
  nextHop?: string;
  iface?: string;
  distance: number;
}

/** A VLAN created with the `vlan` command. VLAN 1 and the reserved 1002-1005 always exist and are not stored. */
export interface VlanConfig {
  id: number;
  /** Custom name; the default is VLANxxxx. */
  name?: string;
}

export interface LineConfig {
  /** Canonical id as printed by IOS: 'con 0', 'aux 0', 'vty 0 4', 'vty 5 15'. */
  id: string;
  /** Stored in clear; `show running-config` renders it encrypted when service password-encryption is on. */
  password?: string;
  login: boolean;
  loggingSynchronous: boolean;
  execTimeout?: { minutes: number; seconds: number };
  /** Standard ACL limiting who may open a session on this line (`access-class N in`). */
  accessClassIn?: string;
}

/** Structured device configuration. `show running-config` is a rendering of this state, never the other way round. */
export interface DeviceConfig {
  hostname: string;
  enableSecret?: string;
  enablePassword?: string;
  /** Banner lines (without delimiter). */
  motd?: string[];
  domainLookup: boolean;
  passwordEncryption: boolean;
  defaultGateway?: string;
  staticRoutes: StaticRoute[];
  acls: AclConfig[];
  nat: NatConfig;
  ospf?: OspfConfig;
  vlans: VlanConfig[];
  lines: LineConfig[];
  interfaces: InterfaceConfig[];
}

export const vlanName = (config: DeviceConfig, id: number): string => {
  if (id === 1) return 'default';
  const reserved: Record<number, string> = { 1002: 'fddi-default', 1003: 'token-ring-default', 1004: 'fddinet-default', 1005: 'trnet-default' };
  return reserved[id] ?? config.vlans.find((v) => v.id === id)?.name ?? `VLAN${String(id).padStart(4, '0')}`;
};

/** VLAN 1 and 1002-1005 always exist; the others only once created. */
export const vlanExists = (config: DeviceConfig, id: number): boolean =>
  id === 1 || (id >= 1002 && id <= 1005) || config.vlans.some((v) => v.id === id);

const defaultLine = (id: string, login: boolean): LineConfig => ({
  id,
  login,
  loggingSynchronous: false,
});

export function createDefaultConfig(profile: DeviceProfile): DeviceConfig {
  const lines = [defaultLine('con 0', false)];
  if (profile.hasAux) lines.push(defaultLine('aux 0', false));
  lines.push(defaultLine('vty 0 4', true), defaultLine('vty 5 15', true));

  return {
    hostname: profile.defaultHostname,
    domainLookup: true,
    passwordEncryption: false,
    staticRoutes: [],
    acls: [],
    nat: { statics: [], pools: [], rules: [] },
    vlans: [],
    lines,
    interfaces: profile.groups.flatMap((g) =>
      g.ids.map((id) => ({
        name: g.type + id,
        shutdown: g.kind === 'svi' ? true : profile.defaultShutdown,
      })),
    ),
  };
}

export function cloneConfig(config: DeviceConfig): DeviceConfig {
  return JSON.parse(JSON.stringify(config)) as DeviceConfig;
}

export function sameConfig(a: DeviceConfig, b: DeviceConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
