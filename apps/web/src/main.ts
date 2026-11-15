import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './style.css';
import * as THREE from 'three';
import { campaign, tour, TOUR_LEVEL } from '@patchbay/content';
import { catalog, type Level } from '@patchbay/sim-core';
import { sound } from './audio.js';
import { startGamepad } from './game/gamepad.js';
import { classroom } from './game/classroom.js';
import { Mission } from './game/mission.js';
import { buildDevice, rackOccupied } from './scene/devices.js';
import { loadGear } from './scene/gear.js';
import { applyLightmap, preloadLightmaps } from './scene/lightmaps.js';
import { onPropAppeared } from './scene/props.js';
import { buildRoom, rackFillers } from './scene/room.js';
import { detectQuality, Stage } from './scene/stage.js';
import { tx } from './i18n.js';
import { h } from './ui/dom.js';
import { panorama } from './scene/outside.js';
import { showClassroom } from './ui/classroom.js';
import { showSettings } from './ui/pause.js';
import { randomTip } from './ui/tips.js';
import { progress, showBriefing, showMissions, showResults, showTitle } from './ui/screens.js';

// A soft tick on every button of the interface.
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.btn, .tool, .cable-slot, .mission-row, .menu-item')) sound.play('click');
});

// Without WebGL there is no room to walk in: say so, rather than leaving a black page.
if (!document.createElement('canvas').getContext('webgl2')) {
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'IST Network Lab a besoin de WebGL 2. Active l’accélération matérielle du navigateur, ou essaie Chrome ou Edge à jour.';
  throw new Error('WebGL 2 is not available');
}

const stage = new Stage(document.getElementById('stage') as HTMLElement, detectQuality());
const room = buildRoom();
stage.scene.add(room);
// The town seen through the windows: around the campus, the agency in Bobo-Dioulasso and the operator's data centre.
stage.scene.add(panorama('campus', -0.7, -2.8, 45), panorama('agence', 0, 398, 32, 1.6, 2.1), panorama('datacenter', 0, 797, 32));
// The room's baked light, fetched while the equipment loads.
const lightmaps = preloadLightmaps().then((found) => {
  if (found && applyLightmap(room) > 0) stage.useBakedLight();
});
onPropAppeared(() => stage.refreshShadows(1));
if (stage.currentQuality === 'high') {
  stage.captureEnvironment();
  // Once the photo textures are in, the reflections are taken again from the finished room.
  setTimeout(() => stage.captureEnvironment(), 2500);
}

/** A message on top of whatever screen is shown (outside missions, which have their own toasts). */
function notify(text: string): void {
  const el = h('div', { class: 'toast glass' }, text);
  const box = document.querySelector('.toasts') ?? document.body.appendChild(h('div', { class: 'toasts', 'aria-live': 'polite' }));
  box.append(el);
  setTimeout(() => el.remove(), 4200);
}
startGamepad(stage, notify);
stage.renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  notify('La carte graphique a décroché : recharge la page pour reprendre.');
});

// Installable and playable offline once loaded (production builds only: the dev server reloads modules itself).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

let mission: Mission | null = null;
const bootScreen = document.getElementById('boot') as HTMLElement;
let stopShowcase: (() => void) | null = null;

/** Behind the menus: the first level's gear on the bench, and a slow camera sweep across the room. */
function showcase(): void {
  sound.setMood('menu');
  if (stopShowcase) return;
  mission?.dispose();
  mission = null;
  stage.clearLevel();
  const level = campaign[0]!;
  const views = level.devices.map((d) => buildDevice(d.id, catalog[d.model]!, d.position, d.id));
  stage.level.add(...views.map((v) => v.root), rackFillers(rackOccupied(views)));
  stage.controls.enabled = false;
  const target = new THREE.Vector3(-0.5, 1.05, -0.4);
  stopShowcase = stage.onFrame((_dt, time) => {
    const a = Math.sin(time * 0.11) * 0.55;
    stage.camera.position.set(0.5 + Math.sin(a) * 3.0, 1.75 + Math.sin(time * 0.17) * 0.1, 0.4 + Math.cos(a) * 3.0);
    stage.controls.target.copy(target);
  });
}

function endShowcase(): void {
  stopShowcase?.();
  stopShowcase = null;
}

