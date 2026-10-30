import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { bake } from './bake.js';
import { ceilingTexture, contactShadow, outsideTexture } from './materials.js';
import { BUILDING, buildRoomParts, doorWall, paintedWall } from './room.js';
import { textTexture } from './textures.js';

/**
 * The rest of the building: the corridor behind the technical room, the lab room across it, and for the missions that
 * need them, the stairs and the first floor with its corridor and offices. All the cabling between rooms is hidden in
 * the walls and ends on patch panels, as in a real building.
 */

const lit = (color: string, roughness = 0.6, metalness = 0.1): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

const WALL = lit('#d6dbe3', 0.9);
const CEILING = lit('#e5e7eb', 0.95);
const FRAME = lit('#475569', 0.5, 0.5);
const STEEL = lit('#475569', 0.45, 0.75);
const BLACK = lit('#1b2028', 0.55, 0.25);
const WOOD = lit('#b08a5e', 0.7);
const GREY = lit('#94a3b8', 0.65, 0.2);

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function soft(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, radius = 0.012): THREE.Mesh {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, h / 2.2, w / 2.2, d / 2.2)), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function lettering(text: string, w: number, h: number, colour: string): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: textTexture(text, { width: 1024, height: Math.round((1024 * h) / w), color: colour, font: `700 ${Math.round((1024 * h) / w * 0.62)}px Poppins, sans-serif` }), transparent: true, roughness: 0.9 }),
  );
}

/** A printed panel: a sign, a notice. */
function plate(w: number, h: number, background: string, colour: string, lines: string[]): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * h) / w);
  const c = canvas.getContext('2d') as CanvasRenderingContext2D;
  c.fillStyle = background;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = colour;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `700 ${Math.round(Math.min(canvas.height / (lines.length + 0.8), 66))}px Inter, sans-serif`;
  lines.forEach((line, i) => c.fillText(line, canvas.width / 2, (canvas.height * (i + 1)) / (lines.length + 1), canvas.width - 24));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 }));
}

const panelLight = new THREE.MeshBasicMaterial({ color: '#f8fbff', toneMapped: false });

