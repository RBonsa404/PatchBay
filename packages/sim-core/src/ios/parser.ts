import { resolveInterface } from './interfaces.js';
import type { DeviceProfile } from './profiles.js';
import { isInRange, isIpv4, paramLabel, parseSyntax, type LiteralNode, type ParamNode, type SyntaxNode } from './syntax.js';
import type { Args, CommandDef } from './types.js';

export interface CompiledCommand {
  def: CommandDef;
  nodes: SyntaxNode[];
  /** Nodes used after `no` when the command declares a negateSyntax. */
  negNodes?: SyntaxNode[];
}

export const compileCommands = (defs: CommandDef[]): CompiledCommand[] =>
  defs.map((def) => ({
    def,
    nodes: parseSyntax(def.syntax),
    ...(def.negateSyntax ? { negNodes: parseSyntax(def.negateSyntax) } : {}),
  }));

export const isNegatable = (c: CompiledCommand): boolean => c.def.negatable === true || c.def.negateSyntax !== undefined;

export interface Token {
  text: string;
  /** Column of the token within the raw line. */
  start: number;
}

export function tokenize(line: string): Token[] {
  const out: Token[] = [];
  const re = /\S+/g;
  for (let m = re.exec(line); m; m = re.exec(line)) out.push({ text: m[0], start: m.index });
  return out;
}

export interface ParseEnv {
  profile: DeviceProfile;
  /** Parsing the part after `no`: trailing parameters are optional. */
  negate: boolean;
  groupHelp: Record<string, string>;
}

interface State {
  cmd: CompiledCommand;
  /** Index of the next syntax node to match. */
  n: number;
  args: Args;
  /** The syntax being matched (negate form after `no` when the command has one). */
  nodes: SyntaxNode[];
}

type WalkError = { kind: 'invalid'; at: number } | { kind: 'ambiguous' };

function walk(pool: CompiledCommand[], tokens: Token[], line: string, env: ParseEnv): { states: State[]; error?: WalkError } {
  let states: State[] = pool.map((cmd) => ({ cmd, n: 0, args: {}, nodes: env.negate && cmd.negNodes ? cmd.negNodes : cmd.nodes }));
  let t = 0;
  while (t < tokens.length) {
    const tok = tokens[t] as Token;
    const lower = tok.text.toLowerCase();

    const literalHits = states.filter((s) => {
      const nd = s.nodes[s.n];
      return nd?.kind === 'literal' && nd.word.startsWith(lower);
    });
    if (literalHits.length > 0) {
      const wordOf = (s: State): string => (s.nodes[s.n] as LiteralNode).word;
      const exact = literalHits.filter((s) => wordOf(s) === lower);
      const use = exact.length > 0 ? exact : literalHits;
      if (new Set(use.map(wordOf)).size > 1) return { states, error: { kind: 'ambiguous' } };
      states = use.map((s) => ({ ...s, n: s.n + 1 }));
      t += 1;
      continue;
    }

    let consumed = 0;
    const next: State[] = [];
    for (const s of states) {
      const nd = s.nodes[s.n];
      if (nd?.kind !== 'param') continue;
      const r = matchParam(nd, tokens, t, line, env);
      if (!r) continue;
      // States that disagree on how many tokens a parameter consumes are dropped: first one wins.
      if (consumed === 0) consumed = r.consumed;
      if (r.consumed !== consumed) continue;
      next.push({ cmd: s.cmd, n: s.n + 1, args: { ...s.args, [nd.name]: r.value }, nodes: s.nodes });
    }
    if (next.length === 0) return { states, error: { kind: 'invalid', at: t } };
    states = next;
    t += consumed;
  }
  return { states };
}

function matchParam(
  nd: ParamNode,
  tokens: Token[],
  t: number,
  line: string,
  env: ParseEnv,
): { value: string; consumed: number } | null {
  const tok = (tokens[t] as Token).text;
  switch (nd.type) {
    case 'word':
      return { value: tok, consumed: 1 };
    case 'int':
      return isInRange(tok, nd) ? { value: tok, consumed: 1 } : null;
    case 'ip':
    case 'mask':
      return isIpv4(tok) ? { value: tok, consumed: 1 } : null;
    case 'text':
      return { value: line.slice((tokens[t] as Token).start).trimEnd(), consumed: tokens.length - t };
    case 'iface': {
      const r = resolveInterface(
        env.profile,
        tokens.slice(t, t + 2).map((x) => x.text),
      );
      return r ? { value: r.name, consumed: r.consumed } : null;
    }
  }
}

/** A command is complete when all nodes matched; with `no`, remaining parameter-only nodes may be omitted. */
function isComplete(s: State, env: ParseEnv): boolean {
  const rest = s.nodes.slice(s.n);
  return rest.length === 0 || (env.negate && rest.every((nd) => nd.kind === 'param'));
}

