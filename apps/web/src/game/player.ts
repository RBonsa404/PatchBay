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
  [-3.5, -3.1, -0.8, -0.4], // fire extinguisher
  [-3.5, -3.0, 0.1, 2.1], // shelving
  [2.82, 3.5, -0.4, 1.65], // row of cabinets
  [2.97, 3.5, 1.95, 3.25], // cupboard under the pegboard
  [-1.65, -0.15, 2.85, 3.6], // desk
  [-1.25, -0.65, 2.2, 2.8], // chair
  [0.1, 0.4, 3.15, 3.45], // bin
];
const ROOM = { x0: -3.5, x1: 3.5, z0: -1.6, z1: 3.6 };
/** The rest of the building: the corridor, the doorways leading to it (already narrowed for the body), and the lab room. */
const CORRIDOR = { x0: -4.5, x1: 4.5, z0: -3.4, z1: -1.6 };
const LAB = { x0: -3.5, x1: 3.5, z0: -8.6, z1: -3.4 };
const DOORWAYS = [
  { x0: -3.19, x1: -2.71, z0: -1.95, z1: -1.25 },
  { x0: -3.19, x1: -2.71, z0: -3.75, z1: -3.05 },
];
const LAB_OBSTACLES: [number, number, number, number][] = [
  [-1.6, 1.6, -7.3, -6.2], // bench
  [-0.36, 0.36, -7.96, -7.33], // rack
  [1.95, 3.5, -8.5, -4.05], // workstations
  [-3.5, -2.95, -8.6, -7.3], // lockers
];
const OFFICE_OBSTACLES: [number, number, number, number][] = [
  [-1.6, 1.6, -0.3, 0.8], // bench
  [-0.36, 0.36, -0.96, -0.33], // rack
  [1.95, 3.5, -1.45, 2.35], // workstations
  [-3.5, -2.95, -0.1, 2.5], // low cabinet
];
/** The stairs: two flights either side of z = -2.5, joined by a landing (see `BUILDING.stairs`), already narrowed. */
const FLIGHT_UP = { x0: 4.2, x1: 7, z0: -3.16, z1: -2.74 };
const FLIGHT_DOWN = { x0: 4.2, x1: 7, z0: -2.26, z1: -1.84 };
const LANDING = { x0: 6.9, x1: 7.76, z0: -3.16, z1: -1.84 };
const STAIR_START = 4.5;
const STAIR_RUN = 2.5;
const FLOOR_HEIGHT = 3.3;
const RADIUS = 0.24;
const WALK = 1.35;
const RUN = 2.6;
const EYE = 1.62;
const MAX_PITCH = 1.35;
/** Looking at the bench and the rack from a standing position. */
const HOME_YAW = Math.PI;
const HOME_PITCH = -0.34;

export interface MoveInput {
  /** -1 … 1: right is +x, forward is +y (relative to where the player looks). */
  x: number;
  y: number;
  run: boolean;
}

export class Player {
  x = 0;
  z = 1.75;
  yaw = HOME_YAW;
  pitch = HOME_PITCH;
  private speed = 0;
  private phase = 0;
  private building = false;
  private stairs = false;
  /** 0 on the ground floor (and on the lower flight), 1 upstairs (and on the upper flight). */
  private floor = 0;
  private y = 0;

  /** Open the building to the player (otherwise, the technical room only); `stairs` adds the first floor. */
  enterBuilding(stairs: boolean): void {
    this.building = true;
    this.stairs = stairs;
  }

  /** Height of the floor under the player. */
  get floorY(): number {
    return this.y;
  }

  private inBox(x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }): boolean {
    return x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;
  }

  /** The floor's height at (x, z), for the part of the building the player is in. */
  private heightAt(x: number, z: number): number {
    if (this.stairs) {
      if (this.inBox(x, z, LANDING)) return FLOOR_HEIGHT / 2;
      const along = Math.min(1, Math.max(0, (x - STAIR_START) / STAIR_RUN));
      if (this.floor === 0 && this.inBox(x, z, FLIGHT_UP)) return (along * FLOOR_HEIGHT) / 2;
      if (this.floor === 1 && this.inBox(x, z, FLIGHT_DOWN)) return FLOOR_HEIGHT / 2 + ((1 - along) * FLOOR_HEIGHT) / 2;
    }
    return this.floor === 1 ? FLOOR_HEIGHT : 0;
  }

  /** Where the eyes are, with the slight bob of walking. */
  get eye(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.y + EYE + Math.sin(this.phase * 2) * 0.012 * Math.min(1, this.speed / WALK), this.z);
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
    const inArea = (x: number, z: number, area: typeof ROOM): boolean => x > area.x0 + RADIUS && x < area.x1 - RADIUS && z > area.z0 + RADIUS && z < area.z1 - RADIUS;
    const inDoorway = (x: number, z: number): boolean => DOORWAYS.some((d) => x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1);
    const blocked = (x: number, z: number, list: typeof OBSTACLES): boolean => list.some(([x0, x1, z0, z1]) => x > x0 - RADIUS && x < x1 + RADIUS && z > z0 - RADIUS && z < z1 + RADIUS);
    const onLanding = this.inBox(this.x, this.z, LANDING);
    const free = (x: number, z: number): boolean => {
      if (this.stairs) {
        if (this.inBox(x, z, LANDING)) return true;
        if ((this.floor === 0 || onLanding) && this.inBox(x, z, FLIGHT_UP)) return true;
        if ((this.floor === 1 || onLanding) && this.inBox(x, z, FLIGHT_DOWN)) return true;
      }
      if (this.floor === 1) {
        if (blocked(x, z, OFFICE_OBSTACLES)) return false;
        return inArea(x, z, ROOM) || inArea(x, z, CORRIDOR) || (x > (DOORWAYS[0] as typeof ROOM).x0 && x < (DOORWAYS[0] as typeof ROOM).x1 && z > (DOORWAYS[0] as typeof ROOM).z0 && z < (DOORWAYS[0] as typeof ROOM).z1);
      }
      if (blocked(x, z, OBSTACLES)) return false;
      if (inArea(x, z, ROOM)) return true;
      if (!this.building) return false;
      if (blocked(x, z, LAB_OBSTACLES)) return false;
      return inArea(x, z, CORRIDOR) || inArea(x, z, LAB) || inDoorway(x, z);
    };
    const [x, z] = [this.x, this.z];
    if (free(x + dx, z + dz)) [this.x, this.z] = [x + dx, z + dz];
    else if (free(x + dx, z)) this.x = x + dx;
    else if (free(x, z + dz)) this.z = z + dz;
    if (this.stairs) {
      // The flight you step on decides which floor you are heading for.
      if (!this.inBox(this.x, this.z, LANDING)) {
        if (this.inBox(this.x, this.z, FLIGHT_UP) && (this.floor === 0 || this.inBox(x, z, LANDING))) this.floor = 0;
        if (this.inBox(this.x, this.z, FLIGHT_DOWN) && (this.floor === 1 || this.inBox(x, z, LANDING))) this.floor = 1;
      }
      this.y = this.heightAt(this.x, this.z);
    }
    return this.x !== x || this.z !== z;
  }
}
