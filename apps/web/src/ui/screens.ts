import type { Evaluation, Level } from '@patchbay/sim-core';
import { t, tx } from '../i18n.js';
import { h, leave, stars, ui } from './dom.js';

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

export function showTitle(onPlay: () => void, onMissions: () => void): void {
  const screen = h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'title-card glass' },
      h('div', { class: 'kicker' }, t('app.club')),
      h('h1', { class: 'logo' }, h('span', {}, 'Patch'), 'Bay'),
      h('p', {}, t('title.tagline')),
      h(
        'div',
        { class: 'title-actions' },
        h('button', { class: 'btn primary', onclick: () => void leave(screen).then(onPlay) }, t('title.play')),
        h('button', { class: 'btn', onclick: () => void leave(screen).then(onMissions) }, t('title.missions')),
      ),
      h('div', { class: 'credit' }, t('title.credit')),
    ),
  );
  ui().append(screen);
}

export function showMissions(levels: Level[], onPick: (level: Level) => void, onBack: () => void): void {
  const screen: HTMLElement = h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'missions glass' },
      h(
        'header',
        {},
        h('div', {}, h('div', { class: 'kicker' }, t('app.club')), h('h2', {}, t('missions.title'))),
        h('button', { class: 'btn small', onclick: () => void leave(screen).then(onBack) }, t('missions.back')),
      ),
      h(
        'div',
        { class: 'mission-grid' },
        ...levels.map((level, i) => {
          const best = progress.best(level.id);
          return h(
            'button',
            { class: 'mission-card', onclick: () => void leave(screen).then(() => onPick(level)) },
            h('span', { class: 'num' }, `${t('missions.mission')} ${String(i + 1).padStart(2, '0')}`),
            h('h3', {}, tx(level.title)),
            h('span', { class: 'muted' }, tx(level.brief).split('\n')[0] ?? ''),
            h(
              'span',
              { class: 'meta' },
              h('span', {}, `${t('missions.difficulty')} ${'●'.repeat(level.difficulty)}${'○'.repeat(5 - level.difficulty)}`),
              h('span', { class: 'stars' }, best === null ? t('missions.new') : `${stars(best)} ${best}`),
            ),
          );
        }),
      ),
    ),
  );
  ui().append(screen);
}

export function showBriefing(level: Level, index: number, onStart: () => void, onBack: () => void): void {
  const screen: HTMLElement = h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'briefing glass' },
      h('div', { class: 'kicker' }, `${t('briefing.mission')} ${String(index + 1).padStart(2, '0')}`),
      h('h2', {}, tx(level.title)),
      level.story ? h('p', { class: 'story' }, tx(level.story)) : null,
      h('div', { class: 'brief' }, tx(level.brief)),
      h(
        'footer',
        {},
        h('button', { class: 'btn', onclick: () => void leave(screen).then(onBack) }, t('briefing.back')),
        h('button', { class: 'btn primary', onclick: () => void leave(screen).then(onStart) }, t('briefing.start')),
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
  const screen: HTMLElement = h(
    'div',
    { class: 'screen' },
    h(
      'div',
      { class: 'results glass' },
      h('div', { class: 'kicker' }, t('results.title')),
      h('h2', {}, tx(level.title)),
      h('div', { class: 'score' }, String(evaluation.score)),
      h('div', { class: 'stars', style: { fontSize: '28px' } }, stars(evaluation.score)),
      h(
        'ul',
        {},
        ...level.objectives.map((o) => {
          const passed = evaluation.results.find((r) => r.id === o.id)?.passed ?? false;
          return h('li', { class: `objective${passed ? ' done' : ''}` }, h('span', { class: 'tick' }), h('span', { class: 'label' }, tx(o.label)), h('span', { class: 'pts' }, `${o.points}`));
        }),
      ),
      actions.next ? null : h('p', { class: 'muted' }, t('results.campaignDone')),
      h(
        'div',
        { class: 'title-actions' },
        h('button', { class: 'btn', onclick: () => void leave(screen).then(actions.menu) }, t('results.menu')),
        h('button', { class: 'btn', onclick: () => void leave(screen).then(actions.retry) }, t('results.retry')),
        actions.next ? h('button', { class: 'btn primary', onclick: () => void leave(screen).then(actions.next!) }, t('results.next')) : null,
      ),
    ),
  );
  ui().append(screen);
}
