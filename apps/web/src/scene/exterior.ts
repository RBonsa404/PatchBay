import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOOR_Y, inside, ROOM_HEIGHT, SITE_EXIT_X, SITE_Z, siteOf, WALL, WALLS, wallPieces, WINDOWS, ZONES, type Rect, type SiteName } from './building.js';
import { daytime, daytimeName, type Daytime } from './daytime.js';
import { photo, photoRelief } from './materials.js';
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
  g.add(glazing(onSite));
  // Life on the outside walls and the roof: split air conditioners beside the windows, the water tank on its tower.
  placeMany(g, 'ac_unit', airConditioners(onSite));
  if (tankRoof) {
    const roof: { x: number; z: number; y: number; w: number; d: number } = tankRoof;
    placeProp(g, 'water_tank', { x: roof.x + Math.max(0, roof.w / 2 - 1.6), y: roof.y, z: roof.z - Math.max(0, roof.d / 2 - 1.6), turn: 0.2 });
  }
  return g;
}

/** How many looks the glazing atlas holds side by side (blinds lowered more or less, curtains, a lit ceiling). */
const GLAZING_LOOKS = 4;
let glazingAtlas: THREE.CanvasTexture | null = null;

/**
 * What a window shows from the street by day: the room is much darker than the street, so the glass reads as a deep
 * blue-grey with the sky reflected in a soft streak, the ceiling lights glowing at the top, and venetian blinds or a
 * curtain behind it. Painted once in a canvas, `GLAZING_LOOKS` looks side by side.
 */
function glazingTexture(): THREE.CanvasTexture {
  if (glazingAtlas) return glazingAtlas;
  const [W, H] = [512, 448];
  const canvas = document.createElement('canvas');
  canvas.width = W * GLAZING_LOOKS;
  canvas.height = H;
  const c = canvas.getContext('2d') as CanvasRenderingContext2D;
  // A fixed sequence, the same on every machine: no window ever changes from one visit to the next.
  let seed = 7;
  const rand = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let k = 0; k < GLAZING_LOOKS; k++) {
    const x0 = k * W;
    // The room: dark, a little lighter near the ceiling, its far wall and a desk seen as darker shapes.
    const room = c.createLinearGradient(0, 0, 0, H);
    room.addColorStop(0, '#3b4a57');
    room.addColorStop(0.35, '#26323d');
    room.addColorStop(1, '#151d25');
    c.fillStyle = room;
    c.fillRect(x0, 0, W, H);
    c.fillStyle = 'rgba(10,14,18,0.55)';
    c.fillRect(x0 + W * (0.1 + rand() * 0.3), H * 0.62, W * 0.45, H * 0.38);
    // The ceiling's LED panels, glowing.
    c.fillStyle = 'rgba(214,226,236,0.55)';
    for (let i = 0; i < 2; i++) c.fillRect(x0 + W * (0.12 + i * 0.46 + rand() * 0.08), H * 0.04, W * 0.26, H * 0.025);
    // Blinds lowered to a different height in each look, or a curtain drawn to one side.
    if (k === GLAZING_LOOKS - 1) {
      const side = rand() < 0.5 ? 0 : 1;
      const curtain = c.createLinearGradient(x0, 0, x0 + W * 0.3, 0);
      curtain.addColorStop(0, '#b9a98f');
      curtain.addColorStop(1, '#8a7c66');
      c.fillStyle = curtain;
      for (let f = 0; f < 6; f++) {
        c.globalAlpha = f % 2 ? 0.92 : 0.78;
        c.fillRect(x0 + (side ? W * 0.7 : 0) + f * W * 0.05, 0, W * 0.05, H);
      }
      c.globalAlpha = 1;
    } else {
      const down = H * ([0.22, 0.48, 0.7][k % 3] as number);
      for (let y = 0; y < down; y += 11) {
        c.fillStyle = '#c8ccc9';
        c.fillRect(x0, y, W, 8);
        c.fillStyle = '#8e9493';
        c.fillRect(x0, y + 8, W, 1.5);
      }
      c.fillStyle = '#9aa09f';
      c.fillRect(x0, down - 2, W, 6);
    }
    // The sky in the glass: a soft diagonal streak, brighter at the top.
    const sky = c.createLinearGradient(x0, 0, x0 + W, H);
    sky.addColorStop(0, 'rgba(190,215,235,0.32)');
    sky.addColorStop(0.35, 'rgba(190,215,235,0.1)');
    sky.addColorStop(0.5, 'rgba(225,238,248,0.28)');
    sky.addColorStop(0.62, 'rgba(190,215,235,0.06)');
    sky.addColorStop(1, 'rgba(190,215,235,0)');
    c.fillStyle = sky;
    c.fillRect(x0, 0, W, H);
  }
  glazingAtlas = new THREE.CanvasTexture(canvas);
  glazingAtlas.colorSpace = THREE.SRGBColorSpace;
  glazingAtlas.anisotropy = 4;
  return glazingAtlas;
}

