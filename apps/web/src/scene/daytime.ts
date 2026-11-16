import * as THREE from 'three';

/**
 * The time of day of a mission: the sun through the windows (its slant, its colour), the town outside, the sky and,
 * out in the street, the sun's height. The lit rooms keep their baked light (the ceiling panels are on all day); what
 * changes is what comes from outside, as it does in a real building between 8 h and 18 h.
 */
export type Daytime = 'morning' | 'noon' | 'evening';

export interface DaytimeLook {
  /** What the clock in the HUD says. */
  hour: string;
  /**
   * The way the sunlight travels, in the building's frame (+x east, +z south, as the plan in `building.ts`). In
   * November at Ouagadougou (12° N) the sun stays in the southern sky: morning east, noon high in the south, evening west.
   */
  sun: THREE.Vector3;
  /** Colour of the shaft of light and of its patch on the floor; their strength. */
  light: string;
  shaft: number;
  patch: number;
  /** The town through the windows: a multiplier on its photograph (above 1: the bright daylight outside). */
  town: [number, number, number];
  /** The sky's light, indoors. */
  sky: string;
  skyIndoor: number;
  /** Out in the street: the sun's colour, strength and height (1: as given by the scene, less: lower). */
  sunColour: string;
  sunIntensity: number;
  sunHeight: number;
}

export const DAYTIMES: Record<Daytime, DaytimeLook> = {
  // Early: a low sun from the east, long golden shafts, a soft clear town.
  morning: { hour: '7 h 50', sun: new THREE.Vector3(-0.78, -0.42, -0.3), light: '#ffe4b8', shaft: 0.07, patch: 0.55, town: [1.36, 1.36, 1.34], sky: '#eef2f7', skyIndoor: 0.7, sunColour: '#ffe2bd', sunIntensity: 2.7, sunHeight: 0.55 },
  // Midday in Ouagadougou: the sun high in the south, short bright patches near the walls, a pale hot town.
  noon: { hour: '12 h 40', sun: new THREE.Vector3(0.05, -0.88, -0.48), light: '#fff4de', shaft: 0.055, patch: 0.62, town: [1.5, 1.46, 1.38], sky: '#f5f3ee', skyIndoor: 0.78, sunColour: '#fff4e0', sunIntensity: 3.4, sunHeight: 1.6 },
  // End of the afternoon: a low orange sun from the west, warm shafts deep into the rooms, the town in amber.
  evening: { hour: '17 h 20', sun: new THREE.Vector3(0.8, -0.36, -0.3), light: '#ffb878', shaft: 0.085, patch: 0.5, town: [1.32, 1.08, 0.82], sky: '#f4e6d6', skyIndoor: 0.66, sunColour: '#ffb36e', sunIntensity: 2.3, sunHeight: 0.42 },
};

let current: Daytime = 'noon';
const towns = new Set<THREE.MeshBasicMaterial>();

/** The time of day now: set before a mission builds its rooms (their shafts of sun are cut for it). */
export const daytime = (): DaytimeLook => DAYTIMES[current];
export const daytimeName = (): Daytime => current;

export function setDaytime(d: Daytime): void {
  current = d;
  const [r, g, b] = DAYTIMES[d].town;
  for (const m of towns) m.color.setRGB(r, g, b);
}

/** A material showing the town outside: it takes the colour of the time of day. */
export function townMaterial(m: THREE.MeshBasicMaterial): THREE.MeshBasicMaterial {
  towns.add(m);
  const [r, g, b] = DAYTIMES[current].town;
  m.color.setRGB(r, g, b);
  return m;
}

/**
 * The time of each mission: the days of the course go morning, noon, evening; the troubleshooting is « Monday
 * morning » (its title says so), and the guided tour welcomes the student in the morning.
 */
export function daytimeOf(levelId: string, index: number, tour = false): Daytime {
  if (tour || levelId.startsWith('l09')) return 'morning';
  return (['morning', 'noon', 'evening'] as const)[index % 3] as Daytime;
}
