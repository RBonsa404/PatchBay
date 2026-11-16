import * as THREE from 'three';
import type { Cable, CableEnd, CableType, DeviceKind } from '@patchbay/sim-core';
import { cableRole, cordLength, cordText, ROLE_COLOUR } from '../game/cabling.js';
import type { PortView } from './devices.js';
import { BENCH_TOP, LADDER, MANAGER, RACK, roomOrigin, TRAY, WALL_TRUNK } from './room.js';
import { fillet, Rope } from './rope.js';
import type { Stage } from './stage.js';
import { atlasLabel } from './textures.js';

/**
 * Cable colours as they come out of the stock (see `ROLE_COLOUR` for the company code): a straight cable laid between
 * two network devices is taken in yellow rather than blue.
 */
export const CABLE_STYLE: Record<CableType, { colour: string; radius: number }> = {
  straight: { colour: ROLE_COLOUR.access, radius: 0.0036 },
  crossover: { colour: ROLE_COLOUR.crossover, radius: 0.0036 },
  console: { colour: ROLE_COLOUR.console, radius: 0.0032 },
  serial: { colour: ROLE_COLOUR.serial, radius: 0.0045 },
};

const keyOf = (c: Cable): string => `${c.type}|${c.a.device}:${c.a.port}|${c.b.device}:${c.b.port}`;
const FORWARD = new THREE.Vector3(0, 0, 1);

/** World position of a port's mouth and the direction pointing out of its panel. */
export function portFrame(port: PortView): { point: THREE.Vector3; normal: THREE.Vector3 } {
  const point = port.mouth.getWorldPosition(new THREE.Vector3());
  const q = port.mouth.getWorldQuaternion(new THREE.Quaternion());
  return { point, normal: FORWARD.clone().applyQuaternion(q) };
}

/** Space between two cables lying side by side on the bench. */
const LANE = 0.016;

/**
 * Where a plugged cable runs, the way a technician would lay it: out of the port, a bend down to the bench, then
 * flat along the bench to the other device. Each cable has its own lane (`lane`), so neighbours lie side by side
 * instead of crossing in the air. Two ports in the rack, close to each other, get a short patch loop instead.
 */
