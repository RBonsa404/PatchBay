// Minimal device profiles for M1. The full hardware catalog (ports, capabilities, cabling rules) arrives in M2
// under model/catalog; profiles then become derived from it.

export type InterfaceKind = 'ethernet' | 'serial' | 'svi';

export interface InterfaceGroup {
  /** Canonical type name, e.g. FastEthernet. */
  type: string;
  kind: InterfaceKind;
  /** OSI layer the port operates at by default (switch access ports are layer 2). */
  layer: 2 | 3;
  /** Port ids, e.g. ['0/0', '0/1']. */
  ids: string[];
}

export interface DeviceProfile {
  id: string;
  family: 'router' | 'switch';
  /** Product id shown by `show version`. */
  productId: string;
  platform: string;
  iosVersion: string;
  defaultHostname: string;
  /** Router interfaces boot administratively down; switch ports boot up. */
  defaultShutdown: boolean;
  hasAux: boolean;
  groups: InterfaceGroup[];
}

const range = (prefix: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

export const profiles: Record<string, DeviceProfile> = {
  // Router used in the CCNA lab PDFs (docs/references/text/CONFIG base ROUTER.txt).
  'cisco-1841': {
    id: 'cisco-1841',
    family: 'router',
    productId: 'CISCO1841',
    platform: '1841',
    iosVersion: '12.4',
    defaultHostname: 'Router',
    defaultShutdown: true,
    hasAux: true,
    groups: [
      { type: 'FastEthernet', kind: 'ethernet', layer: 3, ids: ['0/0', '0/1'] },
      { type: 'Serial', kind: 'serial', layer: 3, ids: ['0/0/0', '0/0/1'] },
    ],
  },
  'cisco-2911': {
    id: 'cisco-2911',
    family: 'router',
    productId: 'CISCO2911/K9',
    platform: '2911',
    iosVersion: '15.1',
    defaultHostname: 'Router',
    defaultShutdown: true,
    hasAux: true,
    groups: [
      { type: 'GigabitEthernet', kind: 'ethernet', layer: 3, ids: ['0/0', '0/1', '0/2'] },
      { type: 'Serial', kind: 'serial', layer: 3, ids: ['0/0/0', '0/0/1'] },
    ],
  },
  'catalyst-2960': {
    id: 'catalyst-2960',
    family: 'switch',
    productId: 'WS-C2960-24TT-L',
    platform: '2960',
    iosVersion: '12.2',
    defaultHostname: 'Switch',
    defaultShutdown: false,
    hasAux: false,
    groups: [
      { type: 'FastEthernet', kind: 'ethernet', layer: 2, ids: range('0/', 1, 24) },
      { type: 'GigabitEthernet', kind: 'ethernet', layer: 2, ids: ['0/1', '0/2'] },
      { type: 'Vlan', kind: 'svi', layer: 3, ids: ['1'] },
    ],
  },
};

export function groupOf(profile: DeviceProfile, interfaceName: string): InterfaceGroup | undefined {
  const exact = profile.groups.find((g) => g.ids.some((id) => g.type + id === interfaceName));
  if (exact) return exact;
  // SVIs are created on demand (`interface vlan 99`), so they are not listed in the profile's ids.
  return profile.groups.find((g) => g.kind === 'svi' && new RegExp(`^${g.type}\\d+$`).test(interfaceName));
}
