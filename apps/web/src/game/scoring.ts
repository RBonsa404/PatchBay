import type { Evaluation } from '@patchbay/sim-core';

/**
 * The mark of a mission. The objectives are worth 80 points; the last 20 reward speed, and only once everything is
 * done. So a slow, complete mission gets 80 and two stars; the third star has to be earned against the clock. When
 * the time runs out, the network is marked as it stands.
 */
export interface Grade {
  evaluation: Evaluation;
  /** Out of 80. */
  objectives: number;
  /** Out of 20. */
  speed: number;
  total: number;
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  timedOut: boolean;
  exam: boolean;
  /** Seconds taken, and seconds allowed. */
  used: number;
  limit: number;
}

const OBJECTIVES = 80;
const SPEED = 20;
/** Speed points are all earned by finishing in this share of the time. */
const FULL_SPEED_AT = 0.5;

export function grade(evaluation: Evaluation, remaining: number, limit: number, timedOut: boolean, exam: boolean): Grade {
  const objectives = Math.round((evaluation.score * OBJECTIVES) / 100);
  const left = Math.max(0, remaining) / limit;
  const speed = evaluation.complete ? Math.round(SPEED * Math.min(1, left / FULL_SPEED_AT)) : 0;
  const total = objectives + speed;
  const rank = total >= 95 ? 'S' : total >= 88 ? 'A' : total >= 70 ? 'B' : total >= 40 ? 'C' : 'D';
  return { evaluation, objectives, speed, total, rank, timedOut, exam, used: Math.round(limit - Math.max(0, remaining)), limit };
}

/** 12:05 */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
