import { describe, expect, it } from 'vitest';
import { campaign } from '@patchbay/content';
import { LEVEL_TIPS, randomTip, TIPS } from '../src/ui/tips.js';

describe('loading tips', () => {
  it('has tips about every mission of the course', () => {
    for (const level of campaign) expect(LEVEL_TIPS[level.id]?.length ?? 0, level.id).toBeGreaterThanOrEqual(2);
    expect(Object.keys(LEVEL_TIPS).sort()).toEqual(campaign.map((l) => l.id).sort());
  });

  it('picks from the mission’s own tips or the general ones', () => {
    const own = new Set(LEVEL_TIPS['l05-routage-ospf']);
    const all = new Set([...own, ...TIPS]);
    let mine = 0;
    for (let i = 0; i < 300; i++) {
      const tip = randomTip('l05-routage-ospf');
      expect(all.has(tip)).toBe(true);
      if (own.has(tip)) mine++;
    }
    // Two times out of three on average: well within these bounds.
    expect(mine).toBeGreaterThan(150);
    expect(mine).toBeLessThan(250);
    expect(TIPS).toContain(randomTip());
  });
});
