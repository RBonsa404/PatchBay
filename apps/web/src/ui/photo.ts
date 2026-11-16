import { Camera, Grid3x3, LogOut, PenLine, User } from 'lucide';
import { sound } from '../audio.js';
import { t, type Key } from '../i18n.js';
import { icon } from './brand.js';
import { h, ui } from './dom.js';

/**
 * Photo mode (K, or the pause menu): the clock stops, the interface goes, the camera floats free in the room. Drag to
 * frame, wheel for the focal length, a filter, a grid of thirds, and the shot saved as a PNG signed with the game's
 * name, at a higher resolution than the screen.
 */

export const PHOTO_FILTERS = ['natural', 'warm', 'cool', 'mono', 'noir'] as const;
export type PhotoFilter = (typeof PHOTO_FILTERS)[number];

/** The same filter on the screen (CSS on the canvas) and on the saved photo (the 2D canvas's `filter`). */
export const FILTER_CSS: Record<PhotoFilter, string> = {
  natural: 'none',
  warm: 'sepia(0.16) saturate(1.18) brightness(1.03)',
  cool: 'hue-rotate(-10deg) saturate(0.92) contrast(1.06) brightness(1.02)',
  mono: 'grayscale(1) contrast(1.08)',
  noir: 'grayscale(1) contrast(1.4) brightness(0.9)',
};

/** File name of a photo taken at `when`: `ist-network-lab-2026-11-16-15h42-07.png`. */
export function photoName(when: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `ist-network-lab-${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}-${p(when.getHours())}h${p(when.getMinutes())}-${p(when.getSeconds())}.png`;
}

export interface PhotoActions {
  /** Turn the free camera by a drag of (dx, dy) pixels. */
  look(dx: number, dy: number): void;
  /** Multiply the focal length (above 1: closer). */
  zoom(factor: number): void;
  /** Show or hide the player's own student. */
  showAvatar(on: boolean): void;
  /** The picture as the camera sees it now, filters of the quality included. */
  capture(): HTMLCanvasElement;
  close(): void;
}

