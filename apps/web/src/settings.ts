/** The player's preferences, kept in this browser: how fast the head turns, and which way. */

const KEY = 'patchbay.settings';

interface Settings {
  /** Multiplies the speed at which dragging turns the head (0.4 … 2.5). */
  lookSpeed: number;
  /** Dragging up looks down, as with an aircraft's stick. */
  invertY: boolean;
}

const DEFAULTS: Settings = { lookSpeed: 1, invertY: false };

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
      localStorage.setItem(KEY, JSON.stringify({ lookSpeed: this.lookSpeed, invertY: this.invertY }));
    } catch {
      // storage unavailable: the choice lasts until the page closes
    }
  },
};
