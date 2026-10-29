import type { DeviceConfig, InterfaceConfig, NatRule } from '../../model/config.js';
import { maskToPrefix, prefixToMask } from '../../protocols/l3/ip.js';
import { formatTranslations, poolAddresses } from '../../protocols/nat/nat.js';
import type { LinkEnvironment } from '../environment.js';
import type { Args, CommandContext, CommandDef } from '../types.js';

const IF_MODES = ['config-if', 'config-if-range', 'config-subif'] as const;

const interfaces = (ctx: CommandContext): InterfaceConfig[] =>
  ctx.config.interfaces.filter((i) => ctx.selection.interfaces?.includes(i.name));

const role = (which: 'inside' | 'outside'): CommandDef => ({
  modes: [...IF_MODES],
  syntax: `ip nat ${which}`,
  help: which === 'inside' ? 'Inside interface for address translation' : 'Outside interface for address translation',
  negatable: true,
  run: (ctx) => {
    for (const ifc of interfaces(ctx)) {
      if (ctx.negate) {
        if (ifc.natRole === which) delete ifc.natRole;
      } else {
        ifc.natRole = which;
      }
    }
  },
});

const sameRule = (a: NatRule, b: NatRule): boolean => a.acl === b.acl && a.pool === b.pool && a.iface === b.iface;

function rule(syntax: string, build: (args: Args) => NatRule): CommandDef {
  return {
    modes: ['config'],
    syntax: `ip nat inside source list <acl:word> ${syntax}`,
    help: 'Specify access list describing local addresses',
    paramHelp: { acl: 'Access list number or name for local addresses', pool: 'Name pool of global addresses', out: 'Specify interface for global address' },
    negatable: true,
    run: (ctx, args) => {
      const r = build(args);
      // One dynamic rule per ACL, as in IOS: a new line replaces the previous one for the same list.
      ctx.config.nat.rules = ctx.config.nat.rules.filter((x) => x.acl !== r.acl && !sameRule(x, r));
      if (!ctx.negate) ctx.config.nat.rules.push(r);
    },
  };
}

function pool(syntax: string, mask: (args: Args) => string | null): CommandDef {
  return {
    modes: ['config'],
    syntax: `ip nat pool <name:word> <start:ip> <end:ip> ${syntax}`,
    negateSyntax: 'ip nat pool <name:word>',
    help: 'Define pool of addresses',
    paramHelp: { name: 'Pool name', start: 'Start IP address', end: 'End IP address', mask: 'Network mask', length: 'Prefix length' },
    run: (ctx, args) => {
      const name = args.name as string;
      ctx.config.nat.pools = ctx.config.nat.pools.filter((p) => p.name !== name);
      if (ctx.negate) return;
      const m = mask(args) ?? ctx.invalid(6);
      ctx.config.nat.pools.push({ name, start: args.start as string, end: args.end as string, mask: m });
    },
  };
}

export const natCommands: CommandDef[] = [
  role('inside'),
  role('outside'),
  {
    modes: ['config'],
    syntax: 'ip nat inside source static <local:ip> <global:ip>',
    help: 'Specify static local->global mapping',
    paramHelp: { local: 'Inside local IP address', global: 'Inside global IP address' },
    negatable: true,
    run: (ctx, args) => {
      const local = args.local as string;
      ctx.config.nat.statics = ctx.config.nat.statics.filter((s) => s.local !== local);
      if (!ctx.negate) ctx.config.nat.statics.push({ local, global: args.global as string });
    },
  },
  pool('netmask <mask:mask>', (a) => (maskToPrefix(a.mask as string) === null ? null : (a.mask as string))),
  pool('prefix-length <length:int:1-32>', (a) => prefixToMask(Number(a.length))),
  rule('pool <pool:word>', (a) => ({ acl: a.acl as string, pool: a.pool as string, overload: false })),
  rule('pool <pool:word> overload', (a) => ({ acl: a.acl as string, pool: a.pool as string, overload: true })),
  rule('interface <out:iface> overload', (a) => ({ acl: a.acl as string, iface: a.out as string, overload: true })),
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip nat translations',
    help: 'Translation entries',
    run: (ctx) => formatTranslations(ctx.config.nat.statics, ctx.env.natTranslations()),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip nat statistics',
    help: 'Translation statistics',
    run: (ctx) => renderNatStatistics(ctx.config, ctx.env),
  },
  {
    modes: ['privileged'],
    syntax: 'clear ip nat translation *',
    help: 'Delete all dynamic translations',
    run: (ctx) => ctx.env.clearNat(),
  },
];

/** A shortened `show ip nat statistics`: the parts the CCNA course reads. */
export function renderNatStatistics(config: DeviceConfig, env: LinkEnvironment): string {
  const entries = env.natTranslations();
  const statics = config.nat.statics.length;
  const extended = entries.filter((e) => e.proto !== 'ip').length;
  const { hits, misses } = env.natCounters();
  const named = (r: 'inside' | 'outside'): string[] => config.interfaces.filter((i) => i.natRole === r).map((i) => `  ${i.name}`);
  const mappings = config.nat.rules.flatMap((r, i) => {
    const p = r.pool ? config.nat.pools.find((x) => x.name === r.pool) : undefined;
    // Global addresses this rule hands out: its pool, or the address of its interface.
    const globals = p ? poolAddresses(p) : [config.interfaces.find((x) => x.name === r.iface)?.ip?.address ?? ''];
    const mine = entries.filter((e) => globals.includes(e.insideGlobal));
    const head = `[Id: ${i + 1}] access-list ${r.acl} ${r.iface ? `interface ${r.iface}` : `pool ${r.pool}`}${r.overload ? ' overload' : ''} refcount ${mine.length}`;
    if (!p) return [head];
    const total = globals.length;
    const allocated = new Set(mine.map((e) => e.insideGlobal)).size;
    return [
      head,
      ` pool ${p.name}: netmask ${p.mask}`,
      `\tstart ${p.start} end ${p.end}`,
      `\ttype generic, total addresses ${total}, allocated ${allocated} (${Math.floor((allocated * 100) / Math.max(1, total))}%), misses 0`,
    ];
  });
  return [
    `Total active translations: ${statics + entries.length} (${statics} static, ${entries.length} dynamic; ${extended} extended)`,
    'Outside interfaces:',
    ...named('outside'),
    'Inside interfaces:',
    ...named('inside'),
    `Hits: ${hits}  Misses: ${misses}`,
    'Expired translations: 0',
    'Dynamic mappings:',
    ...(mappings.length > 0 ? ['-- Inside Source', ...mappings] : []),
  ].join('\n');
}
