import { sound } from './audio.js';
import { spoken } from './voice-commands.js';

/**
 * Aïcha's voice and the player's: speech synthesis reads her lines (the voices installed with Windows or the browser,
 * so it works offline), speech recognition hears commands (Chrome and Edge, which send the audio to their speech
 * service: it needs a connection). Both are optional; the game is whole without them.
 */

const KEY = 'patchbay.voice';

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

let enabled = stored();
let chosen: SpeechSynthesisVoice | null = null;

/** A French woman's voice, the natural ones (Edge's online voices) first. */
function pickVoice(): SpeechSynthesisVoice | null {
  if (chosen || typeof speechSynthesis === 'undefined') return chosen;
  const french = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('fr'));
  const score = (v: SpeechSynthesisVoice): number =>
    (/natural|online|neural/i.test(v.name) ? 4 : 0) +
    (/denise|eloise|vivienne|hortense|julie|amélie|amelie|audrey|marie|céline|celine|google/i.test(v.name) ? 2 : 0) +
    (v.lang.toLowerCase() === 'fr-fr' ? 1 : 0);
  chosen = french.sort((a, b) => score(b) - score(a))[0] ?? null;
  return chosen;
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener('voiceschanged', () => (chosen = null));

export const voice = {
  get enabled(): boolean {
    return enabled;
  },

  get canSpeak(): boolean {
    return typeof speechSynthesis !== 'undefined';
  },

  toggle(): boolean {
    enabled = !enabled;
    if (!enabled) this.stop();
    try {
      localStorage.setItem(KEY, enabled ? 'on' : 'off');
    } catch {
      // storage unavailable: the choice lasts until the page closes
    }
    return enabled;
  },

  /** Read a line aloud, cutting off whatever was being said. Silent when the voice or the sound is off. */
  say(text: string): void {
    if (!enabled || sound.isMuted || !this.canSpeak || !text.trim()) return;
    speechSynthesis.cancel();
    const line = new SpeechSynthesisUtterance(spoken(text));
    const v = pickVoice();
    if (v) line.voice = v;
    line.lang = v?.lang ?? 'fr-FR';
    line.rate = 1.02;
    line.pitch = 1.05;
    speechSynthesis.speak(line);
  },

  stop(): void {
    if (this.canSpeak) speechSynthesis.cancel();
  },
};

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const RecognitionClass = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export const canListen = !!RecognitionClass;

/** Listen for one sentence. `heard` gets what was understood (several guesses, best first), `failed` a reason. */
export function listenOnce(heard: (guesses: string[]) => void, failed: (reason: 'denied' | 'nothing' | 'offline' | 'unsupported') => void, ended: () => void): () => void {
  if (!RecognitionClass) {
    failed('unsupported');
    ended();
    return () => undefined;
  }
  const rec = new RecognitionClass();
  rec.lang = 'fr-FR';
  rec.interimResults = false;
  rec.maxAlternatives = 3;
  let got = false;
  rec.onresult = (e) => {
    got = true;
    const first = e.results[0];
    heard(first ? Array.from({ length: first.length }, (_, i) => (first[i] as { transcript: string }).transcript) : []);
  };
  rec.onerror = (e) => {
    got = true;
    failed(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'network' ? 'offline' : 'nothing');
  };
  rec.onend = () => {
    if (!got) failed('nothing');
    ended();
  };
  voice.stop();
  rec.start();
  return () => rec.stop();
}