/** A corridor on either floor. `stairs` opens the door at its far end. */
function corridor(upper: boolean, stairs: boolean): THREE.Group {
  const g = new THREE.Group();
  const [back, front] = [BUILDING.corridor.back, BUILDING.corridor.front];
  const depth = front - back;
  const mid = (front + back) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, depth), lit('#8f97a3', 0.42, 0.08));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.002, mid);
  floor.receiveShadow = true;
  const tiles = ceilingTexture();
  tiles.repeat.set(9 / 0.6, depth / 0.6);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(9, depth), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.95 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3, mid);
  g.add(floor, ceiling);

  // Walls on the corridor's side, with the doors.
  doorWall(g, 9, front - 0.005, Math.PI);
  if (upper) {
    paintedWall(g, 9, 0, back + 0.005, 0);
    // A closed door for the archive room, opposite the offices.
    g.add(box(0.92, 2.05, 0.04, lit('#8b9bb0', 0.6, 0.2), BUILDING.door.x, 1.025, back + 0.03), box(0.14, 0.02, 0.03, lit('#e2e8f0', 0.2, 1), BUILDING.door.x + 0.34, 1.02, back + 0.07, false));
    const archive = plate(0.42, 0.11, '#0b1e3f', '#e2e8f0', ['ARCHIVES']);
    archive.position.set(BUILDING.door.x, 1.62, back + 0.052);
    g.add(archive);
  } else {
    doorWall(g, 9, back + 0.005, 0);
  }
  paintedWall(g, depth, -4.5, mid, Math.PI / 2);

  // The far end. Boxes, because this wall is seen from both sides once the stairs exist.
  const endX = 4.53;
  const open = upper ? -2.05 : -2.95;
  const shut = upper ? -2.95 : -2.05;
  if (!stairs) {
    g.add(box(0.06, 3, depth, WALL, endX, 1.5, mid));
    g.add(box(0.04, 2.05, 0.92, lit('#8b9bb0', 0.6, 0.2), 4.48, 1.025, open), box(0.03, 0.02, 0.14, lit('#e2e8f0', 0.2, 1), 4.45, 1.02, open + 0.3, false));
  } else {
    g.add(box(0.06, 3, 0.9, WALL, endX, 1.5, shut), box(0.06, 0.95, 0.9, WALL, endX, 2.525, open));
    for (const dz of [-0.43, 0.43]) g.add(box(0.08, 2.05, 0.04, FRAME, endX, 1.025, open + dz));
    g.add(box(0.08, 0.04, 0.9, FRAME, endX, 2.05, open));
  }
  const stairsSign = plate(0.8, 0.15, '#14532d', '#ffffff', [upper ? 'ESCALIER · RDC' : 'ESCALIER · ÉTAGE 1']);
  stairsSign.rotation.y = -Math.PI / 2;
  stairsSign.position.set(4.49, 2.3, open);
  g.add(stairsSign);

  // A row of recessed lights, and a closed trunking along the ceiling: no cable is on show.
  for (const x of [-3.2, -1.2, 0.8, 2.8]) {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.26), panelLight);
    light.rotation.x = Math.PI / 2;
    light.position.set(x, 2.985, mid);
    g.add(light);
  }
  g.add(box(9, 0.09, 0.22, lit('#e8ebef', 0.7), 0, 2.93, front - 0.14, false));

  // Handrail, door signs, fire equipment and a notice board.
  g.add(box(9, 0.03, 0.03, STEEL, 0, 0.95, back + 0.04, false));
  const toRoom = lettering(upper ? 'ADMINISTRATION' : 'SALLE TECHNIQUE', 0.9, 0.11, '#0b1e3f');
  toRoom.rotation.y = Math.PI;
  toRoom.position.set(BUILDING.door.x, 2.25, front - 0.012);
  g.add(toRoom);
  if (!upper) {
    const toLab = lettering('SALLE DE TP', 0.7, 0.11, '#0b1e3f');
    toLab.position.set(BUILDING.door.x, 2.25, back + 0.012);
    g.add(toLab);
  }
  const hose = soft(0.5, 0.7, 0.12, lit('#c62222', 0.4, 0.2), 0.9, 1.25, front - 0.07, 0.012);
  const hoseSign = plate(0.34, 0.16, '#ffffff', '#b91c1c', ['INCENDIE']);
  hoseSign.rotation.y = Math.PI;
  hoseSign.position.set(0.9, 1.25, front - 0.135);
  g.add(hose, hoseSign);
  g.add(box(1.5, 0.9, 0.02, lit('#2b3442', 0.8), 1.9, 1.5, back + 0.018));
  for (const [i, lines] of [['RÉSEAU', 'DE L’IST'], ['SÉCURITÉ', 'ÉVACUATION'], ['HORAIRES', 'DES TP']].entries()) {
    const notice = plate(0.42, 0.56, '#f8fafc', '#0b1e3f', lines);
    notice.position.set(1.42 + i * 0.48, 1.5, back + 0.03);
    g.add(notice);
  }
  return g;
}

