import * as THREE from 'three';
import { blockedAt, DOORS, groundAt, zoneOf, type ZoneName } from '../scene/building.js';

/**
 * The player, seen from inside: eyes at 1.62 m, walking on the building's floors, steps and landings, and stopped by
 * its walls and furniture (all from the plan in `scene/building.ts`). There is no body to draw: the camera is the
 * technician's head.
 */

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
  /** Height of the floor under the feet; the eyes follow it smoothly (`shownY`), a step at a time on the stairs. */
  y = 0;
  private shownY = 0;
  private speed = 0;
  private phase = 0;
  /** Where the player may go: the technical room alone, or the building (and upstairs). */
  private allowed = new Set<ZoneName>(['room']);

  /** Open the building to the player (otherwise, the technical room only); `stairs` adds the first floor. */
  enterBuilding(stairs: boolean): void {
    this.allowed = new Set<ZoneName>(['room', 'corridor', 'lab', 'classroom0', 'toilets', 'lounge', ...(stairs ? (['stairs', 'corridor1', 'office', 'classroom1', 'classroom2'] as ZoneName[]) : [])]);
  }

  /** Height of the floor under the player. */
  get floorY(): number {
    return this.y;
  }

  /** Where the eyes are, with the slight bob of walking. */
  get eye(): THREE.Vector3 {
    return new THREE.Vector3(this.x, this.shownY + EYE + Math.sin(this.phase * 2) * 0.012 * Math.min(1, this.speed / WALK), this.z);
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

  /** Put the player somewhere at once (a teleport: the eyes do not glide there). */
  place(x: number, z: number, y = 0): void {
    [this.x, this.z, this.y, this.shownY] = [x, z, y, y];
  }

  /** Walk according to `input`. `step` is true on the frame a foot touches the floor. */
  update(dt: number, input: MoveInput): { moved: boolean; step: boolean } {
    // The eyes climb or go down to the floor's height softly: a step lifts them in a tenth of a second.
    this.shownY += (this.y - this.shownY) * Math.min(1, dt * 14);
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

  /** The floor height at (x, z) if the player can stand there, coming from where they are; null if not. */
  private standAt(x: number, z: number): number | null {
    const g = groundAt(x, z, this.y);
    if (g === null) return null;
    if (!this.allowed.has(zoneOf(x, g + 0.1, z))) return null;
    return blockedAt(x, z, g) ? null : g;
  }

  /**
   * Move by (dx, dz), sliding along walls and furniture instead of passing through them. Near a doorway's edge, the
   * body is eased sideways into the opening, as one naturally steps through a door without aiming for it.
   */
  private move(dx: number, dz: number): boolean {
    const [x, z] = [this.x, this.z];
    const straight = this.standAt(x + dx, z + dz);
    // Walking into a wall beside a doorway, or into the doorway off-centre: ease the body towards the opening's
    // middle, as one naturally steps through a door. Only then: someone walking along a wall is not pulled aside.
    const step = Math.hypot(dx, dz);
    const guided: [number, number][] = [];
    let early = false;
    for (const d of DOORS) {
      if (Math.abs(d.y - this.y) > 0.5) continue;
      const across = d.along === 'x' ? Math.abs(z - d.z) : Math.abs(x - d.x);
      const beside = d.along === 'x' ? x - d.x : z - d.z;
      const towards = d.along === 'x' ? Math.sign(d.z - z) === Math.sign(dz) && Math.abs(dz) > Math.abs(dx) * 0.5 : Math.sign(d.x - x) === Math.sign(dx) && Math.abs(dx) > Math.abs(dz) * 0.5;
      if (across > 0.9 || Math.abs(beside) > d.width / 2 + 0.6 || !towards) continue;
      const shift = -Math.sign(beside) * Math.min(Math.abs(beside), step);
      guided.push(...((d.along === 'x' ? [[x + shift, z + dz], [x + shift, z + dz * 0.5], [x + shift, z]] : [[x + dx, z + shift], [x + dx * 0.5, z + shift], [x, z + shift]]) as [number, number][]));
      if (across < 0.45 && Math.abs(beside) < d.width / 2 + 0.05 && Math.abs(beside) > d.width / 2 - 0.3) early = true;
    }
    if (straight !== null && !early) {
      [this.x, this.z, this.y] = [x + dx, z + dz, straight];
      return true;
    }
    const tries: [number, number][] = [...guided, [x + dx, z + dz], [x + dx, z], [x, z + dz]];
    // Brushing a frame or a piece of furniture: try a little to each side, so that the body slips past.
    const nudge = step * 0.8;
    for (const s of [1, -1]) {
      if (Math.abs(dz) > Math.abs(dx)) tries.push([x + s * nudge, z + dz]);
      else tries.push([x + dx, z + s * nudge]);
    }
    for (const [tx, tz] of tries) {
      if (tx === x && tz === z) continue;
      const g = this.standAt(tx, tz);
      if (g === null) continue;
      [this.x, this.z, this.y] = [tx, tz, g];
      return true;
    }
    return false;
  }
}
