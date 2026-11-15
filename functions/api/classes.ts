import { ClassroomLogic, isClassCode, randomCode, teacherKey, type Store } from './classroom.js';

/**
 * The classes' API, at /api/classes: POST only (the game's offline cache never keeps these answers), JSON both ways,
 * from the game's own pages only. `POST /api/classes` opens a class; `POST /api/classes/CODE` carries every other
 * request to that class's Durable Object.
 */

interface Stub {
  fetch(request: Request): Promise<Response>;
}

export interface ClassesEnv {
  CLASSROOMS?: { idFromName(name: string): unknown; get(id: unknown): Stub };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

/** Requests per visitor and per minute, counted by each Cloudflare instance on its own: a guard, not a quota. */
const LIMIT = 60;
const CREATE_LIMIT = 5;
const WINDOW_MS = 60_000;
const CREATE_WINDOW_MS = 3_600_000;
const seen = new Map<string, number[]>();

export function tooMany(key: string, limit: number, window: number, now = Date.now()): boolean {
  const recent = (seen.get(key) ?? []).filter((t) => now - t < window);
  if (seen.size > 5000) seen.clear();
  if (recent.length >= limit) {
    seen.set(key, recent);
    return true;
  }
  seen.set(key, [...recent, now]);
  return false;
}

const room = (env: Required<ClassesEnv>, code: string): Stub => env.CLASSROOMS.get(env.CLASSROOMS.idFromName(code));

const call = (stub: Stub, body: unknown): Promise<Response> =>
  stub.fetch(new Request('https://classroom/', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));

export async function classesRequest(request: Request, env: ClassesEnv): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (!env.CLASSROOMS) return json({ error: 'not-configured' }, 503);
  const origin = request.headers.get('Origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) return json({ error: 'forbidden' }, 403);
  const visitor = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (tooMany(visitor, LIMIT, WINDOW_MS)) return json({ error: 'rate-limited' }, 429);
  if (Number(request.headers.get('Content-Length') ?? 0) > 16_000) return json({ error: 'too-large' }, 413);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'bad-request' }, 400);
  }
  const env2 = env as Required<ClassesEnv>;
  const path = new URL(request.url).pathname.replace(/\/+$/, '');

  if (path === '/api/classes') {
    if (tooMany(`create:${visitor}`, CREATE_LIMIT, CREATE_WINDOW_MS)) return json({ error: 'rate-limited' }, 429);
    // A fresh code, tried again in the very rare case it is already a class's.
    for (let i = 0; i < 5; i++) {
      const code = randomCode(6);
      const key = teacherKey();
      const answer = await call(room(env2, code), { action: 'create', code, key, name: body.name, teacher: body.teacher });
      if (answer.status === 409) continue;
      if (!answer.ok) return answer;
      return json({ ...((await answer.json()) as Record<string, unknown>), key });
    }
    return json({ error: 'busy' }, 503);
  }

  const code = path.slice('/api/classes/'.length).toUpperCase();
  if (!isClassCode(code) || body.action === 'create') return json({ error: 'not-found' }, 404);
  return call(room(env2, code), body);
}

/** One class, in its own Durable Object with SQLite storage. */
export class Classroom {
  private readonly logic: ClassroomLogic;

  constructor(state: { storage: Store }) {
    this.logic = new ClassroomLogic(state.storage);
  }

  async fetch(request: Request): Promise<Response> {
    const body = (await request.json()) as Record<string, unknown>;
    const reply = await this.logic.handle(body, Date.now());
    return json(reply.body, reply.status);
  }
}
