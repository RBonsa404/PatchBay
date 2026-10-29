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
import { Mission } from './game/mission.js';
import { buildDevice } from './scene/devices.js';
import { buildRoom } from './scene/room.js';
import { detectQuality, Stage } from './scene/stage.js';
import { progress, showBriefing, showMissions, showResults, showTitle } from './ui/screens.js';

// A soft tick on every button of the interface.
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.btn, .cable-slot, .mission-card')) sound.play('click');
});

const stage = new Stage(document.getElementById('stage') as HTMLElement, detectQuality());
stage.scene.add(buildRoom());

let mission: Mission | null = null;
let stopShowcase: (() => void) | null = null;

/** Behind the menus: the first level's gear on the bench, and a slow camera sweep across the room. */
function showcase(): void {
  if (stopShowcase) return;
  mission?.dispose();
  mission = null;
  stage.clearLevel();
  const level = campaign[0]!;
  for (const d of level.devices) stage.level.add(buildDevice(d.id, catalog[d.model]!, d.position, d.id).root);
  stage.controls.enabled = false;
  const target = new THREE.Vector3(0, 1.05, -0.2);
  stopShowcase = stage.onFrame((_, time) => {
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
  const i = campaign.findIndex((l) => (progress.best(l.id) ?? 0) < 100);
  return i < 0 ? 0 : i;
}

function briefing(index: number): void {
  showcase();
  const level = campaign[index] as Level;
  showBriefing(level, index, () => play(index), missions);
}

function play(index: number): void {
  endShowcase();
  mission?.dispose();
  const level = campaign[index] as Level;
  mission = new Mission(stage, level, {
    complete: (evaluation) => {
      progress.record(level.id, evaluation.score);
      const next = index + 1 < campaign.length ? () => briefing(index + 1) : undefined;
      showResults(level, evaluation, { ...(next ? { next } : {}), retry: () => play(index), menu: missions });
    },
    menu: missions,
  });
}

// Development only: lets automated checks find where a port is on screen. Stripped from production builds.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__patchbay = {
    stage,
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