/** The stairwell: two flights around a landing, from the ground-floor corridor to the first floor's. */
function stairwell(): THREE.Group {
  const g = new THREE.Group();
  const { flightEnd, landingEnd, split, back, front, rise } = BUILDING.stairs;
  const start = 4.5;
  const run = flightEnd - start;
  const steps = 11;
  const tread = lit('#aab2bd', 0.55, 0.1);
  const nosing = lit('#fbbf24', 0.6);
  const half = rise / 2;
  for (let i = 0; i < steps; i++) {
    const dx = run / steps;
    const top = ((i + 1) * half) / steps;
    g.add(box(dx, top, split - back, tread, start + (i + 0.5) * dx, top / 2, (back + split) / 2));
    g.add(box(0.03, 0.008, split - back, nosing, start + (i + 1) * dx - 0.015, top + 0.004, (back + split) / 2, false));
    const upperTop = half + top;
    g.add(box(dx, top + 0.2, front - split, tread, flightEnd - (i + 0.5) * dx, half - 0.2 + (top + 0.2) / 2, (split + front) / 2));
    g.add(box(0.03, 0.008, front - split, nosing, flightEnd - (i + 1) * dx + 0.015, upperTop + 0.004, (split + front) / 2, false));
  }
  g.add(box(landingEnd - flightEnd, half, front - back, tread, (flightEnd + landingEnd) / 2, half / 2, (back + front) / 2));

  // Walls and ceiling, and the wall between the flights.
  const top = rise + 3;
  const wide = landingEnd - start;
  g.add(box(wide, top, 0.05, WALL, (start + landingEnd) / 2, top / 2, back - 0.025));
  g.add(box(wide, top, 0.05, WALL, (start + landingEnd) / 2, top / 2, front + 0.025));
  g.add(box(0.05, top, front - back, WALL, landingEnd + 0.025, top / 2, (back + front) / 2));
  g.add(box(run, half + 1.1, 0.08, WALL, start + run / 2, (half + 1.1) / 2, split));
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(wide, front - back), CEILING);
  roof.rotation.x = Math.PI / 2;
  roof.position.set((start + landingEnd) / 2, top - 0.01, (back + front) / 2);
  g.add(roof);

  // The painted bands carry on along the stairwell's walls, on both levels.
  const blue = lit('#1d4ed8', 0.8);
  const amber = lit('#fbbf24', 0.8);
  for (const y of [1.12, half + 1.12, rise + 1.12]) {
    for (const z of [back + 0.002, front - 0.002]) g.add(box(wide, 0.05, 0.004, blue, (start + landingEnd) / 2, y, z, false), box(wide, 0.012, 0.004, amber, (start + landingEnd) / 2, y + 0.045, z, false));
    g.add(box(0.004, 0.05, front - back, blue, landingEnd - 0.002, y, (back + front) / 2, false), box(0.004, 0.012, front - back, amber, landingEnd - 0.002, y + 0.045, (back + front) / 2, false));
  }

  // Handrails along the slope.
  const slope = Math.atan2(half, run);
  const length = Math.hypot(run, half);
  const low = box(length, 0.04, 0.04, STEEL, start + run / 2, half / 2 + 0.95, back + 0.06, false);
  low.rotation.z = slope;
  const high = box(length, 0.04, 0.04, STEEL, start + run / 2, half + half / 2 + 0.95, front - 0.06, false);
  high.rotation.z = -slope;
  g.add(low, high);

  // A tall window on the landing, daylight behind it, and the floor number on the wall.
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.9), new THREE.MeshBasicMaterial({ map: outsideTexture() }));
  glass.rotation.y = -Math.PI / 2;
  (glass.material as THREE.MeshBasicMaterial).color.set('#c4c8cc');
  glass.position.set(landingEnd - 0.012, half + 1.5, (back + front) / 2);
  g.add(box(0.012, 2.0, 1.2, FRAME, landingEnd - 0.002, half + 1.5, (back + front) / 2, false), glass);
  const first = plate(0.5, 0.5, '#1d4ed8', '#ffffff', ['1']);
  first.rotation.y = Math.PI;
  first.position.set(flightEnd - 1.6, rise + 1.7, front - 0.005);
  g.add(first);
  const lamp = new THREE.PointLight('#f1f6ff', 4, 9, 1.6);
  lamp.position.set((flightEnd + landingEnd) / 2, half + 2.6, (back + front) / 2);
  g.add(lamp);
  return g;
}