function routeBetween(a: THREE.Vector3, na: THREE.Vector3, b: THREE.Vector3, nb: THREE.Vector3, lane: number, radius: number, obstacles: THREE.Box3[]): THREE.CatmullRomCurve3 {
  const lead = 0.05;
  const a1 = a.clone().addScaledVector(na, lead);
  const b1 = b.clone().addScaledVector(nb, lead);
  const frontZ = RACK.frontZ;
  const rest = BENCH_TOP + radius + 0.001;
  const highA = a.y - BENCH_TOP > 0.1;
  const highB = b.y - BENCH_TOP > 0.1;
  const offset = lane * LANE;

  // A box on the wall behind the rack (the operator's NTU): the cord never crosses the air. Up the rack's cable
  // manager, over the top of the rack, up the vertical ladder to the overhead tray, along it, down the wall trunking
  // beside the box, and only the last few centimetres free, curving up into the socket.
  const onWall = (p: THREE.Vector3): boolean => p.z < frontZ - RACK.depth - 0.25;
  if (highA && highB && onWall(a) !== onWall(b)) {
    const [r, w, nw] = onWall(a) ? [b, a, na] : [a, b, nb];
    const nr = onWall(a) ? nb : na;
    const r1 = r.clone().addScaledVector(nr, lead);
    const w1 = w.clone().addScaledVector(nw, lead);
    const side = RACK.x + MANAGER.x - 0.01;
    const z = frontZ + 0.03;
    const top = RACK.height + 0.03 + (lane % 3) * 0.006;
    const trayY = TRAY.y + radius + 0.006 + (lane % 3) * 0.008;
    const trayZ = TRAY.z - 0.06 + (lane % 4) * 0.025;
    const trunkX = w.x + WALL_TRUNK.dx;
    const trunkZ = WALL_TRUNK.z;
    const path = [
      r,
      r1,
      new THREE.Vector3(side, r1.y, z),
      new THREE.Vector3(side, top, z),
      new THREE.Vector3(LADDER.x, top + 0.02, frontZ - RACK.depth + 0.05),
      // Laid against the ladder's rungs (on the rack's side of them), as a technician ties it there.
      new THREE.Vector3(LADDER.x, top + 0.08, LADDER.z + 0.012),
      new THREE.Vector3(LADDER.x, trayY - 0.06, LADDER.z + 0.012),
      new THREE.Vector3(LADDER.x + 0.06, trayY, trayZ),
      // To the tray's back edge, then straight into the top of the trunking against the wall.
      new THREE.Vector3(trunkX - 0.08, trayY, trayZ),
      new THREE.Vector3(trunkX, trayY, TRAY.z - 0.13),
      new THREE.Vector3(trunkX, trayY - 0.03, trunkZ),
      new THREE.Vector3(trunkX, trayY - 0.15, trunkZ),
      new THREE.Vector3(trunkX, WALL_TRUNK.bottom + 0.02, trunkZ),
      new THREE.Vector3(trunkX - 0.02, WALL_TRUNK.bottom - 0.05, trunkZ + 0.04),
      new THREE.Vector3(w1.x + 0.03, w1.y - 0.07, w1.z + 0.03),
      w1,
      w,
    ];
    const ordered = onWall(a) ? path.reverse() : path;
    return new THREE.CatmullRomCurve3(fillet(ordered, 0.05, 6), false, 'centripetal', 0.5);
  }

  if (highA && highB) {
    // Patch cord, dressed as in an enterprise rack: straight out of the port, into the horizontal cable manager
    // between the two units, along it, and out to the other port. It never hangs across other ports; its corners
    // bend no tighter than a cable allows. Cords share the manager side by side, each in its own lane.
    const z = frontZ + 0.03 + (lane % 4) * 0.006;
    const low = Math.min(a1.y, b1.y);
    const high = Math.max(a1.y, b1.y);
    const y = (high - low > 0.05 ? (a1.y + b1.y) / 2 : low - 0.03) + ((lane % 3) - 1) * 0.004;
    const outA = new THREE.Vector3(a1.x, a1.y, z);
    const outB = new THREE.Vector3(b1.x, b1.y, z);
    const path = [a, a1, outA, new THREE.Vector3(a1.x, y, z), new THREE.Vector3(b1.x, y, z), outB, b1, b];
    return new THREE.CatmullRomCurve3(fillet(path, 0.014, 6), false, 'centripetal', 0.5);
  }

  // Touch-down points on the bench, just past each port, shifted into this cable's lane.
  const down = (p: THREE.Vector3, n: THREE.Vector3, high: boolean, other: THREE.Vector3): THREE.Vector3[] => {
    const flat = new THREE.Vector3(n.x, 0, n.z).normalize();
    if (!high) {
      const t = p.clone().addScaledVector(flat, 0.04 + offset);
      t.y = rest;
      return [t];
    }
    // From the rack: along the front of the gear to the nearest cable manager, down inside it, then out onto the
    // bench's back edge. Cables never hang in front of the ports below.
    const side = other.x < RACK.x ? -1 : 1;
    const x = RACK.x + side * (MANAGER.x - 0.012 + (lane % 4) * 0.006);
    const z = frontZ + 0.03;
    const across = new THREE.Vector3(x, p.y - 0.018 - (lane % 4) * 0.004, z);
    const low = new THREE.Vector3(x, rest + 0.1, z);
    const t = new THREE.Vector3(x, rest, frontZ + 0.13 + offset);
    return [across, low, t];
  };
  const da = down(a1, na, highA, b1);
  const db = down(b1, nb, highB, a1).reverse();
  const ta = da[da.length - 1] as THREE.Vector3;
  const tb = db[0] as THREE.Vector3;
  // Lie flat along the bench, going around whatever stands on it.
  const around = avoid(ta, tb, obstacles, offset, 0);
  let run = around;
  if (around.length === 0) {
    const mid = ta.clone().lerp(tb, 0.5);
    mid.z += offset * 0.5;
    run = [mid];
  }
  for (const p of run) p.y = rest;
  // A smooth curve overshoots its points a little: flatten what would dip into the bench.
  const smooth = new THREE.CatmullRomCurve3([a, a1, ...da, ...run, ...db, b1, b], false, 'centripetal', 0.5);
  const flattened = smooth.getPoints(120).map((p) => p.setY(Math.max(p.y, rest)));
  return new THREE.CatmullRomCurve3(flattened, false, 'centripetal', 0.5);
}

