import type { InterfaceConfig } from '../../model/config.js';
import { maskToPrefix, networkOf } from '../../protocols/l3/ip.js';
import { renderArp, renderPing, renderRoutes, renderTraceroute } from '../render/l3.js';
import type { Args, CommandContext, CommandDef } from '../types.js';

const ROUTE_HELP = { network: 'Destination prefix', mask: 'Destination prefix mask', next: 'Forwarding router\'s address', out: 'Forwarding interface', distance: 'Distance metric for this route' };

/** One handler for the four spellings of `ip route`. */
function ipRoute(ctx: CommandContext, args: Args): string | void {
  const { network, mask, next, out } = args as { network: string; mask: string; next?: string; out?: string };
  if (maskToPrefix(mask) === null) ctx.invalid(3);
  if (networkOf(network, mask) !== network) return '%Inconsistent address and mask';

  const sameTarget = (r: { nextHop?: string; iface?: string }): boolean =>
    (next === undefined && out === undefined) || (next !== undefined && r.nextHop === next) || (out !== undefined && r.iface === out);
  const samePrefix = (r: { network: string; mask: string }): boolean => r.network === network && r.mask === mask;

  const routes = ctx.config.staticRoutes;
  ctx.config.staticRoutes = routes.filter((r) => !(samePrefix(r) && sameTarget(r)));
  if (ctx.negate) return;
  ctx.config.staticRoutes.push({
    network,
    mask,
    ...(next !== undefined ? { nextHop: next } : {}),
    ...(out !== undefined ? { iface: out } : {}),
    distance: args.distance ? Number(args.distance) : 1,
  });
}

const route = (syntax: string): CommandDef => ({
  modes: ['config'],
  syntax: `ip route <network:ip> <mask:mask> ${syntax}`,
  help: 'Establish static routes',
  paramHelp: ROUTE_HELP,
  negatable: true,
  run: ipRoute,
});

const subinterface = (ctx: CommandContext): InterfaceConfig[] =>
  ctx.config.interfaces.filter((i) => ctx.selection.interfaces?.includes(i.name));

function encapsulate(native: boolean): CommandDef['run'] {
  return (ctx, args) => {
    for (const ifc of subinterface(ctx)) {
      if (ctx.negate) delete ifc.encapsulation;
      else ifc.encapsulation = { vlan: Number(args.vlan), native };
    }
  };
}

export const l3Commands: CommandDef[] = [
  route('<next:ip>'),
  route('<next:ip> <distance:int:1-255>'),
  route('<out:iface>'),
  route('<out:iface> <distance:int:1-255>'),
  {
    modes: ['config-subif'],
    syntax: 'encapsulation dot1q <vlan:int:1-4094>',
    help: 'IEEE 802.1Q Virtual LAN',
    paramHelp: { vlan: 'IEEE 802.1Q VLAN ID' },
    negatable: true,
    run: encapsulate(false),
  },
  {
    modes: ['config-subif'],
    syntax: 'encapsulation dot1q <vlan:int:1-4094> native',
    help: 'Make this VLAN the native VLAN on the trunk',
    paramHelp: { vlan: 'IEEE 802.1Q VLAN ID' },
    negatable: true,
    run: encapsulate(true),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'ping <destination:ip>',
    help: 'Send echo messages',
    paramHelp: { destination: 'Ping destination address or hostname' },
    run: (ctx, args) => renderPing(args.destination as string, ctx.env.ping(args.destination as string)),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'traceroute <destination:ip>',
    help: 'Trace route to destination',
    paramHelp: { destination: 'Trace route to destination address or hostname' },
    run: (ctx, args) => renderTraceroute(args.destination as string, ctx.env.traceroute(args.destination as string)),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip route',
    help: 'IP routing table',
    run: (ctx) => {
      if (ctx.profile.family !== 'router') ctx.invalid(2);
      return renderRoutes(ctx.config, ctx.env);
    },
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip arp',
    help: 'IP ARP table',
    run: (ctx) => renderArp(ctx.env.arpTable()),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show arp',
    help: 'ARP table',
    run: (ctx) => renderArp(ctx.env.arpTable()),
  },
  {
    modes: ['privileged'],
    syntax: 'clear arp-cache',
    help: 'Clear the entire ARP cache',
    run: (ctx) => ctx.env.clearArp(),
  },
];
