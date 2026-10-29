import { vlanExists, type InterfaceConfig, type SwitchportConfig } from '../../model/config.js';
import { groupOf } from '../profiles.js';
import { ALL_VLANS, parseVlanList } from '../vlan-list.js';
import type { CommandContext, CommandDef } from '../types.js';

const MODES = ['config-if', 'config-if-range'] as const;

const ports = (ctx: CommandContext): InterfaceConfig[] =>
  ctx.config.interfaces.filter((i) => ctx.selection.interfaces?.includes(i.name));

/** Switchport commands exist on layer-2 ports only. */
function layer2Ports(ctx: CommandContext): InterfaceConfig[] {
  const list = ports(ctx);
  if (list.some((i) => groupOf(ctx.profile, i.name)?.layer !== 2)) ctx.invalid(0);
  return list;
}

/** Drop the `switchport` object once nothing is configured in it, so running-config stays minimal. */
function tidy(ifc: InterfaceConfig): void {
  if (ifc.switchport && Object.values(ifc.switchport).every((v) => v === undefined)) delete ifc.switchport;
}

function edit(ifc: InterfaceConfig, change: (sw: SwitchportConfig) => void): void {
  const sw: SwitchportConfig = ifc.switchport ?? {};
  change(sw);
  for (const key of Object.keys(sw) as (keyof SwitchportConfig)[]) if (sw[key] === undefined) delete sw[key];
  ifc.switchport = sw;
  tidy(ifc);
}

/** Assigning a missing VLAN to an access port creates it, as IOS does. */
function ensureVlan(ctx: CommandContext, id: number): string[] {
  if (vlanExists(ctx.config, id)) return [];
  ctx.config.vlans.push({ id });
  ctx.config.vlans.sort((a, b) => a.id - b.id);
  return [`% Access VLAN does not exist. Creating vlan ${id}`];
}

function allowed(sw: SwitchportConfig): number[] {
  return sw.trunkAllowed ?? [...ALL_VLANS];
}

const listParam = { list: 'VLAN IDs of the allowed VLANs when this port is in trunking mode' };

export const vlanCommands: CommandDef[] = [
  {
    modes: ['config-vlan'],
    syntax: 'name <name:word>',
    help: 'Ascii name of the VLAN',
    paramHelp: { name: 'The ascii name for the VLAN' },
    negatable: true,
    run: (ctx, args) => {
      const id = ctx.selection.vlan;
      if (id === undefined) return;
      if (id === 1) return 'Default VLAN 1 may not have its name changed.';
      const vlan = ctx.config.vlans.find((v) => v.id === id);
      if (!vlan) return;
      if (ctx.negate) delete vlan.name;
      else vlan.name = args.name as string;
    },
  },
  {
    modes: [...MODES],
    syntax: 'switchport mode access',
    negateSyntax: 'switchport mode',
    help: 'Set trunking mode to ACCESS unconditionally',
    run: (ctx) => {
      for (const ifc of layer2Ports(ctx)) edit(ifc, (sw) => (sw.mode = ctx.negate ? undefined : 'access'));
    },
  },
  {
    modes: [...MODES],
    syntax: 'switchport mode trunk',
    negateSyntax: 'switchport mode',
    help: 'Set trunking mode to TRUNK unconditionally',
    run: (ctx) => {
      for (const ifc of layer2Ports(ctx)) edit(ifc, (sw) => (sw.mode = ctx.negate ? undefined : 'trunk'));
    },
  },
  {
    modes: [...MODES],
    syntax: 'switchport access vlan <id:int:1-4094>',
    help: 'Set VLAN when interface is in access mode',
    paramHelp: { id: 'VLAN ID of the VLAN when this port is in access mode' },
    negatable: true,
    run: (ctx, args) => {
      const list = layer2Ports(ctx);
      const id = Number(args.id);
      const notes = ctx.negate ? [] : ensureVlan(ctx, id);
      for (const ifc of list) edit(ifc, (sw) => (sw.accessVlan = ctx.negate ? undefined : id));
      return notes.join('\n');
    },
  },
  {
    modes: [...MODES],
    syntax: 'switchport trunk native vlan <id:int:1-4094>',
    help: 'Set native VLAN when interface is in trunking mode',
    paramHelp: { id: 'VLAN ID of the native VLAN when this port is in trunking mode' },
    negatable: true,
    run: (ctx, args) => {
      for (const ifc of layer2Ports(ctx)) edit(ifc, (sw) => (sw.trunkNative = ctx.negate ? undefined : Number(args.id)));
    },
  },
  {
    modes: [...MODES],
    syntax: 'switchport trunk allowed vlan <list:word>',
    help: 'Set allowed VLAN characteristics when interface is in trunking mode',
    paramHelp: listParam,
    negatable: true,
    run: (ctx, args) => {
      const ids = ctx.negate ? undefined : parseVlanList(args.list as string);
      if (!ctx.negate && !ids) ctx.invalid(4);
      for (const ifc of layer2Ports(ctx)) edit(ifc, (sw) => (sw.trunkAllowed = ids ?? undefined));
    },
  },
  {
    modes: [...MODES],
    syntax: 'switchport trunk allowed vlan add <list:word>',
    help: 'add VLANs to the current list',
    paramHelp: listParam,
    run: (ctx, args) => {
      const ids = parseVlanList(args.list as string) ?? ctx.invalid(5);
      for (const ifc of layer2Ports(ctx)) {
        edit(ifc, (sw) => {
          if (sw.trunkAllowed) sw.trunkAllowed = [...new Set([...sw.trunkAllowed, ...ids])].sort((a, b) => a - b);
        });
      }
    },
  },
  {
    modes: [...MODES],
    syntax: 'switchport trunk allowed vlan remove <list:word>',
    help: 'remove VLANs from the current list',
    paramHelp: listParam,
    run: (ctx, args) => {
      const ids = parseVlanList(args.list as string) ?? ctx.invalid(5);
      for (const ifc of layer2Ports(ctx)) edit(ifc, (sw) => (sw.trunkAllowed = allowed(sw).filter((v) => !ids.includes(v))));
    },
  },
  {
    modes: [...MODES],
    syntax: 'switchport trunk allowed vlan all',
    help: 'all VLANs',
    run: (ctx) => {
      for (const ifc of layer2Ports(ctx)) edit(ifc, (sw) => (sw.trunkAllowed = undefined));
    },
  },
  {
    modes: [...MODES],
    syntax: 'switchport trunk allowed vlan none',
    help: 'no VLANs',
    run: (ctx) => {
      for (const ifc of layer2Ports(ctx)) edit(ifc, (sw) => (sw.trunkAllowed = []));
    },
  },
];
