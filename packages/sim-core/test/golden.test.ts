import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Cli, profiles } from '../src/index.js';
import { fixtures } from './fixtures.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'golden');

/** Headers: `# profile: <id>` for a lone device, or `# fixture: <name>` + `# device: <id>` to sit inside a network. */
interface Session {
  profile?: string;
  fixture?: string;
  device?: string;
  lines: string[];
}

function parse(text: string): Session {
  const raw = text.replace(/\r\n/g, '\n').split('\n');
  const header = (key: string): string | undefined =>
    raw.map((h) => new RegExp(`^# ${key}: (.+)$`).exec(h)?.[1]).find(Boolean);
  const session: Session = { profile: header('profile'), fixture: header('fixture'), device: header('device'), lines: [] };
  if (!session.profile && !(session.fixture && session.device)) {
    throw new Error('golden session needs "# profile: <id>" or "# fixture: <name>" + "# device: <id>"');
  }
  const lines = raw.filter((l) => !l.startsWith('# '));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  session.lines = lines;
  return session;
}

function cliFor(session: Session): Cli {
  if (session.fixture) {
    const cli = fixtures[session.fixture]!().device(session.device!).cli;
    if (!cli) throw new Error(`${session.device} has no CLI`);
    return cli;
  }
  return new Cli({ profile: profiles[session.profile!]! });
}

/**
 * Replays a terminal transcript. A line is an input when it starts with the current prompt; the output lines that
 * follow an input are skipped (they are compared at the end). The last line must be the final prompt.
 */
function replay(session: Session): string[] {
  const cli = cliFor(session);
  const actual: string[] = [];
  const { lines } = session;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    const prompt = cli.prompt;
    const trimmed = prompt.trimEnd();
    if (i === lines.length - 1 && line.trimEnd() === trimmed) {
      actual.push(prompt);
      break;
    }
    if (!line.startsWith(trimmed)) {
      actual.push(`<<expected an input line starting with "${prompt}", got: ${line}>>`);
      i += 1;
      continue;
    }
    let input = line.slice(trimmed.length);
    if (prompt.endsWith(' ') && input.startsWith(' ')) input = input.slice(1);
    const r = cli.execute(input);
    actual.push(prompt + input);
    const out = r.output === '' ? [] : r.output.split('\n');
    actual.push(...out);
    i += 1 + out.length;
  }
  return actual.map((l) => l.trimEnd());
}

const files = readdirSync(dir).filter((f) => f.endsWith('.session.txt'));

describe('golden IOS sessions', () => {
  it('has golden sessions', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(file, () => {
      const session = parse(readFileSync(join(dir, file), 'utf8'));
      expect(replay(session)).toEqual(session.lines.map((l) => l.trimEnd()));
    });
  }
});
