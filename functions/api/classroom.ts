/**
 * A class of the IST: one teacher, the students who joined with the class code, the missions given as homework and
 * each student's results. Each class lives in its own Durable Object (SQLite storage, free plan), reached by its code;
 * the logic here only sees a small key-value store, so it runs the same in the Worker and in the tests.
 *
 * Nobody types a password: the teacher keeps a key shown once at creation, each student's browser keeps a token given
 * when joining. Only their SHA-256 digests are stored.
 */

export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
}

export interface Assignment {
  level: string;
  /** Marked as an exam: no hints, less time. */
  exam: boolean;
  /** Last day, YYYY-MM-DD, or none. */
  due?: string;
}

interface Meta {
  code: string;
  name: string;
  teacher: string;
  teacherHash: string;
  created: number;
  assignments: Assignment[];
}

interface Student {
  id: string;
  name: string;
  tokenHash: string;
  joined: number;
  seen: number;
}

export interface Result {
  level: string;
  exam: boolean;
  /** Best mark out of 100, and that attempt's details. */
  best: number;
  rank: string;
  used: number;
  limit: number;
  tidy: number | null;
  /** Last mark, and how many times the mission was handed in. */
  last: number;
  attempts: number;
  at: number;
}

export type Reply = { status: number; body: Record<string, unknown> };

export const MAX_STUDENTS = 300;
export const MAX_ASSIGNMENTS = 30;
const NAME = 40;
const LEVEL = /^l\d{2}-[a-z0-9-]{1,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Letters and digits that cannot be mistaken for one another when read aloud or copied from a board. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export const isClassCode = (value: unknown): value is string => typeof value === 'string' && /^[A-HJ-NP-Z2-9]{6}$/.test(value);

/** A teacher's key: 12 characters in three groups, about 60 bits. */
export const teacherKey = (): string => [randomCode(4), randomCode(4), randomCode(4)].join('-');

export async function digest(secret: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Trimmed, single-spaced, without control characters, cut to size. */
export function cleanName(value: unknown, max = NAME): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').replace(/[\p{Cc}<>]/gu, '').trim().slice(0, max);
}

const clamp = (value: unknown, min: number, max: number): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : null;

export function cleanAssignments(value: unknown): Assignment[] | null {
  if (!Array.isArray(value) || value.length > MAX_ASSIGNMENTS) return null;
  const out: Assignment[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const { level, exam, due } = item as Record<string, unknown>;
    if (typeof level !== 'string' || !LEVEL.test(level)) return null;
    const a: Assignment = { level, exam: exam === true };
    if (typeof due === 'string' && DAY.test(due)) a.due = due;
    // The same mission twice in the same mode says nothing more.
    if (!out.some((o) => o.level === a.level && o.exam === a.exam)) out.push(a);
  }
  return out;
}

const fail = (status: number, error: string): Reply => ({ status, body: { error } });
const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body });

const publicStudent = (s: Student): { id: string; name: string; joined: number; seen: number } => ({ id: s.id, name: s.name, joined: s.joined, seen: s.seen });

/** One class's requests. `now` is passed in so that tests decide the time. */
export class ClassroomLogic {
  constructor(private readonly store: Store) {}

  private meta(): Promise<Meta | undefined> {
    return this.store.get<Meta>('meta');
  }

  private async teacher(key: unknown): Promise<Meta | null> {
    const meta = await this.meta();
    if (!meta || typeof key !== 'string' || key.length > 40) return null;
    return (await digest(key.trim().toUpperCase())) === meta.teacherHash ? meta : null;
  }

  private async student(id: unknown, token: unknown): Promise<Student | null> {
    if (typeof id !== 'string' || typeof token !== 'string' || id.length > 40 || token.length > 80) return null;
    const s = await this.store.get<Student>(`student:${id}`);
    return s && (await digest(token)) === s.tokenHash ? s : null;
  }

  private async results(prefix: string): Promise<(Result & { student: string })[]> {
    const found = await this.store.list<Result>({ prefix });
    return [...found].map(([key, r]) => ({ ...r, student: key.split(':')[1] as string }));
  }

  async handle(body: Record<string, unknown>, now: number): Promise<Reply> {
    switch (body.action) {
      case 'create':
        return this.create(body, now);
      case 'join':
        return this.join(body, now);
      case 'me':
        return this.me(body, now);
      case 'report':
        return this.report(body, now);
      case 'board':
        return this.board(body);
      case 'assign':
        return this.assign(body);
      case 'remove':
        return this.remove(body);
      default:
        return fail(400, 'bad-request');
    }
  }

