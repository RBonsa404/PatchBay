import * as THREE from 'three';
import { FLOOR_Y, inside, ROOM_HEIGHT, SITE_EXIT_X, SITE_Z, siteOf, WALL, WALLS, wallPieces, WINDOWS, ZONES, type Rect, type SiteName } from './building.js';
import { photoRelief } from './materials.js';
import { placeMany, placeProp, type Placement } from './props.js';
import { textTexture } from './textures.js';

/**
 * Each building seen from the street, for the trip from one site to another: its plastered façades drawn from the same
 * plan as the rooms (so every window is where it is inside), the band of each floor slab, the parapet round the flat
 * roof, the entrance with its canopy and the site's name, the pavement and the street. Every face looks outwards:
 * from inside, none of it is ever drawn.
 */

/** Where each site's street door is, and which way it opens (the outward normal). */
export const ENTRANCES: Record<SiteName, { x: number; z: number; out: [number, number]; name: string }> = {
  campus: { x: -14, z: -2.84, out: [-1, 0], name: 'INSTITUT SUPÉRIEUR DE TECHNOLOGIES' },
  agence: { x: SITE_EXIT_X, z: SITE_Z.agence - 9.2, out: [0, -1], name: 'IST · AGENCE DE BOBO-DIOULASSO' },
  datacenter: { x: SITE_EXIT_X, z: SITE_Z.datacenter - 9.2, out: [0, -1], name: 'OPÉRATEUR · CENTRE DE DONNÉES' },
};

