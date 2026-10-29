import type { DeviceConfig, InterfaceConfig } from '../../model/config.js';
import type { LinkEnvironment } from '../environment.js';
import { maskToPrefix } from '../../protocols/l3/ip.js';
import { groupOf, type DeviceProfile } from '../profiles.js';

/** `show ip interface brief` */
export function renderInterfaceBrief(config: DeviceConfig, env: LinkEnvironment): string {
  const row = (a: string, b: string, c: string, d: string, e: string, f: string): string =>
    `${a.padEnd(23)}${b.padEnd(16)}${c.padEnd(4)}${d.padEnd(7)}${e.padEnd(22)}${f}`;
  return [
    row('Interface', 'IP-Address', 'OK?', 'Method', 'Status', 'Protocol'),
    ...config.interfaces.map((ifc) => {
      const state = env.linkState(ifc.name);
      return row(ifc.name, ifc.ip?.address ?? 'unassigned', 'YES', ifc.ip ? 'manual' : 'unset', state.status, state.protocol);
    }),
  ].join('\n');
}

const BANDWIDTH_KBIT: Record<string, [bw: number, delay: number]> = {
  FastEthernet: [100000, 100],
  GigabitEthernet: [1000000, 10],
  Serial: [1544, 20000],
  Vlan: [1000000, 10],
};

function renderOne(profile: DeviceProfile, ifc: InterfaceConfig, env: LinkEnvironment): string {
  const group = groupOf(profile, ifc.name);
  const state = env.linkState(ifc.name);
  const isSwitchPort = profile.family === 'switch' && group?.kind === 'ethernet';
  const detail = state.status === 'administratively down' ? 'disabled' : state.status === 'up' ? 'connected' : 'notconnect';
  const [bw, delay] = BANDWIDTH_KBIT[group?.type ?? ''] ?? [1000000, 10];
  const mac = env.macAddress(ifc.name);

  const lines = [`${ifc.name} is ${state.status}, line protocol is ${state.protocol}${isSwitchPort ? ` (${detail})` : ''}`];
  if (group?.kind === 'serial') lines.push('  Hardware is HD64570');
  else lines.push(`  Hardware is ${group?.kind === 'svi' ? 'EtherSVI' : 'Lance'}, address is ${mac} (bia ${mac})`);
  if (ifc.description) lines.push(`  Description: ${ifc.description}`);
  if (ifc.ip) lines.push(`  Internet address is ${ifc.ip.address}/${maskToPrefix(ifc.ip.mask) ?? 0}`);
  lines.push(
    `  MTU 1500 bytes, BW ${bw} Kbit, DLY ${delay} usec,`,
    '     reliability 255/255, txload 1/255, rxload 1/255',
    `  Encapsulation ${group?.kind === 'serial' ? 'HDLC' : 'ARPA'}, loopback not set`,
  );
  if (group?.kind === 'ethernet') {
    lines.push(state.status === 'up' ? `  Full-duplex, ${bw / 1000}Mb/s` : '  Auto-duplex, Auto-speed');
  }
  lines.push('  Last input never, output never, output hang never', '  0 packets input, 0 bytes, 0 no buffer', '  0 packets output, 0 bytes, 0 underruns');
  return lines.join('\n');
}

/** `show interfaces [name]`: a simplified rendering; counters stay at zero until the packet engine exists (M4). */
export function renderInterfaces(profile: DeviceProfile, config: DeviceConfig, env: LinkEnvironment, name?: string): string {
  const list = name ? config.interfaces.filter((i) => i.name === name) : config.interfaces;
  return list.map((ifc) => renderOne(profile, ifc, env)).join('\n');
}