  private async create(body: Record<string, unknown>, now: number): Promise<Reply> {
    if (await this.meta()) return fail(409, 'taken');
    const name = cleanName(body.name);
    const teacher = cleanName(body.teacher);
    if (!isClassCode(body.code) || !name || !teacher || typeof body.key !== 'string') return fail(400, 'bad-request');
    const meta: Meta = { code: body.code, name, teacher, teacherHash: await digest(body.key.trim().toUpperCase()), created: now, assignments: [] };
    await this.store.put('meta', meta);
    return ok({ code: meta.code, name, teacher });
  }

  private async join(body: Record<string, unknown>, now: number): Promise<Reply> {
    const meta = await this.meta();
    if (!meta) return fail(404, 'no-class');
    const name = cleanName(body.name);
    if (name.length < 2) return fail(400, 'name');
    const students = await this.store.list<Student>({ prefix: 'student:' });
    if (students.size >= MAX_STUDENTS) return fail(403, 'full');
    const id = crypto.randomUUID().slice(0, 8);
    const token = crypto.randomUUID();
    await this.store.put(`student:${id}`, { id, name, tokenHash: await digest(token), joined: now, seen: now } satisfies Student);
    return ok({ id, token, name, className: meta.name, teacher: meta.teacher, assignments: meta.assignments });
  }

  private async me(body: Record<string, unknown>, now: number): Promise<Reply> {
    const meta = await this.meta();
    if (!meta) return fail(404, 'no-class');
    const s = await this.student(body.id, body.token);
    if (!s) return fail(403, 'forbidden');
    if (now - s.seen > 60_000) await this.store.put(`student:${s.id}`, { ...s, seen: now });
    const results = (await this.results(`result:${s.id}:`)).map((r) => {
      const { student, ...own } = r;
      void student;
      return own;
    });
    return ok({ name: s.name, className: meta.name, teacher: meta.teacher, assignments: meta.assignments, results });
  }

  private async report(body: Record<string, unknown>, now: number): Promise<Reply> {
    const s = await this.student(body.id, body.token);
    if (!s) return fail(403, 'forbidden');
    const r = body.result as Record<string, unknown> | undefined;
    if (!r || typeof r.level !== 'string' || !LEVEL.test(r.level)) return fail(400, 'bad-request');
    const total = clamp(r.total, 0, 100);
    const limit = clamp(r.limit, 1, 24 * 3600);
    const used = clamp(r.used, 0, 24 * 3600);
    if (total === null || limit === null || used === null) return fail(400, 'bad-request');
    const exam = r.exam === true;
    const rank = typeof r.rank === 'string' && /^[SABCD]$/.test(r.rank) ? r.rank : 'D';
    const tidy = clamp(r.tidy, 0, 100);
    const key = `result:${s.id}:${r.level}:${exam ? 'e' : 'p'}`;
    const before = await this.store.get<Result>(key);
    const better = !before || total > before.best;
    const next: Result = {
      level: r.level,
      exam,
      best: better ? total : before.best,
      rank: better ? rank : before.rank,
      used: better ? used : before.used,
      limit: better ? limit : before.limit,
      tidy: better ? tidy : before.tidy,
      last: total,
      attempts: (before?.attempts ?? 0) + 1,
      at: now,
    };
    await this.store.put(key, next);
    await this.store.put(`student:${s.id}`, { ...s, seen: now });
    return ok({ result: next });
  }

  private async board(body: Record<string, unknown>): Promise<Reply> {
    const meta = await this.teacher(body.key);
    if (!meta) return fail(403, 'forbidden');
    const students = [...(await this.store.list<Student>({ prefix: 'student:' })).values()].map(publicStudent).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return ok({ code: meta.code, name: meta.name, teacher: meta.teacher, assignments: meta.assignments, students, results: await this.results('result:') });
  }

  private async assign(body: Record<string, unknown>): Promise<Reply> {
    const meta = await this.teacher(body.key);
    if (!meta) return fail(403, 'forbidden');
    const assignments = cleanAssignments(body.assignments);
    if (!assignments) return fail(400, 'bad-request');
    await this.store.put('meta', { ...meta, assignments });
    return ok({ assignments });
  }

  private async remove(body: Record<string, unknown>): Promise<Reply> {
    const meta = await this.teacher(body.key);
    if (!meta) return fail(403, 'forbidden');
    if (typeof body.student !== 'string' || body.student.length > 40) return fail(400, 'bad-request');
    await this.store.delete(`student:${body.student}`);
    for (const key of (await this.store.list({ prefix: `result:${body.student}:` })).keys()) await this.store.delete(key);
    return ok({ removed: body.student });
  }
}
