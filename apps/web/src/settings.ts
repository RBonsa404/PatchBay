/** The player's preferences, kept in this browser: how fast the head turns, and which way. */

const KEY = 'patchbay.settings';

interface Settings {
  /** Multiplies the speed at which dragging turns the head (0.4 … 2.5). */
  lookSpeed: number;
  /** Dragging up looks down, as with an aircraft's stick. */
  invertY: boolean;
  /** Seen from behind the student the player walks as (else through their eyes). */
  thirdPerson: boolean;
  /** Which student: a young man or a young woman of the club. */
  character: 'student-m' | 'student-f';
  /** The recorded voices (Aïcha in the guided tour, the colleagues) are played. */
  voice: boolean;
  /** Their volume (0 … 1). */
  voiceVolume: number;
}

const DEFAULTS: Settings = { lookSpeed: 1, invertY: false, thirdPerson: true, character: 'student-m', voice: true, voiceVolume: 0.9 };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Settings & { save(): void } = {
  ...load(),
  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ lookSpeed: this.lookSpeed, invertY: this.invertY, thirdPerson: this.thirdPerson, character: this.character, voice: this.voice, voiceVolume: this.voiceVolume }));
    } catch {
      // storage unavailable: the choice lasts until the page closes
    }
  },
};
