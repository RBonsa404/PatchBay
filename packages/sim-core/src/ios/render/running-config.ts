import type { DeviceConfig, InterfaceConfig, LineConfig, OspfConfig } from '../../model/config.js';
import { enableSecretHash, type7Encrypt } from '../crypto.js';
import { parentOf } from '../interfaces.js';
import { groupOf, type DeviceProfile } from '../profiles.js';
import { formatVlanList } from '../vlan-list.js';
import { formatConfigEntry } from '../../protocols/acl/acl.js';

function renderInterface(profile: DeviceProfile, ifc: InterfaceConfig): string[] {
  const group = groupOf(profile, ifc.name);
  const out = [`interface ${ifc.name}`];
  const sub = parentOf(ifc.name) !== undefined;
  if (ifc.description) out.push(` description ${ifc.description}`);
  if (ifc.bandwidth !== undefined) out.push(` bandwidth ${ifc.bandwidth}`);
  if (ifc.encapsulation) out.push(` encapsulation dot1Q ${ifc.encapsulation.vlan}${ifc.encapsulation.native ? ' native' : ''}`);
  if (ifc.ip) out.push(` ip address ${ifc.ip.address} ${ifc.ip.mask}`);
  else if (group && group.layer === 3 && !sub) out.push(' no ip address');
  if (ifc.natRole) out.push(` ip nat ${ifc.natRole}`);
  if (ifc.ospfCost !== undefined) out.push(` ip ospf cost ${ifc.ospfCost}`);
  if (ifc.ospfPriority !== undefined) out.push(` ip ospf priority ${ifc.ospfPriority}`);
  if (ifc.aclIn !== undefined) out.push(` ip access-group ${ifc.aclIn} in`);
  if (ifc.aclOut !== undefined) out.push(` ip access-group ${ifc.aclOut} out`);
  if (ifc.clockRate !== undefined) out.push(` clock rate ${ifc.clockRate}`);
  if (group?.kind === 'ethernet' && group.layer === 3 && !sub) out.push(' duplex auto', ' speed auto');
  const sw = ifc.switchport;
  if (sw) {
    if (sw.accessVlan !== undefined) out.push(` switchport access vlan ${sw.accessVlan}`);
    if (sw.trunkNative !== undefined) out.push(` switchport trunk native vlan ${sw.trunkNative}`);
    if (sw.trunkAllowed !== undefined) {
      out.push(` switchport trunk allowed vlan ${sw.trunkAllowed.length === 0 ? 'none' : formatVlanList(sw.trunkAllowed)}`);
    }
    if (sw.mode) out.push(` switchport mode ${sw.mode}`);
  }
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
  if (line.accessClassIn !== undefined) out.push(` access-class ${line.accessClassIn} in`);
  if (line.login) out.push(' login');
  return out;
}

function renderOspf(o: OspfConfig): string[] {
  const out = [`router ospf ${o.processId}`];
  if (o.routerId) out.push(` router-id ${o.routerId}`);
  out.push(' log-adjacency-changes');
  if (o.referenceBandwidth !== 100) out.push(` auto-cost reference-bandwidth ${o.referenceBandwidth}`);
  if (o.passiveDefault) out.push(' passive-interface default', ...o.notPassive.map((i) => ` no passive-interface ${i}`));
  else out.push(...o.passive.map((i) => ` passive-interface ${i}`));
  out.push(...o.networks.map((n) => ` network ${n.network} ${n.wildcard} area ${n.area}`));
  if (o.defaultOriginate) out.push(` default-information originate${o.defaultOriginate.always ? ' always' : ''}`);
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

  for (const vlan of config.vlans) out.push(`vlan ${vlan.id}`, ...(vlan.name ? [` name ${vlan.name}`] : []), '!');

  for (const ifc of config.interfaces) out.push(...renderInterface(profile, ifc), '!');

  // IOS order after the interfaces: routing processes, default gateway, static routes, NAT, access lists.
  if (config.ospf) out.push(...renderOspf(config.ospf), '!');

  if (config.defaultGateway) out.push(`ip default-gateway ${config.defaultGateway}`, '!');

  if (config.staticRoutes.length > 0) {
    for (const r of config.staticRoutes) {
      out.push(`ip route ${r.network} ${r.mask} ${r.nextHop ?? r.iface}${r.distance === 1 ? '' : ` ${r.distance}`}`);
    }
    out.push('!');
  }

  const { nat } = config;
  for (const p of nat.pools) out.push(`ip nat pool ${p.name} ${p.start} ${p.end} netmask ${p.mask}`);
  for (const r of nat.rules) {
    out.push(`ip nat inside source list ${r.acl} ${r.iface ? `interface ${r.iface}` : `pool ${r.pool}`}${r.overload ? ' overload' : ''}`);
  }
  for (const s of nat.statics) out.push(`ip nat inside source static ${s.local} ${s.global}`);
  if (nat.pools.length + nat.rules.length + nat.statics.length > 0) out.push('!');

  const { dhcp } = config;
  for (const r of dhcp.excluded) out.push(`ip dhcp excluded-address ${r.from}${r.to === r.from ? '' : ` ${r.to}`}`);
  if (dhcp.excluded.length > 0) out.push('!');
  for (const p of dhcp.pools) {
    out.push(`ip dhcp pool ${p.name}`);
    if (p.network) out.push(` network ${p.network} ${p.mask}`);
    if (p.router) out.push(` default-router ${p.router}`);
    if (p.dns) out.push(` dns-server ${p.dns}`);
    out.push('!');
  }

  const numbered = config.acls.filter((a) => !a.named);
  for (const acl of numbered) {
    for (const e of acl.entries) out.push(`access-list ${acl.name} ${e.action ? formatConfigEntry(acl.kind, e) : `remark ${e.remark}`}`);
  }
  if (numbered.length > 0) out.push('!');
  for (const acl of config.acls.filter((a) => a.named)) {
    out.push(`ip access-list ${acl.kind} ${acl.name}`);
    for (const e of acl.entries) out.push(` ${e.action ? formatConfigEntry(acl.kind, e) : `remark ${e.remark}`}`);
    out.push('!');
  }

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
