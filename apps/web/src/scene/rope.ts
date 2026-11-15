import * as THREE from 'three';

/**
 * A cable as a chain of points that keep their spacing, pulled down by gravity and kept out of solid things: the way
 * a real cord hangs between two supports, or swings from the hand. Position-based dynamics (Verlet integration, then
 * distance constraints solved a few times per step), cheap enough to run every frame for the cable in hand.
 */

/** Keeps a point out of solid things: change it in place. */
export type Constraint = (p: THREE.Vector3) => void;

const GRAVITY = 9.81;

export class Rope {
  readonly points: THREE.Vector3[];
  private readonly previous: THREE.Vector3[];
  private segment: number;

  /** A rope from `a` to `b`, `slack` times longer than the straight line, made of `count` segments. */
  constructor(a: THREE.Vector3, b: THREE.Vector3, slack = 1.08, count = 24) {
    this.segment = (a.distanceTo(b) * slack) / count;
    this.points = Array.from({ length: count + 1 }, (_, i) => a.clone().lerp(b, i / count));
    this.previous = this.points.map((p) => p.clone());
  }

  /** Let out or take in cable, so that it stays `slack` times longer than the distance between its ends. */
  setLength(length: number): void {
    this.segment = length / (this.points.length - 1);
  }

  get length(): number {
    return this.segment * (this.points.length - 1);
  }

  /** One step of `dt` seconds with both ends held at `a` and `b`. */
  step(dt: number, a: THREE.Vector3, b: THREE.Vector3, constrain: Constraint | null = null, iterations = 14, damping = 0.985): void {
    const n = this.points.length - 1;
    const fall = GRAVITY * dt * dt;
    for (let i = 1; i < n; i++) {
      const p = this.points[i] as THREE.Vector3;
      const q = this.previous[i] as THREE.Vector3;
      const vx = (p.x - q.x) * damping;
      const vy = (p.y - q.y) * damping;
      const vz = (p.z - q.z) * damping;
      q.copy(p);
      p.set(p.x + vx, p.y + vy - fall, p.z + vz);
    }
    for (let k = 0; k < iterations; k++) {
      (this.points[0] as THREE.Vector3).copy(a);
      (this.points[n] as THREE.Vector3).copy(b);
      for (let i = 0; i < n; i++) {
        const p = this.points[i] as THREE.Vector3;
        const q = this.points[i + 1] as THREE.Vector3;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const dz = q.z - p.z;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const f = (d - this.segment) / d / 2;
        // Ends are held: the free point takes the whole correction.
        const fp = i === 0 ? 0 : i + 1 === n ? 2 * f : f;
        const fq = i + 1 === n ? 0 : i === 0 ? 2 * f : f;
        p.set(p.x + dx * fp, p.y + dy * fp, p.z + dz * fp);
        q.set(q.x - dx * fq, q.y - dy * fq, q.z - dz * fq);
      }
      if (constrain) for (let i = 1; i < n; i++) constrain(this.points[i] as THREE.Vector3);
    }
    (this.points[0] as THREE.Vector3).copy(a);
    (this.points[n] as THREE.Vector3).copy(b);
  }

  /** Let the rope come to rest between `a` and `b` (for a cable that is laid once and stays). */
  settle(a: THREE.Vector3, b: THREE.Vector3, constrain: Constraint | null = null, steps = 140): THREE.Vector3[] {
    for (let s = 0; s < steps; s++) this.step(1 / 60, a, b, constrain, 10, 0.9);
    return this.points.map((p) => p.clone());
  }
}

/** The shape of a cord hanging between two supports, `slack` times longer than the gap. */
export function drape(a: THREE.Vector3, b: THREE.Vector3, slack: number, constrain: Constraint | null = null, count = 16): THREE.Vector3[] {
  return new Rope(a, b, slack, count).settle(a, b, constrain);
}

/**
 * A polyline with its corners rounded to `radius`, as a cable bends: it cannot fold sharply. Each corner becomes a
 * short arc (a quadratic curve between the points `radius` before and after it).
 */
export function fillet(points: THREE.Vector3[], radius: number, samples = 6): THREE.Vector3[] {
  if (points.length < 3) return points.map((p) => p.clone());
  const out: THREE.Vector3[] = [(points[0] as THREE.Vector3).clone()];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1] as THREE.Vector3;
    const p = points[i] as THREE.Vector3;
    const next = points[i + 1] as THREE.Vector3;
    const r = Math.min(radius, p.distanceTo(prev) / 2, p.distanceTo(next) / 2);
    const from = p.clone().addScaledVector(prev.clone().sub(p).normalize(), r);
    const to = p.clone().addScaledVector(next.clone().sub(p).normalize(), r);
    const curve = new THREE.QuadraticBezierCurve3(from, p, to);
    for (let s = 0; s <= samples; s++) out.push(curve.getPoint(s / samples));
  }
  out.push((points[points.length - 1] as THREE.Vector3).clone());
  return out;
}