const lit = (color: string, roughness = 0.8, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function zoneAt(x: number, y: number, z: number): string | null {
  for (const zone of ZONES) {
    if (!inside(x, z, zone.rect)) continue;
    if (zone.name === 'stairs') return 'stairs';
    if (y >= zone.y - 0.01 && y < zone.y + FLOOR_Y - 0.01) return zone.name;
  }
  return null;
}

function face(w: number, h: number, material: THREE.Material, metres = 1.6): THREE.Mesh {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / metres, (uv.getY(i) * h) / metres);
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** The rectangles [from, to] × [y0, y1] of a face once its windows are cut out of it. */
function solid(from: number, to: number, y0: number, y1: number, holes: { from: number; to: number; y0: number; y1: number }[]): { from: number; to: number; y0: number; y1: number }[] {
  const cutting = holes.filter((h) => h.to > from && h.from < to && h.y1 > y0 && h.y0 < y1);
  if (!cutting.length) return [{ from, to, y0, y1 }];
  const xs = [...new Set([from, to, ...cutting.flatMap((h) => [Math.max(from, h.from), Math.min(to, h.to)])])].sort((a, b) => a - b);
  const out: { from: number; to: number; y0: number; y1: number }[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const [a, b] = [xs[i] as number, xs[i + 1] as number];
    if (b - a < 1e-4) continue;
    const mid = (a + b) / 2;
    let bottom = y0;
    for (const h of cutting.filter((c) => c.from <= mid && c.to >= mid).sort((p, q) => p.y0 - q.y0)) {
      if (h.y0 > bottom + 1e-4) out.push({ from: a, to: b, y0: bottom, y1: Math.min(h.y0, y1) });
      bottom = Math.max(bottom, h.y1);
    }
    if (bottom < y1 - 1e-4) out.push({ from: a, to: b, y0: bottom, y1 });
  }
  return out;
}

export function buildExterior(site: SiteName): THREE.Group {
  const g = new THREE.Group();
  g.name = `exterior-${site}`;
  const render = new THREE.MeshStandardMaterial({ color: site === 'datacenter' ? '#c9ccd1' : '#dcc7a2', ...photoRelief('painted_plaster_wall', 1, 1), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.92 });
  const band = lit(site === 'datacenter' ? '#8f96a0' : '#b98f62', 0.85);
  const plinth = lit('#6f5a47', 0.9);
  const coping = lit('#e9e4da', 0.7);
  const onSite = (x: number, z: number): boolean => siteOf(z) === site && Math.abs(x) < 60;
  // Façades: every wall face that looks out of the building.
  for (const w of WALLS) {
    const alongX = w.z0 === w.z1;
    const line = alongX ? w.z0 : w.x0;
    if (!onSite(alongX ? (w.x0 + w.x1) / 2 : w.x0, alongX ? w.z0 : (w.z0 + w.z1) / 2)) continue;
    const holes = WINDOWS.filter((win) => (win.along === 'x') === alongX && Math.abs((alongX ? win.z : win.x) - line) < 0.01).map((win) => {
      const c = alongX ? win.x : win.z;
      return { from: c - win.width / 2, to: c + win.width / 2, y0: win.y + win.sill, y1: win.y + win.sill + win.height };
    });
    // Up to the next floor's slab, and a parapet when nothing stands above.
    const above = WALLS.some((o) => o !== w && (o.z0 === o.z1) === alongX && Math.abs((alongX ? o.z0 : o.x0) - line) < 0.01 && Math.abs(o.y0 - (w.y1 + FLOOR_Y - ROOM_HEIGHT)) < 0.05);
    const top = w.y1 + (FLOOR_Y - ROOM_HEIGHT) + (above ? 0 : 0.7);
    for (const p of wallPieces(w)) {
      for (const side of [-1, 1]) {
        const offset = line + side * (WALL / 2);
        const mid = (p.from + p.to) / 2;
        const probe = alongX ? [mid, p.y0 + 0.5, offset + side * 0.05] : [offset + side * 0.05, p.y0 + 0.5, mid];
        if (zoneAt(probe[0] as number, probe[1] as number, probe[2] as number) !== null) continue;
        const ry = alongX ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
        const place = (obj: THREE.Object3D, y: number, out: number, at: number): void => {
          if (alongX) obj.position.set(at, y, offset + side * out);
          else obj.position.set(offset + side * out, y, at);
          obj.rotation.y = ry;
          g.add(obj);
        };
        const y1 = Math.max(p.y1, top);
        for (const r of solid(p.from, p.to, p.y0, y1, holes)) place(face(r.to - r.from, r.y1 - r.y0, render), (r.y0 + r.y1) / 2, 0, (r.from + r.to) / 2);
        const length = p.to - p.from;
        if (p.y0 < 0.01) place(face(length + 0.02, 0.45, plinth), 0.225, 0.004, mid);
        // The slab's edge between the floors, a band of colour; the coping along the parapet.
        if (above || p.y1 > FLOOR_Y + 1) place(face(length + 0.02, 0.3, band), (above ? p.y1 : FLOOR_Y - 0.3) + 0.15, 0.004, mid);
        if (!above) place(box(length + 0.08, 0.06, WALL + 0.12, coping, 0, 0, 0), top + 0.03, -side * (WALL / 2), mid);
        // Outside sills under the windows of this piece.
        for (const h of holes) if (h.from >= p.from - 1e-3 && h.to <= p.to + 1e-3) place(box(h.to - h.from + 0.1, 0.04, 0.09, coping, 0, 0, 0), h.y0 - 0.02, 0.045, (h.from + h.to) / 2);
      }
    }
  }
  // The flat roofs: over every room that has nothing above it.
  let tankRoof: { x: number; z: number; y: number; area: number; w: number; d: number } | null = null;
  const gravel = lit('#8d8a83', 0.95);
  for (const zone of ZONES) {
    if (!onSite((zone.rect.x0 + zone.rect.x1) / 2, (zone.rect.z0 + zone.rect.z1) / 2)) continue;
    const r = zone.rect;
    const y = (zone.name === 'stairs' ? FLOOR_Y : zone.y) + FLOOR_Y + 0.001;
    // Cut the room into cells along the edges of the rooms above it; roof the cells that nothing covers.
    const upper = zone.name === 'stairs' ? [] : ZONES.filter((o) => o.y > zone.y + 0.1 && o.rect.x1 > r.x0 && o.rect.x0 < r.x1 && o.rect.z1 > r.z0 && o.rect.z0 < r.z1);
    const xs = [...new Set([r.x0, r.x1, ...upper.flatMap((o) => [o.rect.x0, o.rect.x1]).filter((v) => v > r.x0 && v < r.x1)])].sort((a, b) => a - b);
    const zs = [...new Set([r.z0, r.z1, ...upper.flatMap((o) => [o.rect.z0, o.rect.z1]).filter((v) => v > r.z0 && v < r.z1)])].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      for (let k = 0; k < zs.length - 1; k++) {
        const [x0, x1, z0, z1] = [xs[i] as number, xs[i + 1] as number, zs[k] as number, zs[k + 1] as number];
        if (upper.some((o) => inside((x0 + x1) / 2, (z0 + z1) / 2, o.rect))) continue;
        const roof = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + WALL, z1 - z0 + WALL), gravel);
        roof.rotation.x = -Math.PI / 2;
        roof.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
        roof.receiveShadow = true;
        g.add(roof);
        const area = (x1 - x0) * (z1 - z0);
        if (area > 12 && (!tankRoof || y > tankRoof.y + 0.1 || (Math.abs(y - tankRoof.y) < 0.1 && area > tankRoof.area))) tankRoof = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, y, area, w: x1 - x0, d: z1 - z0 };
      }
    }
  }
  g.add(entrance(site));
  // Life on the outside walls and the roof: split air conditioners beside the windows, the water tank on its tower.
  placeMany(g, 'ac_unit', airConditioners(onSite));
  if (tankRoof) {
    const roof: { x: number; z: number; y: number; w: number; d: number } = tankRoof;
    placeProp(g, 'water_tank', { x: roof.x + Math.max(0, roof.w / 2 - 1.6), y: roof.y, z: roof.z - Math.max(0, roof.d / 2 - 1.6), turn: 0.2 });
  }
  return g;
}

