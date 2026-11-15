import * as THREE from 'three';
import { DOOR_HEIGHT, DOORS, FLOOR_Y, inside, ROOM_HEIGHT, STAIRS, WALL, WALLS, wallPieces, ZONES, type Flight, type Rect, type ZoneName } from './building.js';
import { ceilingTexture, paintTexture, photo, photoRelief, raisedFloorNormal, raisedFloorTexture } from './materials.js';

/**
 * The building's shell drawn from its plan (`building.ts`): for each zone, its floor, its ceiling, the faces of the
 * walls that look into it (cut at the doorways), the frames of its doorways and its ceiling lights. A wall face
 * belongs to the zone it faces, so that a hidden room takes its walls with it and a visible one never shows a hole.
 */

const lit = (color: string, roughness = 0.6, metalness = 0.1): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

let materials: Record<string, THREE.Material> | null = null;
function M(): Record<string, THREE.Material> {
  materials ??= {
    paint: new THREE.MeshStandardMaterial({ map: paintTexture(), ...photoRelief('painted_plaster_wall', 1, 1), normalScale: new THREE.Vector2(0.22, 0.22), roughness: 0.95 }),
    dado: new THREE.MeshStandardMaterial({ map: paintTexture(), color: '#aab2bd', ...photoRelief('painted_plaster_wall', 1, 1), normalScale: new THREE.Vector2(0.16, 0.16), roughness: 0.7 }),
    skirting: lit('#39414d', 0.55, 0.3),
    blue: lit('#1d4ed8', 0.8),
    amber: lit('#fbbf24', 0.8),
    frame: lit('#475569', 0.5, 0.5),
    concrete: new THREE.MeshStandardMaterial({ color: '#8f97a3', ...photoRelief('smooth_concrete_floor', 1, 1), roughness: 0.6, metalness: 0.05 }),
    tread: lit('#aab2bd', 0.55, 0.1),
    nosing: lit('#fbbf24', 0.6),
    rail: lit('#475569', 0.45, 0.75),
    panelLight: new THREE.MeshBasicMaterial({ color: '#f8fbff', toneMapped: false }),
    panelFrame: lit('#cbd5e1', 0.5, 0.3),
  };
  return materials;
}

/** A plane `w` × `h` whose texture coordinates are in metres, so that paint and relief keep their scale. */
function face(w: number, h: number, material: THREE.Material, metres = 1.6): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / metres, (uv.getY(i) * h) / metres);
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** The zone a point belongs to, on the floor at height `y` (null outside the building). */
function zoneAt(x: number, y: number, z: number): ZoneName | null {
  for (const zone of ZONES) {
    if (!inside(x, z, zone.rect)) continue;
    if (zone.name === 'stairs') return 'stairs';
    if (y >= zone.y - 0.01 && y < zone.y + FLOOR_Y - 0.01) return zone.name;
  }
  return null;
}

/** Floor heights whose painted bands a wall face in `zone` carries. */
function floorsOf(zone: ZoneName): number[] {
  if (zone === 'stairs') return [0, FLOOR_Y];
  return [(ZONES.find((z) => z.name === zone) as { y: number }).y];
}

/** The faces of every wall that look into `zone`. */
function walls(zone: ZoneName): THREE.Group {
  const g = new THREE.Group();
  const m = M();
  for (const w of WALLS) {
    const alongX = w.z0 === w.z1;
    const line = alongX ? w.z0 : w.x0;
    for (const p of wallPieces(w)) {
      const length = p.to - p.from;
      const mid = (p.from + p.to) / 2;
      for (const side of [-1, 1]) {
        const offset = line + side * (WALL / 2);
        // Which zone this face looks into: just in front of it, at the foot of the piece.
        const probe = alongX ? [mid, p.y0 + 0.5, offset + side * 0.05] : [offset + side * 0.05, p.y0 + 0.5, mid];
        if (zoneAt(probe[0] as number, probe[1] as number, probe[2] as number) !== zone) continue;
        const ry = alongX ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
        const place = (obj: THREE.Object3D, y: number, out: number): void => {
          if (alongX) obj.position.set(mid, y, offset + side * out);
          else obj.position.set(offset + side * out, y, mid);
          obj.rotation.y = ry;
          g.add(obj);
        };
        place(face(length, p.y1 - p.y0, m.paint as THREE.Material), (p.y0 + p.y1) / 2, 0);
        // The harder-wearing lower part, the skirting board and the club's bands, on each floor the face covers.
        for (const f of floorsOf(zone)) {
          if (p.y0 > f + 0.01 || p.y1 < f + 1.2) continue;
          place(face(length, 1.1, m.dado as THREE.Material), f + 0.55, 0.0015);
          const skirting = box(length, 0.1, 0.015, m.skirting as THREE.Material, 0, 0, 0, false);
          place(skirting, f + 0.05, 0.008);
          place(face(length, 0.05, m.blue as THREE.Material), f + 1.12, 0.002);
          place(face(length, 0.012, m.amber as THREE.Material), f + 1.165, 0.002);
        }
      }
    }
  }
  return g;
}