const originKey = (o: { y: number; z: number }): string => `${o.y}|${o.z}`;
const FORWARD_NORMAL = new THREE.Vector3(0, 0, 1);

/** A socket of the rack's own patch panel (see `rack()` in room.ts), for links laid in the walls. */
function panelSocket(index: number): THREE.Vector3 {
  return new THREE.Vector3(RACK.x - 0.19 + (index % 12) * 0.016, 1.3573, RACK.frontZ + 0.0006);
}

/** Clearance kept between a cable lying on the bench and the objects standing on it. */
const CLEARANCE = 0.035;

/**
 * Points to pass through so that the straight run from `a` to `b` (on the bench, seen from above) goes around every
 * obstacle instead of through it: at the first box in the way, take the shorter way round its corners, then check
 * the two halves again. The lane offset widens the detour so neighbouring cables do not overlap.
 */
function avoid(a: THREE.Vector3, b: THREE.Vector3, boxes: THREE.Box3[], offset: number, depth: number): THREE.Vector3[] {
  if (depth > 4) return [];
  const margin = CLEARANCE + offset;
  let hit: { box: THREE.Box3; t: number } | null = null;
  for (const box of boxes) {
    const t = segmentHitsRect(a, b, box.min.x - margin, box.max.x + margin, box.min.z - margin, box.max.z + margin);
    if (t !== null && (!hit || t < hit.t)) hit = { box, t };
  }
  if (!hit) return [];
  const { box } = hit;
  const m = margin + 0.005;
  const corners = [
    new THREE.Vector3(box.min.x - m, a.y, box.min.z - m),
    new THREE.Vector3(box.max.x + m, a.y, box.min.z - m),
    new THREE.Vector3(box.max.x + m, a.y, box.max.z + m),
    new THREE.Vector3(box.min.x - m, a.y, box.max.z + m),
  ];
  // Corners on each side of the line a → b, visited in the order of travel.
  const dir = b.clone().sub(a);
  const side = (p: THREE.Vector3): number => dir.x * (p.z - a.z) - dir.z * (p.x - a.x);
  const along = (p: THREE.Vector3): number => (p.x - a.x) * dir.x + (p.z - a.z) * dir.z;
  const left = corners.filter((p) => side(p) > 0).sort((p, q) => along(p) - along(q));
  const right = corners.filter((p) => side(p) <= 0).sort((p, q) => along(p) - along(q));
  const length = (pts: THREE.Vector3[]): number => [a, ...pts, b].reduce((n, p, i, all) => (i ? n + p.distanceTo(all[i - 1] as THREE.Vector3) : 0), 0);
  const way = left.length && (!right.length || length(left) <= length(right)) ? left : right;
  if (way.length === 0) return [];
  // Recurse on each leg, in case another object stands on it.
  const out: THREE.Vector3[] = [];
  const stops = [a, ...way, b];
  for (let i = 0; i < stops.length - 1; i++) {
    out.push(...avoid(stops[i] as THREE.Vector3, stops[i + 1] as THREE.Vector3, boxes.filter((x) => x !== box), offset, depth + 1));
    if (i < way.length) out.push(way[i] as THREE.Vector3);
  }
  return out;
}

/** Where (0..1) the segment a → b first enters the rectangle, seen from above; null if it misses it. */
function segmentHitsRect(a: THREE.Vector3, b: THREE.Vector3, x0: number, x1: number, z0: number, z1: number): number | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dz, a.z - z0], [dz, z1 - a.z]] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return null;
  }
  return t0;
}

