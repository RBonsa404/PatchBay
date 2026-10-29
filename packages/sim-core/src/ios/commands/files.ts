import { renderRunningConfig, renderStartupConfig } from '../render/running-config.js';
import { renderVersion } from '../render/version.js';
import type { CommandContext, CommandDef } from '../types.js';

const isDeclined = (answer: string): boolean => answer.trim().toLowerCase().startsWith('n');

function save(ctx: CommandContext): string {
  ctx.saveStartup();
  return 'Building configuration...\n[OK]';
}

export const fileCommands: CommandDef[] = [
  {
    modes: ['privileged'],
    syntax: 'show running-config',
    help: 'Current operating configuration',
    run: (ctx) => renderRunningConfig(ctx.profile, ctx.config),
  },
  {
    modes: ['privileged'],
    syntax: 'show startup-config',
    help: 'Contents of startup configuration',
    run: (ctx) => (ctx.startup ? renderStartupConfig(ctx.profile, ctx.startup) : 'startup-config is not present'),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show version',
    help: 'System hardware and software status',
    run: (ctx) => renderVersion(ctx.profile, ctx.config),
  },
  {
    modes: ['privileged'],
    syntax: 'copy running-config startup-config',
    help: 'Copy from system:running-config to nvram:startup-config',
    run: (ctx) => {
      ctx.ask({
        prompt: 'Destination filename [startup-config]? ',
        handler: () => save(ctx),
      });
    },
  },
  {
    modes: ['privileged'],
    syntax: 'write memory',
    help: 'Write to NV memory',
    run: (ctx) => save(ctx),
  },
  {
    modes: ['privileged'],
    syntax: 'erase startup-config',
    help: 'Erase the startup configuration',
    run: (ctx) => {
      ctx.ask({
        prompt: 'Erasing the nvram filesystem will remove all files! Continue? [confirm]',
        handler: (answer) => {
          if (isDeclined(answer)) return;
          ctx.eraseStartup();
          return '[OK]\nErase of nvram: complete';
        },
      });
    },
  },
  {
    modes: ['privileged'],
    syntax: 'reload',
    help: 'Halt and perform a cold restart',
    run: (ctx) => ctx.reload(),
  },
];
