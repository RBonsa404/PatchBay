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

export type ZoneName =
  | 'room'
  | 'corridor'
  | 'lab'
  | 'stairs'
  | 'corridor1'
  | 'office'
  // Rooms of an ordinary university building, there to make it real: nothing to cable in them.
  | 'classroom0'
  | 'toilets'
  | 'lounge'
  | 'classroom1'
  | 'classroom2';

export interface Zone {
  name: ZoneName;
  rect: Rect;
  /** Floor height of the zone (the stair hall spans both floors). */
  y: number;
}

/** The rooms of the technical room's kind: one per origin. */
export const ROOMS = {
  /** The technical room, on the ground floor; its origin is the world's. */
  // Wall lines sit half a wall behind the faces the rooms are laid out against: the technical room's back face is
  // at z = -1.6, as everything hung on it expects.
  room: { x0: -6, x1: 6, z0: -1.68, z1: 6.0 },
  /** The lab room, across the corridor. Its origin is at z = LAB_Z. */
  lab: { x0: -7, x1: 7, z0: -11.68, z1: -4.0 },
  /** The ground floor's corridor runs on west to the classroom, the toilets and the lounge. */
  corridor: { x0: -14, x1: 7, z0: -4.0, z1: -1.68 },
  corridor1: { x0: -8, x1: 7, z0: -4.0, z1: -1.68 },
  stairs: { x0: 7, x1: 12.6, z0: -4.0, z1: -0.9 },
  classroom0: { x0: -14, x1: -6, z0: -1.68, z1: 6.0 },
  toilets: { x0: -14, x1: -10.5, z0: -9.2, z1: -4.0 },
  lounge: { x0: -10.5, x1: -7, z0: -9.2, z1: -4.0 },
  /** Upstairs, over the lab: two classrooms. */
  classroom1: { x0: -7, x1: 0, z0: -11.68, z1: -4.0 },
  classroom2: { x0: 0, x1: 7, z0: -11.68, z1: -4.0 },
} as const;

/** Where the lab's furniture is centred: its bench and rack stand as the technical room's do around z = 0. */
export const LAB_Z = -10;

/** Where a room's own layout starts, for a world position: rooms are built as copies of the technical room. */
export function roomOrigin(y: number, z: number): { y: number; z: number } {
  return { y: y > FLOOR_Y - 0.1 ? FLOOR_Y : 0, z: z < ROOMS.corridor.z0 ? LAB_Z : 0 };
}

// The corridors first: a point on a doorway's line belongs to the corridor it opens onto.
export const ZONES: Zone[] = [
  { name: 'corridor', rect: ROOMS.corridor, y: 0 },
  { name: 'corridor1', rect: ROOMS.corridor1, y: FLOOR_Y },
  { name: 'room', rect: ROOMS.room, y: 0 },
  { name: 'lab', rect: ROOMS.lab, y: 0 },
  { name: 'stairs', rect: ROOMS.stairs, y: 0 },
  { name: 'office', rect: ROOMS.room, y: FLOOR_Y },
  { name: 'classroom0', rect: ROOMS.classroom0, y: 0 },
  { name: 'toilets', rect: ROOMS.toilets, y: 0 },
  { name: 'lounge', rect: ROOMS.lounge, y: 0 },
  { name: 'classroom1', rect: ROOMS.classroom1, y: FLOOR_Y },
  { name: 'classroom2', rect: ROOMS.classroom2, y: FLOOR_Y },
];

/** Which zone a point is in: the stair hall first (it spans both floors), then the nearest room of its floor. */
export function zoneOf(x: number, y: number, z: number): ZoneName {
  if (inside(x, z, ROOMS.stairs, -0.05)) return 'stairs';
  const floor = y > FLOOR_Y - 0.5 ? FLOOR_Y : 0;
  let best: ZoneName = floor ? 'corridor1' : 'corridor';
  let distance = Infinity;
  for (const zone of ZONES) {
    if (zone.name === 'stairs' || zone.y !== floor) continue;
    const r = zone.rect;
    const d = Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
    if (d < distance - 1e-6) {
      distance = d;
      best = zone.name;
    }
  }
  return best;
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
  /** The sign over it, on the corridor's side. */
  label?: string;
}

