import { describe, expect, it } from 'vitest';
import { pieceName, PLAYLISTS, sceneOf, shuffled, URGENT_SECONDS, type MissionMoment } from '../src/music.js';

const moment = (over: Partial<MissionMoment> = {}): MissionMoment => ({
  levelId: 'l04-reseau-du-batiment',
  tour: false,
  remaining: 600,
  clockRunning: true,
  configuring: false,
  ...over,
});

describe('adaptive music', () => {
  it('wires to calm music and troubleshoots in a darker one', () => {
    expect(sceneOf(moment())).toEqual({ scene: 'cabling', focus: false });
    expect(sceneOf(moment({ levelId: 'l09-depannage' })).scene).toBe('troubleshoot');
  });

  it('muffles the music while configuring, without changing the piece', () => {
    expect(sceneOf(moment({ configuring: true }))).toEqual({ scene: 'cabling', focus: true });
  });

  it('turns urgent in the last minute, only while the clock runs', () => {
    expect(sceneOf(moment({ remaining: URGENT_SECONDS })).scene).toBe('urgent');
    expect(sceneOf(moment({ remaining: 30, clockRunning: false })).scene).toBe('cabling');
    expect(sceneOf(moment({ remaining: 30, levelId: 'l09-depannage', configuring: true }))).toEqual({ scene: 'urgent', focus: true });
  });

  it('keeps the guided tour on its own music', () => {
    expect(sceneOf(moment({ tour: true, remaining: 10, configuring: true }))).toEqual({ scene: 'tour', focus: false });
  });

  it('gives every scene pieces, and the menu themes only to the menu', () => {
    for (const list of Object.values(PLAYLISTS)) expect(list.length).toBeGreaterThan(0);
    expect(PLAYLISTS.cabling.map(pieceName)).not.toContain('exploration-theme');
    expect(PLAYLISTS.urgent).toEqual([{ synth: 'urgent' }]);
  });

  it('never starts a pass with the piece just heard', () => {
    for (let seed = 0; seed < 50; seed++) {
      let x = seed / 50;
      const random = (): number => (x = (x * 9301 + 0.49297) % 1);
      const pass = shuffled(PLAYLISTS.menu, 'exploration-theme', random);
      expect(pass).toHaveLength(PLAYLISTS.menu.length);
      expect(pieceName(pass[0]!)).not.toBe('exploration-theme');
    }
  });
});
