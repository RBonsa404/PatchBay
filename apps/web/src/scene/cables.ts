import * as THREE from 'three';
import type { Cable, CableEnd, CableType } from '@patchbay/sim-core';
import type { PortView } from './devices.js';
import { BENCH_TOP, MANAGER, RACK, roomOrigin } from './room.js';
import type { Stage } from './stage.js';

/** Cable colours: the usual workshop habits (blue straight, amber crossover, light-blue console, dark serial). */
export const CABLE_STYLE: Record<CableType, { colour: string; radius: number }> = {
  straight: { colour: '#2563eb', radius: 0.0032 },
  crossover: { colour: '#f59e0b', radius: 0.0032 },
  console: { colour: '#2f9fd6', radius: 0.0028 },
  serial: { colour: '#334155', radius: 0.0045 },
};

const keyOf = (c: Cable): string => `${c.type}|${c.a.device}:${c.a.port}|${c.b.device}:${c.b.port}`;
const FORWARD = new THREE.Vector3(0, 0, 1);

/** World position of a port's mouth and the direction pointing out of its panel. */
export function portFrame(port: PortView): { point: THREE.Vector3; normal: THREE.Vector3 } {
  const point = port.mouth.getWorldPosition(new THREE.Vector3());
  const q = port.mouth.getWorldQuaternion(new THREE.Quaternion());
  return { point, normal: FORWARD.clone().applyQuaternion(q) };
}

