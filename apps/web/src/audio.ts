/**
 * Game sounds, synthesised with the Web Audio API: no audio files to ship, works offline.
 * The context starts on the first user gesture (browsers require it).
 */
export type SoundName = 'plug' | 'unplug' | 'error' | 'objective' | 'success' | 'click' | 'packet';

const STORAGE_KEY = 'patchbay.muted';

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted: boolean;

  constructor() {
    let stored = false;
    try {
      stored = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // storage unavailable: sound stays on
    }
    this.muted = stored;
    const unlock = (): void => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch {
      // ignore
    }
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    const length = Math.floor(this.ctx.sampleRate * 0.2);
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      data[i] = (seed / 1073741824 - 1) * (1 - i / length);
    }
    this.startFans();
    return this.ctx;
  }

  /** The room's ambience: the low, steady breath of the server fans, under everything else (and muted with it). */
  private startFans(): void {
    const ctx = this.ctx as AudioContext;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter).connect(gain).connect(this.master as GainNode);
    src.start();
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
    osc.connect(gain).connect(this.master as GainNode);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private burst(start: number, duration: number, volume: number, highpass: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(gain).connect(this.master as GainNode);
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
    }
  }
}

export const sound = new Sound();
