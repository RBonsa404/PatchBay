/**
 * The plan of the building, in one place: its rooms, walls and doorways, its stairs. The scene draws it, the player
 * walks on it and is stopped by it, the game knows from it which room the player is in. Nothing about the building's
 * shape is written anywhere else.
 *
 * Metres, seen from above: x across, z along (the technical room's bench faces -z). The ground floor is at y = 0,
 * the first floor at `FLOOR_Y`. Every room is laid out like the technical room around its own origin (bench and rack
 * at the same place), so that a level can place its devices the same way in any room.
 */

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Height of the first floor's floor; rooms are `ROOM_HEIGHT` high, the slab fills the rest. */
export const FLOOR_Y = 3.3;
export const ROOM_HEIGHT = 3;
/** Every wall is this thick; its line is its middle. */
export const WALL = 0.16;
export const DOOR_HEIGHT = 2.1;

export type ZoneName = 'room' | 'corridor' | 'lab' | 'stairs' | 'corridor1' | 'office';

export interface Zone {
  name: ZoneName;
  rect: Rect;
  /** Floor height of the zone (the stair hall spans both floors). */
  y: number;
}

/** The rooms of the technical room's kind: one per origin. */
export const ROOMS = {
  /** The technical room, on the ground floor; its origin is the world's. */
  room: { x0: -6, x1: 6, z0: -1.6, z1: 6.0 },
  /** The lab room, across the corridor. Its origin is at z = LAB_Z. */
  lab: { x0: -7, x1: 7, z0: -11.6, z1: -4.0 },
  corridor: { x0: -8, x1: 7, z0: -4.0, z1: -1.6 },
  stairs: { x0: 7, x1: 12.6, z0: -4.0, z1: 0.4 },
} as const;

/** Where the lab's furniture is centred: its bench and rack stand as the technical room's do around z = 0. */
export const LAB_Z = -10;

/** Where a room's own layout starts, for a world position: rooms are built as copies of the technical room. */
export function roomOrigin(y: number, z: number): { y: number; z: number } {
  return { y: y > FLOOR_Y - 0.1 ? FLOOR_Y : 0, z: z < ROOMS.corridor.z0 ? LAB_Z : 0 };
}

export const ZONES: Zone[] = [
  { name: 'room', rect: ROOMS.room, y: 0 },
  { name: 'lab', rect: ROOMS.lab, y: 0 },
  { name: 'corridor', rect: ROOMS.corridor, y: 0 },
  { name: 'stairs', rect: ROOMS.stairs, y: 0 },
  { name: 'office', rect: ROOMS.room, y: FLOOR_Y },
  { name: 'corridor1', rect: ROOMS.corridor, y: FLOOR_Y },
];

/** Which zone a point is in: the stair hall first (it spans both floors), then by floor. */
export function zoneOf(x: number, y: number, z: number): ZoneName {
  if (inside(x, z, ROOMS.stairs, -0.05)) return 'stairs';
  const upper = y > FLOOR_Y - 0.5;
  if (z > ROOMS.corridor.z1) return upper ? 'office' : 'room';
  if (z < ROOMS.corridor.z0) return 'lab';
  return upper ? 'corridor1' : 'corridor';
}

export function inside(x: number, z: number, r: Rect, margin = 0): boolean {
  return x > r.x0 + margin && x < r.x1 - margin && z > r.z0 + margin && z < r.z1 - margin;
}

// ---- doors and walls ------------------------------------------------------------------------------------------

export interface Door {
  /** Centre of the doorway on its wall, and its clear width. */
  x: number;
  z: number;
  width: number;
  /** Floor of the doorway. */
  y: number;
  /** Which way the wall runs: 'x' for a wall along x (at fixed z). */
  along: 'x' | 'z';
}

const CORRIDOR_DOOR_X = -4.6;
export const DOORS: Door[] = [
  // Technical room and lab, off the corridor; double-width so that equipment goes through.
  { x: CORRIDOR_DOOR_X, z: ROOMS.corridor.z1, width: 1.4, y: 0, along: 'x' },
  { x: CORRIDOR_DOOR_X, z: ROOMS.corridor.z0, width: 1.4, y: 0, along: 'x' },
  { x: 3.4, z: ROOMS.corridor.z0, width: 1.0, y: 0, along: 'x' },
  // The administration upstairs.
  { x: CORRIDOR_DOOR_X, z: ROOMS.corridor.z1, width: 1.4, y: FLOOR_Y, along: 'x' },
  // Corridor to the stair hall, both floors: wide openings.
  { x: ROOMS.corridor.x1, z: (ROOMS.corridor.z0 + ROOMS.corridor.z1) / 2, width: 2.0, y: 0, along: 'z' },
  { x: ROOMS.corridor.x1, z: (ROOMS.corridor.z0 + ROOMS.corridor.z1) / 2, width: 2.0, y: FLOOR_Y, along: 'z' },
];

