import { ArrowLeft, ArrowRight, ChevronRight, LayoutList, Play, RotateCcw, Star } from 'lucide';
import type { Evaluation, Level } from '@patchbay/sim-core';
import { t, tx } from '../i18n.js';
import { clubBadge, icon, logo, MENTOR, mentorPortrait } from './brand.js';
import { h, leave, starCount, ui } from './dom.js';

/** Best score per level, kept in this browser only (a convenience, not a source of truth). */
export const progress = {
  best(levelId: string): number | null {
    try {
      const v = localStorage.getItem(`patchbay.best.${levelId}`);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  },
  record(levelId: string, score: number): void {
    try {
      if (score > (this.best(levelId) ?? -1)) localStorage.setItem(`patchbay.best.${levelId}`, String(score));
    } catch {
      // private mode or storage disabled: the game still works, it just does not remember
    }
  },
};

/** Three stars, filled according to the score. */
function starRow(score: number | null, size = 16): HTMLElement {
  const n = score === null ? 0 : starCount(score);
  return h('span', { class: 'star-row', 'aria-label': `${n} / 3` }, ...[0, 1, 2].map((i) => {
    const s = icon(Star, size);
    if (i < n) s.classList.add('on');
    return s;
  }));
}

const button = (label: string, onclick: () => void, kind = '', glyph?: Parameters<typeof icon>[0], after = false): HTMLButtonElement =>
  h('button', { class: `btn ${kind}`, onclick }, glyph && !after ? icon(glyph) : null, h('span', {}, label), glyph && after ? icon(glyph) : null);

/** Title: the room in the background, the game's name and menu on the left, the club at the bottom. */
export function showTitle(onPlay: () => void, onMissions: () => void): void {
  const screen: HTMLElement = h(
    'div',
    { class: 'screen screen-side' },
    h(
      'div',
      { class: 'side-column' },
      logo('large'),
      h('p', { class: 'tagline' }, t('title.tagline')),
      h(
        'nav',
        { class: 'menu', 'aria-label': 'Menu principal' },
        h('button', { class: 'menu-item primary', onclick: () => void leave(screen).then(onPlay) }, icon(Play, 20), h('span', {}, t('title.play')), icon(ChevronRight, 20)),
        h('button', { class: 'menu-item', onclick: () => void leave(screen).then(onMissions) }, icon(LayoutList, 20), h('span', {}, t('title.missions')), icon(ChevronRight, 20)),
      ),
      h('footer', { class: 'club' }, clubBadge(), h('div', {}, h('strong', {}, t('app.club')), h('span', {}, t('title.credit')))),
    ),
  );
  ui().append(screen);
}

export function showMissions(levels: Level[], onPick: (level: Level) => void, onBack: () => void): void {
  const screen: HTMLElement = h(
    'div',
    { class: 'screen screen-side' },
    h(
      'div',
      { class: 'side-column wide' },
      logo('small'),
      h('h2', { class: 'screen-title' }, t('missions.title')),
      h(
        'div',
        { class: 'mission-list' },
        ...levels.map((level, i) => {
          const best = progress.best(level.id);
          return h(
            'button',
            { class: 'mission-row', onclick: () => void leave(screen).then(() => onPick(level)) },
            h('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
            h(
              'span',
              { class: 'body' },
              h('span', { class: 'name' }, tx(level.title)),
              // The story's last sentence says what is at stake.
              h('span', { class: 'summary' }, tx(level.story).split(/(?<=[.!?])\s+/).filter(Boolean).pop() ?? ''),
              h(
                'span',
                { class: 'meta' },
                h('span', { class: 'difficulty', 'aria-label': `${t('missions.difficulty')} ${level.difficulty} / 5` }, ...[1, 2, 3, 4, 5].map((d) => h('i', { class: d <= level.difficulty ? 'on' : '' }))),
                best === null ? h('span', { class: 'tag' }, t('missions.new')) : h('span', { class: 'best' }, starRow(best, 14), `${best} / 100`),
              ),
            ),
            icon(ChevronRight, 20),
          );
        }),
      ),
      h('div', { class: 'actions' }, button(t('missions.back'), () => void leave(screen).then(onBack), 'ghost', ArrowLeft)),
    ),
  );
  ui().append(screen);
}

/** Mission order: Aïcha's message, the work order and what will be checked. */
export function showBriefing(level: Level, index: number, onStart: () => void, onBack: () => void): void {
  const screen: HTMLElement = h(
    'div',
    { class: 'screen screen-center' },
    h(
      'article',
      { class: 'dossier panel-solid' },
      h('header', {}, h('span', { class: 'label' }, `${t('briefing.mission')} ${String(index + 1).padStart(2, '0')}`), h('h2', {}, tx(level.title))),
      level.story
        ? h('div', { class: 'mentor-line' }, mentorPortrait(), h('div', {}, h('strong', {}, `${MENTOR.name} · ${MENTOR.role}`), h('p', {}, tx(level.story))))
        : null,
      h('section', {}, h('h3', {}, t('briefing.order')), h('div', { class: 'brief' }, tx(level.brief))),
      h(
        'section',
        {},
        h('h3', {}, t('briefing.checked')),
        h('ul', { class: 'check-list' }, ...level.objectives.map((o) => h('li', {}, h('span', {}, tx(o.label)), h('span', { class: 'pts' }, `${o.points} ${t('hud.points')}`)))),
      ),
      h(
        'footer',
        {},
        button(t('briefing.back'), () => void leave(screen).then(onBack), 'ghost', ArrowLeft),
        button(t('briefing.start'), () => void leave(screen).then(onStart), 'primary', ArrowRight, true),
      ),
    ),
  );
  ui().append(screen);
}

export function showResults(
  level: Level,
  evaluation: Evaluation,
  actions: { next?: () => void; retry: () => void; menu: () => void },
): void {
  const score = h('div', { class: 'score' }, '0');
  const screen: HTMLElement = h(
    'div',
    { class: 'screen screen-center' },
    h(
      'article',
      { class: 'results panel-solid' },
      h('span', { class: 'label' }, t('results.title')),
      h('h2', {}, tx(level.title)),
      h('div', { class: 'score-block' }, score, h('span', { class: 'out-of' }, '/ 100')),
      starRow(evaluation.score, 34),
      h(
        'ul',
        { class: 'check-list results-list' },
        ...level.objectives.map((o) => {
          const passed = evaluation.results.find((r) => r.id === o.id)?.passed ?? false;
          return h('li', { class: passed ? 'done' : 'missed' }, h('span', {}, tx(o.label)), h('span', { class: 'pts' }, passed ? `+${o.points}` : '0'));
        }),
      ),
      actions.next ? null : h('p', { class: 'muted' }, t('results.campaignDone')),
      h(
        'footer',
        {},
        button(t('results.menu'), () => void leave(screen).then(actions.menu), 'ghost', LayoutList),
        button(t('results.retry'), () => void leave(screen).then(actions.retry), 'ghost', RotateCcw),
        actions.next ? button(t('results.next'), () => void leave(screen).then(actions.next!), 'primary', ArrowRight, true) : null,
      ),
    ),
  );
  ui().append(screen);
  // Count the score up, and let the stars land one after the other.
  const start = performance.now();
  const tick = (now: number): void => {
    const k = Math.min(1, (now - start) / 1100);
    score.textContent = String(Math.round(evaluation.score * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
