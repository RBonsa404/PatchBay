import { SUB_CONFIG_MODES, type CliMode, type CommandDef } from '../types.js';

const CONFIG_MODES: CliMode[] = ['config', ...SUB_CONFIG_MODES];

export const sessionCommands: CommandDef[] = [
  {
    modes: ['user'],
    syntax: 'enable',
    help: 'Turn on privileged commands',
    run: (ctx) => {
      const expected = ctx.config.enableSecret ?? ctx.config.enablePassword;
      if (expected === undefined) {
        ctx.setMode('privileged');
        return;
      }
      ctx.askPassword({
        expected,
        badMessage: 'Bad secrets',
        onSuccess: () => ctx.setMode('privileged'),
      });
    },
  },
  {
    modes: ['privileged'],
    syntax: 'disable',
    help: 'Turn off privileged commands',
    run: (ctx) => ctx.setMode('user'),
  },
  {
    modes: ['privileged'],
    syntax: 'configure terminal',
    help: 'Configuration from vty interface',
    run: (ctx) => {
      ctx.setMode('config');
      return 'Enter configuration commands, one per line.  End with CNTL/Z.';
    },
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'exit',
    help: 'Exit from the EXEC',
    run: (ctx) => ctx.logout(),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'logout',
    help: 'Exit from the EXEC',
    run: (ctx) => ctx.logout(),
  },
  {
    modes: CONFIG_MODES,
    syntax: 'exit',
    help: 'Exit from current configuration mode',
    run: (ctx) => ctx.setMode(ctx.mode === 'config' ? 'privileged' : 'config'),
  },
  {
    modes: CONFIG_MODES,
    syntax: 'end',
    help: 'Exit from configure mode',
    run: (ctx) => ctx.setMode('privileged'),
  },
];
