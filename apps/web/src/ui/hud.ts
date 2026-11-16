import { BookOpen, Check, CircleCheckBig, CircleHelp, Gauge, Keyboard, Lightbulb, Menu, MessageCircleQuestion, Mic, Route, Scan, Timer, Volume2, VolumeX, type IconNode } from 'lucide';
import type { CableType, Level, ObjectiveResult } from '@patchbay/sim-core';
import { t, tx, type Key } from '../i18n.js';
import { CABLE_STYLE } from '../scene/cables.js';
import { clock } from '../game/scoring.js';
import type { Quality } from '../scene/stage.js';
import { sound } from '../audio.js';
import { canListen } from '../voice.js';
import { icon } from './brand.js';
import { h, ui } from './dom.js';

export interface HudActions {
  check(): void;
  hint(): void;
  menu(): void;
  overview(): void;
  ask(): void;
  brief(): void;
  help(): void;
  ports(): void;
  cycleQuality(): Quality;
  listen(): void;
  selectCable(type: CableType | null): void;
  /** Take the cable tester out or put it away. */
  tester(): void;
  /** Go to another site (missions across several sites only). */
  travel?(): void;
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

/** The handheld tester: a grey case, its screen showing a wire map, and the RJ45 socket on top. */
function testerGlyph(): SVGElement {
  const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40" width="26" height="32" aria-hidden="true"><rect x="7" y="2" width="8" height="5" rx="1" fill="#94a3b8"/><rect x="5" y="6" width="22" height="32" rx="4" fill="#fbbf24"/><rect x="8" y="9" width="16" height="13" rx="1.5" fill="#050a18"/><path d="M11 12h10M11 15h10M11 18h10" stroke="#38bdf8" stroke-width="1.4"/><circle cx="12" cy="29" r="2.4" fill="#1e293b"/><circle cx="20" cy="29" r="2.4" fill="#1e293b"/><rect x="12" y="34" width="8" height="1.6" rx=".8" fill="#1e293b"/></svg>';
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  return document.importNode(doc.documentElement, true) as unknown as SVGElement;
}

const toolButton = (label: string, glyph: IconNode, onclick: (e: Event) => void): HTMLButtonElement =>
  h('button', { class: 'tool', title: label, 'aria-label': label, onclick }, icon(glyph, 18));

/** Mission title, objectives checklist, cable inventory, tooltip and toasts. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly objectivesBox: HTMLElement;
  /** How many objectives are done, beside the title: « 3 / 8 ». */
  private readonly countLabel = h('span', { class: 'objective-count' });
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

  private readonly qualityButton: HTMLElement;
  private readonly micButton: HTMLButtonElement | null;

  constructor(private readonly level: Level, private readonly actions: HudActions, quality: Quality, index = 0, private readonly exam = false, tour = false, hour = '') {
    const multiSite = level.devices.some((d) => d.room === 'agence' || d.room === 'datacenter');
    this.objectivesList = h('ol', { class: 'objective-list' });
    this.scoreLabel = h('span', { class: 'score' }, '0');
    this.scoreBar = h('span', { class: 'fill' });
    this.inventory = h('div', { class: 'inventory panel-solid', role: 'toolbar', 'aria-label': 'Inventaire de câbles' });
    this.tooltip = h('div', { class: 'tooltip', hidden: true });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.timerText = h('span', { class: 'time' }, '--:--');
    this.timerBar = h('i', {});
    this.timerBox = h('div', { class: 'hud-timer panel-solid', role: 'timer', 'aria-label': t('timer.label') }, icon(Timer, 18), this.timerText, h('span', { class: 'timer-bar' }, this.timerBar));

    const qualityButton = toolButton(this.qualityLabel(quality), Gauge, () => this.showQuality(actions.cycleQuality()));
    this.qualityButton = qualityButton;
    const soundButton = toolButton(sound.isMuted ? t('hud.soundOff') : t('hud.sound'), sound.isMuted ? VolumeX : Volume2, () => {
      const muted = sound.toggleMute();
      soundButton.replaceChildren(icon(muted ? VolumeX : Volume2, 18));
      soundButton.title = muted ? t('hud.soundOff') : t('hud.sound');
    });

    // The microphone for voice commands, where the browser can hear.
    this.micButton = canListen ? toolButton(t('voice.listen'), Mic, () => actions.listen()) : null;

    const root = h(
      'div',
      { class: tour ? 'hud tour' : 'hud' },
      h(
        'header',
        { class: 'hud-top' },
        h('div', { class: 'mission-chip panel-solid' }, h('span', { class: 'label' }, tour ? t('tour.title') : `${t('briefing.mission')} ${String(index + 1).padStart(2, '0')}`, hour ? h('span', { class: 'mission-hour', title: t('hud.hour') }, hour) : null), h('strong', {}, tour ? t('tour.chip') : tx(level.title))),
        h(
          'div',
          { class: 'toolbar panel-solid' },
          toolButton(t('brief.tool'), BookOpen, () => actions.brief()),
          toolButton(t('hud.view'), Scan, () => actions.overview()),
          multiSite ? toolButton('Changer de site (G)', Route, () => actions.travel?.()) : null,
          h('i', { class: 'tool-sep' }),
          exam || tour ? null : toolButton(t('hud.hint'), Lightbulb, () => actions.hint()),
          exam ? null : toolButton(t('assistant.tool'), MessageCircleQuestion, () => actions.ask()),
          toolButton(t('ports.tool'), Keyboard, () => actions.ports()),
          toolButton(t('help.tool'), CircleHelp, () => actions.help()),
          h('i', { class: 'tool-sep' }),
          qualityButton,
          soundButton,
          this.micButton,
          toolButton(t('hud.menu'), Menu, () => actions.menu()),
          tour ? null : h('button', { class: 'btn primary small', onclick: () => actions.check() }, icon(CircleCheckBig, 16), h('span', {}, exam ? t('exam.hand') : t('hud.check'))),
        ),
      ),
      h(
        'aside',
        { class: 'objectives panel-solid' },
        h('header', { onclick: () => this.toggleObjectives(), title: t('objectives.toggle') }, h('span', { class: 'label' }, exam ? t('exam.tasks') : t('hud.objectives'), exam ? null : this.countLabel), exam ? null : h('span', { class: 'score-line' }, this.scoreLabel, h('small', {}, '/ 100'))),
        exam ? null : h('div', { class: 'progress' }, this.scoreBar),
        this.objectivesList,
      ),
      this.timerBox,
      this.inventory,
      this.tooltip,
      this.toasts,
    );
    this.root = root;
    this.objectivesBox = root.querySelector('.objectives') as HTMLElement;
    // A long list folds to the one task in progress (O or a click unfolds it): less to read at once.
    if (!exam && level.objectives.length > 6) this.objectivesBox.classList.add('collapsed');
    // The controls reminder goes once the player has had time to read it.
    setTimeout(() => this.root.classList.add('hint-read'), 45000);
    ui().append(this.root);
  }