/**
 * The outdoor unit of a split air conditioner beside every other outside window, hung at the height of its sill on
 * the side where the wall goes on; none where it would cover another window or hang off the building.
 */
function airConditioners(onSite: (x: number, z: number) => boolean): Placement[] {
  const units: Placement[] = [];
  const along = (w: (typeof WINDOWS)[number]): number => (w.along === 'x' ? w.x : w.z);
  WINDOWS.forEach((w, i) => {
    if (i % 2 === 1 || !onSite(w.x, w.z)) return;
    // The outward normal of the wall the window is in.
    const [ox, oz] = w.along === 'x' ? [0, -w.inside] : [-w.inside, 0];
    for (const side of [1, -1]) {
      const c = along(w) + side * (w.width / 2 + 0.75);
      const [x, z] = w.along === 'x' ? [c, w.z] : [w.x, c];
      const y = w.y + w.sill;
      // Wall behind (a room inside), open air in front, and no other window under the unit.
      const covers = WINDOWS.some((o) => o !== w && o.along === w.along && Math.abs((o.along === 'x' ? o.z : o.x) - (w.along === 'x' ? w.z : w.x)) < 0.01 && Math.abs(o.y - w.y) < 0.1 && Math.abs(along(o) - c) < o.width / 2 + 0.5);
      const behind = zoneAt(x - ox * 0.4, y, z - oz * 0.4) !== null && zoneAt(x - ox * 0.4 + (w.along === 'x' ? 0.45 * side : 0), y, z - oz * 0.4 + (w.along === 'z' ? 0.45 * side : 0)) !== null;
      const front = zoneAt(x + ox * 0.6, y, z + oz * 0.6) === null;
      if (covers || !behind || !front) continue;
      units.push({ x: x + ox * (WALL / 2), y: y - 0.1, z: z + oz * (WALL / 2), turn: Math.atan2(ox, oz) });
      return;
    }
  });
  return units;
}

/** The street door from outside: double glazed doors, a concrete canopy, the name of the place in letters. */
function entrance(site: SiteName): THREE.Group {
  const e = ENTRANCES[site];
  const g = new THREE.Group();
  const frame = lit('#1f2937', 0.35, 0.5);
  const glass = lit('#7f97ab', 0.08, 0.3);
  for (const s of [-1, 1]) {
    g.add(box(0.78, 2.1, 0.05, frame, s * 0.4, 1.05, 0.03), box(0.52, 1.5, 0.052, glass, s * 0.4, 1.2, 0.031));
  }
  g.add(box(2.4, 0.18, 1.5, lit('#e9e4da', 0.7), 0, 2.75, 0.75));
  const letters = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 0.36),
    new THREE.MeshStandardMaterial({ map: textTexture(e.name, { width: 2048, height: 160, color: '#0b1e3f', font: '700 96px Poppins, sans-serif' }), transparent: true, roughness: 0.8 }),
  );
  letters.position.set(0, 3.15, 0.012);
  g.add(letters);
  // Steps up to the door.
  g.add(box(2.6, 0.08, 1.2, lit('#c9c3b8', 0.85), 0, 0.04, 0.6));
  g.rotation.y = Math.atan2(e.out[0], e.out[1]);
  g.position.set(e.x + e.out[0] * (WALL / 2), 0, e.z + e.out[1] * (WALL / 2));
  return g;
}