export interface WallSegment {
  /** From (x0, z0) to (x1, z1): along x or along z. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Bottom and top. */
  y0: number;
  y1: number;
}

/** The walls, each a straight line; doorways are cut out of them by `wallPieces`. */
export const WALLS: WallSegment[] = (() => {
  const { room, lab, corridor, stairs } = ROOMS;
  const out: WallSegment[] = [];
  const level = (y: number): void => {
    const h = y + ROOM_HEIGHT;
    // Around the technical room (or the administration above it).
    out.push({ x0: room.x0, z0: room.z0, x1: room.x1, z1: room.z0, y0: y, y1: h });
    out.push({ x0: room.x0, z0: room.z1, x1: room.x1, z1: room.z1, y0: y, y1: h });
    out.push({ x0: room.x0, z0: room.z0, x1: room.x0, z1: room.z1, y0: y, y1: h });
    out.push({ x0: room.x1, z0: room.z0, x1: room.x1, z1: room.z1, y0: y, y1: h });
    // The corridor's far ends and its long wall on the lab's side (upstairs: offices' archives).
    out.push({ x0: corridor.x0, z0: corridor.z0, x1: corridor.x0, z1: corridor.z1, y0: y, y1: h });
    out.push({ x0: corridor.x0, z0: corridor.z0, x1: corridor.x1, z1: corridor.z0, y0: y, y1: h });
    // Between the room and the corridor's end beyond it.
    out.push({ x0: corridor.x0, z0: corridor.z1, x1: room.x0, z1: corridor.z1, y0: y, y1: h });
    out.push({ x0: room.x1, z0: corridor.z1, x1: corridor.x1, z1: corridor.z1, y0: y, y1: h });
  };
  level(0);
  level(FLOOR_Y);
  // The lab, ground floor only.
  out.push({ x0: lab.x0, z0: lab.z0, x1: lab.x1, z1: lab.z0, y0: 0, y1: ROOM_HEIGHT });
  out.push({ x0: lab.x0, z0: lab.z0, x1: lab.x0, z1: lab.z1, y0: 0, y1: ROOM_HEIGHT });
  out.push({ x0: lab.x1, z0: lab.z0, x1: lab.x1, z1: lab.z1, y0: 0, y1: ROOM_HEIGHT });
  // The stair hall: one shell from the ground to the roof, with the corridors' openings.
  const top = FLOOR_Y + ROOM_HEIGHT;
  out.push({ x0: stairs.x0, z0: stairs.z0, x1: stairs.x1, z1: stairs.z0, y0: 0, y1: top });
  out.push({ x0: stairs.x0, z0: stairs.z1, x1: stairs.x1, z1: stairs.z1, y0: 0, y1: top });
  out.push({ x0: stairs.x1, z0: stairs.z0, x1: stairs.x1, z1: stairs.z1, y0: 0, y1: top });
  out.push({ x0: stairs.x0, z0: stairs.z0, x1: stairs.x0, z1: stairs.z1, y0: 0, y1: top });
  return out;
})();

/** The solid parts of a wall once its doorways are cut out: [from, to, bottom, top] along its own length. */
export function wallPieces(w: WallSegment): { from: number; to: number; y0: number; y1: number }[] {
  const alongX = w.z0 === w.z1;
  const start = alongX ? Math.min(w.x0, w.x1) : Math.min(w.z0, w.z1);
  const end = alongX ? Math.max(w.x0, w.x1) : Math.max(w.z0, w.z1);
  const line = alongX ? w.z0 : w.x0;
  const holes = DOORS.filter((d) => (alongX ? d.along === 'x' && Math.abs(d.z - line) < 0.01 : d.along === 'z' && Math.abs(d.x - line) < 0.01) && d.y >= w.y0 - 0.01 && d.y < w.y1)
    .map((d) => ({ from: (alongX ? d.x : d.z) - d.width / 2, to: (alongX ? d.x : d.z) + d.width / 2, y: d.y }))
    .filter((h) => h.to > start && h.from < end)
    .sort((a, b) => a.from - b.from);
  const out: { from: number; to: number; y0: number; y1: number }[] = [];
  let at = start;
  for (const h of holes) {
    if (h.from > at) out.push({ from: at, to: h.from, y0: w.y0, y1: w.y1 });
    // Below the doorway (another floor) and above it (the lintel).
    if (h.y > w.y0 + 0.01) out.push({ from: h.from, to: h.to, y0: w.y0, y1: h.y });
    out.push({ from: h.from, to: h.to, y0: h.y + DOOR_HEIGHT, y1: w.y1 });
    at = h.to;
  }
  if (at < end) out.push({ from: at, to: end, y0: w.y0, y1: w.y1 });
  return out;
}

// ---- stairs ----------------------------------------------------------------------------------------------------

/** A straight flight: from (x0, y0) to (x1, y1) along x, between z0 and z1. */
export interface Flight {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  steps: number;
}

