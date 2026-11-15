import type { CableType, DeviceKind } from '@patchbay/sim-core';

/**
 * The cabling rules of a company's network room, as the game applies and marks them: cords in standard lengths, a
 * colour for each kind of link, and a mark for the tidiness of the work (separate from the mission's mark).
 */

/** Patch cords as they are sold, in metres. */
export const CORD_LENGTHS = [0.5, 1, 1.5, 2, 3, 5] as const;
/** What a cord needs beyond its path: a little slack at each end, so that no connector pulls on its port. */
const SLACK = 0.15;

/** The shortest standard cord for a path of `metres`; beyond the longest, the length is rounded up to the metre. */
export function cordLength(metres: number): number {
  const needed = metres + SLACK;
  return CORD_LENGTHS.find((l) => l >= needed) ?? Math.ceil(needed);
}

/** "1,5 m" */
export function cordText(length: number): string {
  return `${String(length).replace('.', ',')} m`;
}

export type CableRole = 'access' | 'link' | 'crossover' | 'console' | 'serial';

/**
 * A common company colour code: blue from the wall or the desk to the switch (users), yellow between network devices,
 * orange for crossovers, light blue for consoles (the colour of Cisco's own rollover cable), red for WAN serial links.
 */
export const ROLE_COLOUR: Record<CableRole, string> = {
  access: '#2563eb',
  link: '#facc15',
  crossover: '#f97316',
  console: '#22d3ee',
  serial: '#e11d48',
};

/** The role of a cable from its type and what it joins (`null`: a patch panel, the way to a desk). */
export function cableRole(type: CableType, a: DeviceKind | null, b: DeviceKind | null): CableRole {
  if (type !== 'straight') return type;
  const network = (k: DeviceKind | null): boolean => k === 'router' || k === 'switch';
  return network(a) && network(b) ? 'link' : 'access';
}

export interface TidinessInput {
  /** Cables plugged that join two devices the mission never asked to join. */
  extra: number;
  /** Cables taken out after being plugged: work done twice. */
  reworks: number;
  /** Standard length of each cord in place. */
  cords: number[];
}

export interface Tidiness {
  /** Out of 100. */
  score: number;
  verdict: 'impeccable' | 'propre' | 'correct' | 'reprendre';
  /** "2 × 1 m, 1 × 2 m": what was taken from the stock. */
  bill: string;
}

/** Reworks forgiven: everybody misplugs once or twice. */
const FREE_REWORKS = 2;

export function tidiness({ extra, reworks, cords }: TidinessInput): Tidiness {
  const score = Math.max(0, 100 - extra * 20 - Math.min(40, Math.max(0, reworks - FREE_REWORKS) * 5));
  const verdict = score >= 95 ? 'impeccable' : score >= 80 ? 'propre' : score >= 60 ? 'correct' : 'reprendre';
  const counts = new Map<number, number>();
  for (const c of cords) counts.set(c, (counts.get(c) ?? 0) + 1);
  const bill = [...counts.entries()].sort((p, q) => p[0] - q[0]).map(([l, n]) => `${n} × ${cordText(l)}`).join(', ');
  return { score, verdict, bill };
}

/**
 * Cables beyond those of the reference solution, between the same devices: the network may be cabled on other ports
 * than the solution's, but a link the solution does not have, or one link too many, is clutter in the rack.
 */
export function extraCables(placed: { a: string; b: string }[], solution: { a: string; b: string }[]): number {
  const pair = (a: string, b: string): string => [a, b].sort().join('|');
  const allowed = new Map<string, number>();
  for (const c of solution) allowed.set(pair(c.a, c.b), (allowed.get(pair(c.a, c.b)) ?? 0) + 1);
  let extra = 0;
  for (const c of placed) {
    const key = pair(c.a, c.b);
    const left = allowed.get(key) ?? 0;
    if (left > 0) allowed.set(key, left - 1);
    else extra++;
  }
  return extra;
}
