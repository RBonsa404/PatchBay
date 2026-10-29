import * as THREE from 'three';
import type { Cable, CableEnd, CableType } from '@patchbay/sim-core';
import type { PortView } from './devices.js';
import { BENCH_TOP } from './room.js';
import type { Stage } from './stage.js';

/** Cable colours: the usual workshop habits (blue straight, amber crossover, light-blue console, dark serial). */
export const CABLE_STYLE: Record<CableType, { colour: string; radius: number }> = {
  straight: { colour: '#2563eb', radius: 0.0032 },
  crossover: { colour: '#f59e0b', radius: 0.0032 },
  console: { colour: '#7dd3fc', radius: 0.0028 },
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
function curveBetween(a: THREE.Vector3, na: THREE.Vector3, b: THREE.Vector3, nb: THREE.Vector3): THREE.CatmullRomCurve3 {
  const lead = 0.07;
  const a1 = a.clone().addScaledVector(na, lead);
  const b1 = b.clone().addScaledVector(nb, lead);
  const span = a1.distanceTo(b1);
  const mid = a1.clone().lerp(b1, 0.5);
  mid.y = Math.max(Math.min(a1.y, b1.y) - 0.04 - span * 0.18, BENCH_TOP + 0.015);
  mid.z = Math.max(a1.z, b1.z) + 0.04 + span * 0.05;
  return new THREE.CatmullRomCurve3([a, a1, mid, b1, b], false, 'centripetal', 0.5);
}

/** Space between two cables lying side by side on the bench. */
const LANE = 0.016;

/**
 * Where a plugged cable runs, the way a technician would lay it: out of the port, a bend down to the bench, then
 * flat along the bench to the other device. Each cable has its own lane (`lane`), so neighbours lie side by side
 * instead of crossing in the air. Two ports in the rack, close to each other, get a short patch loop instead.
 */
function routeBetween(a: THREE.Vector3, na: THREE.Vector3, b: THREE.Vector3, nb: THREE.Vector3, lane: number, radius: number): THREE.CatmullRomCurve3 {
  const lead = 0.05;
  const a1 = a.clone().addScaledVector(na, lead);
  const b1 = b.clone().addScaledVector(nb, lead);
  const rest = BENCH_TOP + radius + 0.001;
  const highA = a.y - BENCH_TOP > 0.1;
  const highB = b.y - BENCH_TOP > 0.1;
  const offset = lane * LANE;

  if (highA && highB && a1.distanceTo(b1) < 0.6) {
    // Patch loop in front of the rack: down and out, each cable a little lower and further out than the last.
    const mid = a1.clone().lerp(b1, 0.5);
    mid.y = Math.min(a1.y, b1.y) - 0.05 - offset * 0.6;
    mid.z = Math.max(a1.z, b1.z) + 0.03 + offset;
    mid.x += a1.x <= b1.x ? 0.12 + offset : -0.12 - offset;
    return new THREE.CatmullRomCurve3([a, a1, mid, b1, b], false, 'centripetal', 0.5);
  }

  // Touch-down points on the bench, just past each port, shifted into this cable's lane.
  const down = (p: THREE.Vector3, n: THREE.Vector3, high: boolean): THREE.Vector3[] => {
    const flat = new THREE.Vector3(n.x, 0, n.z).normalize();
    if (!high) {
      const t = p.clone().addScaledVector(flat, 0.04 + offset);
      t.y = rest;
      return [t];
    }
    // From the rack: hang straight down in front of it, then rest on the bench's back edge.
    const fall = p.clone().addScaledVector(flat, 0.02 + offset * 0.5);
    fall.y = (p.y + rest) / 2;
    const t = p.clone().addScaledVector(flat, 0.09 + offset);
    t.y = rest;
    return [fall, t];
  };
  const da = down(a1, na, highA);
  const db = down(b1, nb, highB).reverse();
  const ta = da[da.length - 1] as THREE.Vector3;
  const tb = db[0] as THREE.Vector3;
  // Lie flat: one point in the middle of the run, on the bench, in the lane.
  const mid = ta.clone().lerp(tb, 0.5);
  mid.y = rest;
  mid.z += offset * 0.5;
  return new THREE.CatmullRomCurve3([a, a1, ...da, mid, ...db, b1, b], false, 'centripetal', 0.5);
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
      const curve = routeBetween(a.point, a.normal, b.point, b.normal, lane, CABLE_STYLE[cable.type].radius);
      const view = this.build(cable.type, a, b, curve);
      this.views.set(key, view);
      this.paths.set(key, { cable, curve });
      this.group.add(view);
    }
  }

  private build(type: CableType, a: { point: THREE.Vector3; normal: THREE.Vector3 }, b: { point: THREE.Vector3; normal: THREE.Vector3 }, curve: THREE.CatmullRomCurve3): THREE.Group {
    const style = CABLE_STYLE[type];
    const group = new THREE.Group();
    const geometry = new THREE.TubeGeometry(curve, 160, style.radius, 10, false);
    const tube = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: style.colour, roughness: 0.45, metalness: 0.05 }));
    tube.castShadow = true;
    const pa = plug(type);
    const pb = plug(type);
    placePlug(pa, a.point, a.normal);
    placePlug(pb, b.point, b.normal);
    group.add(tube, pa, pb);

    // Unroll: grow the drawn part of the tube, then show the far plug.
    const total = geometry.index ? geometry.index.count : 0;
    geometry.setDrawRange(0, 0);
    pb.visible = false;
    void this.stage
      .animate(0.55, (t) => geometry.setDrawRange(0, Math.floor(total * t)))
      .then(() => {
        pb.visible = true;
      });
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
    const curve = curveBetween(a.point, a.normal, pointer, new THREE.Vector3(0, 1, 0));
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
