import type { DeviceConfig } from '../../model/config.js';
import type { DeviceProfile } from '../profiles.js';

const TYPE_LABEL: Record<string, string> = {
  FastEthernet: 'FastEthernet',
  GigabitEthernet: 'Gigabit Ethernet',
  Serial: 'Serial',
};

/** Simplified `show version`: stable, plausible, and deterministic (uptime is always 0 until the engine has a clock). */
export function renderVersion(profile: DeviceProfile, config: DeviceConfig): string {
  const interfaces = profile.groups
    .filter((g) => g.kind !== 'svi')
    .map((g) => `${g.ids.length} ${TYPE_LABEL[g.type] ?? g.type} interface${g.ids.length > 1 ? 's' : ''}`);

  return [
    `Cisco IOS Software, ${profile.platform} Software, Version ${profile.iosVersion}, RELEASE SOFTWARE (fc1)`,
    'Technical Support: http://www.cisco.com/techsupport',
    'Copyright (c) 1986-2012 by Cisco Systems, Inc.',
    '',
    'ROM: System Bootstrap',
    '',
    `${config.hostname} uptime is 0 minutes`,
    '',
    `cisco ${profile.productId} (revision 1.0) with 491520K/32768K bytes of memory.`,
    ...interfaces,
    '',
    'Configuration register is 0x2102',
  ].join('\n');
}