/**
 * The clear polycarbonate of an RJ45 plug. See-through, not refracting: refraction (`transmission`) would make the
 * renderer draw the whole room twice in every frame where a plug shows.
 */
const CLEAR_PLUG = new THREE.MeshPhysicalMaterial({ color: '#dbeafe', roughness: 0.25, transparent: true, opacity: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.2 });
const SERIAL_SHELL = new THREE.MeshPhysicalMaterial({ color: '#1e293b', roughness: 0.25 });

function plug(type: CableType, colour = CABLE_STYLE[type].colour): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(type === 'serial' ? 0.024 : 0.013, type === 'serial' ? 0.009 : 0.011, 0.022),
    type === 'serial' ? SERIAL_SHELL : CLEAR_PLUG,
  );
  body.position.z = 0.009;
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0055, 0.016, 12), new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5 }));
  boot.userData.dyed = 'plain';
  boot.rotation.x = Math.PI / 2;
  boot.position.z = 0.027;
  g.add(body, boot);
  return g;
}

const LABEL_STOCK = new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.7 });
const labelInks = new Map<THREE.Texture, THREE.MeshStandardMaterial>();

/** Interface names as they are written on a label: Gi0/2, Fa0/24, S0/0/0, Con. */
function shortPort(port: string): string {
  return port.replace('GigabitEthernet', 'Gi').replace('FastEthernet', 'Fa').replace('Serial', 'S').replace('Console', 'Con').replace('Auxiliary', 'Aux');
}

/**
 * The flag label every enterprise cable carries near each plug: where its other end goes. Its sides face the room, so
 * it reads when one zooms on the port.
 */
function cableLabel(text: string, row: number): THREE.Group {
  const g = new THREE.Group();
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.0138, 0.0082, 0.0008), LABEL_STOCK);
  const { texture, uv: [u0, v0, u1, v1] } = atlasLabel(text, 220, 120, '#0f172a', '600 34px Inter, sans-serif');
  let ink = labelInks.get(texture);
  if (!ink) {
    ink = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.7, depthWrite: false });
    labelInks.set(texture, ink);
  }
  const face = new THREE.PlaneGeometry(0.0132, 0.0072);
  (face.attributes.uv as THREE.BufferAttribute).set([u0, v1, u1, v1, u0, v0, u1, v0]);
  const front = new THREE.Mesh(face, ink);
  front.position.z = 0.0005;
  g.add(stock, front);
  // Hanging under the cable, just past the plug's boot; one cable in two a row lower, so neighbours do not overlap.
  g.position.set(0, -0.0085 - row * 0.0095, 0.046 + row * 0.006);
  return g;
}

function placePlug(group: THREE.Group, point: THREE.Vector3, normal: THREE.Vector3): void {
  group.position.copy(point);
  group.quaternion.setFromUnitVectors(FORWARD, normal);
}

/** Keeps the 3D cables in step with the network's cables, and draws the cable in hand. */
export class CableLayer {
  readonly group = new THREE.Group();
  private readonly views = new Map<string, THREE.Group>();
  /** Path of each cable, from its `a` end to its `b` end, for packets to travel along. */
  private readonly paths = new Map<string, { cable: Cable; curve: THREE.CatmullRomCurve3 }>();
  private readonly lanes = new Map<string, number>();
  /** Boxes of the objects standing on the bench, which cables lying on it must go around. */
  private obstacles = new Map<string, THREE.Box3[]>();
  /** Standard length of the cords of each cable (two for a link through the walls). */
  private readonly lengths = new Map<string, number[]>();

