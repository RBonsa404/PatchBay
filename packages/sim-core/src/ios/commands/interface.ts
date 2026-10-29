import type { InterfaceConfig } from '../../model/config.js';
import { intToIp, ipToInt, maskToPrefix, networkOf, prefixToMask } from '../../protocols/l3/ip.js';
import { groupOf } from '../profiles.js';
import type { CommandContext, CommandDef } from '../types.js';

/** The interface(s) being configured: one in config-if, several in config-if-range. */
const selected = (ctx: CommandContext): InterfaceConfig[] =>
  ctx.config.interfaces.filter((i) => ctx.selection.interfaces?.includes(i.name));

const MODES = ['config-if', 'config-if-range', 'config-subif'] as const;

/**
 * The checks IOS makes before accepting an address: a contiguous mask, not the network or broadcast address of the
 * subnet, and no overlap with a subnet already configured on another interface.
 */
function addressProblem(ctx: CommandContext, ifc: InterfaceConfig, address: string, mask: string): string | undefined {
  const prefix = maskToPrefix(mask);
  if (prefix === null) return `Bad mask 0x${ipToInt(mask).toString(16).toUpperCase().padStart(8, '0')} for address ${address}`;
  if (prefix < 31) {
    const network = networkOf(address, mask);
    const broadcast = intToIp(ipToInt(network) + 2 ** (32 - prefix) - 1);
    if (address === network || address === broadcast) return `Bad mask /${prefix} for address ${address}`;
  }
  for (const other of ctx.config.interfaces) {
    if (other.name === ifc.name || !other.ip) continue;
    const otherPrefix = maskToPrefix(other.ip.mask) ?? 32;
    const shorter = prefixToMask(Math.min(prefix, otherPrefix));
    if (networkOf(address, shorter) === networkOf(other.ip.address, shorter)) return `% ${networkOf(address, mask)} overlaps with ${other.name}`;
  }
  return undefined;
}

export const interfaceCommands: CommandDef[] = [
  {
    modes: [...MODES],
    syntax: 'ip address <address:ip> <mask:mask>',
    help: 'Set the IP address of an interface',
    paramHelp: { address: 'IP address', mask: 'IP subnet mask' },
    negatable: true,
    run: (ctx, args) => {
      const address = args.address as string;
      const mask = args.mask as string;
      for (const ifc of selected(ctx)) {
        // Layer-2 switch ports have no IP address command.
        if (groupOf(ctx.profile, ifc.name)?.layer === 2) ctx.invalid(0);
        if (ctx.negate) {
          delete ifc.ip;
          continue;
        }
        const problem = addressProblem(ctx, ifc, address, mask);
        if (problem) return problem;
        ifc.ip = { address, mask };
      }
    },
  },
  {
    modes: [...MODES],
    syntax: 'shutdown',
    help: 'Shutdown the selected interface',
    negatable: true,
    run: (ctx) => {
      for (const ifc of selected(ctx)) ifc.shutdown = !ctx.negate;
    },
  },
  {
    modes: [...MODES],
    syntax: 'description <text:text>',
    help: 'Interface specific description',
    paramHelp: { text: 'Up to 240 characters describing this interface' },
    negatable: true,
    run: (ctx, args) => {
      for (const ifc of selected(ctx)) {
        if (ctx.negate) delete ifc.description;
        else ifc.description = args.text as string;
      }
    },
  },
  {
    modes: [...MODES],
    syntax: 'clock rate <rate:int:1200-8000000>',
    help: 'Configure serial interface clock',
    paramHelp: { rate: 'Speed (bits per second)' },
    negatable: true,
    run: (ctx, args) => {
      for (const ifc of selected(ctx)) {
        if (groupOf(ctx.profile, ifc.name)?.kind !== 'serial') ctx.invalid(0);
        // Only the DCE end of a cable provides the clock; with no cable attached IOS accepts the command.
        if (!ctx.negate && ctx.env.serialEnd(ifc.name) === 'dte') return '%Error: This command applies only to DCE interfaces';
        if (ctx.negate) delete ifc.clockRate;
        else ifc.clockRate = Number(args.rate);
      }
    },
  },
];
