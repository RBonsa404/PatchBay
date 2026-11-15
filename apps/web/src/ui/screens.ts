import { sound } from '../audio.js';
import { ArrowLeft, ArrowRight, ChevronRight, Compass, GraduationCap, LayoutList, Lock, Play, RotateCcw, Settings, Star, Timer, Trophy } from 'lucide';
import type { Level } from '@patchbay/sim-core';
import { clock, type Grade } from '../game/scoring.js';
import { tourSeen } from '../game/tour.js';
import { t, tx } from '../i18n.js';
import { clubBadge, dedsecCredit, icon, logo, MENTOR, mentorPortrait } from './brand.js';
import { h, leave, starCount, ui } from './dom.js';

/** Best score per level, kept in this browser only (a convenience, not a source of truth). */
export const progress = {
  examBest(levelId: string): number | null {
    try {
      const v = localStorage.getItem(`patchbay.exam.${levelId}`);
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  },
  recordExam(levelId: string, score: number): void {
    try {
      if (score > (this.examBest(levelId) ?? -1)) localStorage.setItem(`patchbay.exam.${levelId}`, String(score));
    } catch {
      // private mode or storage disabled
    }
  },
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
export function showTitle(onPlay: () => void, onMissions: () => void, onSettings?: () => void, onTour?: () => void): void {
  const newcomer = !tourSeen() && progress.best('l01-cablage-console') === null;
  const screen: HTMLElement = h(
    'div',
    { class: 'screen screen-side' },
    h(
      'div',
      { class: 'side-column' },
      logo('large'),
      h('p', { class: 'tagline' }, t('title.tagline')),
      window.innerWidth < 1000 || matchMedia('(pointer: coarse)').matches ? h('p', { class: 'muted' }, t('title.desktop')) : null,
      h(
        'nav',
        { class: 'menu', 'aria-label': 'Menu principal' },
        h('button', { class: 'menu-item primary', onclick: () => void leave(screen).then(onPlay) }, icon(Play, 20), h('span', {}, t('title.play')), icon(ChevronRight, 20)),
        onTour
          ? h('button', { class: `menu-item${newcomer ? ' suggested' : ''}`, onclick: () => void leave(screen).then(onTour) }, icon(Compass, 20), h('span', {}, t('title.tour'), newcomer ? h('small', {}, t('title.tourNew')) : null), icon(ChevronRight, 20))
          : null,
        h('button', { class: 'menu-item', onclick: () => void leave(screen).then(onMissions) }, icon(LayoutList, 20), h('span', {}, t('title.missions')), icon(ChevronRight, 20)),
        onSettings ? h('button', { class: 'menu-item', onclick: () => void leave(screen).then(onSettings) }, icon(Settings, 20), h('span', {}, t('settings.title')), icon(ChevronRight, 20)) : null,
      ),
      h('p', { class: 'muted title-note' }, t('title.network')),
      h('footer', { class: 'club' }, clubBadge(), h('div', {}, h('strong', {}, t('app.club')), h('span', {}, t('title.credit')))),
      dedsecCredit(),
    ),
  );
  ui().append(screen);
}

/**
 * The course, chapter by chapter, from a beginner's first cable to an expert's troubleshooting: what is open now,
 * and what comes next (announced, locked until its missions exist).
 */
const CHAPTERS: { title: string; tier: string; topics: string; levels: string[] }[] = [
  { title: 'Premiers pas', tier: 'Débutant', topics: 'Câblage, console, configuration de base, adressage IP', levels: ['l01-cablage-console'] },
  { title: 'Relier les réseaux', tier: 'Débutant', topics: 'Routeurs, liaison série, routage statique', levels: ['l02-relier-deux-reseaux'] },
  { title: 'Commutation et VLAN', tier: 'Intermédiaire', topics: 'Switchs, VLAN, trunk 802.1Q', levels: ['l03-deux-salles-vlan'] },
  { title: 'Le réseau du bâtiment', tier: 'Intermédiaire', topics: 'Brassage, routage inter-VLAN, DHCP, plusieurs étages', levels: ['l04-reseau-du-batiment'] },
  { title: 'Routage dynamique', tier: 'Avancé', topics: 'OSPF à zone unique, voisins, coûts', levels: ['l05-routage-ospf'] },
  { title: 'Services et accès Internet', tier: 'Avancé', topics: 'NAT et PAT, DHCP centralisé, DNS', levels: ['l06-acces-internet'] },
  { title: 'Sécuriser le réseau', tier: 'Avancé', topics: 'Mots de passe, listes de contrôle d’accès, accès distant filtré', levels: ['l07-securite'] },
  { title: 'Multi-sites', tier: 'Expert', topics: 'Sites distants, ligne louée, OSPF multizone, route par défaut partagée', levels: ['l08-site-distant'] },
  { title: 'Dépannage expert', tier: 'Expert', topics: 'Pannes à trouver et réparer, sur tout le campus', levels: [] },
];

/** The player's standing on the course: stars won, missions passed, and the grade they give. */
function standing(levels: Level[]): { stars: number; max: number; passed: number; grade: string } {
  const stars = levels.reduce((n, l) => n + (progress.best(l.id) === null ? 0 : starCount(progress.best(l.id) as number)), 0);
  const passed = levels.filter((l) => (progress.best(l.id) ?? 0) >= 70).length;
  const share = stars / (levels.length * 3 || 1);
  const grade = share >= 0.9 ? 'Expert réseau' : share >= 0.6 ? 'Administrateur réseau' : share >= 0.25 ? 'Technicien' : 'Stagiaire';
  return { stars, max: levels.length * 3, passed, grade };
}

export function showMissions(levels: Level[], onPick: (level: Level) => void, onBack: () => void): void {
  const me = standing(levels);
  const next = levels.find((l) => (progress.best(l.id) ?? 0) < 70) ?? null;
  let number = 0;
  const card = (level: Level): HTMLElement => {
    const i = levels.indexOf(level);
    const best = progress.best(level.id);
    return h(
      'button',
      { class: `mission-row mission-card${level === next ? ' next' : ''}${best !== null && best >= 70 ? ' done' : ''}`, 'data-mission': String(i + 1), onclick: () => void leave(screen).then(() => onPick(level)) },
      h('span', { class: 'thumb', style: { backgroundImage: `url(${import.meta.env.BASE_URL}missions/${i + 1}.jpg)` } }, h('span', { class: 'num' }, String(i + 1).padStart(2, '0')), level === next ? h('span', { class: 'ribbon' }, 'À faire') : null),
      h(
        'span',
        { class: 'body' },
        h('span', { class: 'name' }, tx(level.title)),
        h('span', { class: 'summary' }, tx(level.story).split(/(?<=[.!?])\s+/).filter(Boolean).pop() ?? ''),
        h(
          'span',
          { class: 'meta' },
          h('span', { class: 'difficulty', 'aria-label': `${t('missions.difficulty')} ${level.difficulty} / 5` }, ...[1, 2, 3, 4, 5].map((d) => h('i', { class: d <= level.difficulty ? 'on' : '' }))),
          best === null ? h('span', { class: 'tag' }, t('missions.new')) : h('span', { class: 'best' }, starRow(best, 14), `${best} / 100`),
          progress.examBest(level.id) === null ? null : h('span', { class: 'tag exam' }, `${t('exam.best')} ${progress.examBest(level.id)} / 100`),
        ),
      ),
      icon(ChevronRight, 20),
    );
  };
  const screen: HTMLElement = h(
    'div',
    { class: 'screen parcours' },
    h(
      'header',
      { class: 'parcours-head' },
      h('div', { class: 'parcours-title' }, logo('small'), h('div', {}, h('span', { class: 'label' }, 'Parcours CCNA'), h('h2', {}, 'Du premier câble au réseau d’un campus'))),
      h(
        'div',
        { class: 'profile' },
        icon(Trophy, 26),
        h('div', {}, h('strong', {}, me.grade), h('span', {}, `${me.passed} / ${levels.length} missions réussies`)),
        h('div', { class: 'profile-stars' }, icon(Star, 18), h('strong', {}, String(me.stars)), h('span', {}, `/ ${me.max}`)),
        h('i', { class: 'profile-bar' }, h('b', { style: { width: `${Math.round((me.stars / (me.max || 1)) * 100)}%` } })),
      ),
    ),
    h(
      'div',
      { class: 'chapters' },
      ...CHAPTERS.map((chapter) => {
        const own = chapter.levels.map((id) => levels.find((l) => l.id === id)).filter((l): l is Level => !!l);
        number++;
        const locked = own.length === 0;
        return h(
          'section',
          { class: `chapter${locked ? ' locked' : ''}` },
          h('div', { class: 'chapter-head' }, h('span', { class: 'chapter-num' }, `CHAPITRE ${String(number).padStart(2, '0')}`), h('h3', {}, chapter.title), h('span', { class: `tier tier-${chapter.tier.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}` }, chapter.tier)),
          h('p', { class: 'chapter-topics' }, chapter.topics),
          locked ? h('div', { class: 'chapter-soon' }, icon(Lock, 18), h('span', {}, 'Bientôt : missions en préparation')) : h('div', { class: 'chapter-cards' }, ...own.map(card)),
        );
      }),
    ),
    h('footer', { class: 'parcours-foot' }, button(t('missions.back'), () => void leave(screen).then(onBack), 'ghost', ArrowLeft)),
  );
  ui().append(screen);
}

/** Mission order: Aïcha's message, the work order and what will be checked. */
export function showBriefing(level: Level, index: number, onStart: () => void, onBack: () => void, onExam?: () => void): void {
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
      h('p', { class: 'time-line' }, icon(Timer, 16), h('span', { style: { whiteSpace: 'nowrap' } }, `${t('briefing.time')} : ${clock(level.timeLimit ?? 600)}`), h('small', {}, onExam ? t('exam.note') : '')),
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
        onExam ? button(t('exam.start'), () => void leave(screen).then(onExam), 'ghost', GraduationCap) : null,
        button(t('briefing.start'), () => void leave(screen).then(onStart), 'primary', ArrowRight, true),
      ),
    ),
  );
  ui().append(screen);
}