/** The ground around a building: pavement round its walls, the street in front of the door, red earth beyond. */
export function buildStreet(site: SiteName, footprint: Rect): THREE.Group {
  const g = new THREE.Group();
  g.name = `street-${site}`;
  const cx = (footprint.x0 + footprint.x1) / 2;
  const cz = (footprint.z0 + footprint.z1) / 2;
  const earth = new THREE.Mesh(new THREE.CircleGeometry(42, 48), lit('#a87b5c', 0.97));
  earth.rotation.x = -Math.PI / 2;
  earth.position.set(cx, -0.02, cz);
  earth.receiveShadow = true;
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(footprint.x1 - footprint.x0 + 4, footprint.z1 - footprint.z0 + 4), lit('#bdb7ad', 0.85));
  pave.rotation.x = -Math.PI / 2;
  pave.position.set(cx, -0.012, cz);
  pave.receiveShadow = true;
  g.add(earth, pave);
  // The street, along the façade with the door.
  const e = ENTRANCES[site];
  const road = new THREE.Mesh(new THREE.PlaneGeometry(e.out[0] === 0 ? 80 : 8, e.out[0] === 0 ? 8 : 80), lit('#3a3b3d', 0.9));
  road.rotation.x = -Math.PI / 2;
  road.position.set(e.out[0] === 0 ? cx : e.x + e.out[0] * 9, -0.008, e.out[0] === 0 ? e.z + e.out[1] * 9 : cz);
  road.receiveShadow = true;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(e.out[0] === 0 ? 80 : 0.12, e.out[0] === 0 ? 0.12 : 80), lit('#f1f1ee', 0.6));
  line.rotation.x = -Math.PI / 2;
  line.position.set(road.position.x, -0.006, road.position.z);
  g.add(road, line);
  g.add(boundary(e, footprint));
  return g;
}

/**
 * The plot's front boundary, as round most buildings of the city: a low rendered wall with a painted railing along
 * the street, returning to the façade at both ends, and the open sliding gate in front of the door.
 */
function boundary(e: (typeof ENTRANCES)[SiteName], footprint: Rect): THREE.Group {
  const g = new THREE.Group();
  const [ox, oz] = e.out;
  const turn = Math.atan2(ox, oz);
  // Along the street: a = (oz, -ox), the model's +X once turned.
  const [ax, az] = [oz, -ox];
  const d = 3.4;
  const px = e.x + ox * d;
  const pz = e.z + oz * d;
  const corners: [number, number][] = [[footprint.x0, footprint.z0], [footprint.x1, footprint.z0], [footprint.x0, footprint.z1], [footprint.x1, footprint.z1]];
  const s = corners.map(([x, z]) => (x - px) * ax + (z - pz) * az);
  let lo = Math.min(...s) - 1.5;
  let hi = Math.max(...s) + 1.5;
  // The open gate slides behind the wall on the side with the more room; the wall runs at least past its leaf.
  const LEAF = 6.8;
  const right = hi >= -lo;
  if (right) hi = Math.max(hi, LEAF);
  else lo = Math.min(lo, -LEAF);
  const at = (u: number, v: number, t = turn): Placement => ({ x: px + ax * u + ox * v, y: 0, z: pz + az * u + oz * v, turn: t });
  placeProp(g, 'gate', at(0, 0, right ? turn : turn + Math.PI));
  const bays: Placement[] = [];
  const BAY = 2.5;
  const START = 2.4 - 0.15;
  // The model's pillar is at its +X end: to the right of the gate the bays run outwards, to the left they turn round.
  let east = START;
  let west = -START;
  for (; east < hi; east += BAY) bays.push(at(east + BAY / 2, 0));
  for (; west > lo; west -= BAY) bays.push(at(west - BAY / 2, 0, turn + Math.PI));
  // The returns, from the ends of the front wall back to the building's line.
  for (const u of [east, west]) for (let v = -BAY / 2; v > -(d + 1.5); v -= BAY) bays.push(at(u, v, turn + (Math.PI / 2) * Math.sign(u)));
  placeMany(g, 'fence', bays);
  return g;
}
