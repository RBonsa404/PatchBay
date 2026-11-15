import { describe, expect, it } from 'vitest';
import { understand } from '../src/voice-commands.js';

const DEVICES = ['R1', 'R2', 'S1', 'S2', 'PC1', 'ADMIN'];

describe('voice commands', () => {
  it('takes a cable by its kind', () => {
    expect(understand('câble droit', DEVICES)).toEqual({ kind: 'cable', cable: 'straight' });
    expect(understand('Prends le câble croisé', DEVICES)).toEqual({ kind: 'cable', cable: 'crossover' });
    expect(understand('le câble console', DEVICES)).toEqual({ kind: 'cable', cable: 'console' });
    expect(understand('pose le câble', DEVICES)).toEqual({ kind: 'cable', cable: null });
  });

  it('opens a device named aloud, digits spoken as words', () => {
    expect(understand('ouvre la console de R1', DEVICES)).toEqual({ kind: 'open', device: 'R1' });
    expect(understand('configure R deux', DEVICES)).toEqual({ kind: 'open', device: 'R2' });
    expect(understand('va sur PC un', DEVICES)).toEqual({ kind: 'open', device: 'PC1' });
  });

  it('runs the mission tools', () => {
    expect(understand('vérifie la mission', DEVICES)).toEqual({ kind: 'check' });
    expect(understand('donne-moi un indice', DEVICES)).toEqual({ kind: 'hint' });
    expect(understand('relis les consignes', DEVICES)).toEqual({ kind: 'brief' });
  });

  it('turns anything else into a question for Aïcha', () => {
    expect(understand("C'est quoi un VLAN ?", DEVICES)).toEqual({ kind: 'ask', question: "C'est quoi un VLAN ?" });
  });
});
