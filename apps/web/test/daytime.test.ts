import { describe, expect, it } from 'vitest';
import { DAYTIMES, daytimeOf } from '../src/scene/daytime.js';

describe('time of day', () => {
  it('runs the days of the course morning, noon, evening', () => {
    expect(daytimeOf('l04-reseau-du-batiment', 3)).toBe('morning');
    expect(daytimeOf('l05-routage-ospf', 4)).toBe('noon');
    expect(daytimeOf('l06-acces-internet', 5)).toBe('evening');
  });

  it('opens the troubleshooting and the guided tour in the morning', () => {
    expect(daytimeOf('l09-depannage', 8)).toBe('morning');
    expect(daytimeOf('l05-routage-ospf', 4, true)).toBe('morning');
  });

  it('keeps the sun coming down, from the east in the morning and the west in the evening', () => {
    for (const look of Object.values(DAYTIMES)) expect(look.sun.y).toBeLessThan(0);
    expect(DAYTIMES.morning.sun.x).toBeLessThan(0);
    expect(DAYTIMES.evening.sun.x).toBeGreaterThan(0);
  });
});