function title(): void {
  showcase();
  const member = classroom.membership();
  showTitle(() => briefing(firstUnfinished()), missions, () => showSettings(stage, title), visit, myClass, member?.className);
}

/** The student's homework or the teacher's board. */
function myClass(): void {
  showcase();
  showClassroom(campaign, { play: (index, exam) => briefing(index, exam ? 'exam' : 'practice'), back: title });
}

function missions(): void {
  showcase();
  showMissions(campaign, (level) => briefing(campaign.indexOf(level)), title);
}

function firstUnfinished(): number {
  const i = campaign.findIndex((l) => (progress.best(l.id) ?? 0) < 80);
  return i < 0 ? 0 : i;
}

/** A homework's mode shows only its own start button; from the course, both. */
function briefing(index: number, mode?: 'practice' | 'exam'): void {
  showcase();
  const level = campaign[index] as Level;
  const back = mode ? myClass : missions;
  if (mode === 'exam') showBriefing(level, index, () => play(index, true), back, undefined, true);
  else showBriefing(level, index, () => play(index), back, mode ? undefined : () => play(index, true));
}

/** The guided tour of the equipment, in the building of the mission where every kind of it is found. */
function visit(): void {
  const index = campaign.findIndex((l) => l.id === TOUR_LEVEL);
  play(index < 0 ? campaign.length - 1 : index, false, true);
}

function play(index: number, exam = false, guided = false): void {
  // A screen first, painted before the work starts: the mission is built, then its shaders compiled in the background.
  const loading = bootScreen.cloneNode(true) as HTMLElement;
  const next = campaign[index] as Level;
  loading.querySelector('strong')?.replaceWith(
    h('div', { class: 'loading-title' }, h('span', {}, guided ? 'Visite guidée' : `Mission ${String(index + 1).padStart(2, '0')}`), h('strong', {}, tx(next.title))),
  );
  loading.append(h('p', { class: 'loading-tip' }, h('b', {}, 'Astuce'), randomTip()));
  document.body.append(loading);
  sound.setMood('mission');
  requestAnimationFrame(() => {
    setTimeout(() => {
      endShowcase();
      mission?.dispose();
      const level = campaign[index] as Level;
      const started = new Mission(stage, level, {
        complete: (result) => {
          if (exam) progress.recordExam(level.id, result.total);
          else progress.record(level.id, result.total);
          // Guided tours are not marked; a student's result goes to their class, or waits for the network.
          if (!guided && classroom.membership()?.role === 'student') {
            void classroom.report(level.id, exam, result).then((sent) => notify(sent ? 'Résultat envoyé à ta classe.' : 'Résultat gardé : il partira vers ta classe dès que le réseau reviendra.'));
          }
          const next = index + 1 < campaign.length ? () => briefing(index + 1) : undefined;
          showResults(level, result, { ...(next ? { next } : {}), retry: () => play(index, exam), menu: missions });
        },
        menu: guided ? title : missions,
        tourDone: () => briefing(0),
      }, index, exam, guided ? tour : null);
      mission = started;
      void stage.prepare().then(() => {
        started.startClock();
        loading.remove();
      });
    });
  });
}

// Development only: lets automated checks find where a port is on screen. Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__patchbay = {
    stage,
    sound,
    mission: () => mission,
    exportStatic: async () => {
      mission?.buildEverything();
      return (await import('./scene/lightmap-export.js')).exportStatic(stage.scene);
    },
    portOnScreen(device: string, port: string): [number, number] | null {
      let found: THREE.Object3D | undefined;
      stage.level.traverse((o) => {
        const p = o.userData.port as { device: string; port: string; mouth: THREE.Object3D } | undefined;
        if (p && p.device === device && p.port === port) found = p.mouth;
      });
      if (!found) return null;
      const v = found.getWorldPosition(new THREE.Vector3()).project(stage.camera);
      const rect = stage.renderer.domElement.getBoundingClientRect();
      return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height];
    },
  };
}

// Results that waited for the network leave as soon as it is back.
void classroom.flush();
window.addEventListener('online', () => void classroom.flush());

// The equipment's models come first: every room built afterwards uses them.
void Promise.all([loadGear(), lightmaps]).finally(() => {
  title();
  void stage.prepare().then(() => bootScreen.remove());
});
