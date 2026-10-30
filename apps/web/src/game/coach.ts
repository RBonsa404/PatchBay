import * as THREE from 'three';
import type { CableType, Network } from '@patchbay/sim-core';
import { sound } from '../audio.js';
import { t, type Key } from '../i18n.js';
import type { Stage } from '../scene/stage.js';
import { MENTOR, mentorPortrait } from '../ui/brand.js';
import { h, ui } from '../ui/dom.js';

/** What the coach can see of the mission to decide whether a step is done. */
export interface CoachView {
  net: Network;
  selected: CableType | null;
  firstEnd: { device: string; port: string } | null;
  /** Device whose console is open, if any. */
  console: string | null;
  portPosition(device: string, port: string): THREE.Vector3 | null;
  devicePosition(device: string): THREE.Vector3 | null;
}

interface Step {
  text: Key;
  /** What to point at in the room. */
  port?: (v: CoachView) => [device: string, port: string] | null;
  device?: string;
  /** Inventory slot to highlight. */
  slot?: CableType;
  done(v: CoachView): boolean;
}

const has = (v: CoachView, device: string, port: string): boolean => v.net.cableAt({ device, port }) !== undefined;
const isFirst = (v: CoachView, device: string, port: string): boolean => v.firstEnd?.device === device && v.firstEnd.port === port;

/** Mission 1 tutorial: the first gestures of a technician, one at a time. */
const MISSION_1: Step[] = [
  { text: 'tuto.1', slot: 'straight', done: (v) => v.selected === 'straight' || has(v, 'PC1', 'FastEthernet0') },
  { text: 'tuto.2', port: () => ['PC1', 'FastEthernet0'], done: (v) => isFirst(v, 'PC1', 'FastEthernet0') || has(v, 'PC1', 'FastEthernet0') },
  { text: 'tuto.3', port: () => ['S1', 'FastEthernet0/1'], done: (v) => has(v, 'PC1', 'FastEthernet0') },
  {
    text: 'tuto.4',
    slot: 'straight',
    port: (v) => (v.firstEnd ? ['R1', 'GigabitEthernet0/0'] : ['S1', 'GigabitEthernet0/1']),
    done: (v) => has(v, 'R1', 'GigabitEthernet0/0'),
  },
  {
    text: 'tuto.5',
    slot: 'console',
    port: (v) => (v.firstEnd ? ['R1', 'Console'] : ['ADMIN', 'RS232']),
    done: (v) => v.net.consoleTarget('ADMIN')?.id === 'R1',
  },
  { text: 'tuto.6', device: 'ADMIN', done: (v) => v.console === 'R1' },
  { text: 'tuto.7', done: (v) => (v.net.device('R1').cli?.mode ?? '').startsWith('config') },
  { text: 'tuto.8', done: () => false },
];

const TUTORIALS: Record<string, Step[]> = { 'l01-cablage-console': MISSION_1 };
const DONE_KEY = 'patchbay.tutorial.done';

export function tutorialSeen(levelId: string): boolean {
  try {
    return (localStorage.getItem(DONE_KEY) ?? '').split(',').includes(levelId);
  } catch {
    return false;
  }
}

function markSeen(levelId: string): void {
  try {
    const list = new Set((localStorage.getItem(DONE_KEY) ?? '').split(',').filter(Boolean));
    list.add(levelId);
    localStorage.setItem(DONE_KEY, [...list].join(','));
  } catch {
    // ignore
  }
}

/** Shows the current step in a bubble, points at the right port with a pulsing ring, and moves on by itself. */
export class Coach {
  private index = 0;
  private readonly bubble: HTMLElement;
  private readonly marker = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly arrow: THREE.Mesh;
  private readonly stopFrame: () => void;
  private finished = false;
  private typing: ReturnType<typeof setInterval> | null = null;
  private lastLine = '';

  static for(levelId: string, stage: Stage, view: () => CoachView): Coach | null {
    const steps = TUTORIALS[levelId];
    return steps && !tutorialSeen(levelId) ? new Coach(levelId, steps, stage, view) : null;
  }

