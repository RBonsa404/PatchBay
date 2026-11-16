import * as THREE from 'three';
import { DOOR_HEIGHT, DOORS, FLOOR_Y, inside, ROOM_HEIGHT, STAIRS, WALL, WALLS, wallPieces, WINDOWS, ZONES, type Flight, type Rect, type Window, type ZoneName } from './building.js';
import { daytime } from './daytime.js';
import { ceilingTexture, outsideTexture, paintTexture, photo, photoRelief, raisedFloorNormal, raisedFloorTexture, sunPatchTexture } from './materials.js';

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
    alu: lit('#cfd5dc', 0.32, 0.85),
    sill: lit('#eef0f2', 0.45),
    glass: new THREE.MeshStandardMaterial({ color: '#dbe7f2', transparent: true, opacity: 0.09, roughness: 0.04, metalness: 0, depthWrite: false }),
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

/** Where along a wall the rooms change: the edges of every room's rectangle that fall within [from, to]. */
function cutsAlong(alongX: boolean, from: number, to: number): number[] {
  const edges = ZONES.flatMap((z) => (alongX ? [z.rect.x0, z.rect.x1] : [z.rect.z0, z.rect.z1])).filter((v) => v > from + 1e-3 && v < to - 1e-3);
  return [from, ...[...new Set(edges)].sort((a, b) => a - b), to];
}

/** The windows cut in the wall on this line, as rectangles along the wall: [from, to] × [y0, y1]. */
function holesIn(alongX: boolean, line: number): { from: number; to: number; y0: number; y1: number }[] {
  return WINDOWS.filter((w) => (w.along === 'x') === alongX && Math.abs((alongX ? w.z : w.x) - line) < 0.01).map((w) => {
    const c = alongX ? w.x : w.z;
    return { from: c - w.width / 2, to: c + w.width / 2, y0: w.y + w.sill, y1: w.y + w.sill + w.height };
  });
}

/** The solid parts of the rectangle [from, to] × [y0, y1] once the holes are taken out of it. */
function solidRects(from: number, to: number, y0: number, y1: number, holes: { from: number; to: number; y0: number; y1: number }[]): { from: number; to: number; y0: number; y1: number }[] {
  const inside = holes.filter((h) => h.to > from && h.from < to && h.y1 > y0 && h.y0 < y1);
  if (!inside.length) return [{ from, to, y0, y1 }];
  const xs = [...new Set([from, to, ...inside.flatMap((h) => [Math.max(from, h.from), Math.min(to, h.to)])])].sort((a, b) => a - b);
  const out: { from: number; to: number; y0: number; y1: number }[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const [a, b] = [xs[i] as number, xs[i + 1] as number];
    if (b - a < 1e-4) continue;
    const mid = (a + b) / 2;
    const cutting = inside.filter((h) => h.from <= mid && h.to >= mid).sort((p, q) => p.y0 - q.y0);
    let bottom = y0;
    for (const h of cutting) {
      if (h.y0 > bottom + 1e-4) out.push({ from: a, to: b, y0: bottom, y1: Math.min(h.y0, y1) });
      bottom = Math.max(bottom, h.y1);
    }
    if (bottom < y1 - 1e-4) out.push({ from: a, to: b, y0: bottom, y1 });
  }
  return out;
}

/**
 * The faces of every wall that look into `zone`. A wall shared by several rooms (a partition meeting an outside
 * wall, say) is cut where the rooms change, so that each room gets exactly its own stretch of it.
 */
