import type { CableType, PortSpec } from '@patchbay/sim-core';

/**
 * The handheld cable tester (a Fluke MicroScanner-like tool): plugged into a port, it reads the cable behind it with
 * its remote unit at the far end. It shows what a real one shows (the wire map pin by pin, the length, an open circuit
 * and how far away it is) and, outside an exam, a word on whether this cable suits the two ports it joins.
 */

/** What the tester finds behind a port. */
export type TestKind =
  /** Nothing plugged. */
  | 'none'
  /** A cord whose far side leads nowhere (the other end of the building's cabling has no cord). */
  | 'open'
  | 'straight'
  | 'crossover'
  /** The console cable: every pin to its mirror (1-8, 2-7…). */
  | 'rollover'
  | 'serial'
  /** A panel port with no cord: the building's own cable to the other panel, always wired straight through. */
  | 'permanent'
  /** The operator's box: its line is not copper the tester can read. */
  | 'leased';

export type Verdict = 'pass' | 'warn' | 'fail' | 'info';

/** Why the verdict, for the advice line. */
export type Reason =
  | 'ok'
  | 'autoMdix'
  | 'autoMdixStraight'
  | 'needCrossover'
  | 'needStraight'
  | 'console'
  | 'serialDce'
  | 'serialDte'
  | 'leasedLine'
  | 'open'
  | 'none'
  | 'permanent';

export interface TestInput {
  type: CableType | null;
  /** Ports at the near end (where the tester is plugged) and the far end. */
  near?: PortSpec;
  far?: PortSpec;
  strictMdix: boolean;
  /** Metres of copper between the two ends. */
  length?: number;
  /** The cord leads to a patch panel whose other side is not plugged. */
  open?: boolean;
  /** A panel port: with no cord, the building's cable; at an operator's box, the leased line. */
  panel?: 'patch' | 'ntu';
  /** For a serial cable: whether the near end is the DCE (the end that gives the clock). */
  dceHere?: boolean;
}

export interface CableTest {
  kind: TestKind;
  verdict: Verdict;
  reason: Reason;
  /** Pin at the far end for pins 1 to 8 of the near end (null: no continuity). Empty when there is no RJ45 to map. */
  wiremap: (number | null)[];
  /** Metres, rounded to the decimetre, as the tester shows it. */
  length?: number;
}

const PINS = [1, 2, 3, 4, 5, 6, 7, 8];
/** T568A at one end, T568B at the other: the transmit pair (1-2) meets the receive pair (3-6). */
const CROSSED: Record<number, number> = { 1: 3, 2: 6, 3: 1, 6: 2 };

export function wiremap(kind: TestKind): (number | null)[] {
  if (kind === 'straight' || kind === 'permanent') return [...PINS];
  if (kind === 'crossover') return PINS.map((p) => CROSSED[p] ?? p);
  if (kind === 'rollover') return PINS.map((p) => 9 - p);
  if (kind === 'open') return PINS.map(() => null);
  return [];
}

const round = (m: number | undefined): number | undefined => (m === undefined ? undefined : Math.round(m * 10) / 10);

export function testCable(input: TestInput): CableTest {
  const length = round(input.length);
  const result = (kind: TestKind, verdict: Verdict, reason: Reason): CableTest => ({ kind, verdict, reason, wiremap: wiremap(kind), ...(length !== undefined ? { length } : {}) });
  if (input.panel === 'ntu' && !input.type) return result('leased', 'info', 'leasedLine');
  if (input.panel === 'patch' && !input.type) return result('permanent', 'pass', 'permanent');
  if (!input.type) return result('none', 'info', 'none');
  if (input.open) return result('open', 'fail', 'open');
  if (input.type === 'console') return result('rollover', 'pass', 'console');
  if (input.type === 'serial') return result('serial', 'pass', input.panel === 'ntu' ? 'leasedLine' : input.dceHere ? 'serialDce' : 'serialDte');
  const kind = input.type;
  // Two ports wired alike (two NICs, two switches) need their pairs crossed; a NIC and a switch, a straight cable.
  const [near, far] = [input.near, input.far];
  if (!near || !far) return result(kind, 'pass', 'ok');
  const needsCrossover = (near.polarity ?? 'mdi') === (far.polarity ?? 'mdi');
  if ((kind === 'crossover') === needsCrossover) return result(kind, 'pass', 'ok');
  // Auto-MDIX swaps the pairs itself. A straight cord where a crossover was due is today's common practice (between
  // switches through the building's cabling); a crossover where a straight one would do is a cord to replace.
  if (!input.strictMdix && (near.autoMdix === true || far.autoMdix === true)) return kind === 'straight' ? result(kind, 'pass', 'autoMdixStraight') : result(kind, 'warn', 'autoMdix');
  return result(kind, 'fail', needsCrossover ? 'needCrossover' : 'needStraight');
}