/** One workstation: a table with a tower, a lit screen, a keyboard, a chair, and its network socket on the trunking. */
function workstation(x: number, z: number, wallX: number, label: string): THREE.Group {
  const g = new THREE.Group();
  const side = Math.sign(wallX - x);
  g.add(box(0.8, 0.03, 1.0, WOOD, x, 0.74, z));
  for (const dz of [-0.45, 0.45]) g.add(box(0.72, 0.03, 0.03, STEEL, x, 0.12, z + dz), box(0.03, 0.74, 0.03, STEEL, x + 0.36, 0.37, z + dz), box(0.03, 0.74, 0.03, STEEL, x - 0.36, 0.37, z + dz));
  g.add(soft(0.024, 0.33, 0.5, BLACK, x + side * 0.2, 1.02, z, 0.008), soft(0.04, 0.16, 0.05, STEEL, x + side * 0.22, 0.83, z, 0.012), soft(0.17, 0.012, 0.22, STEEL, x + side * 0.22, 0.76, z, 0.005));
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.47, 0.3),
    new THREE.MeshBasicMaterial({ map: textTexture(label, { width: 470, height: 300, color: '#7dd3fc', font: '600 30px "JetBrains Mono", monospace' }), color: '#d8e9ff', toneMapped: false, transparent: true }),
  );
  screen.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  screen.position.set(x + side * 0.183, 1.02, z);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.3), new THREE.MeshBasicMaterial({ color: '#0d1c33' }));
  back.rotation.y = screen.rotation.y;
  back.position.set(x + side * 0.1835, 1.02, z);
  g.add(back, screen);
  g.add(soft(0.14, 0.014, 0.36, BLACK, x - side * 0.12, 0.762, z, 0.005), soft(0.095, 0.022, 0.058, BLACK, x - side * 0.12, 0.766, z + 0.27, 0.01));
  g.add(soft(0.36, 0.38, 0.17, BLACK, x + side * 0.12, 0.2, z - 0.28, 0.012));
  // The chair: a pedestal, a seat and a back, turned to the table.
  const cx = x - side * 0.72;
  g.add(soft(0.44, 0.08, 0.42, lit('#2a313c', 0.55), cx, 0.47, z, 0.035), soft(0.06, 0.44, 0.4, lit('#2a313c', 0.55), cx - side * 0.2, 0.8, z, 0.026), box(0.05, 0.4, 0.05, STEEL, cx, 0.24, z), box(0.42, 0.03, 0.05, BLACK, cx, 0.04, z), box(0.05, 0.03, 0.42, BLACK, cx, 0.04, z));
  // The socket under the table, on the trunking.
  g.add(box(0.012, 0.075, 0.075, lit('#e8ebef', 0.7), wallX - side * 0.04, 0.42, z, false), box(0.003, 0.02, 0.022, BLACK, wallX - side * 0.048, 0.42, z, false));
  const shadow = contactShadow(1.1, 1.25, 0.45);
  shadow.position.set(x, 0.004, z);
  g.add(shadow);
  return g;
}

function labFurniture(): THREE.Group {
  const g = new THREE.Group();
  const wallX = 3.48;
  [-1.2, -0.05, 1.1, 2.25].forEach((z, i) => g.add(workstation(2.95, z, wallX, `TP-${String(i + 1).padStart(2, '0')}  login:`)));
  g.add(box(0.03, 0.06, 5.0, lit('#d6dae0', 0.6), wallX - 0.01, 0.42, 0.9, false));

  // Projection screen and projector above the room.
  g.add(box(1.75, 0.05, 0.08, GREY, 1.6, 2.5, -1.56));
  const under = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 1.07), new THREE.MeshStandardMaterial({ color: '#f1f5fb', roughness: 0.8 }));
  under.position.set(1.6, 1.96, -1.578);
  const projected = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05), new THREE.MeshBasicMaterial({ map: textTexture('VLAN 10 · VLAN 20 · TRUNK', { width: 1024, height: 632, color: '#1d4ed8', font: '700 62px Poppins, sans-serif' }), transparent: true }));
  projected.position.set(1.6, 1.96, -1.572);
  g.add(under, projected, box(0.34, 0.12, 0.28, lit('#e8ebef', 0.5), 1.6, 2.72, 0.9), box(0.04, 0.2, 0.04, STEEL, 1.6, 2.89, 0.9), box(0.06, 0.06, 0.02, BLACK, 1.6, 2.72, 0.75, false));

  // Two closed lockers against the left wall, and what is pinned up in any lab.
  for (const z of [-1.28, -0.66]) {
    g.add(box(0.5, 2.0, 0.58, GREY, -3.22, 1.0, z));
    g.add(box(0.005, 1.9, 0.005, BLACK, -2.968, 1.0, z, false), box(0.02, 0.14, 0.02, lit('#e2e8f0', 0.2, 1), -2.955, 1.05, z + 0.04, false));
  }
  const lockerShadow = contactShadow(0.8, 1.5, 0.5);
  lockerShadow.position.set(-3.2, 0.004, -0.97);
  g.add(lockerShadow);
  const rules = plate(0.46, 0.62, '#fef3c7', '#0b1e3f', ['RÈGLES', 'DU TP', 'Pas de boisson', 'près du matériel']);
  rules.rotation.y = Math.PI / 2;
  rules.position.set(-3.49, 1.6, 1.0);
  const netPlan = plate(0.9, 0.62, '#f8fafc', '#1d4ed8', ['PLAN DE BRASSAGE', 'BAIE TP · PP-01']);
  netPlan.rotation.y = Math.PI / 2;
  netPlan.position.set(-3.49, 1.6, 2.0);
  g.add(rules, netPlan);
  return g;
}