const HALF = FLOOR_Y / 2;
export const STAIRS = {
  up: { x0: 7.9, x1: 10.9, z0: -1.0, z1: 0.3, y0: 0, y1: HALF, steps: 10 } as Flight,
  landing: { x0: 10.9, x1: 12.6, z0: -4.0, z1: 0.4 },
  down: { x0: 10.9, x1: 7.9, z0: -3.9, z1: -2.4, y0: HALF, y1: FLOOR_Y, steps: 10 } as Flight,
  /** Upstairs, the gallery from the top of the stairs to the corridor. */
  gallery: { x0: 7.0, x1: 7.9, z0: -4.0, z1: 0.4 },
} as const;

/** Height of a flight's tread under (x, z), or null when the point is not on it. */
export function flightHeight(f: Flight, x: number, z: number): number | null {
  const [lo, hi] = [Math.min(f.x0, f.x1), Math.max(f.x0, f.x1)];
  if (x < lo || x > hi || z < f.z0 || z > f.z1) return null;
  const along = (x - f.x0) / (f.x1 - f.x0);
  // Steps, not a ramp: the eyes go up a step at a time, softened by the player's own smoothing.
  const step = Math.min(f.steps, Math.max(0, Math.floor(along * f.steps + 0.5)));
  return f.y0 + ((f.y1 - f.y0) * step) / f.steps;
}

// ---- walking ---------------------------------------------------------------------------------------------------

/** A surface the player can stand on: a floor (flat) or a flight. */
type Surface = { rect: Rect; y: number } | { flight: Flight };

const SURFACES: Surface[] = [
  { rect: ROOMS.room, y: 0 },
  { rect: ROOMS.lab, y: 0 },
  { rect: ROOMS.corridor, y: 0 },
  // The stair hall's ground: before the first flight and along it (under the second one is a closed cupboard).
  { rect: { x0: 7, x1: 7.9, z0: -4, z1: 0.4 }, y: 0 },
  { rect: { x0: 7.9, x1: 12.6, z0: -1.0 - 0.001, z1: 0.4 }, y: 0 },
  { flight: STAIRS.up },
  { rect: STAIRS.landing, y: HALF },
  { flight: STAIRS.down },
  { rect: STAIRS.gallery, y: FLOOR_Y },
  { rect: ROOMS.room, y: FLOOR_Y },
  { rect: ROOMS.corridor, y: FLOOR_Y },
];

/** Furniture and anything else standing on a floor that the player walks around. */
export interface Obstacle {
  rect: Rect;
  y0: number;
  y1: number;
}
const obstacles: Obstacle[] = [];

/** Something the player cannot walk through; `y` is the floor it stands on. */
export function addObstacle(rect: Rect, y = 0, height = 2): void {
  obstacles.push({ rect, y0: y, y1: y + height });
}

/** Forget the furniture of a mission, keeping the building's. */
export function clearObstacles(keep = 0): void {
  obstacles.length = keep;
}

export function obstacleCount(): number {
  return obstacles.length;
}

/** Body radius and the highest step the player climbs without noticing. */
export const BODY = 0.24;
const STEP = 0.45;

/** Height of the surface under (x, z) that can be reached from height `y`, or null when there is none. */
export function groundAt(x: number, z: number, y: number): number | null {
  let best: number | null = null;
  for (const s of SURFACES) {
    const h = 'flight' in s ? flightHeight(s.flight, x, z) : inside(x, z, s.rect) ? s.y : null;
    if (h === null || Math.abs(h - y) > STEP) continue;
    if (best === null || Math.abs(h - y) < Math.abs(best - y)) best = h;
  }
  return best;
}

/** Whether a body standing at (x, z) on floor height `y` touches a wall or an obstacle. */
export function blockedAt(x: number, z: number, y: number): boolean {
  const head = y + 1.7;
  const hits = (r: Rect): boolean => x > r.x0 - BODY && x < r.x1 + BODY && z > r.z0 - BODY && z < r.z1 + BODY;
  for (const w of WALLS) {
    if (w.y1 <= y + 0.05 || w.y0 >= head) continue;
    const alongX = w.z0 === w.z1;
    for (const p of wallPieces(w)) {
      // Lintels and the parts below a floor do not stop a body walking under or above them.
      if (p.y1 <= y + 0.3 || p.y0 >= head) continue;
      const r = alongX
        ? { x0: p.from, x1: p.to, z0: w.z0 - WALL / 2, z1: w.z0 + WALL / 2 }
        : { x0: w.x0 - WALL / 2, x1: w.x0 + WALL / 2, z0: p.from, z1: p.to };
      if (hits(r)) return true;
    }
  }
  for (const o of obstacles) {
    if (o.y1 <= y + 0.05 || o.y0 >= head) continue;
    if (hits(o.rect)) return true;
  }
  // The flights' sides: the second flight is a wall for whoever is under it, and the stairwell's well is closed.
  if (y < HALF - 0.3 && hits({ x0: 7.9, x1: 12.6, z0: -4.0, z1: -1.15 })) return true;
  return false;
}
