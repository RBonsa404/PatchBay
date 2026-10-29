import { vlanExists, vlanName, type DeviceConfig, type InterfaceConfig } from '../../model/config.js';
import type { LinkEnvironment, MacEntry } from '../environment.js';
import { groupOf, type DeviceProfile } from '../profiles.js';
import { formatVlanList, ALL_VLANS } from '../vlan-list.js';

export function shortName(name: string): string {
  return name.replace('FastEthernet', 'Fa').replace('GigabitEthernet', 'Gi').replace('Serial', 'Se').replace('Loopback', 'Lo');
}

const layer2 = (profile: DeviceProfile, config: DeviceConfig): InterfaceConfig[] =>
  config.interfaces.filter((i) => groupOf(profile, i.name)?.layer === 2);

const isTrunk = (ifc: InterfaceConfig): boolean => ifc.switchport?.mode === 'trunk';

function vlanRow(config: DeviceConfig, profile: DeviceProfile, id: number): string[] {
  const reserved = id >= 1002 && id <= 1005;
  const members = reserved
    ? []
    : layer2(profile, config)
        .filter((i) => !isTrunk(i) && (i.switchport?.accessVlan ?? 1) === id)
        .map((i) => shortName(i.name));
  const head = `${String(id).padEnd(4)} ${vlanName(config, id).padEnd(31)} ${(reserved ? 'act/unsup' : 'active').padEnd(9)} `;
  const indent = ' '.repeat(head.length);
  const chunks: string[] = [];
  for (let i = 0; i < members.length; i += 4) chunks.push(members.slice(i, i + 4).join(', '));
  if (chunks.length === 0) return [head.trimEnd()];
  return chunks.map((c, i) => (i === 0 ? head : indent) + c);
}

/** `show vlan brief`: 4 ports per line, widths as in the course PDF (lab 3.5.1). */
export function renderVlanBrief(profile: DeviceProfile, config: DeviceConfig, only?: number): string {
  const ids = [1, ...config.vlans.map((v) => v.id), 1002, 1003, 1004, 1005]
    .filter((id, i, all) => all.indexOf(id) === i)
    .sort((a, b) => a - b)
    .filter((id) => only === undefined || id === only);
  return [
    `${'VLAN'} ${'Name'.padEnd(31)} ${'Status'.padEnd(9)} Ports`,
    `${'-'.repeat(4)} ${'-'.repeat(31)} ${'-'.repeat(9)} ${'-'.repeat(29)}`,
    ...ids.flatMap((id) => vlanRow(config, profile, id)),
  ].join('\n');
}

export function renderTrunks(profile: DeviceProfile, config: DeviceConfig, env: LinkEnvironment): string {
  const trunks = layer2(profile, config).filter((i) => isTrunk(i) && env.linkState(i.name).status === 'up');
  if (trunks.length === 0) return '';

  const row = (port: string, rest: string): string => `${shortName(port).padEnd(12)}${rest}`;
  const allowed = (i: InterfaceConfig): number[] => i.switchport?.trunkAllowed ?? [...ALL_VLANS];
  const active = (i: InterfaceConfig): number[] =>
    allowed(i).filter((v) => !(v >= 1002 && v <= 1005) && vlanExists(config, v));

  return [
    `${'Port'.padEnd(12)}${'Mode'.padEnd(13)}${'Encapsulation'.padEnd(15)}${'Status'.padEnd(14)}Native vlan`,
    ...trunks.map((i) => row(i.name, `${'on'.padEnd(13)}${'802.1q'.padEnd(15)}${'trunking'.padEnd(14)}${i.switchport?.trunkNative ?? 1}`)),
    '',
    row('Port', 'Vlans allowed on trunk'),
    ...trunks.map((i) => row(i.name, formatVlanList(allowed(i)))),
    '',
    row('Port', 'Vlans allowed and active in management domain'),
    ...trunks.map((i) => row(i.name, formatVlanList(active(i)))),
    '',
    row('Port', 'Vlans in spanning tree forwarding state and not pruned'),
    ...trunks.map((i) => row(i.name, formatVlanList(active(i)))),
  ].join('\n');
}

export function renderMacTable(entries: MacEntry[]): string {
  return [
    '          Mac Address Table',
    '-------------------------------------------',
    '',
    'Vlan    Mac Address       Type        Ports',
    '----    -----------       --------    -----',
    ...entries.map((e) => `${String(e.vlan).padStart(4)}    ${e.mac.padEnd(18)}${'DYNAMIC'.padEnd(12)}${shortName(e.port)}`),
    `Total Mac Addresses for this criterion: ${entries.length}`,
  ].join('\n');
}