const CORRIDOR_DOOR_X = -4.6;
export const DOORS: Door[] = [
  // Technical room and lab, off the corridor; double-width so that equipment goes through.
  { x: CORRIDOR_DOOR_X, z: ROOMS.corridor.z1, width: 1.4, y: 0, along: 'x' },
  // The lab's door opens onto its central aisle, between the rows of desks.
  { x: 0, z: ROOMS.corridor.z0, width: 1.4, y: 0, along: 'x' },
  // The administration upstairs.
  { x: CORRIDOR_DOOR_X, z: ROOMS.corridor.z1, width: 1.4, y: FLOOR_Y, along: 'x' },
  // Corridor to the stair hall, both floors: wide openings.
  { x: ROOMS.corridor.x1, z: (ROOMS.corridor.z0 + ROOMS.corridor.z1) / 2, width: 2.0, y: 0, along: 'z' },
  { x: ROOMS.corridor.x1, z: (ROOMS.corridor.z0 + ROOMS.corridor.z1) / 2, width: 2.0, y: FLOOR_Y, along: 'z' },
  // The building's other rooms.
  { x: -10, z: ROOMS.corridor.z1, width: 1.0, y: 0, along: 'x', label: 'SALLE DE COURS 001' },
  { x: -12.25, z: ROOMS.corridor.z0, width: 0.9, y: 0, along: 'x', label: 'TOILETTES' },
  { x: -8.75, z: ROOMS.corridor.z0, width: 1.0, y: 0, along: 'x', label: 'SALLE DE DÉTENTE' },
  { x: -4.6, z: ROOMS.corridor.z0, width: 1.0, y: FLOOR_Y, along: 'x', label: 'SALLE DE COURS 101' },
  { x: 3.5, z: ROOMS.corridor.z0, width: 1.0, y: FLOOR_Y, along: 'x', label: 'SALLE DE COURS 102' },
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
  const { room, lab, stairs, classroom0, toilets, lounge, classroom1 } = ROOMS;
  const out: WallSegment[] = [];
  const level = (y: number): void => {
    const corridor = y > 0 ? ROOMS.corridor1 : ROOMS.corridor;
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
  // West wing, ground floor: the classroom south of the corridor, the toilets and the lounge north of it.
  out.push({ x0: classroom0.x0, z0: classroom0.z0, x1: classroom0.x0, z1: classroom0.z1, y0: 0, y1: ROOM_HEIGHT });
  out.push({ x0: classroom0.x0, z0: classroom0.z1, x1: classroom0.x1, z1: classroom0.z1, y0: 0, y1: ROOM_HEIGHT });
  out.push({ x0: toilets.x0, z0: toilets.z0, x1: lounge.x1, z1: toilets.z0, y0: 0, y1: ROOM_HEIGHT });
  out.push({ x0: toilets.x0, z0: toilets.z0, x1: toilets.x0, z1: toilets.z1, y0: 0, y1: ROOM_HEIGHT });
  out.push({ x0: toilets.x1, z0: toilets.z0, x1: toilets.x1, z1: toilets.z1, y0: 0, y1: ROOM_HEIGHT });
  // Upstairs over the lab: two classrooms side by side.
  const up = FLOOR_Y + ROOM_HEIGHT;
  out.push({ x0: classroom1.x0, z0: classroom1.z0, x1: ROOMS.classroom2.x1, z1: classroom1.z0, y0: FLOOR_Y, y1: up });
  out.push({ x0: classroom1.x0, z0: classroom1.z0, x1: classroom1.x0, z1: classroom1.z1, y0: FLOOR_Y, y1: up });
  out.push({ x0: classroom1.x1, z0: classroom1.z0, x1: classroom1.x1, z1: classroom1.z1, y0: FLOOR_Y, y1: up });
  out.push({ x0: ROOMS.classroom2.x1, z0: classroom1.z0, x1: ROOMS.classroom2.x1, z1: classroom1.z1, y0: FLOOR_Y, y1: up });
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
    .filter((h) => h.to > start && h.from < end);
  // Doorways over the same span on several floors share one gap; between and around them the wall is solid.
  const spans = new Map<string, { from: number; to: number; ys: number[] }>();
  for (const h of holes) {
    const key = `${h.from}|${h.to}`;
    const span = spans.get(key) ?? { from: h.from, to: h.to, ys: [] };
    span.ys.push(h.y);
    spans.set(key, span);
  }
  const out: { from: number; to: number; y0: number; y1: number }[] = [];
  let at = start;
  for (const span of [...spans.values()].sort((a, b) => a.from - b.from)) {
    if (span.from > at) out.push({ from: at, to: span.from, y0: w.y0, y1: w.y1 });
    let bottom = w.y0;
    for (const y of span.ys.sort((a, b) => a - b)) {
      if (y > bottom + 0.01) out.push({ from: span.from, to: span.to, y0: bottom, y1: y });
      bottom = y + DOOR_HEIGHT;
    }
    if (bottom < w.y1 - 0.01) out.push({ from: span.from, to: span.to, y0: bottom, y1: w.y1 });
    at = span.to;
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
  /** Two flights side by side, the first up to the landing, the second back up to the first floor. */
  up: { x0: 7.9, x1: 10.9, z0: -2.4, z1: -0.95, y0: 0, y1: HALF, steps: 10 } as Flight,
  landing: { x0: 10.9, x1: 12.6, z0: -4.0, z1: -0.9 },
  down: { x0: 10.9, x1: 7.9, z0: -3.95, z1: -2.5, y0: HALF, y1: FLOOR_Y, steps: 10 } as Flight,
  /** Upstairs, the gallery from the top of the stairs to the corridor. */
  gallery: { x0: 7.0, x1: 7.9, z0: -4.0, z1: -0.9 },
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
  // The stair hall's ground, before the first flight (under the second one is a closed cupboard).
  { rect: { x0: 7, x1: 7.9, z0: -4, z1: -0.9 }, y: 0 },
  { flight: STAIRS.up },
  { rect: STAIRS.landing, y: HALF },
  { flight: STAIRS.down },
  { rect: STAIRS.gallery, y: FLOOR_Y },
  { rect: ROOMS.room, y: FLOOR_Y },
  { rect: ROOMS.corridor1, y: FLOOR_Y },
  { rect: ROOMS.classroom0, y: 0 },
  { rect: ROOMS.toilets, y: 0 },
  { rect: ROOMS.lounge, y: 0 },
  { rect: ROOMS.classroom1, y: FLOOR_Y },
  { rect: ROOMS.classroom2, y: FLOOR_Y },
];

/** Furniture and anything else standing on a floor that the player walks around. */
export interface Obstacle {
  rect: Rect;
  y0: number;
  y1: number;
}
const obstacles: Obstacle[] = [];

/** Where the walls' inner faces are: furniture stands against them. */
export const FACE = {
  left: ROOMS.room.x0 + WALL / 2,
  right: ROOMS.room.x1 - WALL / 2,
  back: -1.6,
  front: ROOMS.room.z1 - WALL / 2,
} as const;

/**
 * The furniture of each room (world coordinates), as `room.ts`, `decor.ts` and `annex.ts` lay it out: what the player
 * walks around. Change both together.
 */
const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({ x0, x1, z0, z1 });
function roomFurniture(z: number, y: number): Obstacle[] {
  const at = (r: Rect, h = 2): Obstacle => ({ rect: { x0: r.x0, x1: r.x1, z0: r.z0 + z, z1: r.z1 + z }, y0: y, y1: y + h });
  return [at(rect(-1.6, 1.6, -0.3, 0.8), 1), at(rect(-0.36, 0.36, -0.96, -0.33))];
}
const LAB_ROWS = [2.0, 3.45, 4.9];
/** Where the classrooms' student desks stand (`annex.ts` lays them out in these blocks). */
export const CLASS0_DESKS = { x0: -11.75, x1: -6.75, z0: -0.6, z1: 4.6 } as const;
export const CLASS_UP_DESKS = { z0: -9.95, z1: -5.1 } as const;
const FURNITURE: Obstacle[] = [
  // Technical room: bench and rack, server cabinet, extinguisher, shelving, cabinet row, cupboard, desk, chair, bin,
  // the second row of racks.
  ...roomFurniture(0, 0),
  { rect: rect(FACE.right - 1.0, FACE.right - 0.4, -1.55, -0.65), y0: 0, y1: 2 },
  { rect: rect(FACE.left, FACE.left + 0.4, -0.8, -0.4), y0: 0, y1: 1 },
  { rect: rect(FACE.left, FACE.left + 0.5, 0.1, 2.1), y0: 0, y1: 2 },
  { rect: rect(FACE.right - 0.68, FACE.right, -0.4, 1.65), y0: 0, y1: 2 },
  { rect: rect(FACE.right - 0.53, FACE.right, 1.95, 3.25), y0: 0, y1: 1 },
  { rect: rect(-1.65, -0.15, FACE.front - 0.75, FACE.front), y0: 0, y1: 1 },
  { rect: rect(-1.25, -0.65, FACE.front - 1.4, FACE.front - 0.8), y0: 0, y1: 1 },
  { rect: rect(0.1, 0.4, FACE.front - 0.45, FACE.front - 0.15), y0: 0, y1: 1 },
  { rect: rect(-3.0, 3.0, 3.25, 4.15), y0: 0, y1: 2.2 },
  // Lab room: the teacher's bench and rack, three rows of student desks either side of the aisle, the lockers.
  ...roomFurniture(LAB_Z, 0),
  ...LAB_ROWS.flatMap((row) => [rect(-6.0, -1.8, row - 0.45 + LAB_Z, row + 0.45 + LAB_Z), rect(1.8, 6.0, row - 0.45 + LAB_Z, row + 0.45 + LAB_Z)].map((r) => ({ rect: r, y0: 0, y1: 1 }))),
  { rect: rect(ROOMS.lab.x0 + WALL / 2, ROOMS.lab.x0 + WALL / 2 + 0.6, LAB_Z - 1.4, LAB_Z + 0.6), y0: 0, y1: 2 },
  // Administration: bench and rack, the desk pods, the low cabinet.
  ...roomFurniture(0, FLOOR_Y),
  { rect: rect(-4.6, -1.6, 2.6, 4.4), y0: FLOOR_Y, y1: FLOOR_Y + 1 },
  { rect: rect(1.6, 4.6, 2.6, 4.4), y0: FLOOR_Y, y1: FLOOR_Y + 1 },
  { rect: rect(FACE.left, FACE.left + 0.55, 0.0, 2.6), y0: FLOOR_Y, y1: FLOOR_Y + 1 },
  // The classroom downstairs: its block of desks facing the board on the west wall, the teacher's desk.
  { rect: rect(CLASS0_DESKS.x0, CLASS0_DESKS.x1, CLASS0_DESKS.z0, CLASS0_DESKS.z1), y0: 0, y1: 1 },
  { rect: rect(-13.3, -12.5, 1.3, 2.7), y0: 0, y1: 1 },
  // Toilets: the cubicles along the back wall, the washbasins on the east wall.
  { rect: rect(-13.95, -11.0, -9.12, -7.55), y0: 0, y1: 2.1 },
  { rect: rect(-11.12, -10.58, -6.85, -5.15), y0: 0, y1: 1.2 },
  // Lounge: the sofa, its low table and armchairs, the vending machine, the coffee cart.
  { rect: rect(-9.75, -7.75, -9.12, -8.25), y0: 0, y1: 1 },
  { rect: rect(-9.3, -8.2, -7.95, -7.35), y0: 0, y1: 0.6 },
  { rect: rect(-10.42, -9.55, -5.65, -4.75), y0: 0, y1: 2 },
  { rect: rect(-8.16, -7.08, -6.2, -4.7), y0: 0, y1: 1.2 },
  { rect: rect(-10.3, -9.4, -7.45, -6.45), y0: 0, y1: 1 },
  { rect: rect(-8.1, -7.2, -7.45, -6.45), y0: 0, y1: 1 },
  // Upstairs classrooms: desks facing the board on the back wall.
  ...[ROOMS.classroom1, ROOMS.classroom2].map((r) => ({ rect: rect(r.x0 + 1.1, r.x1 - 1.1, CLASS_UP_DESKS.z0, CLASS_UP_DESKS.z1), y0: FLOOR_Y, y1: FLOOR_Y + 1 })),
  { rect: rect(-6.35, -5.05, -11.6, -10.15), y0: FLOOR_Y, y1: FLOOR_Y + 1 },
  { rect: rect(5.05, 6.35, -11.6, -10.15), y0: FLOOR_Y, y1: FLOOR_Y + 1 },
];

/** The lab's rows of desks (their depth along z, from the lab's origin): `annex.ts` lays them out here. */
export const LAB_DESK_ROWS = LAB_ROWS;

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
  for (const o of [...FURNITURE, ...obstacles]) {
    if (o.y1 <= y + 0.05 || o.y0 >= head) continue;
    if (hits(o.rect)) return true;
  }
  // Under the second flight is a cupboard; between the flights, a wall up to the handrail.
  if (y < HALF - 0.3 && hits({ x0: 7.9, x1: 10.9, z0: -4.0, z1: -2.45 })) return true;
  if (hits({ x0: 7.9, x1: 10.9, z0: -2.47, z1: -2.43 }) && y < HALF + 0.2) return true;
  return false;
}
