import { describe, expect, it } from 'vitest';
import type { Evaluation } from '@patchbay/sim-core';
import { earnedBadges } from '../src/game/badges.js';
import { grade } from '../src/game/scoring.js';

const done = { complete: true, score: 100, results: [] } as unknown as Evaluation;
const half = { complete: false, score: 50, results: [] } as unknown as Evaluation;
const impeccable = { score: 100, verdict: 'impeccable', bill: '2 × 1 m' } as const;

describe('badges', () => {
  it('rewards a first fast, tidy run without hints with everything but the record', () => {
    const result = { ...grade(done, 1700, 2400, false, false), tidiness: impeccable };
    expect(earnedBadges(result, { hints: 0, cabled: true, bestTime: null })).toEqual(['first', 'fast', 'nohint', 'tidy', 'rankS']);
  });

  it('gives a record only when beating the best time', () => {
    const result = grade(done, 600, 2400, false, false);
    expect(earnedBadges(result, { hints: 2, cabled: false, bestTime: 2000 })).toEqual(['record']);
    expect(earnedBadges(result, { hints: 2, cabled: false, bestTime: 1500 })).toEqual([]);
  });

  it('gives nothing to an unfinished or timed-out network', () => {
    expect(earnedBadges(grade(half, 1700, 2400, false, false), { hints: 0, cabled: true, bestTime: null })).toEqual([]);
    expect(earnedBadges(grade(done, 0, 2400, true, false), { hints: 0, cabled: true, bestTime: null })).toEqual([]);
  });

  it('does not count « no hint » in an exam, nor tidiness where nothing was cabled', () => {
    const result = { ...grade(done, 100, 2400, false, true), tidiness: impeccable };
    expect(earnedBadges(result, { hints: 0, cabled: false, bestTime: 3000 })).toEqual(['record']);
  });
});
