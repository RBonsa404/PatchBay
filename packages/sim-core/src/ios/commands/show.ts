import { vlanExists } from '../../model/config.js';
import { renderInterfaceBrief, renderInterfaces } from '../render/interfaces.js';
import { renderMacTable, renderTrunks, renderVlanBrief } from '../render/vlan.js';
import type { CommandContext, CommandDef } from '../types.js';

/** VLAN and MAC-table commands exist on switches only. */
const switchOnly = (ctx: CommandContext): void => {
  if (ctx.profile.family !== 'switch') ctx.invalid(1);
};

export const showCommands: CommandDef[] = [
  {
    modes: ['user', 'privileged'],
    syntax: 'show vlan',
    help: 'VTP VLAN status',
    run: (ctx) => {
      switchOnly(ctx);
      // The full `show vlan` adds type/SAID/MTU tables; the brief table is what the course uses.
      return renderVlanBrief(ctx.profile, ctx.config);
    },
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show vlan brief',
    help: 'VTP all VLAN status in brief',
    run: (ctx) => {
      switchOnly(ctx);
      return renderVlanBrief(ctx.profile, ctx.config);
    },
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show vlan id <id:int:1-4094>',
    help: 'VTP VLAN status by VLAN id',
    paramHelp: { id: 'VLAN ID of the VLAN to display' },
    run: (ctx, args) => {
      switchOnly(ctx);
      const id = Number(args.id);
      return vlanExists(ctx.config, id) ? renderVlanBrief(ctx.profile, ctx.config, id) : `VLAN id ${id} not found in current VLAN database`;
    },
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show interfaces trunk',
    help: 'Show interface trunk information',
    run: (ctx) => {
      switchOnly(ctx);
      return renderTrunks(ctx.profile, ctx.config, ctx.env);
    },
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show mac address-table',
    help: 'MAC forwarding table',
    run: (ctx) => {
      switchOnly(ctx);
      return renderMacTable(ctx.env.macTable());
    },
  },
  {
    modes: ['privileged'],
    syntax: 'clear mac address-table dynamic',
    help: 'dynamic entries',
    run: (ctx) => {
      if (ctx.profile.family !== 'switch') ctx.invalid(1);
      ctx.env.clearMacTable();
    },
  },
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
