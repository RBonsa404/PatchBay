import { describe, expect, it } from 'vitest';
import { cableRole, cordLength, cordText, extraCables, tidiness } from '../src/game/cabling.js';

describe('company cabling rules', () => {
  it('takes the shortest standard cord that reaches, with a little slack', () => {
    expect(cordLength(0.2)).toBe(0.5);
    expect(cordLength(0.4)).toBe(1);
    expect(cordLength(1.2)).toBe(1.5);
    expect(cordLength(2.6)).toBe(3);
    expect(cordLength(6.3)).toBe(7);
    expect(cordText(1.5)).toBe('1,5 m');
  });

  it('colours a cable by what it joins', () => {
    expect(cableRole('straight', 'pc', 'switch')).toBe('access');
    expect(cableRole('straight', 'switch', null)).toBe('access');
    expect(cableRole('straight', 'switch', 'router')).toBe('link');
    expect(cableRole('crossover', 'switch', 'switch')).toBe('crossover');
    expect(cableRole('console', 'pc', 'router')).toBe('console');
    expect(cableRole('serial', 'router', 'router')).toBe('serial');
  });

  it('counts the links the solution does not have, whatever the ports', () => {
    const solution = [{ a: 'PC1', b: 'S1' }, { a: 'S1', b: 'R1' }];
    expect(extraCables([{ a: 'S1', b: 'PC1' }, { a: 'R1', b: 'S1' }], solution)).toBe(0);
    expect(extraCables([{ a: 'PC1', b: 'S1' }, { a: 'S1', b: 'R1' }, { a: 'S1', b: 'R1' }], solution)).toBe(1);
    expect(extraCables([{ a: 'PC1', b: 'R1' }], solution)).toBe(1);
  });

  it('marks tidiness: clutter and work done twice cost points, a slip or two is forgiven', () => {
    expect(tidiness({ extra: 0, reworks: 2, cords: [1, 0.5, 1] })).toEqual({ score: 100, verdict: 'impeccable', bill: '1 × 0,5 m, 2 × 1 m' });
    expect(tidiness({ extra: 1, reworks: 4, cords: [] }).score).toBe(70);
    expect(tidiness({ extra: 0, reworks: 30, cords: [] }).score).toBe(60);
    expect(tidiness({ extra: 5, reworks: 0, cords: [] })).toMatchObject({ score: 0, verdict: 'reprendre' });
  });
});