/**
 * Every outside window seen from the street: the reveals of the opening, the glass set back in it and its aluminium
 * frame with the same mullion and transom as inside. All of it faces outwards (never drawn from inside), merged into
 * three meshes for the whole building: three draw calls whatever the number of windows.
 */
function glazing(onSite: (x: number, z: number) => boolean): THREE.Group {
  const g = new THREE.Group();
  g.name = 'glazing';
  const parts = { glass: [] as THREE.BufferGeometry[], frame: [] as THREE.BufferGeometry[], reveal: [] as THREE.BufferGeometry[] };
  const DEPTH = 0.035;
  const matrix = new THREE.Matrix4();
  const plane = (list: THREE.BufferGeometry[], w: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0): void => {
    const p = new THREE.PlaneGeometry(w, h);
    p.rotateX(rx);
    p.rotateY(ry);
    p.translate(x, y, z);
    list.push(p);
  };
  WINDOWS.forEach((w, i) => {
    const [ox, oz] = w.along === 'x' ? [0, -w.inside] : [-w.inside, 0];
    const [cx, cz] = [w.x + ox * (WALL / 2), w.z + oz * (WALL / 2)];
    if (!onSite(w.x, w.z) || zoneAt(cx + ox * 0.3, w.y + w.sill + 0.5, cz + oz * 0.3) !== null) return;
    const [W, H] = [w.width, w.height];
    const before = { glass: parts.glass.length, frame: parts.frame.length, reveal: parts.reveal.length };
    // Reveals, a millimetre inside the room's own, so the two never fight when both are drawn.
    plane(parts.reveal, DEPTH, H, -W / 2 + 0.001, H / 2, -DEPTH / 2, 0, Math.PI / 2);
    plane(parts.reveal, DEPTH, H, W / 2 - 0.001, H / 2, -DEPTH / 2, 0, -Math.PI / 2);
    plane(parts.reveal, W, DEPTH, 0, H - 0.001, -DEPTH / 2, Math.PI / 2);
    plane(parts.reveal, W, DEPTH, 0, 0.001, -DEPTH / 2, -Math.PI / 2);
    // The glass, showing one of the looks of the atlas.
    plane(parts.glass, W, H, 0, H / 2, -DEPTH);
    const look = (i * 5 + Math.round(w.x * 3 + w.z)) % GLAZING_LOOKS;
    const uv = (parts.glass[parts.glass.length - 1] as THREE.BufferGeometry).attributes.uv as THREE.BufferAttribute;
    for (let v = 0; v < uv.count; v++) uv.setX(v, (look + uv.getX(v)) / GLAZING_LOOKS);
    // The frame just proud of the glass: its four sides, the mullion and the transom.
    const f = -DEPTH + 0.004;
    plane(parts.frame, 0.055, H, -W / 2 + 0.0275, H / 2, f);
    plane(parts.frame, 0.055, H, W / 2 - 0.0275, H / 2, f);
    plane(parts.frame, W, 0.055, 0, 0.0275, f);
    plane(parts.frame, W, 0.055, 0, H - 0.0275, f);
    plane(parts.frame, 0.045, H - 0.11, 0, H / 2, f + 0.001);
    plane(parts.frame, W - 0.11, 0.045, 0, H * 0.72, f + 0.001);
    matrix.makeRotationY(Math.atan2(ox, oz)).setPosition(cx, w.y + w.sill, cz);
    for (const key of ['glass', 'frame', 'reveal'] as const) for (const p of parts[key].slice(before[key])) p.applyMatrix4(matrix);
  });
  const materials = {
    glass: new THREE.MeshStandardMaterial({ map: glazingTexture(), roughness: 0.1, metalness: 0.2 }),
    frame: lit('#3a3f45', 0.4, 0.6),
    reveal: lit('#d6c19c', 0.92),
  };
  for (const key of ['glass', 'frame', 'reveal'] as const) {
    if (!parts[key].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts[key], false), materials[key]);
    mesh.receiveShadow = true;
    mesh.name = `glazing-${key}`;
    for (const p of parts[key]) p.dispose();
    g.add(mesh);
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

/** The street's ends fade out the same way, along its length. */
const roadEdges = new Map<boolean, THREE.Texture>();
function roadEdge(along: boolean): THREE.Texture {
  let t = roadEdges.get(along);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = along ? 256 : 4;
  c.height = along ? 4 : 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = along ? g.createLinearGradient(0, 0, 256, 0) : g.createLinearGradient(0, 0, 0, 256);
  r.addColorStop(0, '#000');
  r.addColorStop(0.3, '#fff');
  r.addColorStop(0.7, '#fff');
  r.addColorStop(1, '#000');
  g.fillStyle = r;
  g.fillRect(0, 0, c.width, c.height);
  t = new THREE.CanvasTexture(c);
  roadEdges.set(along, t);
  return t;
}

/** A soft edge for the ground: opaque in the middle, fading out towards the photographed town around. */
let fadeEdge: THREE.Texture | null = null;
function edge(): THREE.Texture {
  if (fadeEdge) return fadeEdge;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  r.addColorStop(0, '#fff');
  r.addColorStop(1, '#000');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  fadeEdge = new THREE.CanvasTexture(c);
  return fadeEdge;
}

/** Ground photographed (Poly Haven, CC0), `size` metres per tile, fading at its edges when `fade` is given. */
function ground(name: string, tilesX: number, tilesY: number, fade?: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ ...photo(name, tilesX, tilesY), roughness: 1 });
  if (fade) {
    m.alphaMap = fade;
    m.transparent = true;
    m.depthWrite = false;
  }
  return m;
}

