import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/400.css';
import './style.css';
import * as THREE from 'three';
import { campaign } from '@patchbay/content';
import { catalog, type Level } from '@patchbay/sim-core';
import { sound } from './audio.js';
import { startGamepad } from './game/gamepad.js';
import { Mission } from './game/mission.js';
import { buildDevice, rackOccupied } from './scene/devices.js';
import { buildRoom, rackFillers } from './scene/room.js';
import { detectQuality, Stage } from './scene/stage.js';
import { h } from './ui/dom.js';
import { progress, showBriefing, showMissions, showResults, showTitle } from './ui/screens.js';

// A soft tick on every button of the interface.
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.btn, .tool, .cable-slot, .mission-row, .menu-item')) sound.play('click');
});

const stage = new Stage(document.getElementById('stage') as HTMLElement, detectQuality());
stage.scene.add(buildRoom());

/** A message on top of whatever screen is shown (outside missions, which have their own toasts). */
function notify(text: string): void {
  const el = h('div', { class: 'toast glass' }, text);
  const box = document.querySelector('.toasts') ?? document.body.appendChild(h('div', { class: 'toasts', 'aria-live': 'polite' }));
  box.append(el);
  setTimeout(() => el.remove(), 4200);
}
startGamepad(stage, notify);

// Installable and playable offline once loaded (production builds only: the dev server reloads modules itself).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

let mission: Mission | null = null;
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
  const target = new THREE.Vector3(0, 1.05, -0.2);
  stopShowcase = stage.onFrame((_dt, time) => {
    const a = Math.sin(time * 0.11) * 0.55;
    stage.camera.position.set(Math.sin(a) * 2.6, 1.55 + Math.sin(time * 0.17) * 0.12, Math.cos(a) * 2.6);
    stage.controls.target.copy(target);
  });
}

function endShowcase(): void {
  stopShowcase?.();
  stopShowcase = null;
}

function title(): void {
  showcase();
  showTitle(() => briefing(firstUnfinished()), missions);
}

function missions(): void {
  showcase();
  showMissions(campaign, (level) => briefing(campaign.indexOf(level)), title);
}

function firstUnfinished(): number {
  const i = campaign.findIndex((l) => (progress.best(l.id) ?? 0) < 80);
  return i < 0 ? 0 : i;
}

function briefing(index: number): void {
  showcase();
  const level = campaign[index] as Level;
  showBriefing(level, index, () => play(index), missions, () => play(index, true));
}

function play(index: number, exam = false): void {
  endShowcase();
  sound.setMood('mission');
  mission?.dispose();
  const level = campaign[index] as Level;
  mission = new Mission(stage, level, {
    complete: (result) => {
      if (exam) progress.recordExam(level.id, result.total);
      else progress.record(level.id, result.total);
      const next = index + 1 < campaign.length ? () => briefing(index + 1) : undefined;
      showResults(level, result, { ...(next ? { next } : {}), retry: () => play(index, exam), menu: missions });
    },
    menu: missions,
  }, index, exam);
}

// Development only: lets automated checks find where a port is on screen. Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__patchbay = {
    stage,
    sound,
    mission: () => mission,
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

title();
