import * as THREE from 'three';

/**
 * The player, seen from inside: eyes at 1.62 m, walking on the floor and stopped by the furniture and the walls.
 * There is no body to draw: the camera is the technician's head.
 */

/** Furniture footprints seen from above (x0, x1, z0, z1), in metres: the room's layout in `scene/room.ts`. */
const OBSTACLES: [number, number, number, number][] = [
  [-1.6, 1.6, -0.3, 0.8], // workbench
  [-0.36, 0.36, -0.96, -0.33], // rack and its cable managers
  [2.45, 3.05, -1.55, -0.65], // server cabinet
  [-3.5, -3.3, -0.75, -0.45], // fire extinguisher
  [-3.5, -3.0, 0.1, 2.1], // shelving
  [-2.85, -2.25, 0.75, 1.78], // cartons
  [2.82, 3.5, -0.4, 1.65], // row of cabinets
  [2.97, 3.5, 1.95, 3.25], // cupboard under the pegboard
  [1.9, 2.5, 0.53, 0.97], // tool trolley
  [-1.65, -0.15, 2.85, 3.6], // desk
  [-1.25, -0.65, 2.2, 2.8], // chair
  [1.7, 2.2, -1.6, -1.4], // stepladder
  [0.1, 0.4, 3.15, 3.45], // bin
];
const ROOM = { x0: -3.5, x1: 3.5, z0: -1.6, z1: 3.6 };
const RADIUS = 0.24;
const WALK = 1.35;
const RUN = 2.6;
const EYE = 1.62;
const MAX_PITCH = 1.35;
/** Looking at the bench and the rack from a standing position. */
const HOME_YAW = Math.PI;
const HOME_PITCH = -0.26;

export interface MoveInput {
  /** -1 … 1: right is +x, forward is +y (relative to where the player looks). */
  x: number;
  y: number;
  run: boolean;
}

export class Player {
  x = 0;
  z = 1.15;
  yaw = HOME_YAW;
  pitch = HOME_PITCH;
  private speed = 0;
  private phase = 0;

  /** Where the eyes are, with the slight bob of walking. */
  get eye(): THREE.Vector3 {
    return new THREE.Vector3(this.x, EYE + Math.sin(this.phase * 2) * 0.012 * Math.min(1, this.speed / WALK), this.z);
  }

  /** The direction the player looks in. */
  get look(): THREE.Vector3 {
    const c = Math.cos(this.pitch);
    return new THREE.Vector3(Math.sin(this.yaw) * c, Math.sin(this.pitch), Math.cos(this.yaw) * c);
  }

  /** Face the bench again. */
  faceHome(): void {
    this.yaw = HOME_YAW;
    this.pitch = HOME_PITCH;
  }

  turn(yaw: number, pitch: number): void {
    this.yaw += yaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + pitch, -MAX_PITCH, MAX_PITCH);
  }

  lookAlong(direction: THREE.Vector3): void {
    const d = direction.clone().normalize();
    this.yaw = Math.atan2(d.x, d.z);
    this.pitch = THREE.MathUtils.clamp(Math.asin(d.y), -MAX_PITCH, MAX_PITCH);
  }

  /** Walk according to `input`. `step` is true on the frame a foot touches the floor. */
  update(dt: number, input: MoveInput): { moved: boolean; step: boolean } {
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const wish = forward.multiplyScalar(input.y).addScaledVector(right, input.x);
    const amount = Math.min(1, wish.length());
    const target = amount > 0.05 ? (input.run ? RUN : WALK) * amount : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * 10);
    if (amount <= 0.05) return { moved: false, step: false };

    wish.normalize();
    const moved = this.move(wish.x * this.speed * dt, wish.z * this.speed * dt);
    const before = Math.floor(this.phase / Math.PI);
    if (moved) this.phase += dt * this.speed * 5;
    return { moved, step: moved && Math.floor(this.phase / Math.PI) !== before };
  }

  /** Move by (dx, dz), sliding along walls and furniture instead of passing through them. */
  private move(dx: number, dz: number): boolean {
    const free = (x: number, z: number): boolean =>
      x > ROOM.x0 + RADIUS && x < ROOM.x1 - RADIUS && z > ROOM.z0 + RADIUS && z < ROOM.z1 - RADIUS &&
      !OBSTACLES.some(([x0, x1, z0, z1]) => x > x0 - RADIUS && x < x1 + RADIUS && z > z0 - RADIUS && z < z1 + RADIUS);
    const [x, z] = [this.x, this.z];
    if (free(x + dx, z + dz)) [this.x, this.z] = [x + dx, z + dz];
    else if (free(x + dx, z)) this.x = x + dx;
    else if (free(x, z + dz)) this.z = z + dz;
    return this.x !== x || this.z !== z;
  }
}
