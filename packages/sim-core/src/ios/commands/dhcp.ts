import type { DhcpPool } from '../../model/config.js';
import type { CommandContext, CommandDef } from '../types.js';

const current = (ctx: CommandContext): DhcpPool | undefined => ctx.config.dhcp.pools.find((p) => p.name === ctx.selection.dhcpPool);

const routerOnly = (ctx: CommandContext): void => {
  if (ctx.profile.family !== 'router') ctx.invalid(1);
};

/** The DHCP server of a router, with Packet Tracer's output format. */
export const dhcpCommands: CommandDef[] = [
  {
    modes: ['config'],
    syntax: 'ip dhcp pool <name:word>',
    help: 'Configure DHCP address pools',
    paramHelp: { name: 'Pool name' },
    negatable: true,
    run: (ctx, args) => {
      routerOnly(ctx);
      const name = args.name as string;
      if (ctx.negate) {
        ctx.config.dhcp.pools = ctx.config.dhcp.pools.filter((p) => p.name !== name);
        return;
      }
      if (!ctx.config.dhcp.pools.some((p) => p.name === name)) ctx.config.dhcp.pools.push({ name });
      ctx.setMode('dhcp-config', { dhcpPool: name });
    },
  },
  {
    modes: ['config'],
    syntax: 'ip dhcp excluded-address <from:ip>',
    help: 'Prevent DHCP from assigning certain addresses',
    paramHelp: { from: 'Low IP address' },
    negatable: true,
    run: (ctx, args) => exclude(ctx, args.from as string, args.from as string),
  },
  {
    modes: ['config'],
    syntax: 'ip dhcp excluded-address <from:ip> <to:ip>',
    help: 'Prevent DHCP from assigning certain addresses',
    paramHelp: { from: 'Low IP address', to: 'High IP address' },
    negatable: true,
    run: (ctx, args) => exclude(ctx, args.from as string, args.to as string),
  },
  {
    modes: ['dhcp-config'],
    syntax: 'network <network:ip> <mask:ip>',
    help: 'Network number and mask',
    paramHelp: { network: 'Network number in dotted-decimal notation', mask: 'Network mask' },
    negatable: true,
    run: (ctx, args) => {
      const pool = current(ctx);
      if (!pool) return;
      if (ctx.negate) {
        delete pool.network;
        delete pool.mask;
      } else {
        pool.network = args.network as string;
        pool.mask = args.mask as string;
      }
    },
  },
  {
    modes: ['dhcp-config'],
    syntax: 'default-router <address:ip>',
    help: 'Default routers',
    paramHelp: { address: 'Router\'s IP address' },
    negatable: true,
    run: (ctx, args) => {
      const pool = current(ctx);
      if (!pool) return;
      if (ctx.negate) delete pool.router;
      else pool.router = args.address as string;
    },
  },
  {
    modes: ['dhcp-config'],
    syntax: 'dns-server <address:ip>',
    help: 'DNS servers',
    paramHelp: { address: 'Server\'s IP address' },
    negatable: true,
    run: (ctx, args) => {
      const pool = current(ctx);
      if (!pool) return;
      if (ctx.negate) delete pool.dns;
      else pool.dns = args.address as string;
    },
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip dhcp binding',
    help: 'DHCP address bindings',
    run: (ctx) => {
      routerOnly(ctx);
      const rows = ctx.env.dhcpBindings().map((b) => `${b.ip.padEnd(17)}${b.mac.toUpperCase().padEnd(25)}--                     Automatic`);
      return ['IP address       Client-ID/              Lease expiration        Type', '                 Hardware address', ...rows].join('\n');
    },
  },
  {
    modes: ['privileged'],
    syntax: 'clear ip dhcp binding *',
    help: 'Delete items from the DHCP database',
    run: (ctx) => {
      ctx.env.clearDhcpBindings();
    },
  },
];

function exclude(ctx: CommandContext, from: string, to: string): void {
  routerOnly(ctx);
  ctx.config.dhcp.excluded = ctx.config.dhcp.excluded.filter((r) => r.from !== from || r.to !== to);
  if (!ctx.negate) ctx.config.dhcp.excluded.push({ from, to });
}
