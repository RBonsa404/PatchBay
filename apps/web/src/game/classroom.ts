import type { Grade } from './scoring.js';

/**
 * The player's class, on this browser: a student who joined with the class code, or the teacher who opened it. The
 * results of a student's missions are kept here until the server has them, so a lost connection loses nothing.
 */

export interface Assignment {
  level: string;
  exam: boolean;
  due?: string;
}

export interface ClassResult {
  level: string;
  exam: boolean;
  best: number;
  rank: string;
  used: number;
  limit: number;
  tidy: number | null;
  last: number;
  attempts: number;
  at: number;
}

export type Membership =
  | { role: 'student'; code: string; id: string; token: string; name: string; className: string; teacher: string }
  | { role: 'teacher'; code: string; key: string; className: string; teacher: string };

export interface StudentView {
  name: string;
  className: string;
  teacher: string;
  assignments: Assignment[];
  results: ClassResult[];
}

export interface Board {
  code: string;
  name: string;
  teacher: string;
  assignments: Assignment[];
  students: { id: string; name: string; joined: number; seen: number }[];
  results: (ClassResult & { student: string })[];
}

interface Pending {
  code: string;
  id: string;
  result: { level: string; exam: boolean; total: number; rank: string; used: number; limit: number; tidy: number | null };
}

const MEMBER = 'patchbay.class';
const OUTBOX = 'patchbay.class.outbox';

/** What the player reads when a request fails. */
const MESSAGES: Record<string, string> = {
  'no-class': 'Aucune classe ne porte ce code. Vérifie-le auprès de ton professeur.',
  forbidden: 'Code ou clé refusés. Vérifie ce que tu as saisi.',
  name: 'Écris ton prénom et ton nom.',
  full: 'Cette classe est complète.',
  'rate-limited': 'Trop de demandes d’un coup : réessaie dans une minute.',
  'not-configured': 'Les classes ne sont pas disponibles sur ce serveur.',
  'bad-request': 'Demande incomplète : vérifie les champs.',
  offline: 'Pas de connexion à Internet : réessaie quand le réseau revient.',
};

export class ClassError extends Error {
  constructor(readonly code: string) {
    super(MESSAGES[code] ?? 'Le serveur des classes ne répond pas. Réessaie dans un instant.');
  }
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable: the class lasts until the page closes
  }
}

const base = (): string => new URL('api/classes', document.baseURI).pathname;

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ClassError('offline');
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    // an answer that is not ours (a proxy's page, a server down)
  }
  if (!response.ok) throw new ClassError(typeof data.error === 'string' ? data.error : 'server');
  return data as T;
}

/** A code as typed: upper case, without spaces or dashes. */
export const tidyCode = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export const classroom = {
  membership(): Membership | null {
    return read<Membership | null>(MEMBER, null);
  },

  leave(): void {
    write(MEMBER, null);
  },

  async create(className: string, teacher: string): Promise<Membership & { role: 'teacher' }> {
    const r = await post<{ code: string; key: string; name: string; teacher: string }>('', { name: className, teacher });
    const m = { role: 'teacher' as const, code: r.code, key: r.key, className: r.name, teacher: r.teacher };
    write(MEMBER, m);
    return m;
  },

  /** A teacher back on another computer, with the class code and the key. */
  async signIn(code: string, key: string): Promise<Board> {
    const board = await post<Board>(`/${tidyCode(code)}`, { action: 'board', key: key.trim().toUpperCase() });
    write(MEMBER, { role: 'teacher', code: board.code, key: key.trim().toUpperCase(), className: board.name, teacher: board.teacher });
    return board;
  },

  async join(code: string, name: string): Promise<Membership & { role: 'student' }> {
    const r = await post<{ id: string; token: string; name: string; className: string; teacher: string }>(`/${tidyCode(code)}`, { action: 'join', name });
    const m = { role: 'student' as const, code: tidyCode(code), id: r.id, token: r.token, name: r.name, className: r.className, teacher: r.teacher };
    write(MEMBER, m);
    return m;
  },

  async me(): Promise<StudentView> {
    const m = this.membership();
    if (m?.role !== 'student') throw new ClassError('forbidden');
    await this.flush();
    return post<StudentView>(`/${m.code}`, { action: 'me', id: m.id, token: m.token });
  },

  async board(): Promise<Board> {
    const m = this.membership();
    if (m?.role !== 'teacher') throw new ClassError('forbidden');
    return post<Board>(`/${m.code}`, { action: 'board', key: m.key });
  },

  async assign(assignments: Assignment[]): Promise<void> {
    const m = this.membership();
    if (m?.role !== 'teacher') throw new ClassError('forbidden');
    await post(`/${m.code}`, { action: 'assign', key: m.key, assignments });
  },

  async remove(student: string): Promise<void> {
    const m = this.membership();
    if (m?.role !== 'teacher') throw new ClassError('forbidden');
    await post(`/${m.code}`, { action: 'remove', key: m.key, student });
  },

  pending(): number {
    return read<Pending[]>(OUTBOX, []).length;
  },

  /**
   * A finished mission, for the student's class: queued, then sent. Resolves to true once the server has it, false
   * when it waits for the network (or when the player is in no class).
   */
  async report(level: string, exam: boolean, grade: Grade): Promise<boolean> {
    const m = this.membership();
    if (m?.role !== 'student') return false;
    const outbox = read<Pending[]>(OUTBOX, []);
    outbox.push({
      code: m.code,
      id: m.id,
      result: { level, exam, total: grade.total, rank: grade.rank, used: grade.used, limit: grade.limit, tidy: grade.tidiness?.score ?? null },
    });
    write(OUTBOX, outbox.slice(-50));
    return (await this.flush()) === 0;
  },

  /** Sends what waits, oldest first; returns how many are left. */
  async flush(): Promise<number> {
    const m = this.membership();
    let outbox = read<Pending[]>(OUTBOX, []);
    while (outbox.length > 0) {
      const next = outbox[0] as Pending;
      if (m?.role !== 'student' || next.code !== m.code || next.id !== m.id) {
        // A result from a class this browser has left: nobody can receive it any more.
        outbox = outbox.slice(1);
        continue;
      }
      try {
        await post(`/${m.code}`, { action: 'report', id: m.id, token: m.token, result: next.result });
      } catch (e) {
        // Refused for good (the student was removed): dropped. Offline or busy: kept for later.
        if (e instanceof ClassError && (e.code === 'forbidden' || e.code === 'bad-request' || e.code === 'no-class')) outbox = outbox.slice(1);
        else break;
        continue;
      }
      outbox = outbox.slice(1);
      write(OUTBOX, outbox);
    }
    write(OUTBOX, outbox);
    return outbox.length;
  },
};

/** CSV of the teacher's board (separator ";" as French spreadsheets expect), one row per student. */
export function boardCsv(board: Board, title: (level: string) => string): string {
  const cell = (v: string): string => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = ['Étudiant', ...board.assignments.map((a) => `${title(a.level)}${a.exam ? ' (examen)' : ''}`), 'Moyenne'];
  const rows = board.students.map((s) => {
    const marks = board.assignments.map((a) => board.results.find((r) => r.student === s.id && r.level === a.level && r.exam === a.exam)?.best ?? null);
    const done = marks.filter((m): m is number => m !== null);
    const mean = board.assignments.length ? Math.round(marks.reduce<number>((n, m) => n + (m ?? 0), 0) / board.assignments.length) : null;
    return [s.name, ...marks.map((m) => (m === null ? '' : String(m))), mean === null || done.length === 0 ? '' : String(mean)];
  });
  return '﻿' + [head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}
