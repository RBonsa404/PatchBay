// The game's voices, recorded in advance with Piper (neural speech synthesis that runs on this machine, MIT licence;
// French voices from rhasspy/piper-voices): Aïcha for the guided tour, a man's or a woman's voice for each colleague.
// Nothing is synthesised in the browser: the game plays these files, and only when the player asks (next stop of the
// tour, speaking to someone).
//   node tools/voice.cjs        writes apps/web/public/voice/<key>.ogg and index.json
// Needs art/vendor/piper (piper_windows_amd64 and the fr_FR voices) and ffmpeg.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const piperDir = path.join(root, 'art/vendor/piper');
const piper = path.join(piperDir, 'piper', 'piper.exe');
const out = path.join(root, 'apps/web/public/voice');
fs.mkdirSync(out, { recursive: true });

// The same key in the game (apps/web/src/voice.ts): FNV-1a of the text.
function key(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Read the texts from the sources themselves (bundled for Node with esbuild, which Vite brings).
const esbuild = require(path.join(root, 'node_modules/esbuild'));
const tmp = path.join(os.tmpdir(), 'ist-voice-texts.cjs');
esbuild.buildSync({
  stdin: {
    contents: "export { tour } from './packages/content/src/tour.ts'; export { COLLEAGUES } from './apps/web/src/game/cast.ts';",
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: tmp,
  logLevel: 'error',
  define: { 'import.meta.env': '{}' },
});
const { tour, COLLEAGUES } = require(tmp);

const WOMEN = new Set(['awa', 'mme-ouedraogo', 'fatim', 'mariam', 'student-f']);
const VOICE = { aicha: 'fr_FR-siwis-medium', man: 'fr_FR-tom-medium', woman: 'fr_FR-upmc-medium' };
const lines = [];
for (const stop of tour) lines.push({ voice: 'aicha', text: stop.text.fr });
for (const who of COLLEAGUES) for (const line of who.lines) lines.push({ voice: WOMEN.has(who.model) ? 'woman' : 'man', text: line });

const index = {};
let made = 0;
for (const { voice, text } of lines) {
  const k = key(text);
  index[k] = voice;
  const file = path.join(out, `${k}.ogg`);
  if (fs.existsSync(file)) continue;
  const wav = path.join(os.tmpdir(), `ist-voice-${k}.wav`);
  // A touch slower than the voices' default pace, short pauses between sentences: closer to someone explaining.
  execFileSync(piper, ['-m', path.join(piperDir, `${VOICE[voice]}.onnx`), '-f', wav, '--length_scale', '1.06', '--sentence_silence', '0.35'], { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-af', 'highpass=f=70,loudnorm=I=-18:TP=-2', '-c:a', 'libopus', '-b:a', '28k', file]);
  fs.unlinkSync(wav);
  made++;
}
// Files of texts that no longer exist go.
for (const f of fs.readdirSync(out)) if (f.endsWith('.ogg') && !index[f.slice(0, -4)]) fs.unlinkSync(path.join(out, f));
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
const size = fs.readdirSync(out).reduce((s, f) => s + fs.statSync(path.join(out, f)).size, 0);
console.log(`${lines.length} lines, ${made} recorded now, ${Math.round(size / 1024)} Ko in all`);
