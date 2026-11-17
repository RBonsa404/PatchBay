/**
 * Game sounds and music, synthesised with the Web Audio API: no audio files to ship, works offline, no licence to
 * track. The context starts on the first user gesture (browsers require it).
 *
 * Three levels, mixed through a limiter: effects (the player's actions), the room (mains hum and occasional
 * machine noises) and the music. The music adapts (`music.ts`): each scene (menu, guided tour, cabling,
 * troubleshooting, the last minute) has its own shuffled playlist of free tracks (`public/music`, see ASSETS.md) and
 * an original generative piece whose colour and tempo follow the scene; configuration work muffles it; the end of a
 * mission plays a short musical phrase, won or lost.
 */
import { FOCUS_CUTOFF, FOCUS_LEVEL, pieceName, PLAYLISTS, ROOM_LEVEL, SCENE_LEVEL, shuffled, type Piece, type Scene, type SynthStyle } from './music.js';

export type SoundName = 'plug' | 'unplug' | 'error' | 'objective' | 'success' | 'click' | 'packet' | 'step' | 'tick' | 'timeout' | 'shutter';
export type { Scene } from './music.js';

const STORAGE_KEY = 'patchbay.muted';
const MUSIC_KEY = 'patchbay.music';
const MASTER = 0.9;
/** The music's filter when nothing muffles it. */
const OPEN_CUTOFF = 18000;

const SYNTH = 'synth';
const STINGER = 'stinger';
const TITLES: Record<string, string> = {
  'calm-ambient-1': 'Calm Ambient 1',
  'calm-ambient-2': 'Calm Ambient 2',
  'calm-ambient-3': 'Calm Ambient 3',
  'calm-relax-1': 'Calm Relax 1',
  contemplation: 'Contemplation',
  'first-light-particles': 'First Light Particles',
  'starfield-romance': 'Starfield Romance',
  'exploration-theme': 'Exploration Theme',
  [SYNTH]: 'morceau du jeu',
  [STINGER]: 'fin de mission',
};
/** Level of the MP3s, so that they match the generative piece. */
const TRACK_LEVEL = 0.85;
const FADE = 2.5;
/** Bars of the generative piece before moving on. */
const SYNTH_BARS = 40;

