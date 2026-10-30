import { Check, CircleCheckBig, Gauge, Keyboard, Lightbulb, Menu, MessageCircleQuestion, Scan, Timer, Volume2, VolumeX, type IconNode } from 'lucide';
import type { CableType, Level, ObjectiveResult } from '@patchbay/sim-core';
import { t, tx, type Key } from '../i18n.js';
import { CABLE_STYLE } from '../scene/cables.js';
import { clock } from '../game/scoring.js';
import type { Quality } from '../scene/stage.js';
import { sound } from '../audio.js';
import { icon } from './brand.js';
import { h, ui } from './dom.js';

export interface HudActions {
  check(): void;
  hint(): void;
  menu(): void;
  overview(): void;
  ask(): void;
  ports(): void;
  cycleQuality(): Quality;
  selectCable(type: CableType | null): void;
}

export const CABLE_ORDER: CableType[] = ['straight', 'crossover', 'console', 'serial'];

/** A small drawing of the cable's connector, in the cable's colour (RJ45, console RJ45/DB9, serial DB60). */
function cableGlyph(type: CableType): SVGElement {
  const colour = CABLE_STYLE[type].colour;
  const plug =
    type === 'serial'
      ? '<rect x="6" y="8" width="20" height="12" rx="2" fill="#94a3b8"/><rect x="9" y="11" width="14" height="6" rx="1" fill="#1e293b"/>'
      : '<rect x="9" y="6" width="14" height="14" rx="2" fill="#e2e8f0"/><path d="M12 6h8v-3h-8z" fill="#cbd5e1"/><g fill="#d97706"><rect x="11.5" y="8" width="1.4" height="4"/><rect x="14" y="8" width="1.4" height="4"/><rect x="16.6" y="8" width="1.4" height="4"/><rect x="19.1" y="8" width="1.4" height="4"/></g>';
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="26" height="32" aria-hidden="true">${plug}<rect x="12" y="20" width="8" height="6" rx="1.5" fill="${colour}"/><path d="M16 26c0 6-6 7-6 14" stroke="${colour}" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`;
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  return document.importNode(doc.documentElement, true) as unknown as SVGElement;
}

const toolButton = (label: string, glyph: IconNode, onclick: (e: Event) => void): HTMLButtonElement =>
  h('button', { class: 'tool', title: label, 'aria-label': label, onclick }, icon(glyph, 18));

/** Mission title, objectives checklist, cable inventory, tooltip and toasts. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly objectivesList: HTMLElement;
  private readonly scoreLabel: HTMLElement;
  private readonly scoreBar: HTMLElement;
  private readonly inventory: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly hintsShown = new Set<string>();
  private readonly timerText: HTMLElement;
  private readonly timerBar: HTMLElement;
  private readonly timerBox: HTMLElement;
  private readonly doneBefore = new Set<string>();
  private firstObjectives = true;
  private shownSecond = -1;

  constructor(private readonly level: Level, private readonly actions: HudActions, quality: Quality, index = 0, private readonly exam = false) {
    this.objectivesList = h('ol', { class: 'objective-list' });
    this.scoreLabel = h('span', { class: 'score' }, '0');
    this.scoreBar = h('span', { class: 'fill' });
    this.inventory = h('div', { class: 'inventory panel-solid', role: 'toolbar', 'aria-label': 'Inventaire de câbles' });
    this.tooltip = h('div', { class: 'tooltip', hidden: true });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.timerText = h('span', { class: 'time' }, '--:--');
    this.timerBar = h('i', {});
    this.timerBox = h('div', { class: 'hud-timer panel-solid', role: 'timer', 'aria-label': t('timer.label') }, icon(Timer, 18), this.timerText, h('span', { class: 'timer-bar' }, this.timerBar));

    const qualityButton = toolButton(this.qualityLabel(quality), Gauge, () => {
      const label = this.qualityLabel(actions.cycleQuality());
      qualityButton.title = label;
      qualityButton.setAttribute('aria-label', label);
      this.toast(label);
    });
    const soundButton = toolButton(sound.isMuted ? t('hud.soundOff') : t('hud.sound'), sound.isMuted ? VolumeX : Volume2, () => {
      const muted = sound.toggleMute();
      soundButton.replaceChildren(icon(muted ? VolumeX : Volume2, 18));
      soundButton.title = muted ? t('hud.soundOff') : t('hud.sound');
    });

    this.root = h(
      'div',
      { class: 'hud' },
      h(
        'header',
        { class: 'hud-top' },
        h('div', { class: 'mission-chip panel-solid' }, h('span', { class: 'label' }, `${t('briefing.mission')} ${String(index + 1).padStart(2, '0')}`), h('strong', {}, tx(level.title))),
        h(
          'div',
          { class: 'toolbar panel-solid' },
          toolButton(t('hud.view'), Scan, () => actions.overview()),
          exam ? null : toolButton(t('hud.hint'), Lightbulb, () => actions.hint()),
          exam ? null : toolButton(t('assistant.tool'), MessageCircleQuestion, () => actions.ask()),
          toolButton(t('ports.tool'), Keyboard, () => actions.ports()),
          qualityButton,
          soundButton,
          toolButton(t('hud.menu'), Menu, () => actions.menu()),
          h('button', { class: 'btn primary small', onclick: () => actions.check() }, icon(CircleCheckBig, 16), h('span', {}, exam ? t('exam.hand') : t('hud.check'))),
        ),
      ),
      h(
        'aside',
        { class: 'objectives panel-solid' },
        h('header', {}, h('span', { class: 'label' }, exam ? t('exam.tasks') : t('hud.objectives')), exam ? null : h('span', { class: 'score-line' }, this.scoreLabel, h('small', {}, '/ 100'))),
        exam ? null : h('div', { class: 'progress' }, this.scoreBar),
        this.objectivesList,
      ),
      this.timerBox,
      this.inventory,
      this.tooltip,
      this.toasts,
    );
    ui().append(this.root);
  }

  private qualityLabel(q: Quality): string {
    return `${t('hud.quality')} : ${t(`quality.${q}` as Key)}`;
  }

  destroy(): void {
    document.body.classList.remove('time-low');
    this.root.remove();
  }

  /** The clock: amber in the last minute, red and pulsing in the last 15 seconds. */
  setTimer(remaining: number, limit: number, paused: boolean): void {
    const second = Math.ceil(remaining);
    if (second === this.shownSecond) return;
    this.shownSecond = second;
    this.timerText.textContent = clock(remaining);
    this.timerBar.style.width = `${Math.max(0, (remaining / limit) * 100)}%`;
    this.timerBox.classList.toggle('paused', paused);
    this.timerBox.title = paused ? t('timer.tutorial') : t('timer.label');
    this.timerBox.classList.toggle('warn', remaining <= 60);
    this.timerBox.classList.toggle('danger', remaining <= 15);
    document.body.classList.toggle('time-low', remaining <= 15);
  }

  /** A short line across the screen: the start of the mission. */
  banner(title: string, line: string): void {
    const el = h('div', { class: 'mission-banner', 'aria-hidden': 'true' }, h('strong', {}, title), h('span', {}, line));
    this.root.append(el);
    setTimeout(() => el.remove(), 2600);
  }

  setObjectives(results: ObjectiveResult[]): void {
    const passed = new Map(results.map((r) => [r.id, r]));
    // In an exam the list is the subject: nothing is ticked before the end.
    if (this.exam) {
      this.objectivesList.replaceChildren(...this.level.objectives.map((o) => h('li', { class: 'objective' }, h('span', { class: 'tick' }), h('span', { class: 'text' }, tx(o.label)), h('span', { class: 'pts' }, String(o.points)))));
      return;
    }
    const score = results.reduce((n, r) => n + r.points, 0);
    this.scoreLabel.textContent = String(score);
    this.scoreBar.style.width = `${score}%`;
    this.objectivesList.replaceChildren(
      ...this.level.objectives.map((o) => {
        const done = passed.get(o.id)?.passed ?? false;
        const fresh = done && !this.doneBefore.has(o.id) && !this.firstObjectives;
        if (done) this.doneBefore.add(o.id);
        else this.doneBefore.delete(o.id);
        return h(
          'li',
          { class: `objective${done ? ' done' : ''}${fresh ? ' fresh' : ''}`, 'data-gain': `+${o.points}` },
          h('span', { class: 'tick', 'aria-label': done ? 'fait' : 'à faire' }, done ? icon(Check, 12) : null),
          h('span', { class: 'text' }, tx(o.label)),
          h('span', { class: 'pts' }, String(o.points)),
          !done && this.hintsShown.has(o.id) && o.hint ? h('span', { class: 'hint' }, icon(Lightbulb, 13), tx(o.hint)) : null,
        );
      }),
    );
    this.firstObjectives = false;
  }

  /** Reveal the hints of these objectives in the checklist. */
  revealHints(ids: string[]): void {
    for (const id of ids) this.hintsShown.add(id);
  }

  setInventory(left: Partial<Record<CableType, number>>, selected: CableType | null): void {
    const types = CABLE_ORDER.filter((type) => this.level.inventory.cables[type] !== undefined);
    const slots = types.map((type, i) => {
      const count = left[type] ?? 0;
      return h(
        'button',
        {
          class: `cable-slot${selected === type ? ' selected' : ''}`,
          'data-cable': type,
          disabled: count === 0 && selected !== type,
          'aria-pressed': selected === type ? 'true' : 'false',
          title: `${t(`cable.${type}` as Key)} (${i + 1})`,
          onclick: () => this.actions.selectCable(selected === type ? null : type),
        },
        h('kbd', {}, String(i + 1)),
        cableGlyph(type),
        h('span', { class: 'name' }, t(`cable.${type}` as Key)),
        h('span', { class: 'count' }, `× ${count}`),
      );
    });
    this.inventory.replaceChildren(...slots, h('span', { class: 'tool-hint' }, t(matchMedia('(pointer: coarse)').matches ? 'hud.toolHintTouch' : 'hud.toolHint')));
  }

  showTooltip(text: string | null, x = 0, y = 0, bad = false): void {
    if (!text) {
      this.tooltip.hidden = true;
      return;
    }
    this.tooltip.hidden = false;
    this.tooltip.textContent = text;
    this.tooltip.classList.toggle('bad', bad);
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  toast(message: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
    const el = h('div', { class: `toast ${kind}` }, message);
    this.toasts.append(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.remove(), 3200);
  }
}
