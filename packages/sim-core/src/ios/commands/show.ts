import { renderInterfaceBrief, renderInterfaces } from '../render/interfaces.js';
import type { CommandDef } from '../types.js';

export const showCommands: CommandDef[] = [
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip interface brief',
    help: 'Brief summary of IP status and configuration',
    run: (ctx) => renderInterfaceBrief(ctx.config, ctx.env),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show interfaces',
    help: 'Interface status and configuration',
    run: (ctx) => renderInterfaces(ctx.profile, ctx.config, ctx.env),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show interfaces <name:iface>',
    help: 'Interface status and configuration',
    paramHelp: { name: 'Interface type and number' },
    run: (ctx, args) => renderInterfaces(ctx.profile, ctx.config, ctx.env, args.name),
  },
];
