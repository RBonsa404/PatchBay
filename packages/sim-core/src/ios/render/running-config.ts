import type { DeviceConfig, InterfaceConfig, LineConfig } from '../../model/config.js';
import { enableSecretHash, type7Encrypt } from '../crypto.js';
import { groupOf, type DeviceProfile } from '../profiles.js';

function renderInterface(profile: DeviceProfile, ifc: InterfaceConfig): string[] {
  const group = groupOf(profile, ifc.name);
  const out = [`interface ${ifc.name}`];
  if (ifc.description) out.push(` description ${ifc.description}`);
  if (ifc.ip) out.push(` ip address ${ifc.ip.address} ${ifc.ip.mask}`);
  else if (group && group.layer === 3) out.push(' no ip address');
  if (ifc.clockRate !== undefined) out.push(` clock rate ${ifc.clockRate}`);
  if (group?.kind === 'ethernet' && group.layer === 3) out.push(' duplex auto', ' speed auto');
  if (ifc.shutdown) out.push(' shutdown');
  return out;
}

function renderLine(config: DeviceConfig, line: LineConfig): string[] {
  const out = [`line ${line.id}`];
  if (line.execTimeout) out.push(` exec-timeout ${line.execTimeout.minutes} ${line.execTimeout.seconds}`);
  if (line.password !== undefined) {
    out.push(config.passwordEncryption ? ` password 7 ${type7Encrypt(line.password)}` : ` password ${line.password}`);
  }
  if (line.loggingSynchronous) out.push(' logging synchronous');
  if (line.login) out.push(' login');
  return out;
}

/** Body of `show running-config` / `show startup-config`, from the first `!` to `end`. */
export function renderConfigBody(profile: DeviceProfile, config: DeviceConfig): string {
  const out: string[] = [
    '!',
    `version ${profile.iosVersion}`,
    'service timestamps log datetime msec',
    'service timestamps debug datetime msec',
    `${config.passwordEncryption ? '' : 'no '}service password-encryption`,
    '!',
    `hostname ${config.hostname}`,
    '!',
    '!',
  ];

  if (config.enableSecret !== undefined) out.push(`enable secret 5 ${enableSecretHash(config.enableSecret)}`);
  if (config.enablePassword !== undefined) {
    out.push(
      config.passwordEncryption
        ? `enable password 7 ${type7Encrypt(config.enablePassword)}`
        : `enable password ${config.enablePassword}`,
    );
  }
  if (config.enableSecret !== undefined || config.enablePassword !== undefined) out.push('!');

  if (!config.domainLookup) out.push('no ip domain lookup', '!');

  for (const ifc of config.interfaces) out.push(...renderInterface(profile, ifc), '!');

  if (config.motd !== undefined) out.push('banner motd ^C', ...config.motd, '^C', '!');

  for (const line of config.lines) out.push(...renderLine(config, line), '!');

  out.push('end');
  return out.join('\n');
}

export function renderRunningConfig(profile: DeviceProfile, config: DeviceConfig): string {
  const body = renderConfigBody(profile, config);
  return `Building configuration...\n\nCurrent configuration : ${body.length} bytes\n${body}`;
}

export function renderStartupConfig(profile: DeviceProfile, config: DeviceConfig): string {
  const body = renderConfigBody(profile, config);
  const total = profile.family === 'switch' ? 65536 : 262136;
  return `Using ${body.length} out of ${total} bytes\n${body}`;
}
