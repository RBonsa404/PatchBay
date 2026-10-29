import type { PortSpec } from '../model/catalog.js';

export type CableType = 'straight' | 'crossover' | 'console' | 'serial';

/** Can this cable physically be plugged into both ports? (An RJ-45 cable does not fit a serial port.) */
export function canPlug(type: CableType, a: PortSpec, b: PortSpec): boolean {
  switch (type) {
    case 'straight':
    case 'crossover':
      return a.kind === 'ethernet' && b.kind === 'ethernet';
    case 'serial':
      return a.kind === 'serial' && b.kind === 'serial';
    case 'console':
      return (a.kind === 'console' && b.kind === 'rs232') || (a.kind === 'rs232' && b.kind === 'console');
  }
}

/**
 * Does a copper link come up? Like polarities (MDI-MDI, MDIX-MDIX) need a crossover, mixed ones a straight cable.
 * Outside strict mode, auto-MDIX on either end forgives the wrong choice.
 */
export function copperLinkWorks(type: 'straight' | 'crossover', a: PortSpec, b: PortSpec, strictMdix: boolean): boolean {
  const needsCrossover = (a.polarity ?? 'mdi') === (b.polarity ?? 'mdi');
  if ((type === 'crossover') === needsCrossover) return true;
  return !strictMdix && (a.autoMdix === true || b.autoMdix === true);
}