  /** Objects standing on the bench (world-space boxes). Call before the first `sync`. */
  setObstacles(boxes: THREE.Box3[]): void {
    this.obstacles.clear();
    // Each room is handled in its own coordinates, as if it were the technical room.
    const byRoom = new Map<string, THREE.Box3[]>();
    for (const box of boxes) {
      const o = roomOrigin(box.min.y, box.min.z);
      const local = box.clone().translate(new THREE.Vector3(0, -o.y, -o.z));
      byRoom.set(originKey(o), [...(byRoom.get(originKey(o)) ?? []), local]);
    }
    for (const [key, list] of byRoom) {
      // Objects close enough that no cable fits between them (a monitor beside its tower) count as one block, so
      // detours go round the whole group instead of zigzagging through it.
      const merged = list.filter((b) => b.min.y < BENCH_TOP + 0.05 && b.max.y > BENCH_TOP);
      const near = (p: THREE.Box3, q: THREE.Box3): boolean =>
        p.min.x - CLEARANCE * 2 < q.max.x && q.min.x - CLEARANCE * 2 < p.max.x && p.min.z - CLEARANCE * 2 < q.max.z && q.min.z - CLEARANCE * 2 < p.max.z;
      for (let changed = true; changed; ) {
        changed = false;
        for (let i = 0; i < merged.length && !changed; i++) {
          for (let j = i + 1; j < merged.length; j++) {
            if (near(merged[i] as THREE.Box3, merged[j] as THREE.Box3)) {
              (merged[i] as THREE.Box3).union(merged[j] as THREE.Box3);
              merged.splice(j, 1);
              changed = true;
              break;
            }
          }
        }
      }
      this.obstacles.set(key, merged);
    }
  }

  /** A path within one room: computed in the room's own coordinates, then put back in place. */
  private routeInRoom(a: THREE.Vector3, na: THREE.Vector3, b: THREE.Vector3, nb: THREE.Vector3, lane: number, radius: number): THREE.CatmullRomCurve3 {
    const o = roomOrigin(a.y, a.z);
    const shift = new THREE.Vector3(0, o.y, o.z);
    const curve = routeBetween(a.clone().sub(shift), na, b.clone().sub(shift), nb, lane, radius, this.obstacles.get(originKey(o)) ?? []);
    for (const p of curve.points) p.add(shift);
    return curve;
  }

  /** `kindOf` says what is plugged at a cable's end, for the colour code (through a patch panel: what is beyond it). */
  constructor(
    private readonly stage: Stage,
    private readonly kindOf: (end: CableEnd) => DeviceKind | null = () => null,
  ) {}

  private colourOf(cable: Cable): string {
    return ROLE_COLOUR[cableRole(cable.type, this.kindOf(cable.a), this.kindOf(cable.b))];
  }

  /** The standard length of every cord in place. */
  cords(): number[] {
    return [...this.lengths.values()].flat();
  }

