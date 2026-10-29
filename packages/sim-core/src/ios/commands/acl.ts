import type { AclConfig, AclEntry, DeviceConfig, InterfaceConfig, LineConfig } from '../../model/config.js';
import { formatEntry, isExtendedNumber, isStandardNumber, parseEntry } from '../../protocols/acl/acl.js';
import type { LinkEnvironment } from '../environment.js';
import type { CommandContext, CommandDef } from '../types.js';

const IF_MODES = ['config-if', 'config-if-range', 'config-subif'] as const;
const NACL_MODES = ['config-std-nacl', 'config-ext-nacl'] as const;

function ensure(config: DeviceConfig, name: string, kind: AclConfig['kind'], named: boolean): AclConfig {
  let acl = config.acls.find((a) => a.name === name);
  if (!acl) config.acls.push((acl = { name, kind, named, entries: [] }));
  return acl;
}

/** Entries stay sorted by sequence number; a missing number is 10 past the last one. */
function addEntry(acl: AclConfig, entry: Omit<AclEntry, 'seq'>, seq?: number): void {
  const next = seq ?? (acl.entries.reduce((m, e) => Math.max(m, e.seq), 0) || 0) + 10;
  acl.entries = acl.entries.filter((e) => e.seq !== next);
  acl.entries.push({ ...entry, seq: next });
  acl.entries.sort((a, b) => a.seq - b.seq);
}

/**
 * Add or remove a `permit/deny/remark ...` line. `firstToken` is the index of the action within the whole command, so
 * a bad token gets its caret in the right place.
 */
function editEntry(ctx: CommandContext, acl: AclConfig, text: string, firstToken: number, seq?: number): void {
  const tokens = text.split(/\s+/);
  let entry: Omit<AclEntry, 'seq'>;
  if (tokens[0] === 'remark') {
    entry = { remark: tokens.slice(1).join(' ') };
  } else {
    const parsed = parseEntry(acl.kind, tokens);
    if ('error' in parsed) ctx.invalid(firstToken + parsed.error);
    entry = parsed.entry;
  }
  if (!ctx.negate) return addEntry(acl, entry, seq);
  const wanted = JSON.stringify({ ...entry, seq: 0 });
  acl.entries = acl.entries.filter((e) => JSON.stringify({ ...e, seq: 0 }) !== wanted);
}

const dropIfEmpty = (ctx: CommandContext, acl: AclConfig): void => {
  if (acl.entries.length === 0 && !acl.named) ctx.config.acls = ctx.config.acls.filter((a) => a !== acl);
};

const selectedAcl = (ctx: CommandContext): AclConfig | undefined => ctx.config.acls.find((a) => a.name === ctx.selection.acl);

const interfaces = (ctx: CommandContext): InterfaceConfig[] =>
  ctx.config.interfaces.filter((i) => ctx.selection.interfaces?.includes(i.name));

const lines = (ctx: CommandContext): LineConfig[] => ctx.config.lines.filter((l) => ctx.selection.lines?.includes(l.id));

const group = (direction: 'in' | 'out'): CommandDef => ({
  modes: [...IF_MODES],
  syntax: `ip access-group <acl:word> ${direction}`,
  help: direction === 'in' ? 'inbound packets' : 'outbound packets',
  paramHelp: { acl: 'Access list name or number' },
  negatable: true,
  run: (ctx, args) => {
    const key = direction === 'in' ? 'aclIn' : 'aclOut';
    for (const ifc of interfaces(ctx)) {
      if (ctx.negate) delete ifc[key];
      else ifc[key] = args.acl as string;
    }
  },
});

const naclLine = (syntax: string, help: string): CommandDef => ({
  modes: [...NACL_MODES],
  syntax,
  help,
  negatable: true,
  run: (ctx, args) => {
    const acl = selectedAcl(ctx);
    if (!acl) return;
    if (args.seq !== undefined && !args.rest) {
      // `no 20`
      acl.entries = acl.entries.filter((e) => e.seq !== Number(args.seq));
      return;
    }
    const verb = syntax.startsWith('<seq') ? '' : `${syntax.split(' ')[0]} `;
    editEntry(ctx, acl, `${verb}${args.rest ?? args.text}`, syntax.startsWith('<seq') ? 1 : 0, args.seq ? Number(args.seq) : undefined);
  },
});