function walls(zone: ZoneName): THREE.Group {
  const g = new THREE.Group();
  const m = M();
  for (const w of WALLS) {
    const alongX = w.z0 === w.z1;
    const line = alongX ? w.z0 : w.x0;
    const holes = holesIn(alongX, line);
    for (const p of wallPieces(w)) {
      const cuts = cutsAlong(alongX, p.from, p.to);
      for (let c = 0; c < cuts.length - 1; c++) {
        const [from, to] = [cuts[c] as number, cuts[c + 1] as number];
        const length = to - from;
        const mid = (from + to) / 2;
        for (const side of [-1, 1]) {
          const offset = line + side * (WALL / 2);
          // Which zone this face looks into: just in front of it, at the foot of the stretch.
          const probe = alongX ? [mid, p.y0 + 0.5, offset + side * 0.05] : [offset + side * 0.05, p.y0 + 0.5, mid];
          if (zoneAt(probe[0] as number, probe[1] as number, probe[2] as number) !== zone) continue;
          const ry = alongX ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
          const place = (obj: THREE.Object3D, y: number, out: number, at = mid): void => {
            if (alongX) obj.position.set(at, y, offset + side * out);
            else obj.position.set(offset + side * out, y, at);
            obj.rotation.y = ry;
            g.add(obj);
          };
          for (const r of solidRects(from, to, p.y0, p.y1, holes)) place(face(r.to - r.from, r.y1 - r.y0, m.paint as THREE.Material), (r.y0 + r.y1) / 2, 0, (r.from + r.to) / 2);
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
  }
  for (const w of WINDOWS) {
    const probe = w.along === 'x' ? [w.x, w.y + 0.5, w.z + w.inside * (WALL / 2 + 0.05)] : [w.x + w.inside * (WALL / 2 + 0.05), w.y + 0.5, w.z];
    if (zoneAt(probe[0] as number, probe[1] as number, probe[2] as number) === zone) g.add(windowAssembly(w, ZONES.find((z) => z.name === zone)?.rect));
  }
  return g;
}

/**
 * A window in its opening: the reveals through the wall, the aluminium frame with its mullion and transom, the glass,
 * the inside sill; the daylight it gives to the light bake; a shaft of sun and its patch on the floor when `sun`.
 */
/** Below this share of the sun's travel going into the room, its light only grazes the wall: no shaft. */
const SUN_GRAZING = 0.25;

function windowAssembly(w: Window, room?: Rect): THREE.Group {
  const g = new THREE.Group();
  const m = M();
  const [W, H, T] = [w.width, w.height, WALL];
  // Reveals: the wall's thickness, seen inside the opening.
  const reveal = (pw: number, ph: number, x: number, y: number, rx: number, ry: number): void => {
    const f = face(pw, ph, m.paint as THREE.Material, 1.6);
    f.position.set(x, y, 0);
    f.rotation.set(rx, ry, 0);
    g.add(f);
  };
  reveal(T, H, -W / 2, H / 2, 0, Math.PI / 2);
  reveal(T, H, W / 2, H / 2, 0, -Math.PI / 2);
  reveal(W, T, 0, H, Math.PI / 2, 0);
  reveal(W, T, 0, 0, -Math.PI / 2, 0);
  // The frame, set back towards the outside of the wall.
  const alu = m.alu as THREE.Material;
  const fz = -T / 2 + 0.035;
  for (const s of [-1, 1]) {
    g.add(box(0.055, H, 0.06, alu, s * (W / 2 - 0.0275), H / 2, fz, false));
    g.add(box(W, 0.055, 0.06, alu, 0, s < 0 ? 0.0275 : H - 0.0275, fz, false));
  }
  g.add(box(0.045, H, 0.05, alu, 0, H / 2, fz, false), box(W, 0.045, 0.05, alu, 0, H * 0.72, fz, false));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), m.glass as THREE.Material);
  glass.position.set(0, H / 2, fz);
  glass.userData.dynamic = true;
  g.add(glass);
  // The inside sill: a white board proud of the wall.
  g.add(box(W + 0.12, 0.03, T / 2 + 0.07, m.sill as THREE.Material, 0, -0.015, T / 4 + 0.035));
  // The daylight for the light bake: an emitter in the opening, never drawn in the game.
  const light = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: outsideTexture('quad'), color: '#ffffff' }));
  light.position.set(0, H / 2, -T / 2 - 0.02);
  light.visible = false;
  light.userData.dynamic = true;
  light.userData.windowLight = true;
  g.add(light);
  g.rotation.y = w.along === 'x' ? (w.inside > 0 ? 0 : Math.PI) : w.inside > 0 ? Math.PI / 2 : -Math.PI / 2;
  g.position.set(w.x, w.y + w.sill, w.z);
  // The sun of the mission's time of day, in the window's own frame: it comes in only through a window facing it.
  const look = daytime();
  const sun = new THREE.Vector3(look.sun.dot(new THREE.Vector3(1, 0, 0).applyEuler(g.rotation)), look.sun.y, look.sun.dot(new THREE.Vector3(0, 0, 1).applyEuler(g.rotation)));
  if (w.sun && sun.z > SUN_GRAZING) {
    // The sun stops at the room's walls: the shaft and its patch are cut at their inside faces.
    g.updateMatrix();
    const inner = room && { x0: room.x0 + WALL / 2, x1: room.x1 - WALL / 2, z0: room.z0 + WALL / 2, z1: room.z1 - WALL / 2 };
    g.add(sunlight(W, H, w.sill, sun, inner ? { matrix: g.matrix, rect: inner } : undefined));
  }
  return g;
}

/** A corner of a polygon being cut: where it is, and what it carries (colour or texture coordinates). */
interface Corner {
  p: THREE.Vector3;
  extra: number[];
}

/**
 * Cut a flat polygon (in the window's own frame) to a room's floor plan: what lies beyond its walls is dropped. The
 * cut is done in the building's frame (`matrix` takes the window's frame there), one wall at a time.
 */
