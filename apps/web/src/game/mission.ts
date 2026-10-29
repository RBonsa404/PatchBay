import * as THREE from 'three';
import { buildLevel, canPlug, catalog, evaluate, type CableEnd, type CableType, type EthernetFrame, type Evaluation, type L3Payload, type Level, type Network, type ObjectiveResult, type PortSpec } from '@patchbay/sim-core';
import { sound } from '../audio.js';
import { t, tx } from '../i18n.js';
import { Coach, type CoachView } from './coach.js';
import { setGameTarget, type GameTarget } from './gamepad.js';
import { CableLayer, portFrame } from '../scene/cables.js';
import { buildDevice, highlightSocket, setLed, type DeviceView, type PortView } from '../scene/devices.js';
import { buildWhiteboard } from '../scene/details.js';
import type { Quality, Stage } from '../scene/stage.js';
import { CABLE_ORDER, Hud } from '../ui/hud.js';
import { closePanel, Consoles, openPanelKey, resetHostShells, showHostPanel, showNotice } from '../ui/panels.js';

const HOME = { position: new THREE.Vector3(0, 1.78, 2.45), target: new THREE.Vector3(0, 0.86, 0.02) };
const ACCEPTS: Record<CableType, PortSpec['kind'][]> = {
  straight: ['ethernet'],
  crossover: ['ethernet'],
  serial: ['serial'],
  console: ['console', 'rs232'],
};
/** Objectives that send traffic: checked when the player asks, not after every keystroke. */
const TRAFFIC = new Set(['ping', 'tcp']);
/** Colour of an animated frame: what it carries. */
function packetColour(frame: EthernetFrame): string {
  const payload = frame.payload as L3Payload | undefined;
  if (!payload) return '#e2e8f0';
  if (payload.type === 'arp') return '#fbbf24';
  const p = payload.packet;
  if (p.icmp?.type === 'echo-request') return '#38bdf8';
  if (p.icmp?.type === 'echo-reply') return '#10b981';
  if (p.icmp) return '#ef4444';
  return '#60a5fa';
}
/** Seconds between two animated hops, and the most hops replayed for one action. */
const HOP_GAP = 0.16;
const MAX_HOPS = 90;
/** How long a finger must stay down to unplug (the touch version of the right click). */
const LONG_PRESS_MS = 550;

export interface MissionEvents {
  complete(evaluation: Evaluation): void;
  menu(): void;
}

/** One level being played: the network, its 3D devices and cables, the HUD and the player's actions. */
export class Mission {
  readonly net: Network;
  private readonly devices = new Map<string, DeviceView>();
  private readonly cables: CableLayer;
  private readonly hud: Hud;
  private readonly consoles: Consoles;
  private readonly picks: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly cleanup: (() => void)[] = [];
  private selected: CableType | null = null;
  private firstEnd: PortView | null = null;
  private hovered: PortView | null = null;
  private trafficResults = new Map<string, ObjectiveResult>();
  private hintIndex = 0;
  private finished = false;
  private coach: Coach | null = null;
  private recording = false;
  private hops: { from: CableEnd; to: CableEnd; frame: EthernetFrame }[] = [];
  private doneCount = -1;

