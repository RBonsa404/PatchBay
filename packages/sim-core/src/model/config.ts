import type { DeviceProfile } from '../ios/profiles.js';

export interface IpAddress {
  address: string;
  mask: string;
}

export interface InterfaceConfig {
  /** Canonical name, e.g. FastEthernet0/0. */
  name: string;
  description?: string;
  ip?: IpAddress;
  shutdown: boolean;
  clockRate?: number;
}

export interface LineConfig {
  /** Canonical id as printed by IOS: 'con 0', 'aux 0', 'vty 0 4', 'vty 5 15'. */
  id: string;
  /** Stored in clear; `show running-config` renders it encrypted when service password-encryption is on. */
  password?: string;
  login: boolean;
  loggingSynchronous: boolean;
  execTimeout?: { minutes: number; seconds: number };
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
  lines: LineConfig[];
  interfaces: InterfaceConfig[];
}

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
