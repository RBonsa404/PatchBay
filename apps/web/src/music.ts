/**
 * Adaptive music: which ambience fits what the player is doing. Pure rules, played by `audio.ts`.
 *
 * Two axes, so that the music never jumps at every click:
 * - the **scene** chooses the family of pieces (menu, guided tour, cabling, troubleshooting, the clock running out);
 *   a new piece starts, with a crossfade, only when the scene changes;
 * - **focus** (a console or a PC's settings open: configuration work) only lowers and muffles the piece playing,
 *   like a door closing on it, and lets it come back when the panel closes.
 */
export type Scene = 'menu' | 'tour' | 'cabling' | 'troubleshoot' | 'urgent';
/** The colours of the generative piece: calm (major, 84 bpm), dark (minor, 72 bpm), urgent (driving, 104 bpm). */
export type SynthStyle = 'calm' | 'dark' | 'urgent';

/** A playlist entry: an MP3 of `public/music`, or the generative piece in one of its styles. */
export type Piece = string | { synth: SynthStyle };

/** The pieces of each scene, chosen for it (see ASSETS.md): never a menu theme while wiring, never calm when time runs out. */
export const PLAYLISTS: Record<Scene, Piece[]> = {
  menu: ['exploration-theme', 'starfield-romance', 'first-light-particles', { synth: 'calm' }],
  tour: ['contemplation', 'calm-relax-1', 'calm-ambient-2'],
  cabling: ['calm-ambient-1', 'calm-ambient-2', 'calm-ambient-3', { synth: 'calm' }],
  troubleshoot: [{ synth: 'dark' }, 'calm-ambient-3', 'contemplation'],
  urgent: [{ synth: 'urgent' }],
};

/** Level of the music bus for each scene; focus multiplies it by `FOCUS_LEVEL`. */
export const SCENE_LEVEL: Record<Scene, number> = { menu: 1.0, tour: 0.55, cabling: 0.7, troubleshoot: 0.7, urgent: 0.85 };
export const FOCUS_LEVEL = 0.55;
/** Cut-off of the music's low-pass filter when focused (Hz): the piece goes on, heard as through a wall. */
export const FOCUS_CUTOFF = 1400;
/** The room's hum against the music in each scene (the menus let the music forward). */
export const ROOM_LEVEL: Record<Scene, number> = { menu: 0.6, tour: 0.9, cabling: 1.2, troubleshoot: 1.2, urgent: 1.0 };

/** Missions played as troubleshooting: the network is broken and the player hunts the faults. */
const TROUBLESHOOTING = new Set(['l09-depannage']);
/** Seconds left on the clock from which the music turns urgent (the same minute the HUD warns about). */
export const URGENT_SECONDS = 60;

export interface MissionMoment {
  levelId: string;
  tour: boolean;
  /** Seconds left; ignored during the tutorial and the entrance, when the clock stands still. */
  remaining: number;
  clockRunning: boolean;
  /** A console or a PC's settings are open. */
  configuring: boolean;
}

/** The scene and focus of a mission at this moment. */
export function sceneOf(m: MissionMoment): { scene: Scene; focus: boolean } {
  if (m.tour) return { scene: 'tour', focus: false };
  const scene: Scene = m.clockRunning && m.remaining <= URGENT_SECONDS ? 'urgent' : TROUBLESHOOTING.has(m.levelId) ? 'troubleshoot' : 'cabling';
  return { scene, focus: m.configuring };
}

/** The name an entry plays under (the generative piece is one name whatever its style). */
export const pieceName = (piece: Piece): string => (typeof piece === 'string' ? piece : 'synth');

/** A shuffled pass over a playlist, never starting with the piece just heard. */
export function shuffled(list: Piece[], playing: string, random: () => number = Math.random): Piece[] {
  const all = [...list];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [all[i], all[j]] = [all[j] as Piece, all[i] as Piece];
  }
  if (all.length > 1 && pieceName(all[0] as Piece) === playing) all.push(all.shift() as Piece);
  return all;
}
