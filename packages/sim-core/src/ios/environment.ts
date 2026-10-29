import type { DeviceConfig } from '../model/config.js';

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

/** What an IOS device needs to know about the world around it. Implemented by Network; stubbed when a Cli runs alone. */
export interface LinkEnvironment {
  linkState(interfaceName: string): LinkState;
  /** Which end of a serial cable this interface is, or null when no serial cable is attached. */
  serialEnd(interfaceName: string): 'dce' | 'dte' | null;
  macAddress(interfaceName: string): string;
  /** Learned MAC addresses of this switch, in learning order. */
  macTable(): MacEntry[];
  clearMacTable(): void;
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
    commit: () => [],
    drain: () => [],
  };
}