/** A hanging path: out of each port, then a sag between them that never goes through the bench (cable in hand). */
function curveBetween(a: THREE.Vector3, na: THREE.Vector3, b: THREE.Vector3, nb: THREE.Vector3, obstacles: THREE.Box3[]): THREE.CatmullRomCurve3 {
  const lead = 0.07;
  const a1 = a.clone().addScaledVector(na, lead);
  const b1 = b.clone().addScaledVector(nb, lead);
  const span = a1.distanceTo(b1);
  const mid = a1.clone().lerp(b1, 0.5);
  mid.y = Math.max(Math.min(a1.y, b1.y) - 0.04 - span * 0.18, BENCH_TOP + 0.015 + roomOrigin(a.y, a.z).y);
  mid.z = Math.max(a1.z, b1.z) + 0.04 + span * 0.05;
  // Held over whatever stands between the two ends, rather than through it.
  const margin = 0.02;
  for (const box of obstacles) {
    if (segmentHitsRect(a1, b1, box.min.x - margin, box.max.x + margin, box.min.z - margin, box.max.z + margin) !== null) mid.y = Math.max(mid.y, box.max.y + 0.04);
  }
  return new THREE.CatmullRomCurve3([a, a1, mid, b1, b], false, 'centripetal', 0.5);
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

  if (highA && highB && a1.distanceTo(b1) < 0.6) {
    // Patch cord: along the gear to the nearest cable manager, along the manager, and back along the other device.
    const side = (a1.x + b1.x) / 2 < RACK.x ? -1 : 1;
    // A soft bow towards the manager, staying inside the rack's width whatever the distance between the ports.
    const x = RACK.x + side * Math.min(MANAGER.x - 0.05, Math.max(Math.abs(a1.x), Math.abs(b1.x)) + 0.03 + (lane % 4) * 0.005);
    const z = frontZ + 0.03;
    const drop = 0.016 + (lane % 4) * 0.004;
    return new THREE.CatmullRomCurve3([a, a1, new THREE.Vector3(x - side * 0.03, a1.y - drop * 0.6, z), new THREE.Vector3(x, (a1.y + b1.y) / 2 - drop, z), new THREE.Vector3(x - side * 0.03, b1.y + drop * 0.6, z), b1, b], false, 'centripetal', 0.5);
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

function plug(type: CableType): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(type === 'serial' ? 0.024 : 0.013, type === 'serial' ? 0.009 : 0.011, 0.022),
    new THREE.MeshPhysicalMaterial({ color: type === 'serial' ? '#1e293b' : '#dbeafe', roughness: 0.25, transmission: type === 'serial' ? 0 : 0.6, thickness: 0.01 }),
  );
  body.position.z = 0.009;
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.0055, 0.016, 12), new THREE.MeshStandardMaterial({ color: CABLE_STYLE[type].colour, roughness: 0.5 }));
  boot.rotation.x = Math.PI / 2;
  boot.position.z = 0.027;
  g.add(body, boot);
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

  private preview: THREE.Mesh | null = null;
  private previewPlug: THREE.Group | null = null;

  constructor(private readonly stage: Stage) {}

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
    }
    for (const [key, cable] of wanted) {
      if (this.views.has(key)) continue;
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
        view = this.build(cable.type, a, b, [curve]);
      } else {
        // Between rooms, what shows is a patch cord to the rack's panel at each end: the rest is in the walls.
        const end = (p: { point: THREE.Vector3; normal: THREE.Vector3 }, o: { y: number; z: number }): { point: THREE.Vector3; normal: THREE.Vector3 } => ({ point: panelSocket(lane).add(new THREE.Vector3(0, o.y, o.z)), normal: FORWARD_NORMAL.clone() });
        const [pa, pb] = [end(a, oa), end(b, ob)];
        const cordA = this.routeInRoom(a.point, a.normal, pa.point, pa.normal, lane, radius);
        const cordB = this.routeInRoom(pb.point, pb.normal, b.point, b.normal, lane, radius);
        curve = new THREE.CatmullRomCurve3([...cordA.points, ...cordB.points], false, 'centripetal', 0.5);
        view = this.build(cable.type, a, b, [cordA, cordB]);
        const plugs = [plug(cable.type), plug(cable.type)];
        placePlug(plugs[0] as THREE.Group, pa.point, pa.normal);
        placePlug(plugs[1] as THREE.Group, pb.point, pb.normal);
        view.add(...plugs);
      }
      this.views.set(key, view);
      this.paths.set(key, { cable, curve });
      this.group.add(view);
    }
  }

  private build(type: CableType, a: { point: THREE.Vector3; normal: THREE.Vector3 }, b: { point: THREE.Vector3; normal: THREE.Vector3 }, curves: THREE.CatmullRomCurve3[]): THREE.Group {
    const style = CABLE_STYLE[type];
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: style.colour, roughness: 0.45, metalness: 0.05 });
    const pa = plug(type);
    const pb = plug(type);
    placePlug(pa, a.point, a.normal);
    placePlug(pb, b.point, b.normal);
    group.add(pa, pb);
    pb.visible = false;
    // Unroll: grow the drawn part of each tube, then show the far plug.
    for (const curve of curves) {
      const geometry = new THREE.TubeGeometry(curve, 200, style.radius, 10, false);
      const tube = new THREE.Mesh(geometry, material);
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
    if (this.preview) {
      this.group.remove(this.preview);
      this.preview.geometry.dispose();
      this.preview = null;
    }
    if (!from || !pointer) {
      if (this.previewPlug) this.group.remove(this.previewPlug);
      this.previewPlug = null;
      return;
    }
    const a = portFrame(from);
    // The hand stays above the bench, even when the pointer aims below it.
    const hand = pointer.clone();
    hand.y = Math.max(hand.y, BENCH_TOP + 0.02 + roomOrigin(a.point.y, a.point.z).y);
    const curve = curveBetween(a.point, a.normal, hand, new THREE.Vector3(0, 1, 0), []);
    this.preview = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 64, CABLE_STYLE[type].radius, 8, false),
      new THREE.MeshStandardMaterial({ color: CABLE_STYLE[type].colour, emissive: '#38bdf8', emissiveIntensity: 0.35, transparent: true, opacity: 0.85 }),
    );
    this.group.add(this.preview);
    if (!this.previewPlug) {
      this.previewPlug = plug(type);
      placePlug(this.previewPlug, a.point, a.normal);
      this.group.add(this.previewPlug);
    }
  }
}