/** The frame of each doorway on the floor of `zone` (both faces of the wall, and its reveals). */
function doorFrames(y: number): THREE.Group {
  const g = new THREE.Group();
  const m = M();
  for (const d of DOORS) {
    if (Math.abs(d.y - y) > 0.01) continue;
    const depth = WALL + 0.05;
    for (const s of [-1, 1]) {
      const jamb = d.along === 'x' ? box(0.05, DOOR_HEIGHT + 0.05, depth, m.frame as THREE.Material, d.x + s * (d.width / 2 + 0.025), d.y + (DOOR_HEIGHT + 0.05) / 2, d.z) : box(depth, DOOR_HEIGHT + 0.05, 0.05, m.frame as THREE.Material, d.x, d.y + (DOOR_HEIGHT + 0.05) / 2, d.z + s * (d.width / 2 + 0.025));
      g.add(jamb);
    }
    g.add(d.along === 'x' ? box(d.width + 0.1, 0.05, depth, m.frame as THREE.Material, d.x, d.y + DOOR_HEIGHT + 0.025, d.z) : box(depth, 0.05, d.width + 0.1, m.frame as THREE.Material, d.x, d.y + DOOR_HEIGHT + 0.025, d.z));
    // A brushed threshold strip on the floor.
    g.add(d.along === 'x' ? box(d.width, 0.008, WALL + 0.04, m.frame as THREE.Material, d.x, d.y + 0.004, d.z, false) : box(WALL + 0.04, 0.008, d.width, m.frame as THREE.Material, d.x, d.y + 0.004, d.z, false));
  }
  return g;
}

function slab(r: Rect, y: number, material: THREE.Material, down = false, metres = 1.6): THREE.Mesh {
  const m = face(r.x1 - r.x0, r.z1 - r.z0, material, metres);
  m.rotation.x = down ? Math.PI / 2 : -Math.PI / 2;
  m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  return m;
}

/** Ceiling LED panels on a grid over `r`, `step` metres apart. */
function panels(r: Rect, ceiling: number, step = 2.4): THREE.Group {
  const g = new THREE.Group();
  const m = M();
  const nx = Math.max(1, Math.round((r.x1 - r.x0) / step));
  const nz = Math.max(1, Math.round((r.z1 - r.z0) / step));
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = r.x0 + ((i + 0.5) * (r.x1 - r.x0)) / nx;
      const z = r.z0 + ((k + 0.5) * (r.z1 - r.z0)) / nz;
      const frame = box(0.64, 0.02, 0.64, m.panelFrame as THREE.Material, x, ceiling - 0.01, z, false);
      const light = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58), m.panelLight);
      light.rotation.x = Math.PI / 2;
      light.position.set(x, ceiling - 0.021, z);
      g.add(frame, light);
    }
  }
  return g;
}

/** One straight flight of solid steps, with a yellow nosing on each. */
function flight(f: Flight): THREE.Group {
  const g = new THREE.Group();
  const m = M();
  const run = (f.x1 - f.x0) / f.steps;
  const depth = f.z1 - f.z0;
  for (let i = 0; i < f.steps; i++) {
    const top = f.y0 + ((f.y1 - f.y0) * (i + 1)) / f.steps;
    const x = f.x0 + (i + 0.5) * run;
    // Solid down to the floor: no gap under the stairs to see through.
    g.add(box(Math.abs(run), top, depth, m.tread as THREE.Material, x, top / 2, (f.z0 + f.z1) / 2));
    g.add(box(0.03, 0.008, depth, m.nosing as THREE.Material, x + run / 2 - Math.sign(run) * 0.015, top + 0.004, (f.z0 + f.z1) / 2, false));
  }
  return g;
}