/** Seconds per beat of each style of the generative piece. */
const BEATS: Record<SynthStyle, number> = { calm: 60 / 84, dark: 60 / 72, urgent: 60 / 104 };
const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);
type Chord = { root: number; notes: number[] };
/** The chords of each style, two bars each: root for the bass, notes for the pad and the arpeggio (MIDI numbers). */
const CHORDS: Record<SynthStyle, Chord[]> = {
  calm: [
    { root: 45, notes: [57, 60, 64, 67, 71] }, // Am9
    { root: 41, notes: [57, 60, 65, 69, 72] }, // Fmaj7
    { root: 48, notes: [55, 60, 64, 67, 71] }, // Cmaj7
    { root: 43, notes: [55, 59, 62, 69, 71] }, // G6/9
  ],
  // Troubleshooting: D minor, the colour of a search, with a suspended chord that does not resolve.
  dark: [
    { root: 38, notes: [50, 53, 57, 60, 64] }, // Dm9
    { root: 34, notes: [50, 53, 57, 58, 62] }, // Bbmaj7
    { root: 43, notes: [50, 55, 58, 62, 65] }, // Gm7
    { root: 45, notes: [52, 55, 57, 62, 64] }, // A7sus4
  ],
  // The last minute: A minor with a major dominant, which pulls forward.
  urgent: [
    { root: 45, notes: [57, 60, 64, 69, 72] }, // Am
    { root: 41, notes: [57, 60, 65, 69, 72] }, // F
    { root: 38, notes: [57, 62, 65, 69, 74] }, // Dm
    { root: 40, notes: [56, 59, 64, 68, 71] }, // E
  ],
};
/** Which note of the chord each eighth of a bar plays; -1 is a rest. */
const ARPEGGIO = [0, 2, 4, 3, 1, 3, 2, -1];

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the choice lasts until the page closes
  }
};

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fx: GainNode | null = null;
  private music: GainNode | null = null;
  private room: GainNode | null = null;
  /** Low-pass on the music bus: open, or closed down while the player configures. */
  private musicTone: BiquadFilterNode | null = null;
  private delay: DelayNode | null = null;
  private echo: GainNode | null = null;
  private reverb: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = read(STORAGE_KEY) === '1';
  private musicOn = read(MUSIC_KEY) !== '0';
  private scene: Scene = 'menu';
  private focus = false;
  private style: SynthStyle = 'calm';
  /** Bumped at each scene change, so that a delayed restart after an ending phrase knows it is stale. */
  private sceneToken = 0;
  private nextBar = 0;
  private bar = 0;
  private nextNoise = 0;
  private queue: Piece[] = [];
  private playing = SYNTH;
  private player: HTMLAudioElement | null = null;
  private playerGain: GainNode | null = null;
  private synthEnds = 0;

  constructor() {
    const unlock = (): void => {
      void this.ensure()?.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Silence in a background tab.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        void this.ctx?.suspend();
        this.player?.pause();
      } else {
        void this.ctx?.resume();
        if (this.musicOn) void this.player?.play().catch(() => undefined);
      }
    });
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    write(STORAGE_KEY, this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : MASTER;
    return this.muted;
  }

  /** Whether the music is on (it may still be silent while the sound is muted). */
  get musicPlaying(): boolean {
    return this.musicOn;
  }

  /** Turn the music alone on or off; returns whether it now plays. */
  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    write(MUSIC_KEY, this.musicOn ? '1' : '0');
    this.applyMood();
    if (this.musicOn) void this.player?.play().catch(() => undefined);
    else this.player?.pause();
    return this.musicOn;
  }

  /** Skip to the next piece of the playlist. */
  nextTrack(): void {
    if (this.ctx && this.musicOn) this.startNext();
  }

  /** The name of the piece playing now, to tell which one you like or not. */
  get trackTitle(): string {
    return TITLES[this.playing] ?? this.playing;
  }

  /** The track playing now (for automated checks). */
  get track(): string {
    return this.playing;
  }

  /** Stop the current piece with a fade, and start the next one in the shuffled order. */
  private startNext(): void {
    const ctx = this.ctx as AudioContext;
    this.fadeOutPlayer();
    if (this.queue.length === 0) this.queue = shuffled(PLAYLISTS[this.scene], this.playing);
    const piece = this.queue.shift() as Piece;
    const next = pieceName(piece);
    const wasSynth = this.playing === SYNTH;
    this.playing = next;
    if (typeof piece !== 'string') {
      this.setStyle(piece.synth);
      // Already playing: carry on along the same grid of bars, in the new colour (no doubled bar, no gap).
      if (!wasSynth || this.nextBar < ctx.currentTime) this.nextBar = ctx.currentTime + 0.2;
      this.bar = 0;
      this.synthEnds = SYNTH_BARS;
      return;
    }
    this.synthEnds = 0;
    const audio = new Audio(`${import.meta.env.BASE_URL}music/${next}.mp3`);
    audio.preload = 'auto';
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(TRACK_LEVEL, ctx.currentTime + FADE);
    ctx.createMediaElementSource(audio).connect(gain).connect(this.music as GainNode);
    const skip = (): void => {
      if (this.player === audio) this.startNext();
    };
    audio.addEventListener('ended', skip);
    // A track that cannot load (offline, say) is skipped; the generative piece needs no file.
    audio.addEventListener('error', () => {
      if (this.player !== audio) return;
      this.queue = this.queue.filter((t) => typeof t !== 'string');
      this.startNext();
    });
    this.player = audio;
    this.playerGain = gain;
    if (this.musicOn) void audio.play().catch(() => undefined);
  }

  private fadeOutPlayer(): void {
    const ctx = this.ctx as AudioContext;
    const audio = this.player;
    const gain = this.playerGain;
    this.player = null;
    this.playerGain = null;
    if (!audio || !gain) return;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setTargetAtTime(0, ctx.currentTime, FADE / 4);
    setTimeout(() => audio.pause(), FADE * 1000);
  }

  private setStyle(style: SynthStyle): void {
    this.style = style;
    if (this.delay && this.ctx) this.delay.delayTime.setTargetAtTime(BEATS[style] * 0.75, this.ctx.currentTime, 0.3);
  }

  /** The scene the player is in, and whether they are configuring (see `music.ts`). Cheap to call every frame. */
  setScene(scene: Scene, focus = false): void {
    if (scene === this.scene && focus === this.focus) return;
    const changed = scene !== this.scene;
    this.scene = scene;
    this.focus = focus;
    this.applyMood();
    if (!changed) return;
    this.sceneToken++;
    this.queue = [];
    if (this.ctx) this.startNext();
  }

  /** The scene playing now (for automated checks). */
  get currentScene(): { scene: Scene; focus: boolean } {
    return { scene: this.scene, focus: this.focus };
  }

  /**
   * The end of a mission: the piece fades, a short phrase says won or lost (on the music bus: the music switch silences
   * it too), then the menu's music comes back under the results.
   */
  stinger(kind: 'win' | 'fail'): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.fadeOutPlayer();
    this.playing = STINGER;
    this.synthEnds = 0;
    this.scene = 'menu';
    this.focus = false;
    this.queue = [];
    this.applyMood();
    const token = ++this.sceneToken;
    if (this.musicOn) {
      const t = ctx.currentTime + 0.6;
      if (kind === 'win') {
        // A rising C major ninth that opens and rings.
        for (const n of [48, 55, 64, 67, 74]) this.pad(midi(n), t, 3.2);
        [60, 64, 67, 72, 76, 79].forEach((n, i) => this.note(midi(n + 12), t + i * 0.12, 1.2, 'triangle', 0.08, 3200, true));
        this.note(midi(36), t, 3, 'triangle', 0.3, 500, false);
      } else {
        // A falling phrase over D minor, unresolved.
        for (const n of [50, 53, 57, 60]) this.pad(midi(n), t, 3.2);
        [69, 67, 65, 62].forEach((n, i) => this.note(midi(n), t + i * 0.32, 1.1, 'sine', 0.09, 2400, true));
        this.note(midi(38), t, 3, 'triangle', 0.3, 400, false);
      }
    }
    setTimeout(() => {
      if (token === this.sceneToken && this.playing === STINGER) this.startNext();
    }, 4600);
  }

  private presence = 1;

  /**
   * How much of the machines' hum the place where the player stands lets through (0 … 1.6): full by the racks,
   * faint in a classroom, almost nothing in the toilets.
   */
  setPresence(level: number): void {
    if (Math.abs(level - this.presence) < 0.01) return;
    this.presence = level;
    this.applyMood();
  }

  /** Current loudness of the whole mix, in dB relative to full scale (for automated checks). */
  level(): number {
    if (!this.analyser) return -Infinity;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    return 10 * Math.log10(data.reduce((sum, v) => sum + v * v, 0) / data.length + 1e-12);
  }

  private applyMood(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const level = SCENE_LEVEL[this.scene] * (this.focus ? FOCUS_LEVEL : 1);
    this.music?.gain.setTargetAtTime(this.musicOn ? level : 0, ctx.currentTime, 0.6);
    this.musicTone?.frequency.setTargetAtTime(this.focus ? FOCUS_CUTOFF : OPEN_CUTOFF, ctx.currentTime, 0.5);
    this.room?.gain.setTargetAtTime(ROOM_LEVEL[this.scene] * this.presence, ctx.currentTime, 0.9);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = (this.ctx = new Ctor());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.2;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 8192;
    this.master.connect(limiter).connect(this.analyser).connect(ctx.destination);
    this.fx = ctx.createGain();
    this.fx.gain.value = 1.5;
    this.fx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.musicTone = ctx.createBiquadFilter();
    this.musicTone.type = 'lowpass';
    this.musicTone.frequency.value = OPEN_CUTOFF;
    this.musicTone.Q.value = 0.5;
    this.music.connect(this.musicTone).connect(this.master);
    this.room = ctx.createGain();
    this.room.gain.value = 0;
    this.room.connect(this.master);

    const length = Math.floor(ctx.sampleRate * 0.2);
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      data[i] = (seed / 1073741824 - 1) * (1 - i / length);
    }

    this.buildEffects();
    this.startRoom();
    this.applyMood();
    this.nextNoise = ctx.currentTime + 4;
    this.startNext();
    // Notes are scheduled ahead of time: timers are slowed down in the background and when the game is busy.
    setInterval(() => this.schedule(), 250);
    this.schedule();
    return ctx;
  }

  /** A dotted echo and a generated reverb, shared by the music and the room's noises. */
  private buildEffects(): void {
    const ctx = this.ctx as AudioContext;
    this.echo = ctx.createGain();
    const delay = (this.delay = ctx.createDelay(2));
    delay.delayTime.value = BEATS[this.style] * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    this.echo.connect(delay).connect(tone).connect(feedback).connect(delay);

    const impulse = ctx.createBuffer(2, ctx.sampleRate * 3, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const d = impulse.getChannelData(channel);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    this.reverb = ctx.createGain();
    this.reverb.connect(convolver);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    convolver.connect(wet);
    wet.connect(this.music as GainNode);
    tone.connect(this.music as GainNode);
    tone.connect(this.reverb);
  }

  /** The steady sound of the room: only the low mains hum of the machines. No noise: it sounds like rain or static. */
  private startRoom(): void {
    const ctx = this.ctx as AudioContext;
    for (const [freq, volume] of [[100, 0.035], [200, 0.012]] as const) {
      const hum = ctx.createOscillator();
      hum.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      hum.connect(gain).connect(this.room as GainNode);
      hum.start();
    }
  }

  /** Queue the music's next bars and the room's next noise. */
  private schedule(): void {
    const ctx = this.ctx as AudioContext;
    while (this.playing === SYNTH && this.nextBar < ctx.currentTime + 1.5) {
      if (this.bar >= this.synthEnds) {
        this.startNext();
        break;
      }
      if (this.musicOn) this.playBar(this.bar, this.nextBar);
      this.nextBar += BEATS[this.style] * 4;
      this.bar++;
    }
    if (this.nextNoise < ctx.currentTime + 1.5) {
      this.roomNoise(this.nextNoise);
      this.nextNoise += 5 + Math.random() * 11;
    }
  }

  /**
   * One bar of the generative piece, in the current style. Calm: 32 bars of pad and bass alone, then the arpeggio,
   * then a thinner passage. Dark: slower, a sparse arpeggio low down and a bell answering. Urgent: the bass pulses on
   * every eighth, a closed hi-hat ticks the off-beats and the arpeggio never stops.
   */
  private playBar(bar: number, t: number): void {
    const style = this.style;
    const beat = BEATS[style];
    const chords = CHORDS[style];
    const chord = chords[Math.floor(bar / 2) % chords.length] as Chord;
    const section = Math.floor(bar / 8) % 4;
    if (bar % 2 === 0) for (const n of chord.notes.slice(0, 4)) this.pad(midi(n), t, beat * 8);
    if (style === 'urgent') {
      for (let i = 0; i < 8; i++) {
        this.note(midi(chord.root - 12), t + (i * beat) / 2, beat * 0.42, 'sawtooth', i % 2 ? 0.07 : 0.11, 380, false);
        if (i % 2) this.burst(t + (i * beat) / 2, 0.03, 0.05, 7000, this.music as GainNode);
      }
      ARPEGGIO.forEach((index, i) => {
        if (index < 0) return;
        this.note(midi((chord.notes[index] as number) + 12), t + (i * beat) / 2, 0.22, 'triangle', i % 4 === 0 ? 0.1 : 0.07, 3000, true);
      });
      return;
    }
    if (bar % 2 === 0) this.note(midi(chord.root - 12), t, beat * 3.5, 'triangle', 0.3, 500, false);
    else this.note(midi(chord.root - 12), t + beat * 2, beat * 1.5, 'triangle', 0.22, 500, false);
    if (style === 'dark') {
      if (section >= 1) {
        ARPEGGIO.forEach((index, i) => {
          if (index < 0 || i % 2) return;
          this.note(midi(chord.notes[index] as number), t + (i * beat) / 2, 0.5, 'triangle', 0.07, 1600, true);
        });
      }
      if (bar % 4 === 3) this.note(midi((chord.notes[4] as number) + 12), t + beat * 2, 1.6, 'sine', 0.06, 2800, true);
      return;
    }
    if (section >= 1 && section <= 2) {
      ARPEGGIO.forEach((index, i) => {
        if (index < 0) return;
        const swing = i % 2 ? beat * 0.03 : 0;
        this.note(midi((chord.notes[index] as number) + 12), t + (i * beat) / 2 + swing, 0.32, 'triangle', i % 4 === 0 ? 0.11 : 0.075, 2600, true);
      });
    }
    if (section === 3 && bar % 4 === 3) {
      // A single high phrase over the thinner passage.
      [4, 3, 2].forEach((index, i) => this.note(midi((chord.notes[index] as number) + 12), t + i * beat * 1.5, 0.9, 'sine', 0.1, 3000, true));
    }
  }

  private pad(freq: number, t: number, duration: number): void {
    const ctx = this.ctx as AudioContext;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.linearRampToValueAtTime(1050, t + duration * 0.55);
    filter.frequency.linearRampToValueAtTime(420, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + duration * 0.3);
    gain.gain.setValueAtTime(0.05, t + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0, t + duration + 0.5);
    for (const detune of [-7, 6]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + duration + 0.6);
    }
    filter.connect(gain);
    gain.connect(this.music as GainNode);
    gain.connect(this.reverb as GainNode);
  }

  private note(freq: number, t: number, duration: number, type: OscillatorType, volume: number, cutoff: number, wet: boolean): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(filter).connect(gain);
    gain.connect(this.music as GainNode);
    if (wet) gain.connect(this.echo as GainNode);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** Now and then, a machine in the room makes itself heard: a relay, a far-off beep. */
  private roomNoise(t: number): void {
    const room = this.room as GainNode;
    const choice = Math.random();
    if (choice < 0.5) {
      // A relay clicking twice.
      this.burst(t, 0.012, 0.28, 3000, room);
      this.burst(t + 0.05 + Math.random() * 0.05, 0.012, 0.18, 3500, room);
    } else {
      // A far-off status beep, softened by the room's reverb.
      const ctx = this.ctx as AudioContext;
      const osc = ctx.createOscillator();
      osc.frequency.value = choice < 0.8 ? 1568 : 1175;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.035, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain);
      gain.connect(room);
      gain.connect(this.reverb as GainNode);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  private tone(freq: number, start: number, duration: number, type: OscillatorType, volume: number, glideTo?: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.fx as GainNode);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private burst(start: number, duration: number, volume: number, highpass: number, out: GainNode = this.fx as GainNode): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(start);
    src.stop(start + duration + 0.02);
  }

  play(name: SoundName): void {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + 0.005;
    switch (name) {
      case 'plug': // the latch of an RJ-45 snapping in
        this.burst(t, 0.035, 0.5, 2500);
        this.tone(160, t, 0.09, 'sine', 0.35);
        break;
      case 'unplug':
        this.burst(t, 0.05, 0.35, 1800);
        this.tone(240, t, 0.12, 'sine', 0.25, 110);
        break;
      case 'error':
        this.tone(220, t, 0.11, 'square', 0.07);
        this.tone(174, t + 0.12, 0.16, 'square', 0.07);
        break;
      case 'objective':
        this.tone(988, t, 0.28, 'triangle', 0.18);
        this.tone(1318, t + 0.07, 0.3, 'sine', 0.1);
        break;
      case 'success':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.11, 0.42, 'triangle', 0.2));
        this.tone(1568, t + 0.44, 0.7, 'sine', 0.08);
        break;
      case 'click':
        this.tone(1400, t, 0.03, 'sine', 0.06);
        break;
      case 'packet':
        this.tone(1760, t, 0.04, 'sine', 0.04);
        break;
      case 'tick': // the last seconds of the clock
        this.tone(1320, t, 0.06, 'square', 0.05);
        break;
      case 'timeout': // the buzzer
        this.tone(196, t, 0.5, 'sawtooth', 0.12, 130);
        this.tone(147, t, 0.6, 'square', 0.05, 98);
        break;
      case 'shutter': // a camera's shutter: the blades, then the mirror falling back
        this.burst(t, 0.025, 0.4, 3200);
        this.burst(t + 0.07, 0.04, 0.3, 1400);
        this.tone(2100, t, 0.02, 'square', 0.03);
        break;
      case 'step': // a soft footfall on the raised floor, hollow underneath
        this.tone(95 + Math.random() * 20, t, 0.09, 'sine', 0.16, 60);
        this.burst(t, 0.03, 0.05, 1200);
        break;
    }
  }
}

export const sound = new Sound();