  /** Add the cables that appeared, remove those that are gone. New cables unroll from the first port. */
  sync(cables: Cable[], ports: (device: string, port: string) => PortView | undefined): void {
    const wanted = new Map(cables.map((c) => [keyOf(c), c]));
    for (const [key, view] of this.views) {
      if (wanted.has(key)) continue;
      this.group.remove(view);
      view.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.views.delete(key);
      this.paths.delete(key);
      this.lanes.delete(key);
      this.lengths.delete(key);
    }
    for (const [key, cable] of wanted) {
      const shown = this.views.get(key);
      if (shown) {
        // A cord to a patch panel learns what it leads to once the far side is plugged: it takes that colour.
        const colour = this.colourOf(cable);
        if (shown.userData.colour !== colour) {
          shown.userData.colour = colour;
          shown.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
            if (o.userData.dyed && m) {
              m.color.set(colour);
              if (o.userData.dyed === 'glow') m.emissive.set(colour);
            }
          });
        }
        continue;
      }
      const pa = ports(cable.a.device, cable.a.port);
      const pb = ports(cable.b.device, cable.b.port);
      if (!pa || !pb) continue;
      const a = portFrame(pa);
      const b = portFrame(pb);
      // The first free lane: a cable keeps its lane while it stays plugged.
      const used = new Set([...this.lanes.values()]);
      let lane = 0;
      while (used.has(lane)) lane++;
      this.lanes.set(key, lane);
      const radius = CABLE_STYLE[cable.type].radius;
      const [oa, ob] = [roomOrigin(a.point.y, a.point.z), roomOrigin(b.point.y, b.point.z)];
      let curve: THREE.CatmullRomCurve3;
      let view: THREE.Group;
      if (originKey(oa) === originKey(ob)) {
        curve = this.routeInRoom(a.point, a.normal, b.point, b.normal, lane, radius);
        view = this.build(cable.type, a, b, [curve], cable, lane % 2);
      } else {
        // Between rooms, what shows is a patch cord to the rack's panel at each end: the rest is in the walls.
        const end = (p: { point: THREE.Vector3; normal: THREE.Vector3 }, o: { y: number; z: number }): { point: THREE.Vector3; normal: THREE.Vector3 } => ({ point: panelSocket(lane).add(new THREE.Vector3(0, o.y, o.z)), normal: FORWARD_NORMAL.clone() });
        const [pa, pb] = [end(a, oa), end(b, ob)];
        const cordA = this.routeInRoom(a.point, a.normal, pa.point, pa.normal, lane, radius);
        const cordB = this.routeInRoom(pb.point, pb.normal, b.point, b.normal, lane, radius);
        curve = new THREE.CatmullRomCurve3([...cordA.points, ...cordB.points], false, 'centripetal', 0.5);
        view = this.build(cable.type, a, b, [cordA, cordB], cable, lane % 2);
        const plugs = [plug(cable.type, this.colourOf(cable)), plug(cable.type, this.colourOf(cable))];
        placePlug(plugs[0] as THREE.Group, pa.point, pa.normal);
        placePlug(plugs[1] as THREE.Group, pb.point, pb.normal);
        view.add(...plugs);
      }
      this.views.set(key, view);
      this.lengths.set(key, view.userData.cords as number[]);
      this.paths.set(key, { cable, curve });
      this.group.add(view);
    }
  }

  private build(type: CableType, a: { point: THREE.Vector3; normal: THREE.Vector3 }, b: { point: THREE.Vector3; normal: THREE.Vector3 }, curves: THREE.CatmullRomCurve3[], cable: Cable, row = 0): THREE.Group {
    const style = CABLE_STYLE[type];
    const colour = this.colourOf(cable);
    const group = new THREE.Group();
    group.userData.colour = colour;
    // A little of its own light: a cable keeps its colour in the shade of the rack.
    const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.45, metalness: 0.05, emissive: colour, emissiveIntensity: 0.22 });
    const pa = plug(type, colour);
    const pb = plug(type, colour);
    placePlug(pa, a.point, a.normal);
    placePlug(pb, b.point, b.normal);
    // The cord of the standard length that reaches, as taken from the stock.
    const cords = curves.map((c) => cordLength(c.getLength()));
    group.userData.cords = cords;
    // Each end says where the other one goes, and the length of its cord.
    pa.add(cableLabel(`${cable.b.device} ${shortPort(cable.b.port)}\n${cordText(cords[0] as number)}`, row));
    pb.add(cableLabel(`${cable.a.device} ${shortPort(cable.a.port)}\n${cordText(cords[cords.length - 1] as number)}`, row));
    group.add(pa, pb);
    pb.visible = false;
    // Unroll: grow the drawn part of each tube, then show the far plug.
    for (const curve of curves) {
      const geometry = new THREE.TubeGeometry(curve, 90, style.radius, 6, false);
      const tube = new THREE.Mesh(geometry, material);
      tube.userData.dyed = 'glow';
      tube.castShadow = true;
      group.add(tube);
      const total = geometry.index ? geometry.index.count : 0;
      geometry.setDrawRange(0, 0);
      void this.stage
        .animate(0.55, (t) => geometry.setDrawRange(0, Math.floor(total * t)))
        .then(() => {
          pb.visible = true;
        });
    }
    return group;
  }

  /**
   * A glowing packet travelling along the cable between two ends, starting after `delay` seconds.
   * Several packets queued with growing delays replay an exchange in the order it happened.
   */
  pulse(from: CableEnd, to: CableEnd, colour: string, delay: number): void {
    const entry = [...this.paths.values()].find(
      (p) =>
        (p.cable.a.device === from.device && p.cable.a.port === from.port && p.cable.b.device === to.device && p.cable.b.port === to.port) ||
        (p.cable.b.device === from.device && p.cable.b.port === from.port && p.cable.a.device === to.device && p.cable.a.port === to.port),
    );
    if (!entry) return;
    const forward = entry.cable.a.device === from.device && entry.cable.a.port === from.port;
    const packet = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 14, 14), new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 14), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false }));
    packet.add(halo);
    packet.visible = false;
    this.group.add(packet);
    setTimeout(() => {
      packet.visible = true;
      void this.stage
        .animate(0.42, (t) => packet.position.copy(entry.curve.getPointAt(forward ? t : 1 - t)))
        .then(() => {
          this.group.remove(packet);
          packet.geometry.dispose();
          halo.geometry.dispose();
        });
    }, delay * 1000);
  }

  /** Draw the cable in hand from `from` to the pointer; null clears it. */
  showPreview(type: CableType, from: PortView | null, pointer: THREE.Vector3 | null): void {
    if (!from || !pointer) {
      this.dropHand();
      return;
    }
    const a = portFrame(from);
    // The hand stays above the bench, even when the pointer aims below it.
    const hand = pointer.clone();
    const floor = BENCH_TOP + 0.02 + roomOrigin(a.point.y, a.point.z).y;
    hand.y = Math.max(hand.y, floor);
    const start = a.point.clone().addScaledVector(a.normal, 0.03);
    if (!this.hand || this.hand.from !== from || this.hand.type !== type) {
      this.dropHand();
      const material = new THREE.MeshStandardMaterial({ color: CABLE_STYLE[type].colour, emissive: '#38bdf8', emissiveIntensity: 0.3, roughness: 0.45 });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      const end = plug(type);
      const fixed = plug(type);
      placePlug(fixed, a.point, a.normal);
      this.group.add(mesh, end, fixed);
      const rope = new Rope(start, hand, 1.12, 28);
      const rest = floor - 0.02 + CABLE_STYLE[type].radius;
      const constrain = (p: THREE.Vector3): void => {
        if (p.y < rest) p.y = rest;
      };
      const stop = this.stage.onFrame((dt) => {
        if (!this.hand) return;
        const h = this.hand;
        // Cable comes off the reel as the hand moves away, and stays out (it does not shorten by itself).
        const wanted = h.start.distanceTo(h.target) * 1.12;
        if (wanted > h.rope.length) h.rope.setLength(wanted);
        h.rope.step(Math.min(dt, 1 / 30), h.start, h.target, constrain);
        h.mesh.geometry.dispose();
        h.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a.point, ...h.rope.points], false, 'centripetal', 0.5), 48, CABLE_STYLE[h.type].radius, 6, false);
        const last = h.rope.points[h.rope.points.length - 1] as THREE.Vector3;
        const before = h.rope.points[h.rope.points.length - 2] as THREE.Vector3;
        placePlug(h.end, last, before.clone().sub(last).normalize());
        this.stage.wake();
      });
      this.hand = { from, type, rope, mesh, end, fixed, start, target: hand, stop };
    }
    this.hand.start.copy(start);
    this.hand.target.copy(hand);
    this.stage.wake();
  }

  private hand: { from: PortView; type: CableType; rope: Rope; mesh: THREE.Mesh; end: THREE.Group; fixed: THREE.Group; start: THREE.Vector3; target: THREE.Vector3; stop: () => void } | null = null;

  /** Put down the cable in hand. */
  private dropHand(): void {
    if (!this.hand) return;
    this.hand.stop();
    this.group.remove(this.hand.mesh, this.hand.end, this.hand.fixed);
    this.hand.mesh.geometry.dispose();
    this.hand = null;
  }

}
