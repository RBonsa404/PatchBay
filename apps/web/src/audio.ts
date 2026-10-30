/**
 * Game sounds and music, synthesised with the Web Audio API: no audio files to ship, works offline, no licence to
 * track. The context starts on the first user gesture (browsers require it).
 *
 * Three levels, mixed through a limiter: effects (the player's actions), the room (mains hum and occasional
 * machine noises) and the music (an original generative loop, quieter during a mission).
 */
export type SoundName = 'plug' | 'unplug' | 'error' | 'objective' | 'success' | 'click' | 'packet' | 'step';
export type Mood = 'menu' | 'mission';

const STORAGE_KEY = 'patchbay.muted';
const MUSIC_KEY = 'patchbay.music';
const MASTER = 0.9;
const MUSIC_LEVEL: Record<Mood, number> = { menu: 1.2, mission: 1.0 };
const ROOM_LEVEL: Record<Mood, number> = { menu: 0.6, mission: 1.2 };

const BEAT = 60 / 84;
const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);
/** The chords, four bars each pass: root for the bass, notes for the pad and the arpeggio (MIDI numbers). */
const CHORDS: { root: number; notes: number[] }[] = [
  { root: 45, notes: [57, 60, 64, 67, 71] }, // Am9
  { root: 41, notes: [57, 60, 65, 69, 72] }, // Fmaj7
  { root: 48, notes: [55, 60, 64, 67, 71] }, // Cmaj7
  { root: 43, notes: [55, 59, 62, 69, 71] }, // G6/9
];
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
  private echo: GainNode | null = null;
  private reverb: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = read(STORAGE_KEY) === '1';
  private musicOn = read(MUSIC_KEY) !== '0';
  private mood: Mood = 'menu';
  private nextBar = 0;
  private bar = 0;
  private nextNoise = 0;

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
      if (document.hidden) void this.ctx?.suspend();
      else void this.ctx?.resume();
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

  /** Turn the music alone on or off; returns whether it now plays. */
  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    write(MUSIC_KEY, this.musicOn ? '1' : '0');
    this.applyMood();
    return this.musicOn;
  }

  /** The menus let the music forward; a mission brings the room forward. */
  setMood(mood: Mood): void {
    this.mood = mood;
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
    this.music?.gain.setTargetAtTime(this.musicOn ? MUSIC_LEVEL[this.mood] : 0, ctx.currentTime, 0.6);
    this.room?.gain.setTargetAtTime(ROOM_LEVEL[this.mood], ctx.currentTime, 0.6);
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
    this.music.connect(this.master);
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
    this.nextBar = ctx.currentTime + 0.2;
    this.nextNoise = ctx.currentTime + 4;
    // Notes are scheduled ahead of time: timers are slowed down in the background and when the game is busy.
    setInterval(() => this.schedule(), 250);
    this.schedule();
    return ctx;
  }

  /** A dotted echo and a generated reverb, shared by the music and the room's noises. */
  private buildEffects(): void {
    const ctx = this.ctx as AudioContext;
    this.echo = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = BEAT * 0.75;
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
    while (this.nextBar < ctx.currentTime + 1.5) {
      if (this.musicOn) this.playBar(this.bar, this.nextBar);
      this.nextBar += BEAT * 4;
      this.bar++;
    }
    if (this.nextNoise < ctx.currentTime + 1.5) {
      this.roomNoise(this.nextNoise);
      this.nextNoise += 5 + Math.random() * 11;
    }
  }

  /**
   * One bar of the music. The form is 32 bars: pad and bass alone, then the arpeggio, then the pulse, then a thinner
   * passage, so that it never sits still for long.
   */
  private playBar(bar: number, t: number): void {
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length] as { root: number; notes: number[] };
    const section = Math.floor(bar / 8) % 4;
    if (bar % 2 === 0) {
      for (const n of chord.notes.slice(0, 4)) this.pad(midi(n), t, BEAT * 8);
      this.note(midi(chord.root - 12), t, BEAT * 3.5, 'triangle', 0.3, 500, false);
    } else {
      this.note(midi(chord.root - 12), t + BEAT * 2, BEAT * 1.5, 'triangle', 0.22, 500, false);
    }
    if (section >= 1 && section <= 2) {
      ARPEGGIO.forEach((index, i) => {
        if (index < 0) return;
        const swing = i % 2 ? BEAT * 0.03 : 0;
        this.note(midi((chord.notes[index] as number) + 12), t + (i * BEAT) / 2 + swing, 0.32, 'triangle', i % 4 === 0 ? 0.11 : 0.075, 2600, true);
      });
    }
    if (section === 2) {
      for (let beat = 0; beat < 4; beat++) {
        if (beat % 2 === 0) this.kick(t + beat * BEAT);
      }
    }
    if (section === 3 && bar % 4 === 3) {
      // A single high phrase over the thinner passage.
      [4, 3, 2].forEach((index, i) => this.note(midi((chord.notes[index] as number) + 12), t + i * BEAT * 1.5, 0.9, 'sine', 0.1, 3000, true));
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

  private kick(t: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    osc.connect(gain).connect(this.music as GainNode);
    osc.start(t);
    osc.stop(t + 0.3);
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
      case 'step': // a soft footfall on the raised floor, hollow underneath
        this.tone(95 + Math.random() * 20, t, 0.09, 'sine', 0.16, 60);
        this.burst(t, 0.03, 0.05, 1200);
        break;
    }
  }
}

export const sound = new Sound();
