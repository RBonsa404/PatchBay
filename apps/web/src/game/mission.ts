import * as THREE from 'three';
import { buildLevel, canPlug, catalog, evaluate, type CableEnd, type CableType, type EthernetFrame, type L3Payload, type Level, type Network, type ObjectiveResult, type PortSpec } from '@patchbay/sim-core';
import { sound } from '../audio.js';
import { t, tx } from '../i18n.js';
import { Player, type MoveInput } from './player.js';
import { Coach, type CoachView } from './coach.js';
import { setGameTarget, type GameTarget } from './gamepad.js';
import { CableLayer, portFrame } from '../scene/cables.js';
import { buildDevice, buildPatchPanel, highlightSocket, rackOccupied, setLed, type DeviceView, type PortView } from '../scene/devices.js';
import { buildWhiteboard } from '../scene/details.js';
import { buildAnnex } from '../scene/annex.js';
import { BUILDING, rackFillers, setMainDoorOpen } from '../scene/room.js';
import type { Quality, Stage } from '../scene/stage.js';
import { AskAicha } from '../ui/askAicha.js';
import { CABLE_ORDER, Hud } from '../ui/hud.js';
import { closePanel, Consoles, openPanelKey, resetHostShells, showHostPanel, showBriefPanel, showConfirm, showHelp, showNotice, showPortList } from '../ui/panels.js';
import { clock, grade, type Grade } from './scoring.js';

