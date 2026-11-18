import { describe, expect, it } from 'vitest';
import { Player } from '../src/game/player.js';

/** In the technical room, from the bench, walking towards +x is free for about four metres. */
const start = (): Player => {
  const p = new Player();
  p.place(0, 1.75);
  p.yaw = Math.PI / 2;
  p.pitch = 0;
  return p;
};
const walk = (p: Player, seconds: number): void => {
  for (let i = 0; i < seconds * 60; i++) p.update(1 / 60, { x: 0, y: 1, run: false });
};

describe('player and people', () => {
  it('walks freely with nobody in the way', () => {
    const p = start();
    walk(p, 2);
    expect(p.x).toBeGreaterThan(2);
  });

  it('never walks through a colleague', () => {
    const p = start();
    p.people = [{ x: 1.5, y: 0, z: 1.75, r: 0.55 }];
    for (let i = 0; i < 180; i++) {
      p.update(1 / 60, { x: 0, y: 1, run: false });
      expect(Math.hypot(p.x - 1.5, p.z - 1.75)).toBeGreaterThan(0.53);
    }
  });

  it('is never stuck when someone stands right on them', () => {
    const p = start();
    p.people = [{ x: 0, y: 0, z: 1.75, r: 0.55 }];
    walk(p, 1);
    expect(p.x).toBeGreaterThan(0.5);
  });

  it('ignores people on another floor', () => {
    const p = start();
    p.people = [{ x: 1.5, y: 3.5, z: 1.75, r: 0.55 }];
    walk(p, 2);
    expect(p.x).toBeGreaterThan(2);
  });
});