/** The ground around a building: pavement round its walls, the street in front of the door, red earth beyond. */
export function buildStreet(site: SiteName, footprint: Rect): THREE.Group {
  const g = new THREE.Group();
  g.name = `street-${site}`;
  const cx = (footprint.x0 + footprint.x1) / 2;
  const cz = (footprint.z0 + footprint.z1) / 2;
  // Red laterite, as round every building of the country, fading into the photographed town (no edge to the ground).
  const earth = new THREE.Mesh(new THREE.CircleGeometry(42, 48), ground('red_laterite_soil_stones', 21, 21, edge()));
  earth.renderOrder = -5;
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
  const along = e.out[0] === 0;
  const road = new THREE.Mesh(new THREE.PlaneGeometry(along ? 80 : 8, along ? 8 : 80), ground('asphalt_02', along ? 20 : 2, along ? 2 : 20, roadEdge(along)));
  road.renderOrder = -4;
  road.rotation.x = -Math.PI / 2;
  road.position.set(e.out[0] === 0 ? cx : e.x + e.out[0] * 9, -0.008, e.out[0] === 0 ? e.z + e.out[1] * 9 : cz);
  road.receiveShadow = true;
  const lineMat = lit('#e9e7df', 0.6);
  lineMat.alphaMap = roadEdge(along);
  lineMat.transparent = true;
  lineMat.depthWrite = false;
  const line = new THREE.Mesh(new THREE.PlaneGeometry(along ? 80 : 0.12, along ? 0.12 : 80), lineMat);
  line.renderOrder = -3;
  line.rotation.x = -Math.PI / 2;
  line.position.set(road.position.x, -0.006, road.position.z);
  g.add(road, line);
  g.add(boundary(e, footprint));
  // Across the campus street, the town is modelled (the photographed one was a foreign shopping street).
  if (site === 'campus') g.add(facingStreet(site));
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


interface Shop {
  sign: [string, string];
  paint: string;
  ground: string;
  ink: string;
  open: boolean;
}
const shop = (title: string, line: string, paint: string, ground: string, ink: string, open = true): Shop => ({ sign: [title, line], paint, ground, ink, open });

/** Across the campus street, in order along it: shops, open or with their shutter down, and gaps where a neem grows. */
const FAR_SHOPS: (Shop | null)[] = [
  shop('VULCANISATEUR', 'Pneus · chambres à air · motos et vélos', '#cdb38c', '#111827', '#facc15'),
  shop('DÉPÔT DE BOISSONS', 'Eau · sucreries · glace', '#d8c3a5', '#0e7490', '#ffffff', false),
  null,
  shop('ATELIER SOUDURE', 'Portails · grilles · fenêtres', '#bfc4c7', '#374151', '#fbbf24'),
  shop('BOULANGERIE DU QUARTIER', 'Pain chaud matin et soir', '#e6cfa3', '#f5e7c6', '#7c2d12'),
  shop('PRESSING ÉCLAT', 'Lavage · repassage · teinture', '#c8d3dc', '#ffffff', '#0369a1', false),
  shop('ALIMENTATION GÉNÉRALE', 'Chez Adama · riz, huile, sucre', '#d9c19a', '#1d4ed8', '#ffffff'),
  shop('QUINCAILLERIE DU PROGRÈS', 'Ciment · fer · peinture · plomberie', '#c9a27c', '#f5d90a', '#7f1d1d'),
  shop('COUTURE MODERNE', 'Awa · Faso Dan Fani · retouches', '#d8b7a3', '#ffffff', '#9d174d', false),
  null,
  shop('CYBER LE BAOBAB', 'Internet · photocopie · saisie · impression', '#b8c7a6', '#0b1e3f', '#38bdf8'),
  shop('TÉLÉPHONES · ACCESSOIRES', 'Réparation · crédit · transfert d’argent', '#e3d3b4', '#f97316', '#ffffff'),
  shop('PIÈCES MOTOS', 'Entretien · vidange · pneus', '#c7cfd6', '#dc2626', '#ffffff', false),
  null,
  shop('MAQUIS LA JOIE', 'Poulet braisé · riz gras · boissons fraîches', '#e6c98f', '#15803d', '#fef08a'),
  shop('SALON BELLE VIE', 'Coiffure · tresses · esthétique', '#d9c19a', '#7c3aed', '#ffffff', false),
  shop('LIBRAIRIE PAPETERIE', 'Fournitures scolaires · livres', '#c9a27c', '#ffffff', '#1d4ed8'),
  shop('MENUISERIE BOIS', 'Lits · armoires · portes', '#cfb592', '#78350f', '#fde68a', false),
  null,
  shop('ÉLECTRICITÉ BÂTIMENT', 'Câbles · disjoncteurs · lampes', '#d6d0c2', '#1e3a8a', '#fbbf24'),
  shop('DÉPÔT DE GAZ', 'Bouteilles 6 et 12 kg', '#c2cbb4', '#b91c1c', '#ffffff', false),
  shop('CAFÉ SENEGALAIS', 'Café Touba · pain · omelette', '#e2c79b', '#fef3c7', '#92400e'),
];
/** On the campus side of the street, beyond its fence: the neighbours, facing the street too. */
const NEAR_SHOPS: (Shop | null)[] = [
  shop('TAILLEUR LE CHIC', 'Costumes · tenues de cérémonie', '#d7c4a8', '#0f172a', '#e2e8f0', false),
  shop('KIOSQUE INFORMATIQUE', 'Clés USB · câbles · cartouches', '#c5d0d8', '#1d4ed8', '#ffffff'),
  null,
  shop('PHOTO STUDIO', 'Photos d’identité minute', '#e1cfb0', '#be185d', '#ffffff'),
  shop('BOUTIQUE ALIMENTATION', 'Lait · conserves · savon', '#cdb38c', '#16a34a', '#ffffff', false),
];

/** How many signs the atlas holds side by side, and the size of each. */
const SIGN_COLUMNS = 4;
const [SIGN_W, SIGN_H] = [512, 88];

/** The shops' sign boards, all painted into one picture, worn by the sun. */
function signAtlas(shops: Shop[]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = SIGN_W * SIGN_COLUMNS;
  c.height = SIGN_H * Math.ceil(shops.length / SIGN_COLUMNS);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  let seed = 5;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  shops.forEach((s, i) => {
    const [x, y] = [(i % SIGN_COLUMNS) * SIGN_W, Math.floor(i / SIGN_COLUMNS) * SIGN_H];
    g.fillStyle = s.ground;
    g.fillRect(x, y, SIGN_W, SIGN_H);
    g.strokeStyle = s.ink;
    g.lineWidth = 3;
    g.strokeRect(x + 5, y + 5, SIGN_W - 10, SIGN_H - 10);
    g.fillStyle = s.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 34px Poppins, Inter, sans-serif';
    g.fillText(s.sign[0], x + SIGN_W / 2, y + 33, SIGN_W - 30);
    g.font = '600 17px Inter, sans-serif';
    g.fillText(s.sign[1], x + SIGN_W / 2, y + 66, SIGN_W - 40);
    // Sun-bleached paint and a few streaks of dust from the top edge.
    for (let k = 0; k < 140; k++) {
      g.fillStyle = `rgba(255, 250, 235, ${rnd() * 0.12})`;
      g.fillRect(x + rnd() * SIGN_W, y + rnd() * SIGN_H, 1 + rnd() * 9, 1 + rnd() * 2);
    }
    for (let k = 0; k < 8; k++) {
      g.fillStyle = `rgba(90, 60, 30, ${0.05 + rnd() * 0.08})`;
      g.fillRect(x + rnd() * SIGN_W, y, 1 + rnd() * 2, SIGN_H * (0.2 + rnd() * 0.6));
    }
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** The haze at the horizon, by time of day (the fog of the street takes it too). */
export const HAZE: Record<Daytime, string> = { morning: '#e9e1d2', noon: '#ebe5d9', evening: '#ecd2b4' };

/** A wire hanging between two points: `sag` metres below the straight line in the middle. */
function wire(a: THREE.Vector3, b: THREE.Vector3, sag: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    points.push(a.clone().lerp(b, t).setY(a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t)));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.009, 4, false);
}

/**
 * The sky over the street without the photographed town: deep blue overhead, the dusty pale haze of the harmattan at
 * the horizon (November), and the laterite plain under it, so that the street's ends melt into the haze.
 */
function hazySky(radius: number): THREE.Mesh {
  const look = daytime();
  const geometry = new THREE.SphereGeometry(radius, 48, 24);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const [top, haze, earth] = [new THREE.Color(look.hour.startsWith('17') ? '#8fa6c4' : '#6f9ccc'), new THREE.Color(HAZE[daytimeName()]), new THREE.Color('#b69a7c')];
  const colours: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / radius;
    const col = h >= 0 ? haze.clone().lerp(top, Math.min(1, h * 2.2) ** 0.7) : haze.clone().lerp(earth, Math.min(1, -h * 12));
    colours.push(col.r, col.g, col.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const sky = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  sky.renderOrder = -11;
  sky.frustumCulled = false;
  sky.name = 'street-sky';
  return sky;
}


/**
 * The campus street, modelled rather than photographed: rows of single-storey shops of the city (rendered blockwork
 * in faded paints, roller shutters, painted sign boards, sheet-metal awnings on posts) on both sides, neem trees in
 * the gaps, the concrete poles of the electricity line with their wires and street lamps, under a hazy sky.
 */
function facingStreet(site: SiteName): THREE.Group {
  const g = new THREE.Group();
  g.name = `facing-${site}`;
  const e = ENTRANCES[site];
  const [ox, oz] = e.out;
  const [ax, az] = [oz, -ox];
  const across = Math.atan2(-ox, -oz);
  const BAY = 4;
  const FAR = 15;
  const NEAR = 3.0;
  const at = (u: number, v: number, t = across): Placement => ({ x: e.x + ax * u + ox * v, y: 0, z: e.z + az * u + oz * v, turn: t });
  const open: Placement[] = [];
  const closed: Placement[] = [];
  const trees: Placement[] = [];
  const painted: Shop[] = [];
  const boards: THREE.BufferGeometry[] = [];
  // One row of shops: their fronts on the line `front` out from the door, facing the street.
  const row = (list: (Shop | null)[], from: number, front: number, facing: number, back: number): void => {
    list.forEach((s, i) => {
      const u = from + i * BAY;
      if (!s) {
        trees.push({ ...at(u, front + back * 1.2), turn: i * 1.7 + u, scale: 0.92 + (Math.abs(u) % 3) * 0.07 });
        return;
      }
      (s.open ? open : closed).push({ ...at(u, front + back * 2, facing), tint: s.paint });
      const n = painted.push(s) - 1;
      const [col, line] = [n % SIGN_COLUMNS, Math.floor(n / SIGN_COLUMNS)];
      const plane = new THREE.PlaneGeometry(3.6, 0.62);
      const uv = plane.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (col + uv.getX(k)) / SIGN_COLUMNS, line + 1 - uv.getY(k));
      plane.userData.line = line;
      plane.rotateY(facing);
      const p = at(u, front - back * 0.045);
      plane.translate(p.x, 3.35, p.z);
      boards.push(plane);
    });
  };
  row(FAR_SHOPS, -((FAR_SHOPS.length - 1) / 2) * BAY, FAR, across, 1);
  // The neighbours either side of the campus plot, beyond its fence.
  const out = Math.atan2(ox, oz);
  row(NEAR_SHOPS, 16, NEAR, out, -1);
  row([...NEAR_SHOPS].reverse(), -16 - (NEAR_SHOPS.length - 1) * BAY, NEAR, out, -1);
  // Atlas lines counted from the top of the picture: flip them now that the number of lines is known.
  const lines = Math.ceil(painted.length / SIGN_COLUMNS);
  for (const b of boards) {
    const uv = b.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - uv.getY(k) / lines);
  }
  // Behind the row, the rest of the quarter: the backs of other houses and shops at odd depths and heights (some of
  // two storeys), and the crowns of the trees in their yards, fading into the haze.
  let seed = 19;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const PAINTS = ['#d9c19a', '#c9a27c', '#e3d3b4', '#d8b7a3', '#cdb38c', '#c2cbb4', '#e6cfa3', '#bfc4c7'];
  for (let u = -74; u < 74; u += 4.5 + rnd() * 3) {
    closed.push({ ...at(u, FAR + 9 + rnd() * 7, across + Math.PI), scale: 0.95 + rnd() * 0.65, tint: PAINTS[Math.floor(rnd() * PAINTS.length)] as string });
    if (rnd() > 0.62) trees.push({ ...at(u + 2, FAR + 7 + rnd() * 10), turn: rnd() * 6, scale: 0.85 + rnd() * 0.4 });
  }
  placeMany(g, 'shop_open', open);
  placeMany(g, 'shop_closed', closed);
  const half = ((FAR_SHOPS.length - 1) / 2) * BAY;
  trees.push({ ...at(-half - 4.5, FAR + 0.8), turn: 0.4 }, { ...at(half + 4.5, FAR + 0.8), turn: 2.2, scale: 1.08 });
  placeMany(g, 'tree', trees);
  const signs = new THREE.Mesh(mergeGeometries(boards), new THREE.MeshStandardMaterial({ map: signAtlas(painted), roughness: 0.75 }));
  signs.receiveShadow = true;
  g.add(signs);
  // The pavements in front of the shops, beaten earth and worn concrete.
  for (const [v, length] of [[FAR - 1.0, 2 * half + 12], [NEAR + 1.0, 200]] as const) {
    const pave = new THREE.Mesh(new THREE.PlaneGeometry(2.4, length), new THREE.MeshStandardMaterial({ ...photo('asphalt_02', 1, length / 4), color: '#c9b9a0', roughness: 1 }));
    pave.rotation.set(-Math.PI / 2, 0, across - Math.PI / 2);
    const mid = at(0, v);
    pave.position.set(mid.x, -0.004, mid.z);
    pave.receiveShadow = true;
    g.add(pave);
  }
  // Laterite as far as the haze.
  const plain = new THREE.Mesh(new THREE.CircleGeometry(260, 48), new THREE.MeshStandardMaterial({ ...photo('red_laterite_soil_stones', 120, 120), roughness: 1 }));
  plain.rotation.x = -Math.PI / 2;
  plain.position.set(e.x, -0.03, e.z);
  plain.receiveShadow = true;
  plain.renderOrder = -6;
  g.add(plain);
  // The electricity line on the far kerb: poles every 20 m, three wires from insulator to insulator.
  const poles = [-50, -30, -10, 10, 30, 50].map((u) => at(u, FAR - 2.3));
  placeMany(g, 'pole', poles);
  const insulator = (p: Placement, k: number): THREE.Vector3 => new THREE.Vector3(0, 8.73, k * 0.75).applyAxisAngle(new THREE.Vector3(0, 1, 0), p.turn ?? 0).add(new THREE.Vector3(p.x, 0, p.z));
  const wires: THREE.BufferGeometry[] = [];
  for (let i = 0; i < poles.length - 1; i++) for (const k of [-1, 0, 1]) wires.push(wire(insulator(poles[i] as Placement, k), insulator(poles[i + 1] as Placement, k), 0.55));
  const line = new THREE.Mesh(mergeGeometries(wires), lit('#15171a', 0.6, 0.3));
  line.castShadow = true;
  g.add(line);
  const sky = hazySky(240);
  sky.position.set(e.x, 0, e.z);
  g.add(sky);
  return g;
}