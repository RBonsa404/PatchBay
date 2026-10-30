import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import clubLogoUrl from '../assets/club-logo-160.webp';
import { contactShadow } from '../scene/materials.js';

/**
 * The player's character: a club technician in the club's polo, seen from behind. Built from simple shapes (no
 * download), with a procedural walk cycle. It walks on the floor, turns towards where it goes, and is stopped by the
 * furniture and the walls.
 */

/** Furniture footprints seen from above (x0, x1, z0, z1), in metres: the room's layout in `scene/room.ts`. */
const OBSTACLES: [number, number, number, number][] = [
  [-1.6, 1.6, -0.3, 0.8], // workbench
  [-0.36, 0.36, -0.96, -0.33], // rack and its cable managers
  [2.45, 3.05, -1.55, -0.65], // server cabinet
  [-3.5, -3.3, -0.75, -0.45], // fire extinguisher
];
const ROOM = { x0: -3.5, x1: 3.5, z0: -1.6, z1: 3.6 };
const RADIUS = 0.24;
const WALK = 1.35;
const RUN = 2.6;
/** How long the arm stays out when the character reaches for a port, in seconds. */
const REACH_TIME = 0.7;

const skin = new THREE.MeshStandardMaterial({ color: '#8b5532', roughness: 0.65 });

function limb(length: number, radius: number, material: THREE.Material): THREE.Group {
  // A limb hangs from its pivot (shoulder or hip), so it can swing.
  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - radius * 2, 6, 12), material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

export interface MoveInput {
  /** -1 … 1: right is +x, forward is +y (relative to the camera). */
  x: number;
  y: number;
  run: boolean;
}

export class Avatar {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legs: [THREE.Group, THREE.Group];
  private readonly arms: [THREE.Group, THREE.Group];
  private readonly head: THREE.Group;
  private heading = Math.PI; // facing -z, towards the bench
  private phase = 0;
  private speed = 0;
  private time = 0;
  private forearm!: THREE.Group;
  private gesture: { time: number; heading: number; lift: number } | null = null;

