import { describe, expect, it } from 'vitest';
import type { PortSpec } from '@patchbay/sim-core';
import { testCable, wiremap } from '../src/game/tester.js';

const nic: PortSpec = { name: 'Fa0', kind: 'ethernet', polarity: 'mdi' };
const sw: PortSpec = { name: 'Fa0/1', kind: 'ethernet', polarity: 'mdix', autoMdix: true };
const router: PortSpec = { name: 'G0/0', kind: 'ethernet', polarity: 'mdi', autoMdix: true };

describe('cable tester', () => {
  it('maps the pins of each cable as a real tester does', () => {
    expect(wiremap('straight')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(wiremap('crossover')).toEqual([3, 6, 1, 4, 5, 2, 7, 8]);
    expect(wiremap('rollover')).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(wiremap('open')).toEqual([null, null, null, null, null, null, null, null]);
    expect(wiremap('serial')).toEqual([]);
  });

  it('passes the right cable for the two ports, and fails the wrong one in strict mode', () => {
    expect(testCable({ type: 'straight', near: nic, far: sw, strictMdix: true, length: 1.04 })).toMatchObject({ kind: 'straight', verdict: 'pass', reason: 'ok', length: 1 });
    expect(testCable({ type: 'crossover', near: nic, far: sw, strictMdix: true })).toMatchObject({ verdict: 'fail', reason: 'needStraight' });
    expect(testCable({ type: 'straight', near: nic, far: router, strictMdix: true })).toMatchObject({ verdict: 'fail', reason: 'needCrossover' });
    expect(testCable({ type: 'crossover', near: sw, far: { ...sw, name: 'Fa0/2' }, strictMdix: true })).toMatchObject({ verdict: 'pass' });
  });

  it('warns when only auto-MDIX saves the link', () => {
    expect(testCable({ type: 'crossover', near: sw, far: nic, strictMdix: false })).toMatchObject({ verdict: 'warn', reason: 'autoMdix' });
    expect(testCable({ type: 'straight', near: sw, far: { ...sw, name: 'Fa0/2' }, strictMdix: false })).toMatchObject({ verdict: 'pass', reason: 'autoMdixStraight' });
    expect(testCable({ type: 'crossover', near: nic, far: { ...nic, name: 'x' }, strictMdix: false })).toMatchObject({ verdict: 'pass' });
  });

  it('finds open circuits, empty ports and what is not copper', () => {
    expect(testCable({ type: 'straight', open: true, strictMdix: true, length: 4.26 })).toMatchObject({ kind: 'open', verdict: 'fail', length: 4.3 });
    expect(testCable({ type: null, strictMdix: true })).toMatchObject({ kind: 'none', verdict: 'info' });
    expect(testCable({ type: null, panel: 'patch', strictMdix: true, length: 18 })).toMatchObject({ kind: 'permanent', verdict: 'pass' });
    expect(testCable({ type: null, panel: 'ntu', strictMdix: true })).toMatchObject({ kind: 'leased', reason: 'leasedLine' });
    expect(testCable({ type: 'console', strictMdix: true })).toMatchObject({ kind: 'rollover', reason: 'console' });
    expect(testCable({ type: 'serial', strictMdix: true, dceHere: true })).toMatchObject({ kind: 'serial', reason: 'serialDce' });
    expect(testCable({ type: 'serial', strictMdix: true, panel: 'ntu' })).toMatchObject({ reason: 'leasedLine' });
  });
});