function officeFurniture(): THREE.Group {
  const g = new THREE.Group();
  const wallX = 3.48;
  [-0.7, 0.45, 1.6].forEach((z, i) => g.add(workstation(2.95, z, wallX, `ADM-${String(i + 1).padStart(2, '0')}  login:`)));
  g.add(box(0.03, 0.06, 4.0, lit('#d6dae0', 0.6), wallX - 0.01, 0.42, 0.45, false));
  // Windows onto the outside, on the front wall, and binders on a long low cabinet.
  for (const x of [-1.7, 1.2]) {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.15), new THREE.MeshBasicMaterial({ map: outsideTexture() }));
    sky.rotation.y = Math.PI;
    sky.position.set(x, 1.75, 3.585);
    g.add(box(1.9, 1.25, 0.012, FRAME, x, 1.75, 3.594, false), sky);
  }
  g.add(box(0.5, 0.85, 2.6, GREY, -3.24, 0.425, 1.2), box(0.52, 0.03, 2.65, WOOD, -3.23, 0.865, 1.2));
  const colours = ['#1d4ed8', '#fbbf24', '#0b1e3f', '#94a3b8'];
  for (let i = 0; i < 24; i++) g.add(box(0.22, 0.28, 0.05, lit(colours[i % 4] as string, 0.7), -3.24, 1.02, 0.2 + i * 0.086));
  const cabinetShadow = contactShadow(0.85, 2.9, 0.45);
  cabinetShadow.position.set(-3.2, 0.004, 1.2);
  const name = lettering('ADMINISTRATION', 1.9, 0.22, '#0b1e3f');
  name.position.set(0, 2.25, -1.59);
  g.add(cabinetShadow, name);
  return g;
}

/** Each part of the building is merged on its own, so that what cannot be seen need not be drawn. */
function part(name: string, ...content: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.add(...content);
  bake(g);
  return g;
}

export function buildAnnex(floors: boolean): THREE.Group {
  const g = new THREE.Group();
  const lab = buildRoomParts('front');
  lab.add(labFurniture());
  const name = lettering('SALLE DE TP', 1.5, 0.22, '#0b1e3f');
  name.position.set(0, 2.25, -1.59);
  const sub = lettering('CLUB INFORMATIQUE DE L’IST', 1.3, 0.07, '#1d4ed8');
  sub.position.set(0, 2.08, -1.59);
  lab.add(name, sub);
  lab.position.z = BUILDING.annexZ;
  g.add(part('part-lab', lab), part('part-lower', corridor(false, floors)));
  if (floors) {
    const office = buildRoomParts('back');
    office.add(officeFurniture());
    office.position.y = BUILDING.floorY;
    const upper = corridor(true, true);
    upper.position.y = BUILDING.floorY;
    g.add(part('part-stairs', stairwell()), part('part-office', office), part('part-upper', upper));
  }
  // Two lamps only, moved to whichever corridor the player is in: every light costs on every pixel.
  const lamps = new THREE.Group();
  lamps.name = 'corridor-lamps';
  for (const x of [-2.2, 2.2]) {
    const lamp = new THREE.PointLight('#fff4e4', 3.2, 7, 1.5);
    lamp.position.set(x, 2.25, (BUILDING.corridor.back + BUILDING.corridor.front) / 2);
    lamps.add(lamp);
  }
  g.add(lamps);
  return g;
}
