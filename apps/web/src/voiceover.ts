import { settings } from './settings.js';

/**
 * The voices of the game: lines recorded in advance (`tools/voice.cjs`, Piper's French neural voices, made on the
 * computer, not in the browser) and played only when the player asks for them: the next stop of the guided tour,
 * speaking to a colleague. One voice at a time; a new line cuts the one before. Switched off in the settings.
 */

let index: Promise<Record<string, string>> | null = null;
let playing: HTMLAudioElement | null = null;

/** The same key as the recording tool: FNV-1a of the text. */
function key(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function lines(): Promise<Record<string, string>> {
  index ??= fetch(`${import.meta.env.BASE_URL}voice/index.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, string>>) : {}))
    .catch(() => ({}));
  return index;
}

/** Say `text` if it was recorded (nothing otherwise, or when the voices are switched off). */
export async function say(text: string): Promise<void> {
  stopVoice();
  if (!settings.voice) return;
  const k = key(text);
  if (!(k in (await lines()))) return;
  const audio = new Audio(`${import.meta.env.BASE_URL}voice/${k}.ogg`);
  audio.volume = Math.max(0, Math.min(1, settings.voiceVolume));
  playing = audio;
  await audio.play().catch(() => undefined);
}

export function stopVoice(): void {
  playing?.pause();
  playing = null;
}