  /** Say which quality is on, after the player's choice or when the game has lowered it. */
  showQuality(q: Quality): void {
    const label = this.qualityLabel(q);
    this.qualityButton.title = label;
    this.qualityButton.setAttribute('aria-label', label);
    this.toast(label);
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
    let foundCurrent = false;
    this.countLabel.textContent = `${results.filter((r) => r.passed).length} / ${this.level.objectives.length}`;
    this.objectivesList.replaceChildren(
      ...this.level.objectives.map((o) => {
        const done = passed.get(o.id)?.passed ?? false;
        const fresh = done && !this.doneBefore.has(o.id) && !this.firstObjectives;
        const current = !done && !foundCurrent;
        if (current) foundCurrent = true;
        if (done) this.doneBefore.add(o.id);
        else this.doneBefore.delete(o.id);
        return h(
          'li',
          { class: `objective${done ? ' done' : ''}${fresh ? ' fresh' : ''}${current ? ' current' : ''}`, 'data-gain': `+${o.points}` },
          h('span', { class: 'tick', 'aria-label': done ? 'fait' : 'à faire' }, done ? icon(Check, 12) : null),
          h('span', { class: 'text' }, tx(o.label)),
          h('span', { class: 'pts' }, String(o.points)),
          !done && this.hintsShown.has(o.id) && o.hint ? h('span', { class: 'hint' }, icon(Lightbulb, 13), tx(o.hint)) : null,
        );
      }),
    );
    this.firstObjectives = false;
    // The next thing to do stays in view, however long the list.
    this.objectivesList.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }

  private talkHint: HTMLElement | null = null;

  /** « E — parler à … » under the crosshair when a colleague is close enough to talk to. */
  setTalkHint(text: string | null): void {
    if (!text) {
      this.talkHint?.remove();
      this.talkHint = null;
      return;
    }
    if (!this.talkHint) {
      this.talkHint = h('div', { class: 'talk-hint' });
      this.root.append(this.talkHint);
    }
    if (this.talkHint.textContent !== text) this.talkHint.textContent = text;
  }

  /** The microphone glows while the game is listening. */
  setListening(on: boolean): void {
    this.micButton?.classList.toggle('listening', on);
  }

  toggleObjectives(): void {
    this.objectivesBox.classList.toggle('collapsed');
  }

  /** Reveal the hints of these objectives in the checklist. */
  revealHints(ids: string[]): void {
    for (const id of ids) this.hintsShown.add(id);
  }

  setInventory(left: Partial<Record<CableType, number>>, selected: CableType | null, testing = false): void {
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
    const tester = h(
      'button',
      { class: `cable-slot tester-slot${testing ? ' selected' : ''}`, 'aria-pressed': testing ? 'true' : 'false', title: t('tester.tool'), onclick: () => this.actions.tester() },
      h('kbd', {}, 'L'),
      testerGlyph(),
      h('span', { class: 'name' }, t('tester.slot')),
      h('span', { class: 'count' }, 'RJ45'),
    );
    this.inventory.replaceChildren(...slots, h('i', { class: 'slot-sep' }), tester, h('span', { class: 'tool-hint' }, t(matchMedia('(pointer: coarse)').matches ? 'hud.toolHintTouch' : 'hud.toolHint')));
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
    // The same message twice in a row replaces itself; two at most on screen.
    for (const old of [...this.toasts.children]) if (old.textContent === message) old.remove();
    const el = h('div', { class: `toast ${kind}` }, message);
    this.toasts.append(el);
    while (this.toasts.children.length > 2) this.toasts.firstElementChild?.remove();
    setTimeout(() => el.remove(), 3200);
  }
}
