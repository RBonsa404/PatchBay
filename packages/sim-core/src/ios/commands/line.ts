import type { LineConfig } from '../../model/config.js';
import type { CommandContext, CommandDef } from '../types.js';

const selected = (ctx: CommandContext): LineConfig[] =>
  ctx.config.lines.filter((l) => ctx.selection.lines?.includes(l.id));

export const lineCommands: CommandDef[] = [
  {
    modes: ['config-line'],
    syntax: 'password <password:word>',
    help: 'Set a password',
    paramHelp: { password: 'The UNENCRYPTED (cleartext) line password' },
    negatable: true,
    run: (ctx, args) => {
      for (const line of selected(ctx)) {
        if (ctx.negate) delete line.password;
        else line.password = args.password as string;
      }
    },
  },
  {
    modes: ['config-line'],
    syntax: 'login',
    help: 'Enable password checking',
    negatable: true,
    run: (ctx) => {
      for (const line of selected(ctx)) line.login = !ctx.negate;
    },
  },
  {
    modes: ['config-line'],
    syntax: 'logging synchronous',
    help: 'Synchronized message output',
    negatable: true,
    run: (ctx) => {
      for (const line of selected(ctx)) line.loggingSynchronous = !ctx.negate;
    },
  },
  {
    modes: ['config-line'],
    syntax: 'exec-timeout <minutes:int:0-35791> <seconds:int:0-2147483>',
    help: 'Set the EXEC timeout',
    paramHelp: { minutes: 'Timeout in minutes', seconds: 'Timeout in seconds' },
    negatable: true,
    run: (ctx, args) => {
      for (const line of selected(ctx)) {
        if (ctx.negate) delete line.execTimeout;
        else line.execTimeout = { minutes: Number(args.minutes), seconds: Number(args.seconds) };
      }
    },
  },
];