  constructor(private readonly stage: Stage, readonly level: Level, private readonly events: MissionEvents, index = 0) {
    stage.clearLevel();
    resetHostShells();
    this.net = buildLevel(level);
    for (const d of level.devices) {
      const host = this.net.device(d.id).host;
      const caption = host?.ip ? `${d.id} · ${host.ip}` : d.id;
      const view = buildDevice(d.id, catalog[d.model]!, d.position, caption);
      this.devices.set(d.id, view);
      stage.level.add(view.root);
      this.picks.push(...view.body, ...[...view.ports.values()].map((p) => p.hit));
    }
    this.cables = new CableLayer(stage);
    stage.level.add(this.cables.group, buildWhiteboard(level));
    stage.controls.enabled = true;
    void stage.flyTo(HOME.position, HOME.target, 1.4);

    this.consoles = new Consoles(this.net, () => this.afterChange(), (action) => this.recordTraffic(action));
    this.cleanup.push(
      this.net.onWire((from, to, frame) => {
        if (this.recording && this.hops.length < MAX_HOPS) this.hops.push({ from, to, frame });
      }),
    );
    this.hud = new Hud(level, {
      check: () => this.check(),
      hint: () => this.hint(),
      menu: () => events.menu(),
      overview: () => void stage.flyTo(HOME.position, HOME.target),
      cycleQuality: () => this.cycleQuality(),
      selectCable: (type) => this.select(type),
    }, stage.currentQuality, index);
    this.listen();
    this.afterChange();
    this.coach = Coach.for(level.id, stage, () => this.coachView());
  }