export const aclCommands: CommandDef[] = [
  {
    modes: ['config'],
    syntax: 'access-list <number:int:1-2699> <rest:text>',
    help: 'Add an access list entry',
    paramHelp: { number: 'IP access list number', rest: 'permit/deny/remark ...' },
    negatable: true,
    run: (ctx, args) => {
      const n = Number(args.number);
      const kind = isStandardNumber(n) ? 'standard' : isExtendedNumber(n) ? 'extended' : ctx.invalid(1);
      if (ctx.negate && !args.rest) {
        ctx.config.acls = ctx.config.acls.filter((a) => a.name !== String(n));
        return;
      }
      const acl = ensure(ctx.config, String(n), kind, false);
      editEntry(ctx, acl, args.rest as string, 2);
      dropIfEmpty(ctx, acl);
    },
  },
  {
    modes: ['config'],
    syntax: 'ip access-list standard <name:word>',
    help: 'Standard Access List',
    paramHelp: { name: 'Standard IP access-list name or number' },
    negatable: true,
    run: (ctx, args) => {
      const name = args.name as string;
      if (ctx.negate) {
        ctx.config.acls = ctx.config.acls.filter((a) => a.name !== name);
        return;
      }
      ensure(ctx.config, name, 'standard', true);
      ctx.setMode('config-std-nacl', { acl: name });
    },
  },
  {
    modes: ['config'],
    syntax: 'ip access-list extended <name:word>',
    help: 'Extended Access List',
    paramHelp: { name: 'Extended IP access-list name or number' },
    negatable: true,
    run: (ctx, args) => {
      const name = args.name as string;
      if (ctx.negate) {
        ctx.config.acls = ctx.config.acls.filter((a) => a.name !== name);
        return;
      }
      ensure(ctx.config, name, 'extended', true);
      ctx.setMode('config-ext-nacl', { acl: name });
    },
  },
  naclLine('permit <rest:text>', 'Specify packets to forward'),
  naclLine('deny <rest:text>', 'Specify packets to reject'),
  naclLine('remark <text:text>', 'Access list entry comment'),
  naclLine('<seq:int:1-2147483647> <rest:text>', 'Sequence number'),
  group('in'),
  group('out'),
  {
    modes: ['config-line'],
    syntax: 'access-class <acl:word> in',
    help: 'Filter incoming connections',
    paramHelp: { acl: 'IP access list name or number' },
    negatable: true,
    run: (ctx, args) => {
      for (const line of lines(ctx)) {
        if (ctx.negate) delete line.accessClassIn;
        else line.accessClassIn = args.acl as string;
      }
    },
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show access-lists',
    help: 'List access lists',
    run: (ctx) => renderAcls(ctx.config, ctx.env),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show access-lists <name:word>',
    help: 'List access lists',
    paramHelp: { name: 'Access list name or number' },
    run: (ctx, args) => renderAcls(ctx.config, ctx.env, args.name),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip access-lists',
    help: 'List IP access lists',
    run: (ctx) => renderAcls(ctx.config, ctx.env),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip access-lists <name:word>',
    help: 'List IP access lists',
    paramHelp: { name: 'Access list name or number' },
    run: (ctx, args) => renderAcls(ctx.config, ctx.env, args.name),
  },
  {
    modes: ['privileged'],
    syntax: 'clear access-list counters',
    help: 'Clear access list counters',
    run: (ctx) => ctx.env.clearAclHits(),
  },
];

export function renderAcls(config: DeviceConfig, env: LinkEnvironment, only?: string): string {
  return config.acls
    .filter((a) => only === undefined || a.name === only)
    .flatMap((acl) => [
      `${acl.kind === 'standard' ? 'Standard' : 'Extended'} IP access list ${acl.name}`,
      ...acl.entries.map((e) => {
        const n = e.action ? env.aclHits(acl.name, e.seq) : 0;
        const hits = n > 0 ? ` (${n} ${n === 1 ? 'match' : 'matches'})` : '';
        return `    ${e.seq} ${formatEntry(acl.kind, e)}${hits}`;
      }),
    ])
    .join('\n');
}
