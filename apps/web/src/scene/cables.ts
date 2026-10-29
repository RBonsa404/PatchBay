import * as THREE from 'three';
import type { Cable, CableType } from '@patchbay/sim-core';
import type { PortView } from './devices.js';
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

/** A hanging path: out of each port, then a sag between them that never goes through the bench. */
function curveBetween(a: THREE.Vector3, na: THREE.Vector3, b: THREE.Vector3, nb: THREE.Vector3): THREE.CatmullRomCurve3 {
  const lead = 0.07;
  const a1 = a.clone().addScaledVector(na, lead);
  const b1 = b.clone().addScaledVector(nb, lead);
  const span = a1.distanceTo(b1);
  const mid = a1.clone().lerp(b1, 0.5);
  mid.y = Math.max(Math.min(a1.y, b1.y) - 0.04 - span * 0.18, 0.775);
  mid.z = Math.max(a1.z, b1.z) + 0.04 + span * 0.05;
  return new THREE.CatmullRomCurve3([a, a1, mid, b1, b], false, 'centripetal', 0.5);
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
    }
    for (const [key, cable] of wanted) {
      if (this.views.has(key)) continue;
      const pa = ports(cable.a.device, cable.a.port);
      const pb = ports(cable.b.device, cable.b.port);
      if (!pa || !pb) continue;
      const view = this.build(cable.type, portFrame(pa), portFrame(pb));
      this.views.set(key, view);
      this.group.add(view);
    }
  }

  private build(type: CableType, a: { point: THREE.Vector3; normal: THREE.Vector3 }, b: { point: THREE.Vector3; normal: THREE.Vector3 }): THREE.Group {
    const style = CABLE_STYLE[type];
    const group = new THREE.Group();
    const curve = curveBetween(a.point, a.normal, b.point, b.normal);
    const geometry = new THREE.TubeGeometry(curve, 96, style.radius, 10, false);
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
