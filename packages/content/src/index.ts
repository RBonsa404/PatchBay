import type { Level } from '../../sim-core/src/index.js';
import level01 from '../levels/l01-cablage-console.json';
import level02 from '../levels/l02-relier-deux-reseaux.json';
import level03 from '../levels/l03-deux-salles-vlan.json';
import level04 from '../levels/l04-reseau-du-batiment.json';
import level05 from '../levels/l05-routage-ospf.json';
import level06 from '../levels/l06-acces-internet.json';
import { levelSchema } from './schema.js';

export { levelSchema } from './schema.js';
export { tour, TOUR_LEVEL, type TourStop } from './tour.js';

/** Validate untrusted level data (a file, a teacher's upload). Throws a readable error listing every problem. */
export function parseLevel(data: unknown): Level {
  const result = levelSchema.safeParse(data);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.') || '(racine)'} : ${i.message}`).join('\n');
    throw new Error(`Niveau invalide :\n${problems}`);
  }
  return result.data as Level;
}

/** The MVP campaign, in play order. */
export const campaign: Level[] = [level01, level02, level03, level04, level05, level06].map(parseLevel);
