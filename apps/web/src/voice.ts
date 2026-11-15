/**
 * Voice commands: speech recognition hears what the player says (Chrome and Edge, which send the audio to their
 * speech service: it needs a connection). Optional; the game is whole without it. The game does not speak: the
 * browsers' synthetic voices sound robotic, and Aïcha deserves a real voice or none.
 */

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
  rec.start();
  return () => rec.stop();
}