export type Match =
  | { kind: 'ok'; cmd: CompiledCommand; args: Args }
  | { kind: 'invalid'; at: number }
  | { kind: 'ambiguous' }
  | { kind: 'incomplete' };

export function match(pool: CompiledCommand[], line: string, env: ParseEnv): Match {
  const tokens = tokenize(line);
  const { states, error } = walk(pool, tokens, line, env);
  if (error) return error;
  const done = states.find((s) => isComplete(s, env));
  if (done) return { kind: 'ok', cmd: done.cmd, args: done.args };
  return { kind: 'incomplete' };
}

const NO_HELP = 'Negate a command or set its defaults';

const IFACE_HELP: Record<string, string> = {
  FastEthernet: 'FastEthernet IEEE 802.3',
  GigabitEthernet: 'GigabitEthernet IEEE 802.3z',
  Serial: 'Serial',
  Vlan: 'Catalyst Vlans',
};

/** When the next parameter is an interface, the interface types of this device are valid next words. */
function interfaceTypes(states: State[], env: ParseEnv): string[] {
  const wantsIface = states.some((s) => {
    const nd = s.nodes[s.n];
    return nd?.kind === 'param' && nd.type === 'iface';
  });
  return wantsIface ? env.profile.groups.map((g) => g.type) : [];
}

function nextWords(states: State[]): LiteralNode[] {
  const words = new Map<string, LiteralNode>();
  for (const s of states) {
    const nd = s.nodes[s.n];
    if (nd?.kind === 'literal') words.set(nd.word, nd);
  }
  return [...words.values()];
}

/** `?` handling: contextual help, or a word list when the question mark is glued to a partial word. */
export function help(pool: CompiledCommand[], body: string, env: ParseEnv, allowNo: boolean): string {
  const tokens = tokenize(body);
  const partial = body.length > 0 && !/\s$/.test(body);
  const walked = partial ? tokens.slice(0, -1) : tokens;
  const { states, error } = walk(pool, walked, body, env);
  if (error) return '% Unrecognized command';

  if (partial) {
    const prefix = (tokens[tokens.length - 1] as Token).text.toLowerCase();
    const words = nextWords(states)
      .map((n) => n.word)
      .concat(allowNo && walked.length === 0 ? ['no'] : [])
      .concat(interfaceTypes(states, env))
      .filter((w) => w.toLowerCase().startsWith(prefix))
      .sort((a, b) => a.localeCompare(b));
    return words.length > 0 ? words.join('  ') : '% Unrecognized command';
  }

  const rows = new Map<string, string>();
  for (const s of states) {
    const nd = s.nodes[s.n];
    if (nd?.kind === 'literal') {
      if (rows.has(nd.word)) continue;
      const last = s.n === s.nodes.length - 1;
      const path = s.nodes
        .slice(0, s.n + 1)
        .map((x) => (x.kind === 'literal' ? x.word : '*'))
        .join(' ');
      rows.set(nd.word, last ? s.cmd.def.help : (env.groupHelp[path] ?? ''));
    } else if (nd?.kind === 'param' && nd.type === 'iface') {
      for (const g of env.profile.groups) rows.set(g.type, IFACE_HELP[g.type] ?? g.type);
    } else if (nd?.kind === 'param') {
      const label = paramLabel(nd);
      if (!rows.has(label)) rows.set(label, s.cmd.def.paramHelp?.[nd.name] ?? nd.name);
    }
  }
  if (allowNo && walked.length === 0) rows.set('no', NO_HELP);
  const hasCr = states.some((s) => isComplete(s, env));

  const keys = [...rows.keys()].sort((a, b) => a.localeCompare(b));
  if (hasCr) keys.push('<cr>');
  if (keys.length === 0) return '% Unrecognized command';
  const width = Math.max(...keys.map((k) => k.length));
  return keys.map((k) => `  ${k.padEnd(width)}  ${rows.get(k) ?? ''}`.trimEnd()).join('\n');
}

/** Tab completion: complete the last word if exactly one literal matches. Returns the new line or null. */
export function complete(pool: CompiledCommand[], line: string, env: ParseEnv, allowNo: boolean): string | null {
  const tokens = tokenize(line);
  if (tokens.length === 0 || /\s$/.test(line)) return null;
  const last = tokens[tokens.length - 1] as Token;
  const { states, error } = walk(pool, tokens.slice(0, -1), line, env);
  if (error) return null;
  const prefix = last.text.toLowerCase();
  const words = nextWords(states)
    .map((n) => n.word)
    .concat(allowNo && tokens.length === 1 ? ['no'] : [])
    .concat(interfaceTypes(states, env))
    .filter((w) => w.toLowerCase().startsWith(prefix));
  const unique = [...new Set(words)];
  return unique.length === 1 ? `${line.slice(0, last.start)}${unique[0]} ` : null;
}
