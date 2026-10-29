import type { CableType, Level, ObjectiveResult } from '@patchbay/sim-core';
import { t, tx, type Key } from '../i18n.js';
import { CABLE_STYLE } from '../scene/cables.js';
import type { Quality } from '../scene/stage.js';
import { sound } from '../audio.js';
import { h, ui } from './dom.js';

export interface HudActions {
  check(): void;
  hint(): void;
  menu(): void;
  overview(): void;
  cycleQuality(): Quality;
  selectCable(type: CableType | null): void;
}

const CABLE_ORDER: CableType[] = ['straight', 'crossover', 'console', 'serial'];

/** Mission title, objectives checklist, cable inventory, tooltip and toasts. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly objectivesList: HTMLElement;
  private readonly scoreLabel: HTMLElement;
  private readonly inventory: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly hintsShown = new Set<string>();

  constructor(private readonly level: Level, private readonly actions: HudActions, quality: Quality) {
    this.objectivesList = h('div');
    this.scoreLabel = h('span', {}, `0 / 100`);
    this.inventory = h('div', { class: 'inventory glass', role: 'toolbar', 'aria-label': 'Inventaire' });
    this.tooltip = h('div', { class: 'tooltip glass', hidden: true });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    const qualityButton: HTMLButtonElement = h('button', { class: 'btn small', onclick: () => (qualityButton.textContent = this.qualityLabel(actions.cycleQuality())) }, this.qualityLabel(quality));
    this.root = h(
      'div',
      {},
      h(
        'div',
        { class: 'hud-top' },
        h('div', { class: 'mission-tag glass' }, h('div', { class: 'kicker' }, t('app.club')), h('h3', {}, tx(level.title))),
        h(
          'div',
          { class: 'hud-actions' },
          h('button', { class: 'btn small', onclick: () => actions.overview() }, t('hud.view')),
          qualityButton,
          h('button', { class: 'btn small', onclick: (e: Event) => { const muted = sound.toggleMute(); (e.currentTarget as HTMLElement).textContent = muted ? t('hud.soundOff') : t('hud.sound'); } }, sound.isMuted ? t('hud.soundOff') : t('hud.sound')),
          h('button', { class: 'btn small', onclick: () => actions.hint() }, t('hud.hint')),
          h('button', { class: 'btn small', onclick: () => actions.menu() }, t('hud.menu')),
          h('button', { class: 'btn small amber', onclick: () => actions.check() }, t('hud.check')),
        ),
      ),
      h('div', { class: 'objectives glass' }, h('h4', {}, h('span', {}, t('hud.objectives')), this.scoreLabel), this.objectivesList),
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
    this.root.remove();
  }

  setObjectives(results: ObjectiveResult[]): void {
    const passed = new Map(results.map((r) => [r.id, r]));
    const score = results.reduce((n, r) => n + r.points, 0);
    this.scoreLabel.textContent = `${score} / 100`;
    this.objectivesList.replaceChildren(
      ...this.level.objectives.map((o) => {
        const done = passed.get(o.id)?.passed ?? false;
        return h(
          'div',
          { class: `objective${done ? ' done' : ''}` },
          h('span', { class: 'tick', 'aria-label': done ? 'fait' : 'à faire' }),
          h('span', { class: 'label' }, tx(o.label)),
          h('span', { class: 'pts' }, `${o.points} ${t('hud.points')}`),
          !done && this.hintsShown.has(o.id) && o.hint ? h('span', { class: 'hint' }, tx(o.hint)) : null,
        );
      }),
    );
  }

  /** Reveal the hints of these objectives in the checklist. */
  revealHints(ids: string[]): void {
    for (const id of ids) this.hintsShown.add(id);
  }

  setInventory(left: Partial<Record<CableType, number>>, selected: CableType | null): void {
    const slots = CABLE_ORDER.filter((type) => this.level.inventory.cables[type] !== undefined).map((type) => {
      const count = left[type] ?? 0;
      return h(
        'button',
        {
          class: `cable-slot${selected === type ? ' selected' : ''}`,
          disabled: count === 0 && selected !== type,
          'aria-pressed': selected === type ? 'true' : 'false',
          onclick: () => this.actions.selectCable(selected === type ? null : type),
        },
        h('span', { class: 'swatch', style: { background: `linear-gradient(135deg, ${CABLE_STYLE[type].colour}, #0b1e3f)` } }),
        h('span', { class: 'name' }, t(`cable.${type}` as Key)),
        h('span', { class: 'count' }, `${count} ${t('cable.left')}`),
      );
    });
    this.inventory.replaceChildren(...slots, h('span', { class: 'tool-hint' }, t('hud.toolHint')));
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
    const el = h('div', { class: `toast glass ${kind === 'info' ? '' : kind}` }, message);
    this.toasts.append(el);
    setTimeout(() => el.remove(), 3200);
  }
}
