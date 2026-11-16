import * as THREE from 'three';
import { buildLevel, canPlug, catalog, evaluate, type CableEnd, type CableType, type EthernetFrame, type L3Payload, type Level, type Network, type ObjectiveResult, type PortSpec } from '@patchbay/sim-core';
import { sound } from '../audio.js';
import { t, tx } from '../i18n.js';
import { Player, type MoveInput } from './player.js';
import { Coach, type CoachView } from './coach.js';
import { TourGuide } from './tour.js';
import type { TourStop } from '@patchbay/content';
import { setGameTarget, type GameTarget } from './gamepad.js';
import { CableLayer, portFrame } from '../scene/cables.js';
import { buildDevice, buildNtu, buildPatchPanel, flickerLed, highlightSocket, rackOccupied, setLed, type DeviceView, type PortView } from '../scene/devices.js';
import { buildWhiteboard } from '../scene/details.js';
import { buildAnnex, buildClassrooms, buildSite, buildWestWing } from '../scene/annex.js';
import { applyLightmap } from '../scene/lightmaps.js';
import { BUILDING, rackFillers, setMainDoorOpen } from '../scene/room.js';
import { blockedAt, DOORS, FLOOR_Y, groundAt, SITE_EXIT_X, SITE_Z, siteOf, WINDOWS, ZONES, zoneOf, type SiteName, type ZoneName as Zone } from '../scene/building.js';
import type { Quality, Stage } from '../scene/stage.js';
import { AskAicha } from '../ui/askAicha.js';
import { h } from '../ui/dom.js';
import { CABLE_ORDER, Hud } from '../ui/hud.js';
import { closePanel, Consoles, openPanelKey, resetHostShells, showHostPanel, showBriefPanel, showConfirm, showHelp, showNotice, showPortList } from '../ui/panels.js';
import { extraCables, tidiness, type Tidiness } from './cabling.js';
import { testCable, type CableTest } from './tester.js';
import { showTester } from '../ui/tester.js';
import { daytime, daytimeOf, setDaytime } from '../scene/daytime.js';
import { clock, grade, type Grade } from './scoring.js';
import { canListen, listenOnce } from '../voice.js';
import { settings } from '../settings.js';
import { screenTexture } from '../scene/textures.js';
import { say, stopVoice } from '../voiceover.js';
import { Minimap } from '../ui/minimap.js';
import { Person } from '../scene/people.js';
import { COLLEAGUES, REACTIONS, WOMEN, type Colleague } from './cast.js';
import { playTrip, showSiteChooser } from '../ui/travel.js';
import { buildExterior, buildStreet, ENTRANCES } from '../scene/exterior.js';
import { journeyMap, journeyPath, journeyTrail, JOURNEY_ORIGIN } from '../scene/journey.js';
import { distanceKm, SITES } from '../ui/travel.js';
import { pauseOpen, showPause } from '../ui/pause.js';
import { understand, type VoiceCommand } from '../voice-commands.js';

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
/** What is written beside a patch panel port: where its building cable goes. */
function patchLabel(level: Level, end: string): string {
  const link = (level.patchLinks ?? []).find((l) => l.a === end || l.b === end);
  if (!link) return '';
  return tx(link.a === end ? link.label : link.labelB);
}

/** Where each room of a level sits in the building. */
/** The human characters (the student and the colleagues); localStorage 'patchbay.people' = '0' leaves them out. */
const PEOPLE = ((): boolean => {
  try {
    return localStorage.getItem('patchbay.people') !== '0';
  } catch {
    return true;
  }
})();

/** A rectangle on screen in normalised coordinates: left, bottom, right, top (-1…1). */
type Rect = [number, number, number, number];
const FULL_SCREEN: Rect = [-1, -1, 1, 1];
/** Where two rectangles on screen overlap, or null when they do not. */
function overlap(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  return x0 < x1 && y0 < y1 ? [x0, y0, x1, y1] : null;
}

/** Which part of the building a zone is drawn in (see `buildAnnex` and the parts built later). */
function partOf(zone: Zone): string {
  if (zone === 'corridor') return 'lower';
  if (zone === 'corridor1') return 'upper';
  if (zone === 'classroom0' || zone === 'toilets' || zone === 'lounge') return 'west';
  if (zone === 'classroom1' || zone === 'classroom2') return 'classes';
  if (zone.startsWith('agence-')) return 'agence-wing';
  if (zone.startsWith('datacenter-')) return 'datacenter-wing';
  return zone;
}

const ORIGINS: Record<string, Origin> = { '': { y: 0, z: 0 }, annexe: { y: 0, z: BUILDING.annexZ }, etage: { y: BUILDING.floorY, z: 0 }, agence: { y: 0, z: SITE_Z.agence }, datacenter: { y: 0, z: SITE_Z.datacenter } };
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
/** How far the building's cables climb from a patch panel to the tray under the ceiling, in metres. */
const BUILDING_DROP = 1.4;

export interface MissionEvents {
  complete(result: Grade): void;
  menu(): void;
  /** The guided tour's last button: on to the first mission. */
  tourDone?(): void;
}