export class PhotoOverlay {
  readonly el: HTMLElement;
  filter: PhotoFilter = 'natural';
  private grid = true;
  private signed = true;
  private avatar = true;
  private readonly guides: HTMLElement;
  private readonly focal: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly bar: HTMLElement;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly actions: PhotoActions,
    private readonly place: string,
  ) {
    const toggle = (label: Key, glyph: Parameters<typeof icon>[0], on: () => boolean, flip: () => void): HTMLElement => {
      const button: HTMLButtonElement = h('button', { class: 'photo-toggle', 'aria-pressed': String(on()), title: t(label) }, icon(glyph, 16), h('span', {}, t(label)));
      button.addEventListener('click', () => {
        flip();
        button.setAttribute('aria-pressed', String(on()));
      });
      return button;
    };
    const chips = PHOTO_FILTERS.map((f) =>
      h('button', { class: `photo-chip${f === this.filter ? ' on' : ''}`, 'data-filter': f, onclick: () => this.setFilter(f) }, t(`photo.filter.${f}` as Key)),
    );
    this.guides = h('div', { class: 'photo-guides' }, h('i'), h('i'), h('i'), h('i'));
    this.focal = h('span', { class: 'photo-focal' });
    this.flash = h('div', { class: 'photo-flash' });
    this.bar = h(
      'div',
      { class: 'photo-bar' },
      h('div', { class: 'photo-title' }, icon(Camera, 18), h('strong', {}, t('photo.title')), this.focal),
      h('div', { class: 'photo-chips', role: 'group', 'aria-label': t('photo.filter') }, ...chips),
      h(
        'div',
        { class: 'photo-tools' },
        toggle('photo.grid', Grid3x3, () => this.grid, () => {
          this.grid = !this.grid;
          this.guides.hidden = !this.grid;
        }),
        toggle('photo.avatar', User, () => this.avatar, () => {
          this.avatar = !this.avatar;
          this.actions.showAvatar(this.avatar);
        }),
        toggle('photo.sign', PenLine, () => this.signed, () => (this.signed = !this.signed)),
        h('button', { class: 'btn primary small photo-shoot', onclick: () => this.shoot() }, icon(Camera, 16), t('photo.shoot')),
        h('button', { class: 'btn ghost small', onclick: () => this.actions.close() }, icon(LogOut, 16), t('photo.leave')),
      ),
      h('p', { class: 'photo-keys' }, t('photo.keys')),
    );
    const surface = h('div', { class: 'photo-surface', 'aria-label': t('photo.title') });
    let last: [number, number] | null = null;
    surface.addEventListener('pointerdown', (e) => {
      last = [e.clientX, e.clientY];
      surface.setPointerCapture(e.pointerId);
    });
    surface.addEventListener('pointermove', (e) => {
      if (!last) return;
      this.actions.look(e.clientX - last[0], e.clientY - last[1]);
      last = [e.clientX, e.clientY];
    });
    const release = (): void => {
      last = null;
    };
    surface.addEventListener('pointerup', release);
    surface.addEventListener('pointercancel', release);
    surface.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.actions.zoom(Math.exp(-e.deltaY * 0.0012));
    }, { passive: false });
    this.el = h('div', { class: 'photo-mode', role: 'dialog', 'aria-label': t('photo.title') }, surface, this.guides, this.flash, this.bar);
    ui().append(this.el);
    document.body.classList.add('photo-on');
  }

  /** The lens as a photographer reads it: the 35 mm equivalent of the current vertical angle. */
  setFov(fovDeg: number, aspect: number): void {
    const horizontal = 2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect);
    const mm = 36 / (2 * Math.tan(horizontal / 2));
    this.focal.textContent = `${Math.round(mm)} mm`;
  }

  setFilter(f: PhotoFilter): void {
    this.filter = f;
    this.canvas.style.filter = FILTER_CSS[f] === 'none' ? '' : FILTER_CSS[f];
    for (const chip of this.el.querySelectorAll<HTMLElement>('.photo-chip')) chip.classList.toggle('on', chip.dataset.filter === f);
  }

  /** Hide the bar for a clean look at the frame (H), or bring it back. */
  toggleBar(): void {
    this.bar.hidden = !this.bar.hidden;
  }

  /** Take the photo: the shutter, a white flash, then the file. */
  shoot(): void {
    const shot = this.actions.capture();
    sound.play('shutter');
    this.flash.classList.remove('go');
    void this.flash.offsetWidth;
    this.flash.classList.add('go');
    const out = document.createElement('canvas');
    out.width = shot.width;
    out.height = shot.height;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    ctx.filter = FILTER_CSS[this.filter];
    ctx.drawImage(shot, 0, 0);
    ctx.filter = 'none';
    if (this.signed) this.sign(ctx, out.width, out.height);
    const name = photoName(new Date());
    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = h('a', { href: url, download: name });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      this.saved(name);
    }, 'image/png');
  }

  /** The game's signature in a bottom corner: its name in Orbitron, the company and the place below. */
  private sign(ctx: CanvasRenderingContext2D, w: number, hgt: number): void {
    const s = Math.max(1, w / 1920);
    const pad = 34 * s;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 10 * s;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.font = `900 ${Math.round(26 * s)}px Orbitron, 'Segoe UI', sans-serif`;
    ctx.fillText('IST NETWORK LAB', w - pad, hgt - pad - 22 * s);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.95)';
    ctx.font = `500 ${Math.round(12 * s)}px Orbitron, 'Segoe UI', sans-serif`;
    ctx.fillText(`DEDSEC TECHNOLOGIES  ·  ${this.place.toUpperCase()}`, w - pad, hgt - pad);
    ctx.restore();
  }

  private saved(name: string): void {
    const note = h('div', { class: 'photo-saved' }, icon(Camera, 16), h('span', {}, t('photo.saved')), h('code', {}, name));
    this.el.append(note);
    setTimeout(() => note.classList.add('leaving'), 2600);
    setTimeout(() => note.remove(), 3200);
  }

  destroy(): void {
    this.canvas.style.filter = '';
    document.body.classList.remove('photo-on');
    this.el.remove();
  }
}
