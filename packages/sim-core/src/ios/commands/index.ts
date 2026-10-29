import type { CommandDef } from '../types.js';
import { fileCommands } from './files.js';
import { globalCommands } from './global.js';
import { interfaceCommands } from './interface.js';
import { lineCommands } from './line.js';
import { sessionCommands } from './session.js';

export const allCommands: CommandDef[] = [
  ...sessionCommands,
  ...globalCommands,
  ...lineCommands,
  ...interfaceCommands,
  ...fileCommands,
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
  line: 'Configure a terminal line',
  logging: 'Modify message logging facilities',
  service: 'Modify use of network based services',
  show: 'Show running system information',
  write: 'Write running configuration to memory, network, or terminal',
  'copy running-config': 'Copy from current system configuration',
};