/** The zone the player stands in to see a level's room. */
const ROOM_ZONE: Record<string, Zone> = { '': 'room', annexe: 'lab', etage: 'office' };

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
  /** The cable tester in hand: a click on a port reads its cable instead of plugging. */
  private testing = false;
  private firstEnd: PortView | null = null;
  private hovered: PortView | null = null;
  private trafficResults = new Map<string, ObjectiveResult>();
  private hintIndex = 0;
  /** Hints asked, for the « sans indice » badge. */
  private hintsUsed = 0;
  private finished = false;
  private coach: Coach | null = null;
  private recording = false;
  private hops: { from: CableEnd; to: CableEnd; frame: EthernetFrame }[] = [];
  private doneCount = -1;
  /** Cables taken out after being plugged, for the tidiness mark. */
  private reworks = 0;
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
  /** The plan of the floor, in a corner: only in missions across the building. */
  private minimap: Minimap | null = null;
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
  /** What belongs to each part of the building, to draw only what can be seen. */
  private readonly parts = new Map<string, THREE.Object3D[]>();
  private shown = '';
  private lastTick = 0;
  private readonly aicha: AskAicha;
  /** Sitting at the laptop: getting up when the console closes. */
  private seated = false;
  /** A guided tour: no clock and no grade, Aïcha's bubble takes the player from one piece of equipment to the next. */
  private readonly tour: boolean;
  private guide: TourGuide | null = null;
  private fade: HTMLElement | null = null;

  constructor(private readonly stage: Stage, readonly level: Level, private readonly events: MissionEvents, index = 0, private readonly exam = false, tour: TourStop[] | null = null) {
    this.tour = tour !== null;
    // The time of day, before the rooms are built: their shafts of sun are cut for it.
    setDaytime(daytimeOf(level.id, index, this.tour));
    stage.applyDaytime();
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
    const models = new Map(level.devices.map((d) => [d.id, catalog[d.model]?.kind ?? null]));
    this.cables = new CableLayer(stage, (end) => {
      const kind = models.get(end.device);
      if (kind !== undefined) return kind;
      // A patch panel: what is at the far end of the link it is part of, once both sides are plugged.
      const cord = this.cords.find((c) => c.panel.device === end.device && c.panel.port === end.port);
      const cable = cord && this.net.cableAt({ device: cord.end.device, port: cord.end.port });
      if (!cord || !cable) return null;
      const far = cable.a.device === cord.end.device && cable.a.port === cord.end.port ? cable.b : cable.a;
      return models.get(far.device) ?? null;
    });
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
      const ports = (level.patchLinks ?? []).flatMap((l) => [l.a, l.b]).filter((e) => e.startsWith(`${panel.id}:`)).map((e) => ({ name: e.split(':')[1] as string, label: patchLabel(level, e) }));
      const slot = (level.panels ?? []).filter((p) => p.kind === 'ntu' && (p.room ?? '') === (panel.room ?? '') && this.ntus.has(p.id)).length;
      const view = panel.kind === 'ntu' ? buildNtu(panel.id, ports, origin.z, origin.y, slot) : buildPatchPanel(panel.id, ports, origin.z, origin.y);
      if (panel.kind === 'ntu') this.ntus.add(panel.id);
      this.panels.set(panel.id, view);
      stage.level.add(view.root);
      this.inPart(panel.room, view.root);
      this.picks.push(...view.body, ...[...view.ports.values()].map((p) => p.hit));
    }
    this.leasedCords();
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
      if (!this.tour) this.minimap = new Minimap(floors);
      const annex = buildAnnex(floors);
      for (const part of annex.children) applyLightmap(part);
      stage.level.add(annex);
      for (const [key, name] of [['lab', 'part-lab'], ['lower', 'part-lower'], ['stairs', 'part-stairs'], ['office', 'part-office'], ['upper', 'part-upper']] as const) {
        const object = annex.getObjectByName(name);
        if (object) this.parts.set(key, [...(this.parts.get(key) ?? []), object]);
      }
      // The campus's street door: the way to the other sites.
      annex.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.userData.exit) this.picks.push(o);
      });
      // The rest of the building comes later, a part at a time, once the mission is on screen.
      this.later = [() => this.addParts('west', [buildWestWing()]), ...(floors ? [() => this.addParts('classes', [buildClassrooms()])] : [])];
      const main = stage.scene.getObjectByName('technical-room');
      if (main) this.parts.set('room', [...(this.parts.get('room') ?? []), main]);
    }
    stage.controls.enabled = false;
    stage.manualCamera = true;
    this.enter();
    this.cleanup.push(stage.onFrame((dt) => this.walk(dt)));

    this.castPeople();
    this.consoles = new Consoles(this.net, () => this.afterChange(), (action) => this.recordTraffic(action));
    this.cleanup.push(
      this.net.onWire((from, to, frame) => {
        if (this.recording && this.hops.length < MAX_HOPS) this.hops.push({ from, to, frame });
      }),
    );
    this.hud = new Hud(level, {
      check: () => this.check(),
      hint: () => this.hint(),
      menu: () => this.openPause(),
      travel: () => this.openTravel(),
      overview: () => this.overview(),
      ask: () => this.aicha.open(),
      ports: () => this.showPorts(),
      brief: () => this.showBrief(),
      help: () => showHelp(),
      cycleQuality: () => this.cycleQuality(),
      listen: () => this.listenVoice(),
      selectCable: (type) => this.select(type),
      tester: () => this.toggleTester(),
    }, stage.currentQuality, index, exam, this.tour, daytime().hour);
    setTimeout(() => (this.tour ? this.hud.banner(t('tour.title'), t('tour.banner')) : this.hud.banner(`${t('briefing.mission')} ${String(index + 1).padStart(2, '0')}`, exam ? t('exam.start') : this.coach?.active ? t('timer.tutorial') : t('timer.start'))), this.entrance * 1000);
    stage.onQualityLowered = (q) => this.hud.showQuality(q);
    this.cleanup.push(() => {
      stage.onQualityLowered = null;
    });
    this.listen();
    this.afterChange();
    this.coach = exam || tour ? null : Coach.for(level.id, stage, () => this.coachView());
    if (tour) {
      this.guide = new TourGuide(tour, {
        show: (stop) => void this.showStop(stop),
        done: () => (this.events.tourDone ? this.events.tourDone() : this.events.menu()),
        quit: () => this.events.menu(),
      });
    }
  }

  // ---- the guided tour ------------------------------------------------------------------------------------------

  /** Take the player's eyes to what a stop of the tour is about, in whichever room it is. */
  private async showStop(stop: TourStop): Promise<void> {
    // Aïcha says the stop aloud (the player has just asked for it), while the camera goes there.
    void say(stop.text.fr);
    const f = stop.focus;
    if ('device' in f) {
      const view = this.devices.get(f.device) ?? this.panels.get(f.device);
      if (!view) return;
      const room = this.level.devices.find((d) => d.id === f.device)?.room ?? this.level.panels?.find((p) => p.id === f.device)?.room ?? '';
      await this.goToRoom(room, view.root.getWorldPosition(new THREE.Vector3()).x);
      this.focusOn(view, true);
    } else if ('place' in f) {
      await this.goToPlace(f.place.x, f.place.z, f.place.upstairs ? FLOOR_Y : 0, f.place.yaw, f.place.pitch ?? 0);
    } else {
      await this.goToRoom('');
      if ('board' in f) this.toggleBoard();
      else this.overview();
    }
  }

  /** The tour goes to a spot of the building, in a short fade to black, and looks a given way. */
  private async goToPlace(x: number, z: number, y: number, yaw: number, pitch: number): Promise<void> {
    this.settle();
    const fade = (this.fade ??= document.body.appendChild(h('div', { class: 'tour-fade', 'aria-hidden': 'true' })));
    const quick = reducedMotion();
    if (!quick) {
      fade.classList.add('on');
      await new Promise((r) => setTimeout(r, 240));
    }
    this.player.place(x, z, y);
    this.player.yaw = yaw;
    this.player.pitch = pitch;
    this.settle();
    this.followZone();
    this.cull();
    this.stage.camera.position.copy(this.player.eye);
    sound.play('step');
    if (!quick) {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)));
      fade.classList.remove('on');
    }
  }

  /** Stop any flight or zoom: the eyes are the player's again, where they stand. */
  private settle(): void {
    this.flight++;
    this.stage.stopFlight();
    this.flying = false;
    this.following = true;
    this.anchor = null;
    this.seated = false;
  }

  /**
   * Bring the player into a room of the level, in front of its bench (as near `x` as the furniture allows). Another
   * room is reached in a short fade to black: flying through the walls would show the inside of the building.
   */
  private async goToRoom(room: string, x = 0): Promise<void> {
    this.settle();
    const zone = zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z);
    if (zone === ROOM_ZONE[room]) return;
    const origin = (ORIGINS[room] ?? ORIGINS['']) as Origin;
    const spot = this.freeSpot(x, origin.z + 1.75, origin.y) ?? this.freeSpot(0, origin.z + 1.75, origin.y);
    if (!spot) return;
    const fade = (this.fade ??= document.body.appendChild(h('div', { class: 'tour-fade', 'aria-hidden': 'true' })));
    const quick = reducedMotion();
    if (!quick) {
      fade.classList.add('on');
      await new Promise((r) => setTimeout(r, 240));
    }
    this.player.place(spot[0], spot[1], spot[2]);
    this.player.faceHome();
    this.settle();
    this.stage.camera.position.copy(this.player.eye);
    sound.play('step');
    if (!quick) {
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 80)));
      fade.classList.remove('on');
    }
  }

  /** The nearest place to (x, z) where a body can stand on floor `y`, searching in widening rings. */
  private freeSpot(x: number, z: number, y: number): [number, number, number] | null {
    for (let r = 0; r <= 1.6; r += 0.2) {
      const turns = r === 0 ? 1 : 12;
      for (let i = 0; i < turns; i++) {
        const a = (i / turns) * Math.PI * 2;
        const [px, pz] = [x + Math.cos(a) * r, z + Math.sin(a) * r];
        const g = groundAt(px, pz, y);
        if (g !== null && Math.abs(g - y) < 0.05 && !blockedAt(px, pz, g)) return [px, pz, g];
      }
    }
    return null;
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
    stopVoice();
    this.disposed = true;
    // Back to the campus, indoors, whatever the player was doing.
    this.showTown('campus');
    this.stage.setOutdoors(false);
    document.body.classList.remove('cinematic');
    for (const fn of this.cleanup) fn();
    this.stopListening?.();
    this.coach?.dispose();
    this.guide?.dispose();
    this.fade?.remove();
    this.cables.showPreview('straight', null, null);
    this.hud.destroy();
    this.minimap?.destroy();
    this.talkBubble?.remove();
    closePanel();
    this.stage.manualCamera = false;
    this.stage.zoom = 1;
    this.stage.setRig(0, 0);
    this.stage.placeLamps();
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
        const speed = (LOOK_SPEED * settings.lookSpeed) / this.zoom;
        this.player.turn((e.clientX - last[0]) * speed, (e.clientY - last[1]) * speed * (settings.invertY ? -1 : 1));
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
        // Close what is open first; with nothing open, Escape pauses the game.
        if (pauseOpen()) return;
        if (openPanelKey()) closePanel();
        else if (this.selected || this.testing || this.firstEnd || this.anchor) {
          this.select(null);
          if (this.anchor) this.overview(0.7);
        } else this.openPause();
      }
      if (e.code === 'KeyT' && !typing) this.toggleBoard();
      if (e.code === 'KeyL' && !typing) this.toggleTester();
      if (e.code === 'KeyV' && !typing) this.listenVoice();
      if (e.code === 'KeyH' && !typing && !this.exam) this.aicha.open();
      if (e.code === 'KeyP' && !typing) this.showPorts();
      if (e.code === 'KeyB' && !typing) this.showBrief();
      if (e.code === 'KeyO' && !typing) this.hud.toggleObjectives();
      if (e.code === 'KeyC' && !typing) this.minimap?.toggle();
      if (e.code === 'KeyG' && !typing) this.openTravel();
      if (e.code === 'KeyF' && !typing && PEOPLE) {
        settings.thirdPerson = !settings.thirdPerson;
        settings.save();
        this.hud.toast(t(settings.thirdPerson ? 'people.thirdPerson' : 'people.firstPerson'));
      }
      if (e.code === 'KeyE' && !typing) this.talk();
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

  private pick(): { port?: PortView; device?: string; board?: boolean; exit?: boolean } {
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    for (const hit of this.raycaster.intersectObjects(this.picks, false)) {
      // There is no seeing, or reaching, through the walls.
      if (zoneOf(hit.point.x, hit.point.y, hit.point.z) !== zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z)) continue;
      const port = hit.object.userData.port as PortView | undefined;
      if (port) return { port };
      const device = hit.object.userData.device as string | undefined;
      if (device) return { device };
      if (hit.object.userData.whiteboard) return { board: true };
      if (hit.object.userData.exit) return { exit: true };
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
    this.stage.renderer.domElement.style.cursor = port || device || board ? 'pointer' : this.selected || this.testing ? 'crosshair' : 'grab';

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
      if (this.panels.has(port.device) && this.panels.has(this.firstEnd.device)) return t('error.panelToPanel');
      if (this.ntus.has(port.device) || this.ntus.has(this.firstEnd.device)) return this.selected === 'serial' ? null : t('error.incompatible');
      return this.selected === 'straight' || this.selected === 'crossover' ? null : t('error.incompatible');
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
    const { port, device, board, exit } = this.pick();
    if (board) return this.toggleBoard();
    if (exit) return this.openTravel();
    const id = port?.device ?? device;
    if (id && !this.inReach(id)) return;
    if (port && this.testing) return this.testPort(port);
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
    this.avatar?.gesture(port.hit.getWorldPosition(new THREE.Vector3()).y - this.player.floorY < 0.5 ? 'Fixing_Kneeling' : 'Interact');
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
      // Two serial cords on the operator's boxes make a leased line; two identical cords a straight link, one
      // crossover among them a crossed one.
      if (this.ntus.has(cord.panel.device)) this.net.connect('serial', a, b, { leased: true });
      else this.net.connect(cord.type === other.type ? 'straight' : 'crossover', a, b);
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
      this.reworks++;
      return true;
    }
    const done = !this.panels.has(port.device) && this.net.disconnect({ device: port.device, port: port.port });
    if (done) this.reworks++;
    return done;
  }

  /** The tidiness of the cabling as it stands: see `cabling.ts`. Console cables are tools, not part of the network. */
  private tidiness(): Tidiness {
    const kept = (c: { type: CableType }): boolean => c.type !== 'console';
    const device = (end: string): string => end.slice(0, end.indexOf(':'));
    const placed = this.net.cables.filter(kept).map((c) => ({ a: c.a.device, b: c.b.device }));
    const allowed = [...this.level.solution.cables, ...this.level.initial.cables].filter(kept).map((c) => ({ a: device(c.a), b: device(c.b) }));
    return tidiness({ extra: extraCables(placed, allowed), reworks: this.reworks, cords: this.cables.cords() });
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
    if (view) this.focusOn(view);
  }

  /** A close look at a device: the eyes fly up to its front. */
  private focusOn(view: DeviceView, wide = false): void {
    const centre = view.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, view.height * 0.6, 0));
    // The tour shows the device in its setting, in the top half of the screen: Aïcha's bubble is below it.
    const distance = wide ? Math.max(0.95, view.width * 2.1) : Math.max(0.42, view.width * 1.25);
    const target = wide ? centre.clone().add(new THREE.Vector3(0, -distance * 0.2, 0)) : centre;
    const position = centre.clone().add(new THREE.Vector3(0, distance * 0.35, distance));
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

  private paused = false;
  /** The operator's boxes: a cord to one is a router's serial cable, two of them joined make a leased line. */
  private readonly ntus = new Set<string>();

  /**
   * A leased line already in service when the mission starts: what shows is each router's serial cable to the
   * operator's box of its own site, the two boxes joined by the operator.
   */
  private leasedCords(): void {
    const roomOf = (id: string): string => this.level.devices.find((d) => d.id === id)?.room ?? this.level.panels?.find((p) => p.id === id)?.room ?? '';
    for (const cable of this.net.cables) {
      if (!cable.leased) continue;
      const link = (this.level.patchLinks ?? []).find((l) => {
        const [pa, pb] = [l.a.split(':')[0] as string, l.b.split(':')[0] as string];
        return this.ntus.has(pa) && this.ntus.has(pb) && ((roomOf(pa) === roomOf(cable.a.device) && roomOf(pb) === roomOf(cable.b.device)) || (roomOf(pb) === roomOf(cable.a.device) && roomOf(pa) === roomOf(cable.b.device)));
      });
      if (!link) continue;
      const box = (end: string): PortView | undefined => this.panels.get(end.split(':')[0] as string)?.ports.get(end.split(':')[1] as string);
      const [boxA, boxB] = roomOf(link.a.split(':')[0] as string) === roomOf(cable.a.device) ? [box(link.a), box(link.b)] : [box(link.b), box(link.a)];
      const [endA, endB] = [this.devices.get(cable.a.device)?.ports.get(cable.a.port), this.devices.get(cable.b.device)?.ports.get(cable.b.port)];
      if (!boxA || !boxB || !endA || !endB || this.cords.some((c) => c.panel === boxA || c.panel === boxB)) continue;
      this.cords.push({ type: 'serial', end: endA, panel: boxA }, { type: 'serial', end: endB, panel: boxB });
      // Two cords stand for that one cable of the start: the inventory counts both as already in place.
      this.startCords++;
    }
  }

  /** Extra cords in place at the start: each leased line already in service shows two cords for one cable. */
  private startCords = 0;

  /** The sites this mission's equipment stands in: the campus, and maybe the agency or the operator's data centre. */
  private sites(): SiteName[] {
    const rooms = new Set([...this.level.devices.map((d) => d.room ?? ''), ...(this.level.panels ?? []).map((p) => p.room ?? '')]);
    return (['campus', 'agence', 'datacenter'] as const).filter((s) => s === 'campus' || rooms.has(s));
  }

  /** Choose a site, then go: the trip over the map, the player stepping in at the far site's door. */
  private openTravel(): void {
    const sites = this.sites();
    if (sites.length < 2 || this.travelling) return;
    const here = siteOf(this.player.z);
    this.paused = true;
    this.held.clear();
    showSiteChooser(here, sites, (to) => void this.travel(here, to), () => {
      this.paused = false;
      this.clockAt = performance.now();
    });
  }
  private travelling = false;
  /** The student the player walks as, seen from behind; the colleagues in the buildings. */
  private avatar: Person | null = null;
  private readonly people: { person: Person; who: Colleague; leg: number; talking: number; line: number }[] = [];
  private lastFoot = new THREE.Vector3();
  private climb = 0;
  private talkBubble: HTMLElement | null = null;

  /** The player's student and the colleagues of the places this mission goes to. */
  private castPeople(): void {
    if (!PEOPLE) return;
    this.avatar = new Person(settings.character);
    this.stage.level.add(this.avatar.root);
    if (!this.building) return;
    const sites = new Set(this.sites());
    for (const who of COLLEAGUES) {
      const site = siteOf(who.at.z);
      if (!sites.has(site)) continue;
      const person = new Person(who.model);
      person.root.position.set(who.at.x, who.at.y, who.at.z);
      person.root.rotation.y = who.at.yaw;
      person.play(who.motion, 0);
      this.stage.level.add(person.root);
      this.people.push({ person, who, leg: 0, talking: 0, line: 0 });
    }
    this.showPeople();
  }

  /**
   * A colleague shows with the part of the building they are in: hidden behind closed walls like the room itself, and
   * never standing in the air when a mission leaves their floor unbuilt.
   */
  private showPeople(): void {
    const shown = this.shown.split(',');
    for (const p of this.people) {
      const r = p.person.root;
      const part = partOf(zoneOf(r.position.x, r.position.y + 0.1, r.position.z));
      r.visible = this.parts.has(part) && shown.includes(part);
    }
  }

  /** Every frame: the colleagues breathe, walk their rounds, turn to the player when spoken to. */
  private livePeople(dt: number): void {
    const here = zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z);
    let near: (typeof this.people)[number] | null = null;
    let best = Infinity;
    const turn = (root: THREE.Object3D, want: number): void => {
      root.rotation.y += Math.atan2(Math.sin(want - root.rotation.y), Math.cos(want - root.rotation.y)) * Math.min(1, dt * 4);
    };
    for (const p of this.people) {
      const root = p.person.root;
      const d = Math.hypot(root.position.x - this.player.x, root.position.z - this.player.z);
      const sameFloor = Math.abs(root.position.y - this.player.floorY) < 1;
      // Far away or out of sight: no need to animate.
      if (d > 30 || !sameFloor || !root.visible) continue;
      // Up close every frame; further away, 20 steps a second are enough.
      p.person.update(dt, d > 10 ? 20 : 0);
      if (p.talking > 0) {
        p.talking -= dt;
        // Someone seated stays as they sit (turning the body would put their legs through the chair): only their
        // talking shows they answer. Someone standing turns to the player.
        const want = p.who.motion.startsWith('Sitting') ? p.who.at.yaw : Math.atan2(this.player.x - root.position.x, this.player.z - root.position.z);
        turn(root, want);
        if (p.talking <= 0) p.person.play(p.who.motion);
      } else if (!p.who.walk) {
        // Back to what they were doing, turning back the way they were facing.
        turn(root, p.who.at.yaw);
      } else {
        const target = p.who.walk[p.leg % p.who.walk.length] as [number, number];
        const dx = target[0] - root.position.x;
        const dz = target[1] - root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.2) p.leg++;
        else {
          const step = Math.min(dist, dt * 1.25);
          root.position.x += (dx / dist) * step;
          root.position.z += (dz / dist) * step;
          root.rotation.y = Math.atan2(dx, dz);
        }
      }
      // The one the player is looking at, not merely the closest: someone behind or to the side is not spoken to.
      const toward = Math.atan2(root.position.x - this.player.x, root.position.z - this.player.z);
      const off = Math.abs(Math.atan2(Math.sin(toward - this.player.yaw), Math.cos(toward - this.player.yaw)));
      const score = d + off * 1.5;
      // Only someone in the same room: never through a wall (the lounge from the toilets).
      const sameRoom = zoneOf(root.position.x, root.position.y + 0.1, root.position.z) === here;
      if (sameRoom && d < 2.2 && off < 0.9 && score < best) {
        best = score;
        near = p;
      }
    }
    this.hud.setTalkHint(near ? t('people.talkHint', { name: near.who.name }) : null);
    this.nearPerson = near;
  }
  private nearPerson: (typeof this.people)[number] | null = null;

  /** Talk to the colleague nearby: they turn to the player and say their next line. */
  private talk(): void {
    const p = this.nearPerson;
    if (!p) return;
    // Once most of the work is done, each colleague first says so (once), then goes back to their usual lines.
    const reacts = this.progress >= 0.75 && !this.congratulated.has(p.who.model);
    if (reacts) this.congratulated.add(p.who.model);
    const line = reacts ? (REACTIONS[this.congratulated.size % REACTIONS.length] as string) : (p.who.lines[p.line] ?? '');
    if (!reacts) p.line = (p.line + 1) % p.who.lines.length;
    // As long as it takes to say it (their recorded voice reads it out), seven seconds at least.
    const seconds = Math.max(7, line.length / 13);
    p.talking = seconds;
    void say(line, WOMEN.has(p.who.model) ? 'woman' : 'man');
    p.person.play(p.who.motion.startsWith('Sitting') ? 'Sitting_Talking_Loop' : 'Idle_Talking_Loop');
    this.talkBubble?.remove();
    this.talkBubble = h('div', { class: 'talk-bubble' }, h('strong', {}, p.who.name), h('small', {}, p.who.role), h('p', {}, line));
    document.body.append(this.talkBubble);
    const bubble = this.talkBubble;
    setTimeout(() => bubble.classList.add('leaving'), seconds * 1000 - 600);
    setTimeout(() => bubble.remove(), seconds * 1000);
    sound.play('click');
  }

  /**
   * Focus: while the player works (a cable in hand, one end already plugged, a device looked at closely, a console or a
   * panel open), the view goes through the student's eyes so that their body never hides a port; back to the view from
   * behind as soon as the work is put down.
   */
  private get focused(): boolean {
    return this.selected !== null || this.testing || this.firstEnd !== null || this.anchor !== null || document.querySelector('.terminal, .host-settings') !== null;
  }

  private wasFocused = false;

  /** Whether the camera is behind the student's shoulder this frame. */
  private backView(): boolean {
    const focus = this.focused;
    if (focus !== this.wasFocused && settings.thirdPerson && !this.tour) {
      this.wasFocused = focus;
      this.hud.toast(t(focus ? 'people.focus' : 'people.thirdPerson'));
    }
    return settings.thirdPerson && !focus && !this.seated && !this.tour;
  }

  /** The player's student follows the player: where they stand, the way they face, walking or standing still. */
  private moveAvatar(dt: number): void {
    const a = this.avatar;
    if (!a) return;
    a.update(dt);
    const p = this.player;
    const foot = new THREE.Vector3(p.x, p.floorY, p.z);
    const speed = dt > 0 ? Math.hypot(foot.x - this.lastFoot.x, foot.z - this.lastFoot.z) / dt : 0;
    // On the stairs the feet climb: the gait follows (a short memory smooths the steps of the walking surface).
    const rise = dt > 0 ? (foot.y - this.lastFoot.y) / dt : 0;
    this.climb = this.climb * 0.8 + rise * 0.2;
    this.lastFoot.copy(foot);
    a.root.position.copy(foot);
    a.root.rotation.y = p.yaw;
    const view = this.backView();
    a.root.visible = view;
    if (this.seated) a.play('Sitting_Idle_Loop');
    else if (speed > 0.25 && this.climb > 0.15) a.play('Stairs_Up_Loop', 0.2);
    else if (speed > 0.25 && this.climb < -0.15) a.play('Stairs_Down_Loop', 0.2);
    else if (speed > 2.4) a.play('Jog_Fwd_Loop', 0.2);
    else if (speed > 0.25) a.play('Walk_Loop', 0.2);
    else a.play('Idle_Loop', 0.3);
  }

  /**
   * The camera behind the student's shoulder: a little above and to the right, pulled in when a wall or a piece of
   * furniture would come between them, never through the ceiling.
   */
  private thirdPersonCamera(target: THREE.Vector3): void {
    const camera = this.stage.camera;
    const p = this.player;
    const head = new THREE.Vector3(p.x, p.floorY + 1.62, p.z);
    const c = Math.cos(this.viewPitch);
    const dir = new THREE.Vector3(Math.sin(this.viewYaw) * c, Math.sin(this.viewPitch), Math.cos(this.viewYaw) * c);
    const right = new THREE.Vector3(-Math.cos(this.viewYaw), 0, Math.sin(this.viewYaw));
    const want = 2.1 / Math.max(0.6, this.zoom);
    let dist = want;
    // Only what stands at the camera's height stops it (walls, racks, people's heads), not desks or benches.
    const camFloor = p.floorY + 1.45;
    for (let d = 0.3; d <= want; d += 0.1) {
      const q = head.clone().addScaledVector(dir, -d).addScaledVector(right, 0.45 * (d / want));
      if (blockedAt(q.x, q.z, camFloor, 0.14)) {
        dist = Math.max(0.35, d - 0.15);
        break;
      }
    }
    const pos = head.clone().addScaledVector(dir, -dist).addScaledVector(right, 0.45 * (dist / want)).add(new THREE.Vector3(0, 0.15, 0));
    // Pulled in close (a wall behind): rise to look over the shoulder rather than into the back of the head.
    if (dist < 1.2) pos.y += (1.2 - dist) * 0.55;
    pos.y = Math.min(pos.y, p.floorY + 2.8);
    camera.position.lerp(pos, 0.5);
    target.copy(head).addScaledVector(dir, 4);
  }

  private readonly outside = new Map<SiteName, { exterior: THREE.Object3D; street: THREE.Object3D }>();

  /** Each building from the street, built the first time the player goes out of it or arrives at it. */
  private outsideOf(site: SiteName): { exterior: THREE.Object3D; street: THREE.Object3D } {
    let o = this.outside.get(site);
    if (!o) {
      const footprint = site === 'campus' ? { x0: -14, x1: 12.6, z0: -11.68, z1: 6 } : { x0: -8, x1: 7, z0: SITE_Z[site] - 9.2, z1: SITE_Z[site] + 6 };
      o = { exterior: buildExterior(site), street: buildStreet(site, footprint) };
      o.street.visible = false;
      this.stage.level.add(o.exterior, o.street);
      this.outside.set(site, o);
    }
    return o;
  }

  /** Only the town around the site the player is at: the others are hundreds of kilometres away. */
  private showTown(site: SiteName): void {
    for (const s of ['campus', 'agence', 'datacenter'] as const) {
      const town = this.stage.scene.getObjectByName(`panorama-${s}`);
      if (town) town.visible = s === site;
    }
  }

  /** Black out (or back in), the way a scene changes in a film. */
  private async blackout(on: boolean): Promise<void> {
    const fade = (this.fade ??= document.body.appendChild(h('div', { class: 'tour-fade', 'aria-hidden': 'true' })));
    fade.classList.toggle('on', on);
    await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 260));
  }

  /** Out in the street at `site`'s door: sun on, the street shown, the building casting its shadow. */
  private goOutside(site: SiteName, on: boolean): { door: THREE.Vector3; out: THREE.Vector3; side: THREE.Vector3 } {
    const e = ENTRANCES[site];
    const door = new THREE.Vector3(e.x, 0, e.z);
    const out = new THREE.Vector3(e.out[0], 0, e.out[1]);
    const side = new THREE.Vector3(-e.out[1], 0, e.out[0]);
    const o = this.outsideOf(site);
    o.street.visible = on;
    this.showTown(site);
    o.exterior.traverse((m) => ((m as THREE.Mesh).isMesh ? (m.castShadow = on) : null));
    this.stage.setOutdoors(on, door.clone().addScaledVector(out, -6), out.clone().multiplyScalar(0.7).addScaledVector(side, 0.45).setY(1.1));
    return { door, out, side };
  }

  /**
   * The flight over Burkina Faso: the camera comes down out of the sky over the departure town, follows the line of
   * light as it draws the road to the other site, and the distance counts up. The far building waits at the end.
   */
  private async flyOver(from: SiteName, to: SiteName): Promise<void> {
    const stage = this.stage;
    const camera = stage.camera;
    const map = journeyMap();
    if (!map.parent) stage.scene.add(map);
    const curve = journeyPath(from, to);
    const trail = journeyTrail(curve);
    map.add(trail.group);
    map.visible = true;
    const km = distanceKm(from, to);
    const far = km > 50;
    const card = h('div', { class: 'journey-card' }, h('span', { class: 'label' }, 'En route'), h('strong', {}, `${SITES[from].city.split(',')[0]} → ${SITES[to].city.split(',')[0]}`), h('b', { class: 'journey-km' }, '0 km'), h('small', {}, far ? 'Une seule liaison entre les deux sites : la ligne louée de l’opérateur.' : 'Le fournisseur d’accès est dans la même ville.'));
    document.body.append(card);
    const oldFar = camera.far;
    camera.far = 2600;
    camera.updateProjectionMatrix();
    stage.scene.fog = new THREE.Fog('#dfe6ee', far ? 520 : 220, far ? 2300 : 1100);
    stage.setOutdoors(true, JOURNEY_ORIGIN, new THREE.Vector3(-0.4, 1, 0.5));
    camera.far = 2600;
    camera.updateProjectionMatrix();
    const tangent = new THREE.Vector3();
    const look = new THREE.Vector3();
    const [height, back] = far ? [46, 58] : [9, 14];
    const clouds = map.children.filter((c) => c.name === 'cloud');
    // The leased line is alive: packets run along the part already drawn, out in cyan and their replies back in amber,
    // as the pings of the mission would.
    const size = far ? 0.8 : 0.25;
    const packets = [...Array(8).keys()].map((i) => {
      const reply = i % 2 === 1;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), new THREE.MeshBasicMaterial({ color: reply ? '#fbbf24' : '#38bdf8', toneMapped: false, fog: false }));
      dot.userData = { phase: i / 8, reply };
      trail.group.add(dot);
      return dot;
    });
    const along = new THREE.Vector3();
    await this.blackout(false);
    let last = 0;
    await stage.animate(far ? 6.5 : 4.2, (t) => {
      const p = trail.draw(t);
      curve.getTangentAt(Math.min(0.999, Math.max(0.001, t)), tangent);
      tangent.y = 0;
      tangent.normalize();
      // Out of the sky at the start, low over the land at the end.
      const fall = 1 - t;
      camera.position.copy(p).addScaledVector(tangent, -back * (0.7 + fall * 0.6)).setY(p.y + height * (0.55 + fall * 1.1));
      look.copy(p).addScaledVector(tangent, back * 0.35);
      camera.lookAt(look);
      (card.querySelector('.journey-km') as HTMLElement).textContent = `${Math.round(km * t)} km`;
      for (const c of clouds) c.position.x += (t - last) * 30 * (c.userData.drift as number);
      for (const dot of packets) {
        const phase = (t * 4 + (dot.userData.phase as number)) % 1;
        const u = Math.max(0.001, (dot.userData.reply ? 1 - phase : phase) * t);
        curve.getPointAt(Math.min(0.999, u), along);
        dot.position.copy(along).setY(along.y + size * 1.4);
        dot.visible = t > 0.04;
      }
      last = t;
    });
    await new Promise((r) => setTimeout(r, 300));
    await this.blackout(true);
    card.remove();
    map.remove(trail.group);
    trail.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    map.visible = false;
    stage.scene.fog = null;
    camera.far = oldFar;
    camera.updateProjectionMatrix();
  }

  /** A camera move over `seconds`, from one point looking at one target to another. */
  private shot(seconds: number, from: THREE.Vector3, fromLook: THREE.Vector3, to: THREE.Vector3, toLook: THREE.Vector3): Promise<void> {
    const camera = this.stage.camera;
    const look = new THREE.Vector3();
    return this.stage.animate(seconds, (t) => {
      camera.position.lerpVectors(from, to, t);
      camera.lookAt(look.lerpVectors(fromLook, toLook, t));
    });
  }

  /**
   * Going from one site to another, as it would really happen: out through the street door, the building seen from
   * the street as the camera draws back, the road on the map with its distance, then the other building coming
   * closer until its door, and in.
   */
  private async travel(from: SiteName, to: SiteName): Promise<void> {
    this.travelling = true;
    this.select(null);
    document.body.classList.add('cinematic');
    const quick = reducedMotion();
    await this.blackout(true);
    // Between the shots of the trip, a light haze rather than black: as if passing through cloud.
    this.fade?.classList.add('haze');
    // Leaving: the rooms not yet built are built now, while the screen is dark (the façade's windows look into them).
    if (from === 'campus') while (this.later.length) (this.later.shift() as () => void)();
    if (!quick) {
      // At eye level only: the town around is a photograph taken at a person's height, which a camera in the air would
      // stretch. A few steps out of the door into the street, looking down it.
      const { door, out, side } = this.goOutside(from, true);
      const eye = (v: THREE.Vector3, h = 1.65): THREE.Vector3 => v.setY(h);
      await this.blackout(false);
      await this.shot(3.2, eye(door.clone().addScaledVector(out, 0.9)), eye(door.clone().addScaledVector(out, 14), 1.55), eye(door.clone().addScaledVector(out, 6).addScaledVector(side, 1.4)), eye(door.clone().addScaledVector(out, 12).addScaledVector(side, 9), 1.6));
      await this.blackout(true);
      this.goOutside(from, false);
    }
    sound.play('click');
    if (quick) {
      await new Promise<void>((resolve) => playTrip(from, to, () => this.buildSiteOnce(to), resolve));
    } else {
      // The far building is built while the screen is still dark, then the flight over the map.
      this.buildSiteOnce(to);
      this.outsideOf(to);
      await this.flyOver(from, to);
      const { door, out, side } = this.goOutside(to, true);
      const camera = this.stage.camera;
      camera.position.copy(door).addScaledVector(out, 10).addScaledVector(side, -2.5).setY(1.65);
      camera.lookAt(door.clone().setY(1.6));
      await this.blackout(false);
    }
    if (!quick) {
      // Arriving on foot, from across the street up to the door, at eye level.
      const { door, out, side } = this.goOutside(to, true);
      await this.shot(3.4, door.clone().addScaledVector(out, 10).addScaledVector(side, -2.5).setY(1.65), door.clone().setY(1.6), door.clone().addScaledVector(out, 2.2).setY(1.65), door.clone().setY(1.55));
      await this.blackout(true);
      this.goOutside(to, false);
    }
    // In through the street door: into the far site's entrance hall, or the campus's ground floor corridor.
    if (to === 'campus') {
      this.player.place(-13.1, -2.84, 0);
      this.player.yaw = Math.PI / 2;
    } else {
      this.player.place(SITE_EXIT_X, SITE_Z[to] - 8.4, 0);
      this.player.yaw = 0;
    }
    this.player.pitch = -0.05;
    this.followZone();
    this.cull();
    this.stage.camera.position.copy(this.player.eye);
    document.body.classList.remove('cinematic');
    this.fade?.classList.remove('haze');
    this.travelling = false;
    this.paused = false;
    this.clockAt = performance.now();
    await this.blackout(false);
    this.hud.toast(t(`zone.${zoneOf(this.player.x, 0.1, this.player.z)}`));
  }

  /** Parts of the building still to build, one per idle moment; and the far sites already built. */
  private later: (() => void)[] = [];
  private readonly builtSites = new Set<string>();

  /** Put parts of the building into the scene: their baked light, what the culling shows, the doors to click. */
  private addParts(key: string, parts: THREE.Object3D[]): void {
    for (const p of parts) {
      applyLightmap(p);
      this.stage.level.add(p);
      p.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.userData.exit) this.picks.push(o);
      });
    }
    // A far site comes in two parts: its technical room, and its wing.
    if (key === 'agence' || key === 'datacenter') {
      this.parts.set(key, [...(this.parts.get(key) ?? []), parts[0] as THREE.Object3D]);
      this.parts.set(`${key}-wing`, [...(this.parts.get(`${key}-wing`) ?? []), parts[1] as THREE.Object3D]);
    } else this.parts.set(key, [...(this.parts.get(key) ?? []), ...parts]);
    this.shown = '';
    this.cull();
  }

  /** Build a far site the first time it is needed. */
  private buildSiteOnce(site: SiteName): void {
    if (site === 'campus' || this.builtSites.has(site) || !this.building) return;
    this.builtSites.add(site);
    this.addParts(site, buildSite(site));
    // Its screens show the lines as they are now.
    this.supervised = '';
    this.superviseLines();
  }

  /** Build one waiting part when the browser has a moment, then the next: the frame rate never drops for it. */
  private buildLater(): void {
    if (!this.later.length) return;
    const idle = (window as Window & { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    // The part stays in the queue until it is built: the culling can always build it at once if the player gets there
    // first (a part taken out of the queue and not yet built could be neither, and the street would show through).
    const run = (): void => {
      if (this.disposed) return;
      const next = this.later.shift();
      if (!next) return;
      next();
      this.buildLater();
    };
    if (idle) idle(run, { timeout: 1500 });
    else setTimeout(run, 300);
  }

  /**
   * Build at once the parts the player is about to see. Returns whether anything was built (the culling has then run
   * again with them). A part in sight that no mission step can build is a bug of the level: it is reported.
   */
  private buildNow(shown: string[]): boolean {
    let built = false;
    while (this.later.length) {
      (this.later.shift() as () => void)();
      built = true;
    }
    for (const site of ['agence', 'datacenter'] as const) {
      if ((shown.includes(site) || shown.includes(`${site}-wing`)) && !this.builtSites.has(site)) {
        this.buildSiteOnce(site);
        built = true;
      }
    }
    const zone = partOf(zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z));
    if (!built && !this.parts.has(zone)) console.error(`part "${zone}" in sight but never built`);
    return built;
  }

  /** Everything at once (the light bake and the checks need the whole building). */
  buildEverything(): void {
    while (this.later.length) (this.later.shift() as () => void)();
    for (const site of ['agence', 'datacenter'] as const) this.buildSiteOnce(site);
  }
  private disposed = false;

  /** The pause menu: the clock stops, the room waits behind it. */
  private openPause(): void {
    if (this.finished) return this.events.menu();
    this.paused = true;
    this.held.clear();
    showPause(this.stage, {
      resume: () => {
        this.paused = false;
        this.clockAt = performance.now();
      },
      brief: () => this.showBrief(),
      help: () => showHelp(),
      quit: () => {
        this.paused = false;
        this.leave();
      },
    }, tx(this.level.title));
  }

  /** Leaving loses the work in progress: ask first. */
  private leave(): void {
    if (this.finished || this.tour) return this.events.menu();
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
      new THREE.Vector3(BUILDING.door.x, 1.62, -2.9),
      new THREE.Vector3(BUILDING.door.x, 1.62, -1.0),
      new THREE.Vector3(-3.4, 1.62, 0.5),
      new THREE.Vector3(-1.8, 1.62, 1.3),
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
    if (this.paused) return;
    if (this.finished) return;
    this.twinkle(dt);
    if (this.tour) return;
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

  /** The mission is on screen now: what it took to get ready does not count. */
  startClock(): void {
    this.clockAt = performance.now();
    this.buildLater();
  }

  private inPart(room: string | undefined, ...objects: THREE.Object3D[]): void {
    const key = room === 'annexe' ? 'lab' : room === 'etage' ? 'office' : room === 'agence' || room === 'datacenter' ? room : 'room';
    this.parts.set(key, [...(this.parts.get(key) ?? []), ...objects]);
  }

  /** Walls hide everything beyond them: draw only the parts of the building that can be seen from here. */
  private portals: { a: Zone; b: Zone; box: THREE.Box3 }[] | null = null;

  /** Every doorway, the two rooms it joins, and the box of its opening (a little wider, for the frame's lag). */
  private portalList(): { a: Zone; b: Zone; box: THREE.Box3 }[] {
    this.portals ??= DOORS.map((d) => {
      const [nx, nz] = d.along === 'x' ? [0, 0.3] : [0.3, 0];
      const a = zoneOf(d.x - nx, d.y + 0.1, d.z - nz);
      const b = zoneOf(d.x + nx, d.y + 0.1, d.z + nz);
      const half = d.width / 2 + 0.3;
      const [hx, hz] = d.along === 'x' ? [half, 0.3] : [0.3, half];
      const box = new THREE.Box3(new THREE.Vector3(d.x - hx, d.y, d.z - hz), new THREE.Vector3(d.x + hx, d.y + 2.4, d.z + hz));
      return { a, b, box };
    });
    return this.portals;
  }

  private panes: { zone: Zone; box: THREE.Box3 }[] | null = null;

  /** Every outside window, the room it lights and the box of its opening: the rest of the building shows through it. */
  private windowList(): { zone: Zone; box: THREE.Box3 }[] {
    this.panes ??= WINDOWS.map((w) => {
      const [nx, nz] = w.along === 'z' ? [0.3, 0] : [0, 0.3];
      const zone = zoneOf(w.x + nx * w.inside, w.y + 0.1, w.z + nz * w.inside);
      const half = w.width / 2;
      const [hx, hz] = w.along === 'z' ? [0.3, half] : [half, 0.3];
      const box = new THREE.Box3(new THREE.Vector3(w.x - hx, w.y + w.sill, w.z - hz), new THREE.Vector3(w.x + hx, w.y + w.sill + w.height, w.z + hz));
      return { zone, box };
    });
    return this.panes;
  }

  /** Each built part's bounds, worked out once (a part never moves). */
  private readonly partBoxes = new WeakMap<THREE.Object3D[], THREE.Box3>();
  private partBox(objects: THREE.Object3D[]): THREE.Box3 {
    let box = this.partBoxes.get(objects);
    if (!box) {
      box = new THREE.Box3();
      for (const o of objects) box.expandByObject(o);
      this.partBoxes.set(objects, box);
    }
    return box;
  }

  private readonly corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  private readonly corner = new THREE.Vector3();

  /**
   * Where a doorway is on screen, as a rectangle in normalised coordinates (-1…1), null when it is off screen. A box
   * partly behind the camera is cut at the near plane first: only what is in front of the eye counts.
   */
  private doorRect(box: THREE.Box3): Rect | null {
    const camera = this.stage.camera;
    if (box.distanceToPoint(camera.position) < 0.45) return FULL_SCREEN;
    const near = -camera.near * 1.01;
    const c = this.corners;
    for (let i = 0; i < 8; i++) {
      c[i]!.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(camera.matrixWorldInverse);
    }
    const rect: Rect = [Infinity, Infinity, -Infinity, -Infinity];
    const add = (p: THREE.Vector3): void => {
      const s = this.corner.copy(p).applyMatrix4(camera.projectionMatrix);
      rect[0] = Math.min(rect[0], s.x);
      rect[1] = Math.min(rect[1], s.y);
      rect[2] = Math.max(rect[2], s.x);
      rect[3] = Math.max(rect[3], s.y);
    };
    for (const p of c) if (p.z <= near) add(p);
    // Where one of the box's twelve edges crosses the near plane, that point is on screen too.
    for (let i = 0; i < 8; i++) {
      for (const bit of [1, 2, 4]) {
        if (i & bit) continue;
        const a = c[i]!;
        const b = c[i | bit]!;
        if (a.z <= near === b.z <= near) continue;
        add(this.corner.lerpVectors(a, b, (near - a.z) / (b.z - a.z)));
      }
    }
    if (rect[0] === Infinity) return null;
    return rect[2] < -1 || rect[0] > 1 || rect[3] < -1 || rect[1] > 1 ? null : rect;
  }

  private cull(): void {
    if (!this.building) return;
    const floorY = this.player.floorY + 0.1;
    const zone = zoneOf(this.player.x, floorY, this.player.z);
    // What can be seen (portal culling): the room the player is in and the one the camera is in, then each room whose
    // doorway shows on screen, and beyond it only the rooms whose doorways show *through* that doorway (the two
    // rectangles on screen overlap), three doors deep. A room behind the player's back, or beside a door seen at an
    // angle, is not drawn.
    const camera = this.stage.camera;
    camera.updateMatrixWorld();
    const seen = new Map<Zone, Rect>([[zone, FULL_SCREEN]]);
    const cameraZone = zoneOf(camera.position.x, floorY, camera.position.z);
    seen.set(cameraZone, FULL_SCREEN);
    let frontier: Zone[] = [...seen.keys()];
    for (let depth = 0; depth < 3 && frontier.length; depth++) {
      const next: Zone[] = [];
      for (const here of frontier) {
        const through = seen.get(here) as Rect;
        for (const d of this.portalList()) {
          const other = d.a === here ? d.b : d.b === here ? d.a : null;
          // A door to a zone this mission keeps shut is a closed door: nothing is seen through it.
          if (!other || !this.player.canEnter(other)) continue;
          const rect = this.doorRect(d.box);
          const clipped = rect && overlap(rect, through);
          if (!clipped) continue;
          // Seen through another doorway already: keep the union of the two, and look again from there if it grew.
          const before = seen.get(other);
          const grown: Rect = before ? [Math.min(before[0], clipped[0]), Math.min(before[1], clipped[1]), Math.max(before[2], clipped[2]), Math.max(before[3], clipped[3])] : clipped;
          if (before && grown.every((v, i) => v === before[i])) continue;
          seen.set(other, grown);
          next.push(other);
        }
      }
      frontier = next;
    }
    const parts = new Set([...seen.keys()].map(partOf));
    // Out of the windows, and down or up the open stair well: the rest of the building is seen from outside. A built
    // part whose bounds show through one of those openings is drawn too (else its outside walls would be missing).
    const views: { rect: Rect; only?: string[] }[] = [];
    for (const w of this.windowList()) {
      const through = seen.get(w.zone);
      const rect = through && this.doorRect(w.box);
      const clipped = rect && overlap(rect, through);
      if (clipped) views.push({ rect: clipped });
    }
    const well = seen.get('stairs');
    if (well) views.push({ rect: well, only: ['lower', 'upper'] });
    if (views.length) {
      for (const [part, objects] of this.parts) {
        if (parts.has(part)) continue;
        const box = this.partBox(objects);
        if (box.isEmpty() || box.distanceToPoint(camera.position) > 60) continue;
        const rect = this.doorRect(box);
        if (rect && views.some((v) => (!v.only || v.only.includes(part)) && overlap(rect, v.rect))) parts.add(part);
      }
    }
    const shown = [...parts].sort();
    // Never a room in sight that is not built yet (it would leave the street showing through it): what is still
    // waiting for an idle moment is built right now, before this frame is drawn.
    if (shown.some((part) => !this.parts.has(part)) && this.buildNow(shown)) return;
    const key = shown.join();
    if (key === this.shown) return;
    this.shown = key;
    for (const [part, objects] of this.parts) for (const o of objects) o.visible = shown.includes(part);
    this.showPeople();
    this.stage.refreshShadows(0.2);
  }

  /** Link LEDs flicker with the traffic, as they do on real gear. */
  private twinkle(dt: number): void {
    this.ledsIn -= dt;
    if (this.ledsIn > 0 || reducedMotion()) return;
    this.ledsIn = 0.09;
    for (const view of this.devices.values()) {
      for (const port of view.ports.values()) {
        flickerLed(port);
      }
    }
  }

  /** Going through a door: the lights follow, and the player is told where they are. */
  private followZone(): void {
    if (!this.building) return;
    const zone = zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z);
    if (zone === this.lastZone) return;
    if (this.lastZone !== null) this.hud.toast(t(`zone.${zone}`));
    this.showTown(siteOf(this.player.z));
    this.lastZone = zone;
    // The machines' hum: strongest by the racks and in the operator's server room, faint where people sit.
    const hum = /^(room|lab|agence|datacenter)$/.test(zone) ? (zone === 'datacenter' ? 1.5 : 1) : /corridor|stairs|hall/.test(zone) ? 0.45 : 0.2;
    sound.setPresence(hum);
    const floor = this.player.floorY > BUILDING.floorY - 0.5 ? BUILDING.floorY : 0;
    const hall = (BUILDING.corridor.back + BUILDING.corridor.front) / 2;
    const hallLamp = (x: number, y = floor): [number, number, number, number] => [x, y + 2.25, hall, 3.2];
    // Over the room the player is in, and over the corridor they can see through its door.
    const door = BUILDING.door.x;
    if (zone === 'room' || zone === 'office') this.stage.placeLamps([0.4, floor + 2.9, 1.2, 4], hallLamp(door));
    else if (zone === 'lab') this.stage.placeLamps([0.4, 2.9, BUILDING.annexZ + 1.2, 4], hallLamp(door));
    else if (zone === 'stairs') this.stage.placeLamps([10.2, 4.4, -2.45, 4], [8.6, 1.9, -1.7, 3.2]);
    else if (zone === 'agence' || zone === 'datacenter') this.stage.placeLamps([0.4, 2.9, SITE_Z[zone] + 1.2, 4], [-3.5, 2.6, SITE_Z[zone] + 3.0, 5]);
    else if (zone !== 'corridor' && zone !== 'corridor1') {
      // The building's other rooms: a lamp over the middle of the room, another at its door.
      const r = (ZONES.find((z) => z.name === zone) as { rect: { x0: number; x1: number; z0: number; z1: number } }).rect;
      this.stage.placeLamps([(r.x0 + r.x1) / 2, floor + 2.6, (r.z0 + r.z1) / 2, 5], hallLamp((r.x0 + r.x1) / 2));
    }
    else this.stage.placeLamps(hallLamp(door), hallLamp(2.0));
    if (zone === 'room') this.stage.setRig(0, 0);
    if (zone === 'lab') this.stage.setRig(0, BUILDING.annexZ);
    if (zone === 'office') this.stage.setRig(BUILDING.floorY, 0);
    if (zone === 'agence' || zone === 'datacenter') this.stage.setRig(0, SITE_Z[zone]);
  }

  /** Every frame: walk, turn the head, and put the camera where the eyes are. */
  private walk(dt: number): void {
    this.tickClock(dt);
    if (this.paused) return;
    this.minimap?.update(this.player.x, this.player.z, this.player.yaw, this.player.floorY, zoneOf(this.player.x, this.player.floorY + 0.1, this.player.z));
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
    this.moveAvatar(dt);
    this.livePeople(dt);
    if (this.following) {
      const ease = 1 - Math.exp(-dt * 20);
      this.viewYaw += (this.player.yaw - this.viewYaw) * ease;
      this.viewPitch += (this.player.pitch - this.viewPitch) * ease;
      if (PEOPLE && this.backView()) this.thirdPersonCamera(this.stage.controls.target);
      else {
        camera.position.copy(this.anchor ?? this.player.eye);
        const c = Math.cos(this.viewPitch);
        this.stage.controls.target.copy(camera.position).add(new THREE.Vector3(Math.sin(this.viewYaw) * c, Math.sin(this.viewPitch), Math.cos(this.viewYaw) * c));
      }
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
    // After the camera has turned for this frame: what it sees now, not what it saw a frame ago.
    camera.lookAt(this.stage.controls.target);
    this.cull();
  }

  /** Take the cable tester out, or put it away. */
  private toggleTester(): void {
    if (this.testing) return this.select(null);
    this.select(null);
    this.testing = true;
    this.hud.setInventory(this.inventoryLeft(), null, true);
    this.hud.toast(t('tester.inHand'));
    sound.play('click');
  }

  /** Metres of the building's cable between two patch panel ports: along the walls, up to the tray and back down. */
  private buildingRun(a: PortView, b: PortView): number {
    const p = a.hit.getWorldPosition(new THREE.Vector3());
    const q = b.hit.getWorldPosition(new THREE.Vector3());
    return Math.abs(p.x - q.x) + Math.abs(p.z - q.z) + Math.abs(p.y - q.y) + 2 * BUILDING_DROP;
  }

  /** Plug the tester into `port`, its remote unit at the far end of the cable, and show what it reads. */
  private testPort(port: PortView): void {
    const where = `${port.device} · ${port.port}`;
    const strictMdix = this.net.options.strictMdix;
    const sum = (list: number[]): number => list.reduce((n, l) => n + l, 0);
    this.avatar?.gesture(port.hit.getWorldPosition(new THREE.Vector3()).y - this.player.floorY < 0.5 ? 'Fixing_Kneeling' : 'Interact');
    sound.play('plug');
    let test: CableTest;
    let to = '';
    const cord = this.cords.find((c) => c.end === port || c.panel === port);
    if (this.panels.has(port.device) && !cord) {
      // A bare panel port: the building's cable to the other panel, or the operator's line.
      const ntu = this.ntus.has(port.device);
      const peer = this.peerPanelPort(port);
      if (peer) to = `${peer.device} · ${peer.port}`;
      test = testCable({ type: null, panel: ntu ? 'ntu' : 'patch', strictMdix, ...(peer && !ntu ? { length: this.buildingRun(port, peer) } : {}) });
    } else {
      // From a panel with a cord, the tester reads the same cable as from the device the cord goes to.
      const end = cord ? cord.end : port;
      const here = { device: end.device, port: end.port };
      const cable = this.net.cableAt(here);
      const ntu = cord ? this.ntus.has(cord.panel.device) : false;
      if (!cable && !cord) test = testCable({ type: null, strictMdix });
      else if (!cable && cord) {
        // A cord to a panel whose other side is not patched: the circuit stops at the far panel.
        const peer = this.peerPanelPort(cord.panel);
        const run = peer && !ntu ? this.buildingRun(cord.panel, peer) : 0;
        test = testCable({ type: cord.type, open: !ntu, ...(ntu ? { panel: 'ntu' as const } : {}), strictMdix, length: sum(this.cables.cordsAt(here.device, here.port)) + run });
      } else {
        const c = cable as NonNullable<typeof cable>;
        const isHere = c.a.device === here.device && c.a.port === here.port;
        const far = isHere ? c.b : c.a;
        let length = sum(this.cables.cordsAt(here.device, here.port));
        const farCord = this.cordOf(far);
        if (cord && farCord && !ntu) length += sum(this.cables.cordsAt(far.device, far.port)) + this.buildingRun(cord.panel, farCord.panel);
        const near = this.net.portSpec(here);
        const farSpec = this.net.portSpec(far);
        test = testCable({ type: c.type, strictMdix, length, dceHere: isHere, ...(ntu ? { panel: 'ntu' as const } : {}), ...(near ? { near } : {}), ...(farSpec ? { far: farSpec } : {}) });
      }
    }
    setTimeout(() => sound.play(test.verdict === 'fail' ? 'error' : 'tick'), 380);
    showTester(where, test, this.exam, to);
  }

  private select(type: CableType | null): void {
    if (type && this.left(type) === 0) {
      this.hud.toast(t('cable.none'), 'bad');
      sound.play('error');
      return;
    }
    if (this.firstEnd && type !== this.selected) this.hud.toast(t('cable.cancel'));
    if (this.testing && type === null) this.hud.toast(t('tester.put'));
    this.selected = type;
    this.testing = false;
    this.firstEnd = null;
    this.cables.showPreview('straight', null, null);
    this.hud.setInventory(this.inventoryLeft(), this.selected, this.testing);
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
    const initial = this.level.initial.cables.filter((c) => c.type === type).length + (type === 'serial' ? this.startCords : 0);
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
  private supervised = '';

  /**
   * The operator's wall of screens follows the mission: each leased line with its real state (both routers' serial
   * interfaces up, or down and why), and an alarm for each line that is down.
   */
  private superviseLines(): void {
    const leased = this.net.cables.filter((c) => c.leased);
    if (!leased.length && !this.ntus.size) return;
    const place = (device: string): string => {
      const room = this.level.devices.find((d) => d.id === device)?.room ?? '';
      return room === 'agence' ? 'BOBO' : room === 'datacenter' ? 'OPÉRATEUR' : 'CAMPUS';
    };
    const up = (device: string, port: string): boolean => {
      try {
        return this.net.linkState(device, port).status === 'up';
      } catch {
        return false;
      }
    };
    const rows = leased.map((c, i) => {
      const ok = up(c.a.device, c.a.port) && up(c.b.device, c.b.port);
      return { name: `LS-03${31 + i} ${place(c.a.device)} ↔ ${place(c.b.device)}`, ok };
    });
    // A line the client has not yet plugged in at both ends: down at the operator too.
    if (!rows.length) {
      for (const [i, site] of this.sites().filter((x) => x !== 'campus').entries()) rows.push({ name: `LS-03${31 + i} CAMPUS ↔ ${site === 'agence' ? 'BOBO' : 'OPÉRATEUR'}`, ok: false });
    }
    const key = rows.map((r) => `${r.name}${r.ok}`).join();
    if (key === this.supervised) return;
    this.supervised = key;
    const down = rows.filter((r) => !r.ok);
    const screens: [string, string[], string][] = [
      ['supervision-0', ['SUPERVISION · LIGNES LOUÉES', '', ...rows.map((r) => `${r.name.padEnd(28)}${r.ok ? 'UP' : 'DOWN'}`)], down.length ? '#f87171' : '#38bdf8'],
      ['supervision-2', down.length ? ['ALARMES', '', ...down.map((r) => `! ${r.name} : DOWN`), '', 'Câble série absent côté client', 'ou interface série éteinte'] : ['ALARMES', '', 'Aucune alarme active', '', 'Toutes les lignes en service'], down.length ? '#f87171' : '#38bdf8'],
    ];
    for (const [name, lines, accent] of screens) {
      this.stage.scene.traverse((o) => {
        if (o.name !== name) return;
        const mat = (o as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.map = screenTexture(lines, accent);
        mat.needsUpdate = true;
      });
    }
  }

  /** Share of the mission's objectives met (the colleagues notice when the network works again). */
  private progress = 0;
  private readonly congratulated = new Set<string>();

  private afterChange(): void {
    this.superviseLines();
    this.showHints();
    const drawn = [
      ...this.net.cables.filter((c) => !this.cordOf(c.a)),
      ...this.cords.map((c) => ({ type: c.type, a: { device: c.end.device, port: c.end.port }, b: { device: c.panel.device, port: c.panel.port } })),
    ] as typeof this.net.cables;
    this.stage.refreshShadows(0.8);
    this.cables.sync(drawn, (device, port) => (this.devices.get(device) ?? this.panels.get(device))?.ports.get(port));
    this.updateLeds();
    this.consoles.collectSyslog();
    this.hud.setInventory(this.inventoryLeft(), this.selected, this.testing);
    const quiet = this.level.objectives.filter((o) => !TRAFFIC.has(o.type));
    const results = evaluate(this.net, quiet).results;
    const merged = [...results, ...this.trafficResults.values()];
    this.celebrate(merged);
    this.progress = merged.length ? merged.filter((r) => r.passed).length / merged.length : 0;
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
    if (this.tour) return;
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
    const result = { ...grade(evaluation, this.remaining, this.limit, timedOut, this.exam), tidiness: this.tidiness(), hints: this.hintsUsed, cabled: this.level.solution.cables.some((c) => c.type !== 'console') };
    void Promise.race([finale, new Promise((resolve) => setTimeout(resolve, 1800))]).then(() => this.events.complete(result));
  }

  private hint(): void {
    this.hintsUsed++;
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

  private stopListening: (() => void) | null = null;

  /** Hear one spoken sentence and do what it asks; a second press stops listening. */
  private listenVoice(): void {
    if (this.stopListening) {
      this.stopListening();
      return;
    }
    if (!canListen) {
      this.hud.toast(t('voice.unsupported'), 'bad');
      return;
    }
    this.hud.setListening(true);
    this.hud.toast(t('voice.listening'));
    this.stopListening = listenOnce(
      (guesses) => {
        const said = guesses[0] ?? '';
        this.hud.toast(`« ${said} »`);
        this.obey(understand(said, [...this.devices.keys(), ...this.panels.keys()]));
      },
      (reason) => this.hud.toast(t(`voice.${reason}`), reason === 'nothing' ? undefined : 'bad'),
      () => {
        this.hud.setListening(false);
        this.stopListening = null;
      },
    );
  }

  private obey(command: VoiceCommand): void {
    switch (command.kind) {
      case 'cable':
        return this.select(command.cable);
      case 'check':
        return this.check();
      case 'hint':
        if (!this.exam) this.hint();
        return;
      case 'brief':
        return this.showBrief();
      case 'overview':
        return this.overview();
      case 'ports':
        return this.showPorts();
      case 'menu':
        return this.leave();
      case 'help':
        return showHelp();
      case 'open':
        if (this.inReach(command.device)) this.openDevice(command.device);
        return;
      case 'ask':
        if (!this.exam) this.aicha.open(command.question);
        return;
    }
  }

  private cycleQuality(): Quality {
    const order: Quality[] = ['low', 'medium', 'high'];
    const next = order[(order.indexOf(this.stage.currentQuality) + 1) % order.length] as Quality;
    this.stage.chooseQuality(next);
    return next;
  }
}