/** The stair hall's own parts: the two flights, the landing, the gallery upstairs, handrails and the wall between. */
function stairs(): THREE.Group {
  const g = new THREE.Group();
  const m = M();
  const half = FLOOR_Y / 2;
  g.add(flight(STAIRS.up), flight(STAIRS.down));
  const l = STAIRS.landing;
  g.add(box(l.x1 - l.x0, half, l.z1 - l.z0, m.tread as THREE.Material, (l.x0 + l.x1) / 2, half / 2, (l.z0 + l.z1) / 2));
  // The first floor's gallery, a slab from the top of the stairs to the corridor.
  const gl = STAIRS.gallery;
  g.add(box(gl.x1 - gl.x0, 0.3, gl.z1 - gl.z0, m.concrete as THREE.Material, (gl.x0 + gl.x1) / 2, FLOOR_Y - 0.15, (gl.z0 + gl.z1) / 2));
  // The wall between the two flights, up to the handrail of the upper one.
  g.add(box(STAIRS.up.x1 - STAIRS.up.x0, FLOOR_Y + 1.0, 0.08, m.tread as THREE.Material, (STAIRS.up.x0 + STAIRS.up.x1) / 2, (FLOOR_Y + 1.0) / 2, -2.45));
  // Handrails: along the first flight's open side, around the gallery's edge above it.
  const run = STAIRS.up.x1 - STAIRS.up.x0;
  const slope = Math.atan2(half, run);
  const rail = box(Math.hypot(run, half), 0.04, 0.04, m.rail as THREE.Material, (STAIRS.up.x0 + STAIRS.up.x1) / 2, half / 2 + 0.95, STAIRS.up.z1 - 0.04, false);
  rail.rotation.z = slope;
  g.add(rail);
  const edge = box(0.04, 0.04, -0.9 - -2.45, m.rail as THREE.Material, gl.x1 - 0.02, FLOOR_Y + 1.0, (-0.9 + -2.45) / 2, false);
  g.add(edge);
  for (let z = -2.4; z < -0.95; z += 0.12) g.add(box(0.02, 1.0, 0.02, m.rail as THREE.Material, gl.x1 - 0.02, FLOOR_Y + 0.5, z, false));
  return g;
}

export interface ShellOptions {
  /** The technical room's raised floor instead of concrete. */
  raisedFloor?: boolean;
  /** Ceiling lights on a grid (else none). */
  lights?: boolean;
}

/** Everything fixed that belongs to one zone of the building. */
export function zoneShell(zone: ZoneName, options: ShellOptions = {}): THREE.Group {
  const g = new THREE.Group();
  const z = ZONES.find((x) => x.name === zone);
  if (!z) return g;
  const r = z.rect;
  const m = M();
  const ceiling = zone === 'stairs' ? FLOOR_Y + ROOM_HEIGHT : z.y + ROOM_HEIGHT;
  if (options.raisedFloor) {
    const [w, d] = [r.x1 - r.x0, r.z1 - r.z0];
    const tex = raisedFloorTexture();
    tex.repeat.set(w / 1.2, d / 1.2);
    const normal = raisedFloorNormal();
    normal.repeat.set(w / 1.2, d / 1.2);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, normalMap: normal, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: photo('smooth_concrete_floor', w / 1.2, d / 1.2).roughnessMap, roughness: 0.75, metalness: 0.08 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((r.x0 + r.x1) / 2, z.y, (r.z0 + r.z1) / 2);
    floor.receiveShadow = true;
    g.add(floor);
  } else {
    g.add(slab(r, z.y + 0.001, m.concrete as THREE.Material, false, 2.4));
  }
  const tiles = ceilingTexture();
  tiles.repeat.set(1, 1);
  const ceilingMaterial = new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.95 });
  g.add(slab(r, ceiling, ceilingMaterial, true, 0.6));
  g.add(walls(zone));
  // Door frames belong to the corridors, which every room off them can see.
  if (zone === 'corridor' || zone === 'corridor1') g.add(doorFrames(z.y));
  if (zone === 'stairs') g.add(stairs());
  if (options.lights) g.add(panels(r, ceiling));
  return g;
}
