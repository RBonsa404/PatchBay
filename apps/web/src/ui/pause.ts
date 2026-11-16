import { BookOpen, Gauge, Keyboard, LogOut, Mouse, Music, Play, Settings, User, Volume2 } from 'lucide';
import { sound } from '../audio.js';
import type { Quality, Stage } from '../scene/stage.js';
import { settings } from '../settings.js';
import { t, type Key } from '../i18n.js';
import { icon, logo } from './brand.js';
import { h, ui } from './dom.js';

/**
 * The pause menu (Escape during a mission) and the settings screen (from the pause menu or the title screen): full
 * screen, the room dimmed and blurred behind, as in any game.
 */

let open: HTMLElement | null = null;

/** The characters' options show only where the characters are switched on (see `Mission`). */
function peopleOn(): boolean {
  try {
    return localStorage.getItem('patchbay.people') !== '0';
  } catch {
    return false;
  }
}

export function pauseOpen(): boolean {
  return open !== null;
}

function close(): void {
  open?.remove();
  open = null;
}

export interface PauseActions {
  resume(): void;
  brief(): void;
  help(): void;
  quit(): void;
}

export function showPause(stage: Stage, actions: PauseActions, title: string): void {
  close();
  const item = (label: string, glyph: Parameters<typeof icon>[0], onclick: () => void, kind = ''): HTMLElement =>
    h('button', { class: `menu-item ${kind}`, onclick }, icon(glyph, 20), h('span', {}, label));
  const resume = (): void => {
    close();
    actions.resume();
  };
  open = h(
    'div',
    { class: 'pause-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('pause.title') },
    h(
      'div',
      { class: 'pause-card' },
      logo('small'),
      h('span', { class: 'label' }, t('pause.title')),
      h('h2', {}, title),
      h(
        'nav',
        { class: 'menu' },
        item(t('pause.resume'), Play, resume, 'primary'),
        item(t('brief.tool'), BookOpen, () => {
          resume();
          actions.brief();
        }),
        item(t('help.tool'), Keyboard, () => {
          resume();
          actions.help();
        }),
        item(t('settings.title'), Settings, () => showSettings(stage, () => showPause(stage, actions, title))),
        item(t('pause.quit'), LogOut, () => {
          close();
          actions.quit();
        }),
      ),
      h('p', { class: 'muted' }, t('pause.note')),
    ),
  );
  ui().append(open);
}

/** Quality, sound, music, the speed and direction of the head's turning. `back` reopens what was there before. */
export function showSettings(stage: Stage, back: () => void): void {
  close();
  const qualities: Quality[] = ['low', 'medium', 'high'];
  const segment = (current: Quality): HTMLElement =>
    h(
      'div',
      { class: 'segmented', role: 'radiogroup', 'aria-label': t('hud.quality') },
      ...qualities.map((q) =>
        h('button', {
          class: q === current ? 'on' : '',
          role: 'radio',
          'aria-checked': String(q === current),
          onclick: (e: Event) => {
            stage.chooseQuality(q);
            const group = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
            group.replaceWith(segment(q));
          },
        }, t(`quality.${q}` as Key)),
      ),
    );
  const toggle = (label: string, glyph: Parameters<typeof icon>[0], value: () => boolean, flip: () => void): HTMLElement => {
    const box: HTMLInputElement = h('input', { type: 'checkbox', checked: value() });
    box.addEventListener('change', () => {
      flip();
      box.checked = value();
    });
    return h('label', { class: 'setting' }, icon(glyph, 18), h('span', {}, label), box);
  };
  const speed: HTMLInputElement = h('input', { type: 'range', min: '0.4', max: '2.5', step: '0.1', value: String(settings.lookSpeed), 'aria-label': t('settings.look') });
  const speedValue = h('output', {}, `${settings.lookSpeed.toFixed(1)}×`);
  speed.addEventListener('input', () => {
    settings.lookSpeed = Number(speed.value);
    speedValue.textContent = `${settings.lookSpeed.toFixed(1)}×`;
    settings.save();
  });
  open = h(
    'div',
    { class: 'pause-screen', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('settings.title') },
    h(
      'div',
      { class: 'pause-card settings-card' },
      h('span', { class: 'label' }, t('settings.title')),
      h('h2', {}, t('settings.heading')),
      h('div', { class: 'setting' }, icon(Gauge, 18), h('span', {}, t('hud.quality')), segment(stage.currentQuality)),
      h('p', { class: 'muted small' }, t('settings.qualityNote')),
      toggle(t('hud.sound'), Volume2, () => !sound.isMuted, () => sound.toggleMute()),
      toggle(t('settings.music'), Music, () => sound.musicPlaying, () => sound.toggleMusic()),
      toggle(t('settings.voice'), Volume2, () => settings.voice, () => {
        settings.voice = !settings.voice;
        settings.save();
      }),
      h('div', { class: 'setting' }, icon(Mouse, 18), h('span', {}, t('settings.look')), speed, speedValue),
      ...(peopleOn()
        ? [
            toggle(t('settings.thirdPerson'), User, () => settings.thirdPerson, () => {
              settings.thirdPerson = !settings.thirdPerson;
              settings.save();
            }),
            toggle(t('settings.student'), User, () => settings.character === 'student-f', () => {
              settings.character = settings.character === 'student-f' ? 'student-m' : 'student-f';
              settings.save();
            }),
          ]
        : []),
      toggle(t('settings.invert'), Mouse, () => settings.invertY, () => {
        settings.invertY = !settings.invertY;
        settings.save();
      }),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => { close(); back(); } }, t('settings.done'))),
    ),
  );
  ui().append(open);
}
