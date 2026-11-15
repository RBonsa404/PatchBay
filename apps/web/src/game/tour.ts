import type { TourStop } from '@patchbay/content';
import { ChevronLeft, ChevronRight, X } from 'lucide';
import { sound } from '../audio.js';
import { t, tx } from '../i18n.js';
import { icon, MENTOR, mentorPortrait } from '../ui/brand.js';
import { h, ui } from '../ui/dom.js';

const SEEN_KEY = 'patchbay.tour.seen';

/** Whether the player has already been through the guided tour (the title screen then stops suggesting it). */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markTourSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore
  }
}

export interface TourHandlers {
  /** Take the player's eyes to what a stop is about. */
  show(stop: TourStop, index: number): void;
  /** The last stop's button: on to the first mission. */
  done(): void;
  /** Leave the tour early. */
  quit(): void;
}

/**
 * The guided tour's bubble: Aïcha's text for the current stop, Previous / Next, and the stop's place in the tour.
 * Nothing moves on by itself: the player reads at their own pace and chooses when to go on.
 */
export class TourGuide {
  private index = 0;
  private readonly bubble: HTMLElement;
  private typing: ReturnType<typeof setInterval> | null = null;
  private readonly keys = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')) return;
    if (e.code === 'PageDown' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.next();
    } else if (e.code === 'PageUp' || e.code === 'Backspace') {
      e.preventDefault();
      this.go(this.index - 1);
    }
  };

  constructor(private readonly stops: TourStop[], private readonly handlers: TourHandlers) {
    this.bubble = h('div', { class: 'coach tour-guide glass', role: 'dialog', 'aria-live': 'polite', 'aria-label': t('tour.title') });
    ui().append(this.bubble);
    addEventListener('keydown', this.keys);
    this.render();
  }

  get current(): number {
    return this.index;
  }

  /** Show the stop again where it is (after the player walked away from it). */
  replay(): void {
    this.handlers.show(this.stops[this.index] as TourStop, this.index);
  }

  dispose(): void {
    if (this.typing) clearInterval(this.typing);
    removeEventListener('keydown', this.keys);
    this.bubble.remove();
    document.querySelectorAll('.pulse-ui').forEach((e) => e.classList.remove('pulse-ui'));
  }

  private next(): void {
    if (this.index === this.stops.length - 1) {
      markTourSeen();
      this.handlers.done();
    } else {
      this.go(this.index + 1);
    }
  }

  private go(index: number): void {
    if (index < 0 || index >= this.stops.length || index === this.index) return;
    this.index = index;
    if (index === this.stops.length - 1) markTourSeen();
    sound.play('click');
    this.render();
    this.handlers.show(this.stops[index] as TourStop, index);
  }

  private type(el: HTMLElement, line: string): void {
    if (this.typing) clearInterval(this.typing);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = line;
      return;
    }
    let n = 0;
    this.typing = setInterval(() => {
      n = Math.min(line.length, n + 3);
      el.textContent = line.slice(0, n);
      if (n >= line.length && this.typing) clearInterval(this.typing);
    }, 16);
    // A click on the text shows all of it at once.
    el.onclick = () => {
      if (this.typing) clearInterval(this.typing);
      el.textContent = line;
    };
  }

  private render(): void {
    const stop = this.stops[this.index] as TourStop;
    const last = this.index === this.stops.length - 1;
    const text = h('p', {});
    this.bubble.replaceChildren(
      mentorPortrait(),
      h(
        'div',
        { class: 'coach-body' },
        h('header', {}, h('strong', {}, `${MENTOR.name} · ${tx(stop.title)}`), h('span', { class: 'step' }, t('tuto.step', { n: this.index + 1, total: this.stops.length }))),
        text,
        h(
          'footer',
          {},
          h('span', { class: 'dots' }, ...this.stops.map((_, i) => h('i', { class: i < this.index ? 'done' : i === this.index ? 'now' : '', onclick: () => this.go(i), title: tx(this.stops[i]?.title) }))),
          h('button', { class: 'btn ghost small', onclick: () => this.handlers.quit(), title: t('tour.quit') }, icon(X, 14), h('span', {}, t('tour.quit'))),
          h('button', { class: 'btn ghost small', disabled: this.index === 0, onclick: () => this.go(this.index - 1) }, icon(ChevronLeft, 14), h('span', {}, t('tour.previous'))),
          h('button', { class: 'btn primary small', onclick: () => this.next() }, h('span', {}, last ? t('tour.start') : t('tour.next')), icon(ChevronRight, 14)),
        ),
      ),
    );
    this.type(text, tx(stop.text));
    document.querySelectorAll('.pulse-ui').forEach((e) => e.classList.remove('pulse-ui'));
    if ('cables' in stop.focus) document.querySelectorAll('.cable-slot').forEach((e) => e.classList.add('pulse-ui'));
  }
}
