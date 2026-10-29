import { profiles, type DeviceProfile } from '../ios/profiles.js';

export type DeviceKind = 'router' | 'switch' | 'pc' | 'server';
export type PortKind = 'ethernet' | 'serial' | 'console' | 'aux' | 'rs232';

export interface PortSpec {
  /** Canonical name; for IOS devices identical to the interface name (FastEthernet0/0). */
  name: string;
  kind: PortKind;
  /** Copper wiring polarity: NICs are MDI, switch ports MDI-X. A like-for-like pair needs a crossover cable. */
  polarity?: 'mdi' | 'mdix';
  /** Auto-MDIX hardware: tolerates the wrong copper cable when the level is not in strict mode. */
  autoMdix?: boolean;
  speedMbps?: number;
}

export interface DeviceModel {
  id: string;
  kind: DeviceKind;
  label: string;
  /** IOS facet of the model; absent for end hosts. */
  profile?: DeviceProfile;
  ports: PortSpec[];
}

const SPEED: Record<string, number> = { FastEthernet: 100, GigabitEthernet: 1000, Serial: 1.544 };

function iosPorts(profile: DeviceProfile, polarity: 'mdi' | 'mdix'): PortSpec[] {
  const ports: PortSpec[] = profile.groups
    .filter((g) => g.kind === 'ethernet' || g.kind === 'serial')
    .flatMap((g) =>
      g.ids.map(
        (id): PortSpec =>
          g.kind === 'serial'
            ? { name: g.type + id, kind: 'serial', speedMbps: SPEED[g.type] }
            : {
                name: g.type + id,
                kind: 'ethernet',
                polarity,
                autoMdix: profile.family === 'switch' || g.type === 'GigabitEthernet',
                speedMbps: SPEED[g.type],
              },
      ),
    );
  ports.push({ name: 'Console', kind: 'console' });
  if (profile.hasAux) ports.push({ name: 'Auxiliary', kind: 'aux' });
  return ports;
}

const profile = (id: string): DeviceProfile => profiles[id] as DeviceProfile;

const host = (id: string, kind: 'pc' | 'server', label: string): DeviceModel => ({
  id,
  kind,
  label,
  ports: [
    { name: 'FastEthernet0', kind: 'ethernet', polarity: 'mdi', autoMdix: false, speedMbps: 100 },
    ...(kind === 'pc' ? [{ name: 'RS232', kind: 'rs232' as const }] : []),
  ],
});

export const catalog: Record<string, DeviceModel> = {
  'cisco-1841': { id: 'cisco-1841', kind: 'router', label: 'Cisco 1841', profile: profile('cisco-1841'), ports: iosPorts(profile('cisco-1841'), 'mdi') },
  'cisco-2911': { id: 'cisco-2911', kind: 'router', label: 'Cisco 2911', profile: profile('cisco-2911'), ports: iosPorts(profile('cisco-2911'), 'mdi') },
  'catalyst-2960': {
    id: 'catalyst-2960',
    kind: 'switch',
    label: 'Catalyst 2960-24TT',
    profile: profile('catalyst-2960'),
    ports: iosPorts(profile('catalyst-2960'), 'mdix'),
  },
  pc: host('pc', 'pc', 'PC'),
  server: host('server', 'server', 'Server'),
};