/** A burst of paper in the club's colours from both sides of the screen, gone after a few seconds. */
function confetti(host: HTMLElement): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  host.append(canvas);
  const c = canvas.getContext('2d') as CanvasRenderingContext2D;
  const colours = ['#fbbf24', '#1d4ed8', '#38bdf8', '#f8fafc'];
  const pieces = Array.from({ length: 150 }, (_, i) => {
    const left = i % 2 === 0;
    const angle = (left ? -1 : -Math.PI + 1) + (Math.random() - 0.5) * 0.9;
    const speed = 500 + Math.random() * 750;
    return {
      x: left ? -10 : canvas.width + 10,
      y: canvas.height * 0.72,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      turn: Math.random() * 6,
      spin: 4 + Math.random() * 8,
      size: 5 + Math.random() * 6,
      colour: colours[i % colours.length] as string,
    };
  });
  let last = performance.now();
  const end = last + 4500;
  const frame = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.globalAlpha = Math.min(1, (end - now) / 900);
    for (const p of pieces) {
      p.vy += 720 * dt;
      p.vx *= 1 - 0.9 * dt;
      p.vy *= 1 - 0.9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.turn += p.spin * dt;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.turn);
      c.scale(1, Math.cos(p.turn * 1.4));
      c.fillStyle = p.colour;
      c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      c.restore();
    }
    if (now < end && canvas.isConnected) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