const HOME = { position: new THREE.Vector3(0, 1.78, 2.45), target: new THREE.Vector3(0, 0.86, 0.02) };
/** How far the player can reach a device from, in metres (seen from above). */
const REACH = 2.6;
/** Movement keys, by physical position (ZQSD on a French keyboard, WASD on an English one), and the arrows. */
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], KeyD: [1, 0],
};
/** The left and right arrows turn the head, in radians per second. */
const TURN_KEYS: Record<string, number> = { ArrowLeft: 1.7, ArrowRight: -1.7 };
/** Radians turned per pixel dragged, before zooming. */
const LOOK_SPEED = 0.0032;
/** Zoom of the eyes: slightly wide at rest (a person's view), up to a close look at the ports. */
const ZOOM_REST = 0.82;
const ZOOM_MAX = 4.5;
/** Where the eyes go to read the whiteboard (see `buildWhiteboard`), in a room's own coordinates. */
const BOARD_CENTRE = new THREE.Vector3(-1.75, 1.62, -1.56);
const BOARD_VIEW = new THREE.Vector3(-1.75, 1.62, -0.5);
type Origin = { y: number; z: number };
/** Where each room of a level sits in the building. */
const ORIGINS: Record<string, Origin> = { '': { y: 0, z: 0 }, annexe: { y: 0, z: BUILDING.annexZ }, etage: { y: BUILDING.floorY, z: 0 } };
type Zone = 'room' | 'corridor' | 'lab' | 'stairs' | 'corridor1' | 'office';
/** Which part of the building a position is in. */
function zoneOf(x: number, y: number, z: number): Zone {
  if (x > 4.5) return 'stairs';
  const upper = y > BUILDING.floorY - 0.5;
  if (z > BUILDING.corridor.front) return upper ? 'office' : 'room';
  if (z < BUILDING.corridor.back) return 'lab';
  return upper ? 'corridor1' : 'corridor';
}
/** How long it takes to walk in from the door when a mission starts. */
const ENTRANCE_SECONDS = 3.4;
/** Time allowed when a level does not say, and the share of it left in an exam. */
const DEFAULT_LIMIT = 600;
const EXAM_TIME = 0.7;
const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Height of the eyes when sitting at the bench. */
const SEATED_EYE = 1.2;
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
  if (payload.type === 'dhcp') return '#a78bfa';
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
  complete(result: Grade): void;
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
  private readonly player = new Player();
  private readonly held = new Set<string>();
  private padWalk: [number, number] = [0, 0];
  /** The camera is the player's eyes, except while it flies somewhere. */
  private following = false;
  private flying = false;
  private flight = 0;
  /** After a zoom on a device: where the head stays until the player walks away. */
  private anchor: THREE.Vector3 | null = null;
  private zoom = ZOOM_REST;
  /** Patch panels: not in the engine. Two cords joined by a link between panels make one cable of the network. */
  private readonly panels = new Map<string, DeviceView>();
  private cords: { type: CableType; end: PortView; panel: PortView }[] = [];
  private building = false;
  private lastZone: string | null = null;
  private boardView: THREE.Vector3 | null = null;
  private readonly limit: number;
  private remaining: number;
  /** The clock starts once the player has walked in. */
  private entrance = reducedMotion() ? 0 : ENTRANCE_SECONDS;
  private warned = false;
  private clockAt = 0;
  /** The direction shown, catching up with where the player looks: turning the head stays smooth. */
  private viewYaw = 0;
  private viewPitch = 0;
  private ledsIn = 0;
  private lamps: THREE.Object3D | null = null;
  /** What belongs to each part of the building, to draw only what can be seen. */
  private readonly parts = new Map<string, THREE.Object3D[]>();
  private shown = '';
  private lastTick = 0;
  private readonly aicha: AskAicha;
  /** Sitting at the laptop: getting up when the console closes. */
  private seated = false;

  constructor(private readonly stage: Stage, readonly level: Level, private readonly events: MissionEvents, index = 0, private readonly exam = false) {
    this.clockAt = performance.now();
    this.limit = Math.round((level.timeLimit ?? DEFAULT_LIMIT) * (exam ? EXAM_TIME : 1));
    this.remaining = this.limit;
    this.aicha = new AskAicha(() => {
      const failing = this.level.objectives.find((o) => !evaluate(this.net, [o]).complete);
      return { timeLeft: clock(this.remaining), mission: tx(this.level.title), next: failing ? { label: tx(failing.label), ...(failing.hint ? { hint: tx(failing.hint) } : {}) } : null };
    });
    stage.clearLevel();
    resetHostShells();
    this.net = buildLevel(level);
    for (const d of level.devices) {
      const host = this.net.device(d.id).host;
      const caption = host?.ip ? `${d.id} · ${host.ip}` : d.id;
      const origin = ORIGINS[d.room ?? ''] as Origin;
      const view = buildDevice(d.id, catalog[d.model]!, d.position, caption, origin.z, origin.y);
      this.inPart(d.room, view.root);
      this.devices.set(d.id, view);
      stage.level.add(view.root);
      this.picks.push(...view.body, ...[...view.ports.values()].map((p) => p.hit));
    }
    this.cables = new CableLayer(stage);
    this.cables.setObstacles(
      [...this.devices.values()].flatMap((v) => {
        v.root.updateMatrixWorld(true);
        return v.body.map((mesh) => new THREE.Box3().setFromObject(mesh));
      }),
    );
    // A whiteboard, and the rack's fillers, in each room the mission uses.
    const rooms = [...new Set(['', ...level.devices.map((d) => d.room ?? '')])];
    this.building = rooms.length > 1;
    const floors = rooms.includes('etage');
    for (const panel of level.panels ?? []) {
      const origin = ORIGINS[panel.room ?? ''] as Origin;
      const ports = (level.patchLinks ?? []).flatMap((l) => [l.a, l.b]).filter((e) => e.startsWith(`${panel.id}:`)).map((e) => ({ name: e.split(':')[1] as string, label: tx((level.patchLinks ?? []).find((l) => l.a === e)?.label) }));
      const view = buildPatchPanel(panel.id, ports, origin.z, origin.y);
      this.panels.set(panel.id, view);
      stage.level.add(view.root);
      this.inPart(panel.room, view.root);
      this.picks.push(...view.body, ...[...view.ports.values()].map((p) => p.hit));
    }
    const racked = [...this.devices.values(), ...this.panels.values()];
    for (const room of rooms) {
      const origin = ORIGINS[room] as Origin;
      const board = buildWhiteboard(level, origin.z, origin.y);
      this.picks.push(...board.children.filter((o) => o.userData.whiteboard));
      const fillers = rackFillers(rackOccupied(racked, origin.z, origin.y), origin.z, origin.y);
      stage.level.add(board, fillers);
      this.inPart(room || undefined, board, fillers);
    }
    stage.level.add(this.cables.group);
    // A mission across rooms opens the door at the back of the technical room.
    setMainDoorOpen(this.building);
    stage.setRig(0, 0);
    if (this.building) {
      this.player.enterBuilding(floors);
      const annex = buildAnnex(floors);
      this.lamps = annex.getObjectByName('corridor-lamps') ?? null;
      stage.level.add(annex);
      for (const [key, name] of [['lab', 'part-lab'], ['lower', 'part-lower'], ['stairs', 'part-stairs'], ['office', 'part-office'], ['upper', 'part-upper']] as const) {
        const object = annex.getObjectByName(name);
        if (object) this.parts.set(key, [...(this.parts.get(key) ?? []), object]);
      }
      const main = stage.scene.getObjectByName('technical-room');
      if (main) this.parts.set('room', [...(this.parts.get('room') ?? []), main]);
    }
    stage.controls.enabled = false;
    stage.manualCamera = true;
    this.enter();
    this.cleanup.push(stage.onFrame((dt) => this.walk(dt)));

    this.consoles = new Consoles(this.net, () => this.afterChange(), (action) => this.recordTraffic(action));
    this.cleanup.push(
      this.net.onWire((from, to, frame) => {
        if (this.recording && this.hops.length < MAX_HOPS) this.hops.push({ from, to, frame });
      }),
    );
    this.hud = new Hud(level, {
      check: () => this.check(),
      hint: () => this.hint(),
      menu: () => this.leave(),
      overview: () => this.overview(),
      ask: () => this.aicha.open(),
      ports: () => this.showPorts(),
      brief: () => this.showBrief(),
      help: () => showHelp(),
      cycleQuality: () => this.cycleQuality(),
      selectCable: (type) => this.select(type),
    }, stage.currentQuality, index, exam);
    setTimeout(() => this.hud.banner(`${t('briefing.mission')} ${String(index + 1).padStart(2, '0')}`, exam ? t('exam.start') : this.coach?.active ? t('timer.tutorial') : t('timer.start')), this.entrance * 1000);
    this.listen();
    this.afterChange();
    this.coach = exam ? null : Coach.for(level.id, stage, () => this.coachView());
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
    this.hops.forEach((hop, i) => {
      const colour = packetColour(hop.frame);
      const [from, to] = [this.cordOf(hop.from), this.cordOf(hop.to)];
      if (from && to) {
        // Across the panels: along one cord, through the walls, along the other.
        this.cables.pulse(hop.from, { device: from.panel.device, port: from.panel.port }, colour, i * HOP_GAP);
        this.cables.pulse({ device: to.panel.device, port: to.panel.port }, hop.to, colour, i * HOP_GAP + 0.4);
      } else {
        this.cables.pulse(hop.from, hop.to, colour, i * HOP_GAP);
      }
    });
    for (let i = 0; i < Math.min(this.hops.length, 6); i++) setTimeout(() => sound.play('packet'), i * HOP_GAP * 1000);
  }

  dispose(): void {
    for (const fn of this.cleanup) fn();
    this.coach?.dispose();
    this.cables.showPreview('straight', null, null);
    this.hud.destroy();
    closePanel();
    this.stage.manualCamera = false;
    this.stage.zoom = 1;
    this.stage.setRig(0, 0);
    setMainDoorOpen(false);
    const main = this.stage.scene.getObjectByName('technical-room');
    if (main) main.visible = true;
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
    // Fingers on the screen, for the pinch that zooms.
    const fingers = new Map<number, [number, number]>();
    let last: [number, number] | null = null;
    const spread = (): number => {
      const [p, q] = [...fingers.values()] as [[number, number], [number, number]];
      return Math.hypot(p[0] - q[0], p[1] - q[1]);
    };
    on(canvas, 'pointermove', (e) => {
      if (fingers.size === 2 && fingers.has(e.pointerId)) {
        const before = spread();
        fingers.set(e.pointerId, [e.clientX, e.clientY]);
        this.setZoom(this.zoom * (spread() / Math.max(1, before)));
        return;
      }
      if (down && down.id === e.pointerId && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= 6) cancelPress();
      // Dragging turns the head: the room follows the pointer.
      if (down && down.id === e.pointerId && last && e.buttons) {
        const speed = LOOK_SPEED / this.zoom;
        this.player.turn((e.clientX - last[0]) * speed, (e.clientY - last[1]) * speed);
        last = [e.clientX, e.clientY];
      }
      if (e.pointerType === 'touch' && down) return; // a finger dragging turns the head, not the aim
      this.aim(e.clientX, e.clientY);
    });
    on(canvas, 'wheel', (e) => {
      e.preventDefault();
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0014));
    });
    const release = (e: PointerEvent): void => {
      fingers.delete(e.pointerId);
      // Released outside the canvas (over the HUD, say): the gesture is over all the same.
      if (down?.id === e.pointerId) {
        cancelPress();
        down = null;
        last = null;
      }
    };
    on(window, 'pointerup', release);
    on(window, 'pointercancel', release);
    on(canvas, 'pointerdown', (e) => {
      if (e.pointerType === 'touch') fingers.set(e.pointerId, [e.clientX, e.clientY]);
      if (down) {
        // A second finger: a pinch, never a tap.
        cancelPress();
        down = null;
        last = null;
        return;
      }
      down = { x: e.clientX, y: e.clientY, id: e.pointerId };
      last = [e.clientX, e.clientY];
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
    on(window, 'keyup', (e) => {
      this.held.delete(e.code);
      if (e.code.startsWith('Shift')) this.held.delete('Shift');
    });
    on(window, 'blur', () => this.held.clear());
    // Closing the page in the middle of a mission loses it: the browser asks first.
    const guard = (e: BeforeUnloadEvent): void => {
      if (!this.finished) e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    this.cleanup.push(() => window.removeEventListener('beforeunload', guard));
    on(window, 'keydown', (e) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((KEYS[e.code] || TURN_KEYS[e.code]) && !typing) {
        this.held.add(e.code);
        e.preventDefault();
      }
      if (e.code.startsWith('Shift')) this.held.add('Shift');
      if (e.key === 'Escape') {
        if (openPanelKey()) closePanel();
        this.select(null);
        if (this.anchor) this.overview(0.7);
      }
      if (e.code === 'KeyT' && !typing) this.toggleBoard();
      if (e.code === 'KeyH' && !typing && !this.exam) this.aicha.open();
      if (e.code === 'KeyP' && !typing) this.showPorts();
      if (e.code === 'KeyB' && !typing) this.showBrief();
      if (e.code === 'KeyO' && !typing) this.hud.toggleObjectives();
      if (e.key === 'F1') {
        e.preventDefault();
        showHelp();
      }
      if (e.code === 'KeyN' && !typing) {
        sound.nextTrack();
        this.hud.toast(t('music.now', { title: sound.trackTitle }));
      }
      if (e.code === 'KeyM' && !typing) this.hud.toast(t(sound.toggleMusic() ? 'music.on' : 'music.off'));
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
      overview: () => this.overview(),
      walk: (x, y) => (this.padWalk = [x, y]),
      look: (yaw, pitch) => this.player.turn(yaw, pitch),
      zoom: (factor) => this.setZoom(this.zoom * factor),
      cancel: () => (openPanelKey() ? closePanel() : this.select(null)),
      cycleCable: (step) => {
        const types = (Object.keys(ACCEPTS) as CableType[]).filter((type) => this.left(type) > 0);
        if (types.length === 0) return;
        const at = this.selected ? types.indexOf(this.selected) : -1;
        this.select(types[(at + step + types.length) % types.length] ?? null);
      },
    };
  }

  private pick(): { port?: PortView; device?: string; board?: boolean } {
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    for (const hit of this.raycaster.intersectObjects(this.picks, false)) {
      // There is no seeing, or reaching, through the walls.
      if (zoneOf(hit.point.x, hit.point.y, hit.point.z) !== zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z)) continue;
      const port = hit.object.userData.port as PortView | undefined;
      if (port) return { port };
      const device = hit.object.userData.device as string | undefined;
      if (device) return { device };
      if (hit.object.userData.whiteboard) return { board: true };
    }
    return {};
  }

  /** Point at screen position (x, y): hover feedback, tooltip, and the cable in hand following. */
  private aim(x: number, y: number): void {
    const rect = this.stage.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    const e = { clientX: x, clientY: y };
    const { port, device, board } = this.pick();
    if (this.hovered && this.hovered !== port) highlightSocket(this.hovered, this.hinted(this.hovered) ? 'hint' : 'none');
    this.hovered = port ?? null;

    if (port) {
      const verdict = this.canTake(port);
      highlightSocket(port, !this.selected ? 'hover' : verdict === null ? 'ok' : 'bad');
      const name = `${port.device} · ${port.port}`;
      this.hud.showTooltip(verdict && this.selected ? `${name} — ${verdict}` : name, e.clientX, e.clientY, verdict !== null && this.selected !== null);
    } else if (device) {
      this.hud.showTooltip(device, e.clientX, e.clientY);
    } else if (board) {
      this.hud.showTooltip(t('board.tip'), e.clientX, e.clientY);
    } else {
      this.hud.showTooltip(null);
    }
    this.stage.renderer.domElement.style.cursor = port || device || board ? 'pointer' : this.selected ? 'crosshair' : 'grab';

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
    if (this.isBusy(port)) return t('error.busy');
    if (!this.firstEnd) return ACCEPTS[this.selected].includes(port.spec.kind) ? null : t('error.incompatible');
    if (port === this.firstEnd) return t('error.samePort');
    if (port.device === this.firstEnd.device) return t('error.sameDevice');
    const [va, vb] = [this.viewOf(this.firstEnd.device), this.viewOf(port.device)];
    if (va && vb && (va.roomY !== vb.roomY || va.roomZ !== vb.roomZ)) return t('error.otherRoom');
    if (this.panels.has(port.device) || this.panels.has(this.firstEnd.device)) {
      // A cord goes between a panel and a device: panels are only joined by the building's own cabling.
      return this.panels.has(port.device) && this.panels.has(this.firstEnd.device) ? t('error.panelToPanel') : this.selected === 'straight' || this.selected === 'crossover' ? null : t('error.incompatible');
    }
    return canPlug(this.selected, this.firstEnd.spec, port.spec) ? null : t('error.incompatible');
  }

  /** Whether to show `port` as a place for the cable in hand. An exam gives no such help. */
  private hinted(port: PortView): boolean {
    return !this.exam && this.selected !== null && this.canTake(port) === null;
  }

  /** Light every socket where the cable in hand can go, and only those. */
  private showHints(): void {
    for (const view of [...this.devices.values(), ...this.panels.values()]) {
      for (const port of view.ports.values()) highlightSocket(port, this.hinted(port) ? 'hint' : 'none');
    }
  }

  private onClick(): void {
    const { port, device, board } = this.pick();
    if (board) return this.toggleBoard();
    const id = port?.device ?? device;
    if (id && !this.inReach(id)) return;
    if (port && this.selected) return this.plugEnd(port);
    if (id && this.panels.has(id)) return showNotice(id, t('panel.patch'));
    if (id) this.openDevice(id);
  }

  /** Whether the character stands close enough to `device` to touch it; says so when not. */
  private inReach(device: string): boolean {
    const view = this.devices.get(device) ?? this.panels.get(device);
    if (!view) return true;
    const p = view.root.getWorldPosition(new THREE.Vector3());
    if (Math.hypot(p.x - this.player.x, p.z - this.player.z) <= REACH && Math.abs(view.roomY - this.player.floorY) < 1) return true;
    this.hud.toast(t('avatar.tooFar', { device }), 'bad');
    sound.play('error');
    return false;
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
      this.showHints();
      sound.play('plug');
      this.hud.toast(type === 'serial' ? t('cable.firstSerial') : t('cable.first'));
      this.coach?.update();
      return;
    }
    const a = this.firstEnd;
    this.firstEnd = null;
    this.cables.showPreview(type, null, null);
    if (this.panels.has(a.device) || this.panels.has(port.device)) {
      const [panel, end] = this.panels.has(a.device) ? [a, port] : [port, a];
      this.cords.push({ type, end, panel });
      this.joinCords();
      this.hud.toast(t('cable.plugged'), 'good');
      sound.play('plug');
      if (this.left(type) === 0) this.selected = null;
      this.afterChange();
      return;
    }
    const r = this.net.connect(type, { device: a.device, port: a.port }, { device: port.device, port: port.port });
    if (!r.ok) {
      this.hud.toast(t('error.incompatible'), 'bad');
      return;
    }
    this.hud.toast(t('cable.plugged'), 'good');
    sound.play('plug');
    if (this.left(type) === 0) this.selected = null;
    this.afterChange();
  }

  private viewOf(id: string): DeviceView | undefined {
    return this.devices.get(id) ?? this.panels.get(id);
  }

  private isBusy(port: PortView): boolean {
    return this.cords.some((c) => c.end === port || c.panel === port) || (!this.panels.has(port.device) && this.net.cableAt({ device: port.device, port: port.port }) !== undefined);
  }

  /** The panel port at the other end of the building's cabling. */
  private peerPanelPort(panel: PortView): PortView | undefined {
    const key = `${panel.device}:${panel.port}`;
    const link = this.level.patchLinks?.find((l) => l.a === key || l.b === key);
    const other = link && (link.a === key ? link.b : link.a);
    if (!other) return undefined;
    const [device, port] = other.split(':') as [string, string];
    return this.panels.get(device)?.ports.get(port);
  }

  /** When both ends of a link between panels have their cord, the network gets one cable between the two devices. */
  private joinCords(): void {
    for (const cord of this.cords) {
      const peer = this.peerPanelPort(cord.panel);
      const other = peer && this.cords.find((c) => c.panel === peer);
      if (!other) continue;
      const [a, b] = [{ device: cord.end.device, port: cord.end.port }, { device: other.end.device, port: other.end.port }];
      if (this.net.cableAt(a)) continue;
      // Two identical cords make a straight link, one crossover among them a crossed one.
      this.net.connect(cord.type === other.type ? 'straight' : 'crossover', a, b);
    }
  }

  /** The two cords of a joined link, seen from one of its two device ports. */
  private cordOf(end: CableEnd): { type: CableType; end: PortView; panel: PortView } | undefined {
    return this.cords.find((c) => c.end.device === end.device && c.end.port === end.port);
  }

  /** Take out the cable or cord at `port`. Returns whether anything was plugged there. */
  private unplug(port: PortView): boolean {
    const cord = this.cords.find((c) => c.end === port || c.panel === port);
    if (cord) {
      if (this.net.cableAt({ device: cord.end.device, port: cord.end.port })) this.net.disconnect({ device: cord.end.device, port: cord.end.port });
      this.cords = this.cords.filter((c) => c !== cord);
      return true;
    }
    return !this.panels.has(port.device) && this.net.disconnect({ device: port.device, port: port.port });
  }

  private onUnplug(): void {
    const { port } = this.pick();
    if (!port) {
      this.select(null);
      return;
    }
    if (!this.inReach(port.device)) return;
    if (this.unplug(port)) {
      sound.play('unplug');
      this.hud.toast(t('cable.unplugged'));
      this.afterChange();
    }
  }

  private onFocus(): void {
    const { port, device } = this.pick();
    const view = this.devices.get(port?.device ?? device ?? '') ?? this.panels.get(port?.device ?? device ?? '');
    if (!view) return;
    const target = view.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, view.height * 0.6, 0));
    const distance = Math.max(0.42, view.width * 1.25);
    const position = target.clone().add(new THREE.Vector3(0, distance * 0.35, distance));
    this.fly(position, target, 0.9, () => {
      this.anchor = position;
      this.player.lookAlong(target.clone().sub(position));
    });
    this.setZoom(1);
  }

  // ---- the player's eyes ----------------------------------------------------------------------------------------

  /** Fly the camera somewhere, then hand it back to the player's eyes. A newer flight replaces this one. */
  private fly(position: THREE.Vector3, target: THREE.Vector3, seconds: number, arrived?: () => void): void {
    const id = ++this.flight;
    this.following = false;
    this.flying = true;
    void this.stage.flyTo(position, target, seconds).then(() => {
      if (id !== this.flight) return;
      arrived?.();
      this.flying = false;
      this.following = true;
    });
  }

  /** The work order stays at hand during the mission. */
  private showBrief(): void {
    showBriefPanel(tx(this.level.title), tx(this.level.brief));
  }

  /** Leaving loses the work in progress: ask first. */
  private leave(): void {
    if (this.finished) return this.events.menu();
    showConfirm(t('leave.title'), t('leave.text'), t('leave.confirm'), () => this.events.menu());
  }

  /** The keyboard's way to play: every port as a button, doing what a click on it would do. */
  private showPorts(): void {
    showPortList(
      [...this.devices.values(), ...this.panels.values()].map((view) => ({
        id: view.id,
        open: () => (this.panels.has(view.id) ? showNotice(view.id, t('panel.patch')) : this.openDevice(view.id)),
        ports: [...view.ports.values()].filter((p) => !this.selected || ACCEPTS[this.selected].includes(p.spec.kind) || this.isBusy(p)).map((p) => {
          const busy = this.isBusy(p);
          return {
            name: p.port,
            busy,
            pick: () => {
              if (busy) this.unplug(p);
              else if (this.selected) this.plugEnd(p);
              else this.hud.toast(t('ports.hint'));
              if (busy) {
                sound.play('unplug');
                this.afterChange();
              }
              this.showPorts();
            },
          };
        }),
      })),
    );
  }

  /** The player comes in through the door and walks round the bench to their place. Walking cuts it short. */
  private enter(): void {
    if (reducedMotion()) {
      this.following = true;
      return;
    }
    const id = ++this.flight;
    const eye = this.player.eye;
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.95, 1.62, -1.35),
      new THREE.Vector3(-2.35, 1.62, -0.45),
      new THREE.Vector3(-1.95, 1.62, 0.6),
      new THREE.Vector3(-1.1, 1.62, 1.2),
      eye,
    ]);
    const ahead = new THREE.Vector3();
    const end = eye.clone().add(this.player.look);
    this.following = false;
    this.flying = true;
    this.stage.stopFlight();
    this.stage.camera.position.copy(path.getPoint(0));
    this.stage.controls.target.copy(path.getPoint(0.12));
    let steps = 0;
    void this.stage
      .animate(ENTRANCE_SECONDS, (t) => {
        if (id !== this.flight) return;
        const p = path.getPoint(t);
        this.stage.camera.position.copy(p);
        path.getPoint(Math.min(1, t + 0.15), ahead);
        this.stage.controls.target.lerpVectors(ahead, end, THREE.MathUtils.smoothstep(t, 0.55, 1));
        if (Math.floor(t * 9) > steps) {
          steps = Math.floor(t * 9);
          sound.play('step');
        }
      })
      .then(() => {
        if (id !== this.flight) return;
        this.flying = false;
        this.following = true;
      });
  }

  /** Walk up to the whiteboard's schema, from anywhere in the room; again to come back. */
  private toggleBoard(): void {
    if (this.anchor && this.anchor === this.boardView) return this.overview(0.7);
    if (this.flying) return;
    const zone = zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z);
    const origin = (zone === 'lab' ? ORIGINS.annexe : zone === 'office' || zone === 'corridor1' ? ORIGINS.etage : ORIGINS['']) as Origin;
    const shift = new THREE.Vector3(0, origin.y, origin.z);
    const view = BOARD_VIEW.clone().add(shift);
    const centre = BOARD_CENTRE.clone().add(shift);
    this.boardView = view;
    this.fly(view, centre, 0.9, () => {
      this.anchor = view;
      this.player.lookAlong(centre.clone().sub(view));
    });
    this.setZoom(1);
    this.hud.toast(t('board.back'));
  }

  /** Back to standing eyes, facing the bench and the rack. */
  private overview(seconds = 1.1): void {
    this.anchor = null;
    this.seated = false;
    this.player.faceHome();
    this.setZoom(ZOOM_REST);
    const eye = this.player.eye;
    this.fly(eye, eye.clone().add(this.player.look), seconds);
  }

  private setZoom(zoom: number): void {
    this.zoom = THREE.MathUtils.clamp(zoom, ZOOM_REST, ZOOM_MAX);
  }

  private moveInput(): MoveInput {
    if (this.finished) return { x: 0, y: 0, run: false };
    let x = this.padWalk[0];
    let y = -this.padWalk[1];
    for (const code of this.held) {
      const k = KEYS[code];
      if (k) {
        x += k[0];
        y += k[1];
      }
    }
    const n = Math.hypot(x, y);
    const run = this.held.has('Shift');
    return n > 1 ? { x: x / n, y: y / n, run } : { x, y, run };
  }

  /** The clock runs from the end of the entrance, except during the guided tutorial of a first mission. */
  private tickClock(dt: number): void {
    // Real seconds, not frames: a slow machine or a hidden tab must not stop the clock.
    const now = performance.now();
    const real = (now - this.clockAt) / 1000;
    this.clockAt = now;
    if (this.finished) return;
    this.twinkle(dt);
    if (this.entrance > 0) {
      this.entrance -= real;
    } else if (!this.coach?.active) {
      this.remaining -= real;
    }
    this.hud?.setTimer(this.remaining, this.limit, this.coach?.active ?? false);
    if (this.remaining <= 60 && !this.warned) {
      this.warned = true;
      this.hud.toast(t('timer.lastMinute'), 'bad');
      sound.play('error');
    }
    if (this.remaining <= 10 && Math.ceil(this.remaining) !== this.lastTick) {
      this.lastTick = Math.ceil(this.remaining);
      sound.play('tick');
    }
    if (this.remaining <= 0) this.finish(evaluate(this.net, this.level.objectives), true);
  }

  private inPart(room: string | undefined, ...objects: THREE.Object3D[]): void {
    const key = room === 'annexe' ? 'lab' : room === 'etage' ? 'office' : 'room';
    this.parts.set(key, [...(this.parts.get(key) ?? []), ...objects]);
  }

  /** Walls hide everything beyond them: draw only the parts of the building that can be seen from here. */
  private cull(): void {
    if (!this.building) return;
    const zone = zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z);
    // Through the two aligned doors, the far room shows only from the door's side of the room.
    const nearDoors = this.player.x < -1.6;
    const seen: Record<Zone, string[]> = {
      room: ['room', 'lower', ...(nearDoors ? ['lab'] : [])],
      corridor: ['room', 'lower', 'lab', 'stairs'],
      lab: ['lab', 'lower', ...(nearDoors ? ['room'] : [])],
      stairs: ['lower', 'upper', 'stairs'],
      corridor1: ['upper', 'office', 'stairs'],
      office: ['office', 'upper'],
    };
    const key = seen[zone].join();
    if (key === this.shown) return;
    this.shown = key;
    for (const [part, objects] of this.parts) for (const o of objects) o.visible = seen[zone].includes(part);
    this.stage.refreshShadows(0.2);
  }

  /** Link LEDs flicker with the traffic, as they do on real gear. */
  private twinkle(dt: number): void {
    this.ledsIn -= dt;
    if (this.ledsIn > 0 || reducedMotion()) return;
    this.ledsIn = 0.09;
    for (const view of this.devices.values()) {
      for (const port of view.ports.values()) {
        const material = port.led?.material as THREE.MeshStandardMaterial | undefined;
        if (material && material.emissiveIntensity >= 1 && material.emissive.g > material.emissive.r) material.emissiveIntensity = 1.4 + Math.random() * 3.6;
      }
    }
  }

  /** Going through a door: the lights follow, and the player is told where they are. */
  private followZone(): void {
    if (!this.building) return;
    const zone = zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z);
    if (zone === this.lastZone) return;
    if (this.lastZone !== null) this.hud.toast(t(`zone.${zone}`));
    this.lastZone = zone;
    if (this.lamps) this.lamps.position.y = zone === 'corridor1' || zone === 'office' ? BUILDING.floorY : 0;
    if (zone === 'room') this.stage.setRig(0, 0);
    if (zone === 'lab') this.stage.setRig(0, BUILDING.annexZ);
    if (zone === 'office') this.stage.setRig(BUILDING.floorY, 0);
  }

  /** Every frame: walk, turn the head, and put the camera where the eyes are. */
  private walk(dt: number): void {
    this.tickClock(dt);
    const camera = this.stage.camera;
    for (const code of this.held) {
      const turn = TURN_KEYS[code];
      if (turn) this.player.turn((turn * dt) / this.zoom, 0);
    }
    const { moved, step } = this.player.update(dt, this.moveInput());
    if (this.seated && moved) this.seated = false;
    if (this.seated && !this.flying && !openPanelKey()) {
      this.seated = false;
      this.overview(0.7);
    }
    if (step) sound.play('step');
    if (moved && (this.anchor || this.flying) && !this.finished) {
      // Walking takes over at once from a zoom on a device or a flight in progress.
      this.anchor = null;
      this.flight++;
      this.stage.stopFlight();
      this.flying = false;
      this.following = true;
    }
    this.stage.zoom += (this.zoom - this.stage.zoom) * (1 - Math.exp(-dt * 10));
    if (!this.following) {
      this.viewYaw = this.player.yaw;
      this.viewPitch = this.player.pitch;
    }
    if (this.following) {
      camera.position.copy(this.anchor ?? this.player.eye);
      const ease = 1 - Math.exp(-dt * 20);
      this.viewYaw += (this.player.yaw - this.viewYaw) * ease;
      this.viewPitch += (this.player.pitch - this.viewPitch) * ease;
      const c = Math.cos(this.viewPitch);
      this.stage.controls.target.copy(camera.position).add(new THREE.Vector3(Math.sin(this.viewYaw) * c, Math.sin(this.viewPitch), Math.cos(this.viewYaw) * c));
    }
    // Never let the camera leave the room (it would see through the walls).
    if (!this.building) {
      camera.position.set(
        THREE.MathUtils.clamp(camera.position.x, -3.35, 3.35),
        THREE.MathUtils.clamp(camera.position.y, 0.3, 2.85),
        THREE.MathUtils.clamp(camera.position.z, -1.45, 3.45),
      );
    }
    this.followZone();
    this.cull();
    camera.lookAt(this.stage.controls.target);
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
    this.showHints();
    this.coach?.update();
  }

  // ---- devices ---------------------------------------------------------------------------------------------------

  private consoleLaptop(target: string): string | undefined {
    for (const view of this.devices.values()) {
      if ((view.shape === 'laptop' || view.shape === 'pc') && this.net.consoleTarget(view.id)?.id === target) return view.id;
    }
    return undefined;
  }

  /** Sit down at the laptop: eyes lower, facing the bench and the rack, for as long as the console stays open. */
  private openConsole(device: string, laptop: string): void {
    this.consoles.open(device, laptop);
    const view = this.devices.get(laptop);
    if (!view) return;
    const p = view.root.getWorldPosition(new THREE.Vector3());
    const seat = new THREE.Vector3(p.x, SEATED_EYE, Math.max(p.z + 0.62, 1.08));
    // Turned towards the rack, so that it stays visible beside the console panel.
    const target = new THREE.Vector3(0.25 + p.x * 0.4, 0.98, -0.4);
    this.setZoom(1);
    this.seated = true;
    this.fly(seat, target, 0.8, () => {
      this.anchor = seat;
      this.player.lookAlong(target.clone().sub(seat));
    });
  }

  private openDevice(id: string): void {
    const view = this.devices.get(id);
    if (!view) return;
    if (view.shape === 'router' || view.shape === 'switch') {
      const laptop = this.consoleLaptop(id);
      if (laptop) this.openConsole(id, laptop);
      else showNotice(id, t('panel.routerInfo'));
      this.coach?.update();
      return;
    }
    const target = this.net.consoleTarget(id);
    if (view.shape === 'laptop') {
      if (target) this.openConsole(target.id, id);
      else showNotice(`${t('panel.console')} · ${id}`, t('panel.noConsole'));
      this.coach?.update();
      return;
    }
    showHostPanel(this.net, id, () => this.afterChange(), target ? () => this.consoles.open(target.id, id) : null, (action) => this.recordTraffic(action));
  }

  // ---- state -----------------------------------------------------------------------------------------------------

  private left(type: CableType): number {
    const initial = this.level.initial.cables.filter((c) => c.type === type).length;
    // A joined pair of cords is one network cable but two cords taken from the inventory.
    const used = this.net.cables.filter((c) => c.type === type && !this.cordOf(c.a)).length - initial + this.cords.filter((c) => c.type === type).length;
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
    this.showHints();
    const drawn = [
      ...this.net.cables.filter((c) => !this.cordOf(c.a)),
      ...this.cords.map((c) => ({ type: c.type, a: { device: c.end.device, port: c.end.port }, b: { device: c.panel.device, port: c.panel.port } })),
    ] as typeof this.net.cables;
    this.stage.refreshShadows(0.8);
    this.cables.sync(drawn, (device, port) => (this.devices.get(device) ?? this.panels.get(device))?.ports.get(port));
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
    if (this.doneCount >= 0 && done > this.doneCount && !this.exam) sound.play('objective');
    this.doneCount = done;
  }

  private check(): void {
    if (this.finished) return;
    const evaluation = evaluate(this.net, this.level.objectives);
    this.trafficResults = new Map(evaluation.results.filter((r) => TRAFFIC.has(this.level.objectives.find((o) => o.id === r.id)!.type)).map((r) => [r.id, r]));
    this.consoles.collectSyslog();
    this.updateLeds();
    this.hud.setObjectives(evaluation.results);
    if (evaluation.complete || this.exam) return this.finish(evaluation, false);
    this.hud.revealHints(evaluation.results.filter((r) => !r.passed).map((r) => r.id));
    this.celebrate(evaluation.results);
    this.hud.setObjectives(evaluation.results);
    this.hud.toast(t('check.missing'), 'bad');
    sound.play('error');
  }

  /** Stop the clock and hand the network in, as it stands. */
  private finish(evaluation: ReturnType<typeof evaluate>, timedOut: boolean): void {
    this.finished = true;
    sound.play(evaluation.complete ? 'success' : 'timeout');
    this.coach?.dispose();
    this.coach = null;
    this.hud.showTooltip(null);
    this.hud.setObjectives(evaluation.results);
    document.body.classList.remove('time-low');
    closePanel();
    // The camera pulls back for the finale; the results never wait on it (animation pauses in background tabs).
    this.following = false;
    this.flying = true;
    this.flight++;
    const zone = zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z);
    const origin = (zone === 'lab' ? ORIGINS.annexe : zone === 'office' ? ORIGINS.etage : ORIGINS['']) as Origin;
    const finale = this.stage.flyTo(new THREE.Vector3(0, 1.9 + origin.y, 2.8 + origin.z), HOME.target.clone().add(new THREE.Vector3(0, origin.y, origin.z)), 1.6);
    const result = grade(evaluation, this.remaining, this.limit, timedOut, this.exam);
    void Promise.race([finale, new Promise((resolve) => setTimeout(resolve, 1800))]).then(() => this.events.complete(result));
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
    try {
      localStorage.setItem('patchbay.quality', next);
    } catch {
      // storage unavailable: the choice lasts until the page closes
    }
    return next;
  }
}