  private coachView(): CoachView {
    const key = openPanelKey();
    return {
      net: this.net,
      selected: this.selected,
      firstEnd: this.firstEnd ? { device: this.firstEnd.device, port: this.firstEnd.port } : null,
      console: key?.startsWith('console:') ? key.slice(8) : null,
      portPosition: (device, port) => {
        const p = this.devices.get(device)?.ports.get(port);
        return p ? portFrame(p).point : null;
      },
      devicePosition: (device) => {
        const v = this.devices.get(device);
        return v ? v.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, v.height + 0.08, 0)) : null;
      },
    };
  }

  /** Run an action and replay the frames it put on the wires as glowing packets travelling along the cables. */
  private recordTraffic(action: () => void): void {
    this.recording = true;
    this.hops = [];
    try {
      action();
    } finally {
      this.recording = false;
    }
    this.hops.forEach((hop, i) => this.cables.pulse(hop.from, hop.to, packetColour(hop.frame), i * HOP_GAP));
    for (let i = 0; i < Math.min(this.hops.length, 6); i++) setTimeout(() => sound.play('packet'), i * HOP_GAP * 1000);
  }

  dispose(): void {
    for (const fn of this.cleanup) fn();
    this.coach?.dispose();
    this.cables.showPreview('straight', null, null);
    this.hud.destroy();
    closePanel();
    this.stage.clearLevel();
  }

  // ---- input -----------------------------------------------------------------------------------------------------

  /**
   * Mouse, touch and pen go through pointer events. On a touch screen there is no hover and no right button: a tap
   * aims and acts at once, a long press unplugs, a double tap zooms (the browser turns it into `dblclick`).
   */
  private listen(): void {
    const canvas = this.stage.renderer.domElement;
    let down: { x: number; y: number; id: number } | null = null;
    let press: ReturnType<typeof setTimeout> | null = null;
    let pressed = false;
    const cancelPress = (): void => {
      if (press) clearTimeout(press);
      press = null;
    };
    const on = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void): void => {
      target.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(canvas, 'pointermove', (e) => {
      if (down && down.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6) cancelPress();
      if (e.pointerType === 'touch' && down) return; // a finger dragging moves the camera, not the aim
      this.aim(e.clientX, e.clientY);
    });
    on(canvas, 'pointerdown', (e) => {
      if (down) {
        // A second finger: pinch or pan, never a tap.
        cancelPress();
        down = null;
        return;
      }
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      pressed = false;
      if (e.pointerType === 'touch') {
        this.aim(e.clientX, e.clientY);
        press = setTimeout(() => {
          pressed = true;
          this.onUnplug();
          navigator.vibrate?.(30);
        }, LONG_PRESS_MS);
      }
    });
    on(canvas, 'pointerup', (e) => {
      cancelPress();
      // A click, not the end of a camera drag nor a long press.
      if (down && down.id === e.pointerId && !pressed && e.button === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
        if (e.pointerType === 'touch') this.aim(e.clientX, e.clientY);
        this.onClick();
        if (e.pointerType === 'touch') this.hud.showTooltip(null);
      }
      down = null;
    });
    on(canvas, 'pointercancel', () => {
      cancelPress();
      down = null;
    });
    on(canvas, 'contextmenu', (e) => {
      e.preventDefault();
      if (!pressed) this.onUnplug();
    });
    on(canvas, 'dblclick', () => this.onFocus());
    on(window, 'keydown', (e) => {
      if (e.key === 'Escape') this.select(null);
      // 1-4 pick a cable from the inventory (not while typing in a console).
      const slot = /^[1-4]$/.test(e.key) && !(e.target instanceof HTMLInputElement) ? CABLE_ORDER.filter((type) => this.level.inventory.cables[type] !== undefined)[Number(e.key) - 1] : undefined;
      if (slot) this.select(this.selected === slot ? null : slot);
    });
    this.cleanup.push(cancelPress, setGameTarget(this.gameTarget()));
  }

  /** What a gamepad drives while this mission is on screen. */
  private gameTarget(): GameTarget {
    return {
      canvas: this.stage.renderer.domElement,
      aim: (x, y) => this.aim(x, y),
      act: () => this.onClick(),
      unplug: () => this.onUnplug(),
      focus: () => this.onFocus(),
      overview: () => void this.stage.flyTo(HOME.position, HOME.target),
      cancel: () => (openPanelKey() ? closePanel() : this.select(null)),
      cycleCable: (step) => {
        const types = (Object.keys(ACCEPTS) as CableType[]).filter((type) => this.left(type) > 0);
        if (types.length === 0) return;
        const at = this.selected ? types.indexOf(this.selected) : -1;
        this.select(types[(at + step + types.length) % types.length] ?? null);
      },
    };
  }

  private pick(): { port?: PortView; device?: string } {
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    for (const hit of this.raycaster.intersectObjects(this.picks, false)) {
      const port = hit.object.userData.port as PortView | undefined;
      if (port) return { port };
      const device = hit.object.userData.device as string | undefined;
      if (device) return { device };
    }
    return {};
  }

  /** Point at screen position (x, y): hover feedback, tooltip, and the cable in hand following. */
  private aim(x: number, y: number): void {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    const e = { clientX: x, clientY: y };
    const { port, device } = this.pick();
    if (this.hovered && this.hovered !== port) highlightSocket(this.hovered, 'none');
    this.hovered = port ?? null;

    if (port) {
      const verdict = this.canTake(port);
      if (this.selected) highlightSocket(port, verdict === null ? 'ok' : 'bad');
      const name = `${port.device} · ${port.port}`;
      this.hud.showTooltip(verdict && this.selected ? `${name} — ${verdict}` : name, e.clientX, e.clientY, verdict !== null && this.selected !== null);
    } else if (device) {
      this.hud.showTooltip(device, e.clientX, e.clientY);
    } else {
      this.hud.showTooltip(null);
    }
    this.stage.renderer.domElement.style.cursor = port || device ? 'pointer' : this.selected ? 'crosshair' : 'grab';

    if (this.selected && this.firstEnd) {
      const target = port ? portFrame(port).point : this.pointerPoint(this.firstEnd);
      this.cables.showPreview(this.selected, this.firstEnd, target);
    }
  }

  /** Where the pointer is in the room, at the depth of the port the cable comes from. */
  private pointerPoint(from: PortView): THREE.Vector3 {
    const origin = portFrame(from).point;
    const normal = this.stage.camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    return this.raycaster.ray.intersectPlane(plane, new THREE.Vector3()) ?? origin;
  }

  /** Why the cable in hand cannot go into `port`, or null when it can. */
  private canTake(port: PortView): string | null {
    if (!this.selected) return null;
    if (this.net.cableAt({ device: port.device, port: port.port })) return t('error.busy');
    if (!this.firstEnd) return ACCEPTS[this.selected].includes(port.spec.kind) ? null : t('error.incompatible');
    if (port === this.firstEnd) return t('error.samePort');
    if (port.device === this.firstEnd.device) return t('error.sameDevice');
    return canPlug(this.selected, this.firstEnd.spec, port.spec) ? null : t('error.incompatible');
  }

  private onClick(): void {
    const { port, device } = this.pick();
    if (port && this.selected) return this.plugEnd(port);
    const id = port?.device ?? device;
    if (id) this.openDevice(id);
  }

  private plugEnd(port: PortView): void {
    const type = this.selected as CableType;
    const problem = this.canTake(port);
    if (problem) {
      this.hud.toast(problem, 'bad');
      sound.play('error');
      return;
    }
    if (!this.firstEnd) {
      this.firstEnd = port;
      sound.play('plug');
      this.hud.toast(type === 'serial' ? t('cable.firstSerial') : t('cable.first'));
      this.coach?.update();
      return;
    }
    const a = this.firstEnd;
    const r = this.net.connect(type, { device: a.device, port: a.port }, { device: port.device, port: port.port });
    this.firstEnd = null;
    this.cables.showPreview(type, null, null);
    if (!r.ok) {
      this.hud.toast(t('error.incompatible'), 'bad');
      return;
    }
    this.hud.toast(t('cable.plugged'), 'good');
    sound.play('plug');
    if (this.left(type) === 0) this.selected = null;
    this.afterChange();
  }

  private onUnplug(): void {
    const { port } = this.pick();
    if (!port) {
      this.select(null);
      return;
    }
    if (this.net.disconnect({ device: port.device, port: port.port })) {
      sound.play('unplug');
      this.hud.toast(t('cable.unplugged'));
      this.afterChange();
    }
  }

  private onFocus(): void {
    const { port, device } = this.pick();
    const view = this.devices.get(port?.device ?? device ?? '');
    if (!view) return;
    const target = view.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, view.height * 0.6, 0));
    const distance = Math.max(0.42, view.width * 1.25);
    void this.stage.flyTo(target.clone().add(new THREE.Vector3(0, distance * 0.35, distance)), target, 0.9);
  }

  private select(type: CableType | null): void {
    if (type && this.left(type) === 0) {
      this.hud.toast(t('cable.none'), 'bad');
      sound.play('error');
      return;
    }
    if (this.firstEnd && type !== this.selected) this.hud.toast(t('cable.cancel'));
    this.selected = type;
    this.firstEnd = null;
    this.cables.showPreview('straight', null, null);
    this.hud.setInventory(this.inventoryLeft(), this.selected);
    this.coach?.update();
  }

  // ---- devices ---------------------------------------------------------------------------------------------------

  private consoleLaptop(target: string): string | undefined {
    for (const view of this.devices.values()) {
      if ((view.shape === 'laptop' || view.shape === 'pc') && this.net.consoleTarget(view.id)?.id === target) return view.id;
    }
    return undefined;
  }

  private openDevice(id: string): void {
    const view = this.devices.get(id);
    if (!view) return;
    if (view.shape === 'router' || view.shape === 'switch') {
      const laptop = this.consoleLaptop(id);
      if (laptop) this.consoles.open(id, laptop);
      else showNotice(id, t('panel.routerInfo'));
      this.coach?.update();
      return;
    }
    const target = this.net.consoleTarget(id);
    if (view.shape === 'laptop') {
      if (target) this.consoles.open(target.id, id);
      else showNotice(`${t('panel.console')} · ${id}`, t('panel.noConsole'));
      this.coach?.update();
      return;
    }
    showHostPanel(this.net, id, () => this.afterChange(), target ? () => this.consoles.open(target.id, id) : null, (action) => this.recordTraffic(action));
  }

  // ---- state -----------------------------------------------------------------------------------------------------

  private left(type: CableType): number {
    const initial = this.level.initial.cables.filter((c) => c.type === type).length;
    const used = this.net.cables.filter((c) => c.type === type).length - initial;
    return Math.max(0, (this.level.inventory.cables[type] ?? 0) - used);
  }

  private inventoryLeft(): Partial<Record<CableType, number>> {
    const out: Partial<Record<CableType, number>> = {};
    for (const type of Object.keys(this.level.inventory.cables) as CableType[]) out[type] = this.left(type);
    return out;
  }

  private updateLeds(): void {
    for (const view of this.devices.values()) {
      for (const port of view.ports.values()) {
        if (!port.led) continue;
        if (this.net.device(view.id).cli) {
          const s = this.net.linkState(view.id, port.port);
          setLed(port, s.status === 'up' && s.protocol === 'up' ? 'green' : s.status === 'up' ? 'amber' : 'off');
        } else {
          setLed(port, this.net.hostLinkUp({ device: view.id, port: port.port }) ? 'green' : 'off');
        }
      }
    }
  }

  /** After every cable or command: redraw cables, LEDs, inventory, and the objectives that need no traffic. */
  private afterChange(): void {
    this.cables.sync(this.net.cables, (device, port) => this.devices.get(device)?.ports.get(port));
    this.updateLeds();
    this.consoles.collectSyslog();
    this.hud.setInventory(this.inventoryLeft(), this.selected);
    const quiet = this.level.objectives.filter((o) => !TRAFFIC.has(o.type));
    const results = evaluate(this.net, quiet).results;
    const merged = [...results, ...this.trafficResults.values()];
    this.celebrate(merged);
    this.hud.setObjectives(merged);
    this.coach?.update();
  }

  /** A ding when the number of completed objectives grows (not on the first display). */
  private celebrate(results: ObjectiveResult[]): void {
    const done = results.filter((r) => r.passed).length;
    if (this.doneCount >= 0 && done > this.doneCount) sound.play('objective');
    this.doneCount = done;
  }

  private check(): void {
    if (this.finished) return;
    const evaluation = evaluate(this.net, this.level.objectives);
    this.trafficResults = new Map(evaluation.results.filter((r) => TRAFFIC.has(this.level.objectives.find((o) => o.id === r.id)!.type)).map((r) => [r.id, r]));
    this.consoles.collectSyslog();
    this.updateLeds();
    this.hud.setObjectives(evaluation.results);
    if (evaluation.complete) {
      this.finished = true;
      sound.play('success');
      this.coach?.dispose();
      this.coach = null;
      this.hud.toast(t('check.done'), 'good');
      this.hud.showTooltip(null);
      closePanel();
      // The camera pulls back for the finale; the results never wait on it (animation pauses in background tabs).
      const finale = this.stage.flyTo(new THREE.Vector3(0, 1.9, 2.8), HOME.target, 1.6);
      void Promise.race([finale, new Promise((resolve) => setTimeout(resolve, 1800))]).then(() => this.events.complete(evaluation));
      return;
    }
    this.hud.revealHints(evaluation.results.filter((r) => !r.passed).map((r) => r.id));
    this.celebrate(evaluation.results);
    this.hud.setObjectives(evaluation.results);
    this.hud.toast(t('check.missing'), 'bad');
    sound.play('error');
  }

  private hint(): void {
    const next = this.level.hints[this.hintIndex];
    if (next) {
      this.hintIndex++;
      this.hud.toast(tx(next.text));
    } else {
      this.hud.toast(t('hint.none'));
    }
    const failing = this.level.objectives.find((o) => !evaluate(this.net, [o]).complete);
    if (failing) {
      this.hud.revealHints([failing.id]);
      this.afterChange();
    }
  }

  private cycleQuality(): Quality {
    const order: Quality[] = ['low', 'medium', 'high'];
    const next = order[(order.indexOf(this.stage.currentQuality) + 1) % order.length] as Quality;
    this.stage.setQuality(next);
    return next;
  }
}