export function showResults(level: Level, result: Grade, actions: { next?: () => void; retry: () => void; menu: () => void }): void {
  const { evaluation } = result;
  const score = h('div', { class: 'score' }, '0');
  const title = result.exam ? t('results.exam') : result.timedOut ? t('results.timeout') : evaluation.complete ? t('results.title') : t('results.timeout');
  const stars = starCount(result.total);
  const screen: HTMLElement = h(
    'div',
    { class: 'screen screen-center' },
    h(
      'article',
      { class: `results panel-solid${result.timedOut ? ' timed-out' : ''}` },
      h('span', { class: 'label' }, title),
      h('h2', {}, tx(level.title)),
      h('div', { class: 'score-row' }, h('div', { class: `rank rank-${result.rank}` }, result.rank), h('div', { class: 'score-block' }, score, h('span', { class: 'out-of' }, '/ 100'))),
      starRow(result.total, 34),
      h(
        'dl',
        { class: 'breakdown' },
        h('div', {}, h('dt', {}, t('results.objectives')), h('dd', {}, `${result.objectives} / 80`)),
        h('div', {}, h('dt', {}, t('results.speed')), h('dd', {}, `${result.speed} / 20`)),
        h('div', {}, h('dt', {}, t('results.time')), h('dd', {}, `${clock(result.used)} / ${clock(result.limit)}`)),
        result.tidiness ? h('div', { class: 'wide' }, h('dt', {}, t('results.tidy')), h('dd', {}, `${result.tidiness.score} / 100 · ${t(`tidy.${result.tidiness.verdict}`)}`)) : null,
      ),
      result.tidiness?.bill ? h('p', { class: 'muted small' }, t('results.cords', { bill: result.tidiness.bill })) : null,
      evaluation.complete ? (stars < 3 ? h('p', { class: 'muted' }, t('results.slowHint')) : null) : h('p', { class: 'muted' }, t('results.incomplete')),
      h(
        'ul',
        { class: 'check-list results-list' },
        ...level.objectives.map((o) => {
          const passed = evaluation.results.find((r) => r.id === o.id)?.passed ?? false;
          return h('li', { class: passed ? 'done' : 'missed' }, h('span', {}, tx(o.label)), h('span', { class: 'pts' }, passed ? `+${o.points}` : '0'));
        }),
      ),
      actions.next || !evaluation.complete ? null : h('p', { class: 'muted' }, t('results.campaignDone')),
      h(
        'footer',
        {},
        button(t('results.menu'), () => void leave(screen).then(actions.menu), 'ghost', LayoutList),
        button(t('results.retry'), () => void leave(screen).then(actions.retry), evaluation.complete ? 'ghost' : 'primary', RotateCcw),
        actions.next && evaluation.complete ? button(t('results.next'), () => void leave(screen).then(actions.next!), 'primary', ArrowRight, true) : null,
      ),
    ),
  );
  ui().append(screen);
  if (stars >= 2) confetti(screen);
  // A note for each star as it lands.
  [0.25, 0.5, 0.75].slice(0, stars).forEach((delay) => setTimeout(() => sound.play('objective'), delay * 1000));
  // Count the score up, and let the stars land one after the other.
  const start = performance.now();
  const tick = (now: number): void => {
    const k = Math.min(1, (now - start) / 1100);
    score.textContent = String(Math.round(result.total * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