  private constructor(private readonly levelId: string, private readonly steps: Step[], private readonly stage: Stage, private readonly view: () => CoachView) {
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0022, 10, 40), new THREE.MeshBasicMaterial({ color: '#fbbf24', toneMapped: false, transparent: true }));
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 20), new THREE.MeshBasicMaterial({ color: '#fbbf24', toneMapped: false }));
    this.arrow.rotation.x = Math.PI;
    this.marker.add(this.ring, this.arrow);
    stage.scene.add(this.marker);
    this.bubble = h('div', { class: 'coach glass', role: 'status', 'aria-live': 'polite' });
    ui().append(this.bubble);
    this.stopFrame = stage.onFrame((_, time) => {
      const s = 1 + Math.sin(time * 5) * 0.18;
      this.ring.scale.set(s, s, s);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(time * 5) * 0.3;
      this.arrow.position.y = 0.06 + Math.abs(Math.sin(time * 3)) * 0.03;
    });
    this.render();
  }

  /** The guided tutorial is still on screen (the clock waits for it). */
  get active(): boolean {
    return !this.finished;
  }

  /** Re-check the current step; call after every player action. */
  update(): void {
    if (this.finished) return;
    const v = this.view();
    let advanced = false;
    while (this.index < this.steps.length - 1 && (this.steps[this.index] as Step).done(v)) {
      this.index++;
      advanced = true;
    }
    if (advanced) sound.play('objective');
    this.render();
  }

  dispose(): void {
    this.finished = true;
    if (this.typing) clearInterval(this.typing);
    this.stopFrame();
    this.stage.scene.remove(this.marker);
    this.bubble.remove();
    document.querySelectorAll('.pulse-ui').forEach((e) => e.classList.remove('pulse-ui'));
  }

  private finish(): void {
    this.finished = true;
    markSeen(this.levelId);
    this.dispose();
  }

  /** Aïcha "speaks": the line appears a few letters at a time (instantly when motion is reduced). */
  private type(el: HTMLElement, line: string): void {
    if (this.typing) clearInterval(this.typing);
    if (line === this.lastLine || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = line;
      this.lastLine = line;
      return;
    }
    this.lastLine = line;
    let n = 0;
    this.typing = setInterval(() => {
      n = Math.min(line.length, n + 2);
      el.textContent = line.slice(0, n);
      if (n >= line.length && this.typing) clearInterval(this.typing);
    }, 18);
  }

  private render(): void {
    const step = this.steps[this.index] as Step;
    const v = this.view();
    const last = this.index === this.steps.length - 1;
    const text = h('p', {});
    this.bubble.replaceChildren(
      mentorPortrait(),
      h(
        'div',
        { class: 'coach-body' },
        h('header', {}, h('strong', {}, MENTOR.name), h('span', { class: 'step' }, t('tuto.step', { n: this.index + 1, total: this.steps.length }))),
        text,
        h(
          'footer',
          {},
          h('span', { class: 'dots' }, ...this.steps.map((_, i) => h('i', { class: i < this.index ? 'done' : i === this.index ? 'now' : '' }))),
          last ? null : h('button', { class: 'btn ghost small', onclick: () => this.finish() }, t('tuto.skip')),
          last ? h('button', { class: 'btn primary small', onclick: () => this.finish() }, t('tuto.next')) : null,
        ),
      ),
    );
    this.type(text, t(step.text));

    document.querySelectorAll('.pulse-ui').forEach((e) => e.classList.remove('pulse-ui'));
    if (step.slot && v.selected !== step.slot) {
      document.querySelector(`.cable-slot[data-cable="${step.slot}"]`)?.classList.add('pulse-ui');
    }

    const target = step.port?.(v);
    const portPoint = target ? v.portPosition(target[0], target[1]) : null;
    const devicePoint = step.device ? v.devicePosition(step.device) : null;
    this.ring.visible = portPoint !== null;
    this.arrow.visible = devicePoint !== null;
    if (portPoint) this.marker.position.copy(portPoint).add(new THREE.Vector3(0, 0, 0.012));
    else if (devicePoint) this.marker.position.copy(devicePoint);
    this.marker.visible = portPoint !== null || devicePoint !== null;
  }
}
