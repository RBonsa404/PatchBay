import type { CommandDef } from '../types.js';
import { aclCommands } from './acl.js';
import { fileCommands } from './files.js';
import { globalCommands } from './global.js';
import { interfaceCommands } from './interface.js';
import { l3Commands } from './l3.js';
import { lineCommands } from './line.js';
import { natCommands } from './nat.js';
import { ospfCommands } from './ospf.js';
import { sessionCommands } from './session.js';
import { showCommands } from './show.js';
import { vlanCommands } from './vlan.js';

export const allCommands: CommandDef[] = [
  ...sessionCommands,
  ...globalCommands,
  ...lineCommands,
  ...interfaceCommands,
  ...vlanCommands,
  ...l3Commands,
  ...aclCommands,
  ...natCommands,
  ...ospfCommands,
  ...fileCommands,
  ...showCommands,
];

/** `?` descriptions for words that begin several commands (key = literal path, `*` for parameters). */
export const groupHelp: Record<string, string> = {
  banner: 'Define a login banner',
  'banner motd': 'Set Message of the Day banner',
  clock: 'Configure serial interface clock',
  configure: 'Enter configuration mode',
  copy: 'Copy from one file to another',
  enable: 'Modify enable password parameters',
  erase: 'Erase a filesystem',
  exit: 'Exit from the EXEC',
  ip: 'Global IP configuration subcommands',
  'ip domain': 'Domain Name System',
  clear: 'Reset functions',
  'clear mac': 'MAC forwarding table',
  'show mac': 'MAC configuration',
  switchport: 'Set switching mode characteristics',
  'switchport mode': 'Set trunking mode of the interface',
  'switchport access': 'Set access mode characteristics of the interface',
  'switchport trunk': 'Set trunking characteristics of the interface',
  'switchport trunk native': 'Set trunking native characteristics when interface is in trunking mode',
  'switchport trunk allowed': 'Set allowed VLAN characteristics when interface is in trunking mode',
  'switchport trunk allowed vlan': 'Set allowed VLAN characteristics when interface is in trunking mode',
  'switchport trunk native vlan': 'Set native VLAN when interface is in trunking mode',
  'switchport access vlan': 'Set VLAN when interface is in access mode',
  encapsulation: 'Set encapsulation type for an interface',
  'encapsulation dot1q': 'IEEE 802.1Q Virtual LAN',
  'ip route': 'Establish static routes',
  ping: 'Send echo messages',
  traceroute: 'Trace route to destination',
  'clear arp-cache': 'Clear the entire ARP cache',
  'access-list': 'Add an access list entry',
  'ip access-list': 'Named access list',
  'ip access-group': 'Specify access control for packets',
  'show access-lists': 'List access lists',
  'show ip access-lists': 'List IP access lists',
  'clear access-list': 'Clear access list statistical information',
  'ip nat': 'NAT configuration commands',
  'ip nat inside': 'Inside address translation',
  'ip nat inside source': 'Source address translation',
  'ip nat inside source list': 'Specify access list describing local addresses',
  'ip nat pool': 'Define pool of addresses',
  'show ip nat': 'IP NAT information',
  'clear ip nat': 'Clear NAT',
  'clear ip nat translation': 'Clear dynamic translation',
  router: 'Enable a routing process',
  'default-information': 'Control distribution of default information',
  'auto-cost': 'Calculate OSPF interface cost according to bandwidth',
  'passive-interface': 'Suppress routing updates on an interface',
  'ip ospf': 'OSPF interface commands',
  'show ip ospf': 'OSPF information',
  'show ip ospf interface': 'Interface information',
  'clear ip ospf': 'OSPF clear commands',
  'show ip': 'IP information',
  'show ip interface': 'IP interface status and configuration',
  line: 'Configure a terminal line',
  logging: 'Modify message logging facilities',
  service: 'Modify use of network based services',
  show: 'Show running system information',
  write: 'Write running configuration to memory, network, or terminal',
  'copy running-config': 'Copy from current system configuration',
};