  constructor() {
    const polo = new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.75 });
    const trousers = new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.8 });
    const shoe = new THREE.MeshStandardMaterial({ color: '#0b0f17', roughness: 0.5 });
    const amber = new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.6 });

    // Legs from the hips (0.9 m), with shoes.
    const leg = (x: number): THREE.Group => {
      const l = limb(0.86, 0.068, trousers);
      l.position.set(x, 0.9, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), shoe);
      foot.position.set(0, -0.86, 0.04);
      foot.castShadow = true;
      l.add(foot);
      return l;
    };
    this.legs = [leg(-0.1), leg(0.1)];

    // Hips (trousers) joining the legs, then the torso in the club polo: an amber band at the waist, an amber
    // collar, and the club's logo on the back.
    const hips = new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.16, 0.2, 3, 0.06), trousers);
    hips.position.y = 0.92;
    hips.castShadow = true;
    const torso = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.52, 0.22, 4, 0.09), polo);
    torso.position.y = 1.24;
    torso.castShadow = true;
    const band = new THREE.Mesh(new RoundedBoxGeometry(0.405, 0.035, 0.225, 2, 0.015), amber);
    band.position.y = 1.02;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.016, 8, 20), amber);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.5;
    const logoTex = new THREE.TextureLoader().load(clubLogoUrl);
    logoTex.colorSpace = THREE.SRGBColorSpace;
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.07, 32), new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.7 }));
    logo.position.set(0, 1.3, -0.112);
    logo.rotation.y = Math.PI;

    // Arms from the shoulders: short polo sleeve, then forearm and hand.
    const arm = (x: number): THREE.Group => {
      const a = limb(0.28, 0.052, polo);
      a.position.set(x, 1.42, 0);
      // A round shoulder joint so the sleeve grows out of the torso.
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 12), polo);
      shoulder.position.set(-Math.sign(x) * 0.01, 0.01, 0);
      a.add(shoulder);
      const fore = limb(0.27, 0.04, skin);
      fore.position.y = -0.26;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), skin);
      hand.scale.set(0.8, 1.1, 0.6);
      hand.position.y = -0.3;
      fore.add(hand);
      a.add(fore);
      if (x > 0) this.forearm = fore;
      return a;
    };
    this.arms = [arm(-0.235), arm(0.235)];

    // Head with short hair and a headset (a network technician on duty).
    this.head = new THREE.Group();
    this.head.position.y = 1.66;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 18), skin);
    face.scale.set(0.9, 1.05, 0.95);
    face.castShadow = true;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.113, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: '#15100d', roughness: 0.9 }));
    hair.scale.set(0.92, 1.0, 0.98);
    hair.position.y = 0.012;
    const headband = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.012, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: '#0b1e3f', roughness: 0.5 }));
    headband.position.y = 0.02;
    const cupMaterial = new THREE.MeshStandardMaterial({ color: '#0b1e3f', roughness: 0.4, metalness: 0.3 });
    for (const side of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.025, 20), cupMaterial);
      cup.rotation.z = Math.PI / 2;
      cup.position.set(side * 0.105, -0.005, 0);
      this.head.add(cup);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.048, 0.1, 12), skin);
    neck.position.y = 1.54;
    // Face: eyes, brows and a smile, on the front (+z) of the head.
    const dark = new THREE.MeshStandardMaterial({ color: '#15100d', roughness: 0.6 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), dark);
      eye.position.set(side * 0.036, 0.012, 0.096);
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 8), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.4 }));
      white.scale.set(1, 0.8, 0.5);
      white.position.set(side * 0.036, 0.012, 0.09);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.007, 0.01), dark);
      brow.position.set(side * 0.037, 0.04, 0.097);
      this.head.add(white, eye, brow);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0045, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: '#5b2b1a', roughness: 0.6 }));
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.035, 0.1);
    this.head.add(face, hair, headband, smile);

    this.body.add(...this.legs, hips, torso, band, collar, logo, ...this.arms, neck, this.head);
    const shadow = contactShadow(0.7, 0.7, 0.45);
    shadow.position.y = 0.004;
    this.root.add(this.body, shadow);
    this.root.rotation.y = this.heading;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Point the character looks at, for the camera to follow. */
  get facing(): number {
    return this.heading;
  }

  place(x: number, z: number, heading = Math.PI): void {
    this.root.position.set(x, 0, z);
    this.heading = heading;
    this.root.rotation.y = heading;
  }

  /**
   * Walk according to `input`, relative to the camera's horizontal direction `forward`. Returns true when the
   * character moved.
   */
  update(dt: number, input: MoveInput, forward: THREE.Vector3): boolean {
    this.time += dt;
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const wish = forward.clone().multiplyScalar(input.y).addScaledVector(right, input.x);
    const amount = Math.min(1, wish.length());
    const target = amount > 0.05 ? (input.run ? RUN : WALK) * amount : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);

    let moved = false;
    if (amount > 0.05) {
      wish.normalize();
      // Turn smoothly towards the direction of travel.
      const want = Math.atan2(wish.x, wish.z);
      let delta = want - this.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      this.heading += delta * Math.min(1, dt * 12);
      this.root.rotation.y = this.heading;
      moved = this.move(wish.x * this.speed * dt, wish.z * this.speed * dt);
    }

    // Walk cycle: legs and arms swing in opposition, the body bobs; at rest, a slow breath.
    const stride = this.speed / WALK;
    this.phase += dt * (4 + this.speed * 4.5);
    const swing = Math.sin(this.phase) * 0.55 * Math.min(1, stride);
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.8;
    this.arms[1].rotation.x = swing * 0.8;
    this.arms[0].rotation.z = -0.06;
    this.arms[1].rotation.z = 0.06;
    this.reachOut(dt, amount > 0.05);
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.03 * Math.min(1, stride) + Math.sin(this.time * 1.6) * 0.004;
    this.head.rotation.y = Math.sin(this.time * 0.35) * 0.12 * (1 - Math.min(1, stride));
    return moved;
  }

  /** Turn towards `point` and stretch the right arm to it: plugging a cable in, opening a device. */
  reach(point: THREE.Vector3): void {
    const p = this.root.position;
    const shoulderY = 1.42;
    const distance = Math.hypot(point.x - p.x, point.z - p.z);
    this.gesture = { time: 0, heading: Math.atan2(point.x - p.x, point.z - p.z), lift: -Math.atan2(distance, shoulderY - point.y) };
  }

  /** Play the current gesture on top of the walk cycle. Walking keeps the arm's motion but not the turn. */
  private reachOut(dt: number, walking: boolean): void {
    if (!this.gesture) return;
    const g = this.gesture;
    g.time += dt;
    const t = g.time / REACH_TIME;
    if (t >= 1) {
      this.gesture = null;
      this.forearm.rotation.x = 0;
      return;
    }
    if (!walking) {
      const delta = Math.atan2(Math.sin(g.heading - this.heading), Math.cos(g.heading - this.heading));
      this.heading += delta * Math.min(1, dt * 12);
      this.root.rotation.y = this.heading;
    }
    // Up quickly, a short hold at the port, back down.
    const e = Math.min(1, Math.min(t / 0.3, (1 - t) / 0.3));
    const smooth = e * e * (3 - 2 * e);
    const arm = this.arms[1];
    arm.rotation.x += (g.lift - arm.rotation.x) * smooth;
    this.forearm.rotation.x = -0.25 * smooth;
  }

  /** Move by (dx, dz), sliding along walls and furniture instead of passing through them. */
  private move(dx: number, dz: number): boolean {
    const p = this.root.position;
    const free = (x: number, z: number): boolean =>
      x > ROOM.x0 + RADIUS && x < ROOM.x1 - RADIUS && z > ROOM.z0 + RADIUS && z < ROOM.z1 - RADIUS &&
      !OBSTACLES.some(([x0, x1, z0, z1]) => x > x0 - RADIUS && x < x1 + RADIUS && z > z0 - RADIUS && z < z1 + RADIUS);
    const before = p.clone();
    if (free(p.x + dx, p.z + dz)) p.set(p.x + dx, 0, p.z + dz);
    else if (free(p.x + dx, p.z)) p.x += dx;
    else if (free(p.x, p.z + dz)) p.z += dz;
    return !p.equals(before);
  }
}