function cutToRoom(polygon: Corner[], clip: { matrix: THREE.Matrix4; rect: Rect } | undefined): Corner[] {
  if (!clip) return polygon;
  const back = clip.matrix.clone().invert();
  let poly = polygon.map((c) => ({ p: c.p.clone().applyMatrix4(clip.matrix), extra: c.extra }));
  const { x0, x1, z0, z1 } = clip.rect;
  const sides: ((p: THREE.Vector3) => number)[] = [(p) => p.x - x0, (p) => x1 - p.x, (p) => p.z - z0, (p) => z1 - p.z];
  for (const inside of sides) {
    const out: Corner[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] as Corner;
      const b = poly[(i + 1) % poly.length] as Corner;
      const da = inside(a.p);
      const db = inside(b.p);
      if (da >= 0) out.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push({ p: a.p.clone().lerp(b.p, t), extra: a.extra.map((v, k) => v + ((b.extra[k] as number) - v) * t) });
      }
    }
    poly = out;
    if (poly.length < 3) return [];
  }
  return poly.map((c) => ({ p: c.p.applyMatrix4(back), extra: c.extra }));
}

/** Triangles of a convex polygon, as a fan: positions, and what each corner carries. */
function fan(polygon: Corner[], positions: number[], extras: number[]): void {
  for (let i = 1; i + 1 < polygon.length; i++) {
    for (const c of [polygon[0], polygon[i], polygon[i + 1]] as Corner[]) {
      positions.push(c.p.x, c.p.y, c.p.z);
      extras.push(...c.extra);
    }
  }
}

/**
 * The shaft of sunlight through an opening W × H whose sill is `sill` above the floor, and the patch it makes there;
 * both cut at the walls of the room when `clip` gives them.
 */
function sunlight(W: number, H: number, sill: number, sun: THREE.Vector3, clip?: { matrix: THREE.Matrix4; rect: Rect }): THREE.Group {
  const g = new THREE.Group();
  const look = daytime();
  const SUN = sun.clone().normalize();
  const corners = [new THREE.Vector3(-W / 2, 0, 0), new THREE.Vector3(W / 2, 0, 0), new THREE.Vector3(W / 2, H, 0), new THREE.Vector3(-W / 2, H, 0)];
  // Where each corner's ray meets the floor (local y = -sill).
  const floor = corners.map((c) => c.clone().addScaledVector(SUN, (c.y + sill) / -SUN.y));
  const positions: number[] = [];
  const colours: number[] = [];
  const warm = new THREE.Color(look.light);
  const tint = (fade: number): number[] => [warm.r * fade, warm.g * fade, warm.b * fade];
  for (let i = 0; i < 4; i++) {
    const [a, b] = [corners[i] as THREE.Vector3, corners[(i + 1) % 4] as THREE.Vector3];
    const [fa, fb] = [floor[i] as THREE.Vector3, floor[(i + 1) % 4] as THREE.Vector3];
    const side: Corner[] = [
      { p: a, extra: tint(1) },
      { p: b, extra: tint(1) },
      { p: fb, extra: tint(0.15) },
      { p: fa, extra: tint(0.15) },
    ];
    fan(cutToRoom(side, clip), positions, colours);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const shaft = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: look.shaft, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  shaft.userData.dynamic = true;
  shaft.renderOrder = 5;
  const uvs = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const patchCorners = floor.map((v, i): Corner => ({ p: new THREE.Vector3(v.x, -sill + 0.006, v.z), extra: uvs[i] as number[] }));
  const patchPositions: number[] = [];
  const patchUvs: number[] = [];
  fan(cutToRoom(patchCorners, clip), patchPositions, patchUvs);
  const patchGeometry = new THREE.BufferGeometry();
  patchGeometry.setAttribute('position', new THREE.Float32BufferAttribute(patchPositions, 3));
  patchGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(patchUvs, 2));
  const patch = new THREE.Mesh(patchGeometry, new THREE.MeshBasicMaterial({ map: sunPatchTexture(), color: look.light, transparent: true, opacity: look.patch, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  patch.userData.dynamic = true;
  patch.renderOrder = -1;
  g.add(shaft, patch);
  return g;
}

/** The frame of each doorway on the floor of `zone` (both faces of the wall, and its reveals). */
function doorFrames(y: number, r: Rect): THREE.Group {
  const g = new THREE.Group();
  const m = M();
  for (const d of DOORS) {
    if (Math.abs(d.y - y) > 0.01) continue;
    // Only the doors on this corridor's own walls.
    if (d.along === 'x' ? d.x < r.x0 || d.x > r.x1 || (Math.abs(d.z - r.z0) > 0.01 && Math.abs(d.z - r.z1) > 0.01) : d.z < r.z0 || d.z > r.z1 || (Math.abs(d.x - r.x0) > 0.01 && Math.abs(d.x - r.x1) > 0.01)) continue;
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
  if (zone === 'corridor' || zone === 'corridor1' || zone.endsWith('-corridor')) g.add(doorFrames(z.y, r));
  if (zone === 'stairs') g.add(stairs());
  if (options.lights) g.add(panels(r, ceiling));
  return g;
}
