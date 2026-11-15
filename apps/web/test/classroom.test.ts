import { describe, expect, it } from 'vitest';
import { cleanAssignments, cleanName, ClassroomLogic, isClassCode, randomCode, teacherKey, type Store } from '../../../functions/api/classroom.js';

/** The Durable Object's key-value storage, in memory. */
function memory(): Store {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(key: string) => structuredClone(data.get(key)) as T | undefined,
    put: async (key, value) => void data.set(key, structuredClone(value)),
    delete: async (key) => data.delete(key),
    list: async <T>({ prefix }: { prefix: string }) =>
      new Map([...data].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, structuredClone(v) as T])),
  };
}

async function open(): Promise<{ room: ClassroomLogic; key: string }> {
  const room = new ClassroomLogic(memory());
  const key = teacherKey();
  const r = await room.handle({ action: 'create', code: 'ABC234', key, name: 'L2 Réseaux', teacher: 'M. Ouédraogo' }, 1000);
  expect(r.status).toBe(200);
  return { room, key };
}

describe('class codes and names', () => {
  it('makes codes that read without ambiguity', () => {
    for (let i = 0; i < 50; i++) expect(isClassCode(randomCode(6))).toBe(true);
    expect(isClassCode('ABC10O')).toBe(false);
    expect(teacherKey()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it('cleans names', () => {
    expect(cleanName('  Awa   <b>Traoré</b>\n')).toBe('Awa bTraoré/b');
    expect(cleanName(42)).toBe('');
    expect(cleanName('x'.repeat(80))).toHaveLength(40);
  });

  it('keeps only well-formed homework, once each', () => {
    expect(cleanAssignments([{ level: 'l01-cablage-console', exam: false }, { level: 'l01-cablage-console' }, { level: 'l07-securite', exam: true, due: '2026-12-01' }])).toEqual([
      { level: 'l01-cablage-console', exam: false },
      { level: 'l07-securite', exam: true, due: '2026-12-01' },
    ]);
    expect(cleanAssignments([{ level: '../etc' }])).toBeNull();
    expect(cleanAssignments('l01')).toBeNull();
  });
});

describe('a class', () => {
  it('cannot be created twice under the same code', async () => {
    const { room } = await open();
    expect((await room.handle({ action: 'create', code: 'ABC234', key: 'X', name: 'Autre', teacher: 'Autre' }, 2000)).status).toBe(409);
  });

  it('lets students join, gives homework and keeps each best mark', async () => {
    const { room, key } = await open();
    const joined = await room.handle({ action: 'join', name: 'Awa Traoré' }, 2000);
    expect(joined.status).toBe(200);
    const { id, token } = joined.body as { id: string; token: string };
    expect((await room.handle({ action: 'join', name: 'A' }, 2000)).body.error).toBe('name');

    const homework = [{ level: 'l01-cablage-console', exam: false }];
    expect((await room.handle({ action: 'assign', key: 'FAUX-FAUX-FAUX', assignments: homework }, 2100)).status).toBe(403);
    expect((await room.handle({ action: 'assign', key: key.toLowerCase(), assignments: homework }, 2100)).status).toBe(200);

    const report = (total: number, at: number) =>
      room.handle({ action: 'report', id, token, result: { level: 'l01-cablage-console', exam: false, total, rank: total >= 70 ? 'B' : 'C', used: 300, limit: 600, tidy: 90 } }, at);
    expect((await report(72, 3000)).status).toBe(200);
    await report(55, 4000);
    expect((await room.handle({ action: 'report', id, token: 'faux', result: { level: 'l01-cablage-console', total: 100, used: 1, limit: 600 } }, 5000)).status).toBe(403);

    const me = await room.handle({ action: 'me', id, token }, 6000);
    expect(me.body.assignments).toEqual(homework);
    expect(me.body.results).toEqual([expect.objectContaining({ level: 'l01-cablage-console', best: 72, last: 55, attempts: 2, rank: 'B' })]);

    const board = await room.handle({ action: 'board', key }, 7000);
    expect(board.status).toBe(200);
    expect(board.body.students).toEqual([expect.objectContaining({ id, name: 'Awa Traoré' })]);
    expect(JSON.stringify(board.body)).not.toContain('Hash');
    expect(board.body.results).toEqual([expect.objectContaining({ student: id, best: 72 })]);

    expect((await room.handle({ action: 'remove', key, student: id }, 8000)).status).toBe(200);
    const after = await room.handle({ action: 'board', key }, 9000);
    expect(after.body.students).toEqual([]);
    expect(after.body.results).toEqual([]);
    expect((await room.handle({ action: 'me', id, token }, 9000)).status).toBe(403);
  });

  it('refuses a mark out of range or for an unknown action', async () => {
    const { room } = await open();
    const { id, token } = (await room.handle({ action: 'join', name: 'Issa' }, 2000)).body as { id: string; token: string };
    const r = await room.handle({ action: 'report', id, token, result: { level: 'l01-cablage-console', total: 400, used: 10, limit: 600 } }, 3000);
    expect((r.body.result as { best: number }).best).toBe(100);
    expect((await room.handle({ action: 'drop-table' }, 3000)).status).toBe(400);
  });
});
