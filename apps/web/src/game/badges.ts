import type { Grade } from './scoring.js';

/**
 * The badges of a mission, shown on the results: what a good technician is proud of besides the mark. They are only
 * earned by a network that works (a mission complete in time), and kept in this browser so a new one says « Nouveau ».
 */
export type BadgeId = 'first' | 'record' | 'fast' | 'nohint' | 'tidy' | 'rankS';

/** In the order they are shown: from the most common to the rarest. */
export const BADGES: readonly BadgeId[] = ['first', 'record', 'fast', 'nohint', 'tidy', 'rankS'];

export interface BadgeContext {
  /** Hints asked during the mission. */
  hints: number;
  /** Whether the mission asked for cables to be laid (only then is the tidiness a feat). */
  cabled: boolean;
  /** The best time so far for this mission (seconds), before this one; null the first time. */
  bestTime: number | null;
}

export function earnedBadges(result: Grade, context: BadgeContext): BadgeId[] {
  if (!result.evaluation.complete || result.timedOut) return [];
  const earned = new Set<BadgeId>();
  if (context.bestTime === null) earned.add('first');
  else if (result.used < context.bestTime) earned.add('record');
  if (result.speed >= 20) earned.add('fast');
  // In an exam hints are not offered: going without them is no feat.
  if (!result.exam && context.hints === 0) earned.add('nohint');
  if (context.cabled && result.tidiness?.verdict === 'impeccable') earned.add('tidy');
  if (result.rank === 'S') earned.add('rankS');
  return BADGES.filter((b) => earned.has(b));
}

/** What this browser remembers of each mission: its best time and every badge ever earned there. */
export const badgeStore = {
  bestTime(levelId: string): number | null {
    try {
      const v = localStorage.getItem(`patchbay.time.${levelId}`);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  },
  owned(levelId: string): BadgeId[] {
    try {
      const v = JSON.parse(localStorage.getItem(`patchbay.badges.${levelId}`) ?? '[]') as unknown;
      return Array.isArray(v) ? BADGES.filter((b) => v.includes(b)) : [];
    } catch {
      return [];
    }
  },
  /** Keep a finished mission: returns the badges earned this time that were never earned before. */
  record(levelId: string, result: Grade, earned: BadgeId[]): BadgeId[] {
    const before = this.owned(levelId);
    const fresh = earned.filter((b) => !before.includes(b));
    try {
      if (result.evaluation.complete && !result.timedOut && result.used < (this.bestTime(levelId) ?? Infinity)) localStorage.setItem(`patchbay.time.${levelId}`, String(result.used));
      if (fresh.length) localStorage.setItem(`patchbay.badges.${levelId}`, JSON.stringify([...before, ...fresh]));
    } catch {
      // private mode or storage disabled: the badges are still shown, just not remembered
    }
    return fresh;
  },
};
