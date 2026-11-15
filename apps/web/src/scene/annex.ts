import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { bake, freeze } from './bake.js';
import { DOORS, FLOOR_Y, LAB_DESK_ROWS, LAB_Z, ROOMS, STAIRS, WALL as WALL_T, type Door } from './building.js';
import { contactShadow, keyboardTexture, outsideTexture, photo } from './materials.js';
import { placeProp } from './props.js';
import { gearModel } from './gear.js';
import { buildRoomParts } from './room.js';
import { zoneShell } from './structure.js';
import { diagramTexture, screenTexture, textTexture } from './textures.js';

/**
 * The rest of the building: the corridor behind the technical room, the lab room across it, and for the missions that
 * need them, the stairs and the first floor with its corridor and offices. All the cabling between rooms is hidden in
 * the walls and ends on patch panels, as in a real building.
 */

const lit = (color: string, roughness = 0.6, metalness = 0.1): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

const FRAME = lit('#475569', 0.5, 0.5);
const STEEL = lit('#475569', 0.45, 0.75);
const BLACK = lit('#1b2028', 0.55, 0.25);
const WOOD = new THREE.MeshStandardMaterial({ ...photo('plywood', 0.7, 0.5), roughness: 0.8 });
const GREY = lit('#94a3b8', 0.65, 0.2);
const KEYS = new THREE.MeshStandardMaterial({ map: keyboardTexture(), roughness: 0.55 });
const LED = new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 1.6 });

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

/** Signs, notices and fittings along a corridor (its walls, floor and lights come from `structure.ts`). */
function corridorDecor(upper: boolean, stairs: boolean): THREE.Group {
  const g = new THREE.Group();
  const y = upper ? FLOOR_Y : 0;
  const { corridor } = ROOMS;
  const roomFace = corridor.z1 - WALL_T / 2 - 0.004;
  const labFace = corridor.z0 + WALL_T / 2 + 0.004;
  const mid = (corridor.z0 + corridor.z1) / 2;
  const [mainDoor, labDoor] = [DOORS[0] as Door, DOORS[1] as Door];

  const toRoom = lettering(upper ? 'ADMINISTRATION' : 'SALLE TECHNIQUE', 1.1, 0.12, '#0b1e3f');
  toRoom.rotation.y = Math.PI;
  toRoom.position.set(mainDoor.x, y + 2.42, roomFace);
  g.add(toRoom);
  if (!upper) {
    const toLab = lettering('SALLE DE TP', 0.8, 0.12, '#0b1e3f');
    toLab.position.set(labDoor.x, y + 2.42, labFace);
    g.add(toLab);
  } else {
    // Upstairs, the archive room's closed door opposite the offices.
    g.add(box(1.0, 2.05, 0.04, lit('#8b9bb0', 0.6, 0.2), mainDoor.x, y + 1.025, labFace + 0.02), box(0.14, 0.02, 0.03, lit('#e2e8f0', 0.2, 1), mainDoor.x + 0.38, y + 1.02, labFace + 0.06, false));
    const archive = plate(0.46, 0.12, '#0b1e3f', '#e2e8f0', ['ARCHIVES']);
    archive.position.set(mainDoor.x, y + 1.62, labFace + 0.045);
    g.add(archive);
  }
  // At the far end, the stairs (or, without them, a closed door).
  const end = corridor.x1 - WALL_T / 2 - 0.004;
  const stairsSign = plate(0.9, 0.16, '#14532d', '#ffffff', [upper ? 'ESCALIER · RDC' : 'ESCALIER · ÉTAGE 1']);
  stairsSign.rotation.y = -Math.PI / 2;
  stairsSign.position.set(end, y + 2.42, mid);
  g.add(stairsSign);
  if (!stairs) g.add(box(0.05, 2.08, 1.98, lit('#8b9bb0', 0.6, 0.2), corridor.x1, y + 1.04, mid));

  // Fire hose cabinet and a notice board, a closed trunking along the ceiling: no cable on show.
  const hose = soft(0.5, 0.7, 0.12, lit('#c62222', 0.4, 0.2), 0.9, y + 1.25, roomFace - 0.06, 0.012);
  const hoseSign = plate(0.34, 0.16, '#ffffff', '#b91c1c', ['INCENDIE']);
  hoseSign.rotation.y = Math.PI;
  hoseSign.position.set(0.9, y + 1.25, roomFace - 0.125);
  g.add(hose, hoseSign);
  g.add(box(14.8, 0.09, 0.22, lit('#e8ebef', 0.7), (corridor.x0 + corridor.x1) / 2, y + 2.93, roomFace - 0.14, false));
  if (!upper) {
    g.add(box(1.6, 0.95, 0.02, lit('#2b3442', 0.8), -2.6, y + 1.5, labFace + 0.012));
    for (const [i, lines] of [['RÉSEAU', 'DE L’IST'], ['SÉCURITÉ', 'ÉVACUATION'], ['HORAIRES', 'DES TP']].entries()) {
      const notice = plate(0.44, 0.58, '#f8fafc', '#0b1e3f', lines);
      notice.position.set(-3.1 + i * 0.5, y + 1.5, labFace + 0.025);
      g.add(notice);
    }
  }
  return g;
}

/** The stair hall's window on the landing, and the floor number upstairs. */
function stairDecor(): THREE.Group {
  const g = new THREE.Group();
  const half = FLOOR_Y / 2;
  const l = STAIRS.landing;
  const wall = ROOMS.stairs.x1 - WALL_T / 2 - 0.006;
  const mid = (l.z0 + l.z1) / 2;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), new THREE.MeshBasicMaterial({ map: outsideTexture(), color: '#c4c8cc' }));
  glass.rotation.y = -Math.PI / 2;
  glass.position.set(wall - 0.014, half + 1.6, mid);
  g.add(box(0.006, 2.32, 1.52, FRAME, wall + 0.002, half + 1.6, mid, false), glass);
  const first = plate(0.5, 0.5, '#1d4ed8', '#ffffff', ['1']);
  first.rotation.y = Math.PI / 2;
  first.position.set(ROOMS.stairs.x0 + WALL_T / 2 + 0.006, FLOOR_Y + 1.7, ROOMS.stairs.z1 - 0.6);
  g.add(first);
  return g;
}

let loginScreen: THREE.Texture | null = null;

/**
 * One workstation, built facing +x and turned into place by the caller: a table with a tower, a lit screen, a keyboard
 * and mouse, and the floor box where its network cable arrives.
 */
function workstation(): THREE.Group {
  const g = new THREE.Group();
  const [x, z, side, wallX] = [0, 0, 1, 0.5];
  const model = gearModel('workstation');
  if (model) {
    // Modelled in Blender (art/blender/workstation.py), the student on its +z side: turned so that they sit on -x.
    const copy = model.clone(true);
    copy.rotation.y = -Math.PI / 2;
    copy.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    g.add(copy);
    loginScreen ??= screenTexture(['IST Network Lab', '', 'login: _']);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.3), new THREE.MeshBasicMaterial({ map: loginScreen, color: '#d8e9ff', toneMapped: false }));
    screen.rotation.y = -Math.PI / 2;
    screen.position.set(0.19, 1.026, 0);
    g.add(screen);
    g.add(box(0.16, 0.03, 0.16, lit('#cbd2da', 0.6, 0.3), wallX - 0.12, 0.015, 0.3, false), box(0.003, 0.02, 0.022, BLACK, wallX - 0.12, 0.035, 0.3, false));
    const shadow = contactShadow(1.1, 1.25, 0.45);
    shadow.position.set(0, 0.004, 0);
    g.add(shadow);
    return g;
  }
  g.add(box(0.8, 0.03, 1.0, WOOD, x, 0.74, z));
  for (const dz of [-0.45, 0.45]) g.add(box(0.72, 0.03, 0.03, STEEL, x, 0.12, z + dz), box(0.03, 0.74, 0.03, STEEL, x + 0.36, 0.37, z + dz), box(0.03, 0.74, 0.03, STEEL, x - 0.36, 0.37, z + dz));
  g.add(soft(0.024, 0.33, 0.5, BLACK, x + side * 0.2, 1.02, z, 0.008), soft(0.04, 0.16, 0.05, STEEL, x + side * 0.22, 0.83, z, 0.012), soft(0.17, 0.012, 0.22, STEEL, x + side * 0.22, 0.76, z, 0.005));
  loginScreen ??= screenTexture(['IST Network Lab', '', 'login: _']);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.3), new THREE.MeshBasicMaterial({ map: loginScreen, color: '#d8e9ff', toneMapped: false }));
  screen.rotation.y = -Math.PI / 2;
  screen.position.set(x + side * 0.187, 1.02, z);
  g.add(screen);
  const caps = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.13), KEYS);
  caps.rotation.set(-Math.PI / 2, 0, -side * Math.PI / 2);
  caps.position.set(x - side * 0.12, 0.7695, z);
  g.add(soft(0.14, 0.014, 0.36, BLACK, x - side * 0.12, 0.762, z, 0.005), caps, soft(0.095, 0.022, 0.058, BLACK, x - side * 0.12, 0.766, z + 0.27, 0.01));
  g.add(soft(0.36, 0.38, 0.17, BLACK, x + side * 0.12, 0.2, z - 0.28, 0.012));
  g.add(box(0.002, 0.28, 0.004, LED, x - side * 0.062, 0.2, z - 0.34, false), box(0.002, 0.004, 0.11, STEEL, x - side * 0.062, 0.3, z - 0.27, false), box(0.002, 0.02, 0.02, STEEL, x - side * 0.062, 0.25, z - 0.27, false));
  g.add(box(0.16, 0.03, 0.16, lit('#cbd2da', 0.6, 0.3), wallX - 0.12, 0.015, z + 0.3, false), box(0.003, 0.02, 0.022, BLACK, wallX - 0.12, 0.035, z + 0.3, false));
  const shadow = contactShadow(1.1, 1.25, 0.45);
  shadow.position.set(x, 0.004, z);
  g.add(shadow);
  return g;
}

/** A workstation at (x, z) whose screen faces the person sitting on the side `facing` (+1: on the +z side). */
function deskAt(x: number, z: number, facing: 1 | -1): THREE.Group {
  const g = workstation();
  g.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
  g.position.set(x, 0, z);
  return g;
}

const LAB_DESK_X = [-5.5, -4.45, -3.4, -2.35, 2.35, 3.4, 4.45, 5.5];

/**
 * The lab, after real network teaching rooms: three rows of student desks either side of a central aisle, facing the
 * teacher's bench, the rack and the projection screen; lockers, rules and the patching plan on the walls; windows on
 * the outside wall.
 */
function labFurniture(): THREE.Group {
  const g = new THREE.Group();
  const left = ROOMS.lab.x0 + WALL_T / 2;
  const right = ROOMS.lab.x1 - WALL_T / 2;
  for (const row of LAB_DESK_ROWS) for (const x of LAB_DESK_X) g.add(deskAt(x, row, 1));

  // Projection screen on the back wall, left of the rack, and the projector on the ceiling.
  const map = diagramTexture();
  const projected = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.48), new THREE.MeshStandardMaterial({ map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.28, roughness: 0.85 }));
  projected.position.set(-4.2, 1.95, -1.572);
  g.add(soft(2.55, 0.08, 0.1, BLACK, -4.2, 2.74, -1.55, 0.02), soft(2.45, 0.018, 0.02, BLACK, -4.2, 1.2, -1.565, 0.006), projected);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.03, 20), BLACK);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(-4.2, 2.72, 2.35);
  g.add(soft(0.34, 0.12, 0.28, lit('#e8ebef', 0.5), -4.2, 2.72, 2.5, 0.025), lens, box(0.04, 0.2, 0.04, STEEL, -4.2, 2.89, 2.5));

  // Lockers against the left wall, rules and the patching plan above the desks.
  for (const z of [-1.2, -0.6, 0.0]) {
    g.add(box(0.5, 2.0, 0.58, GREY, left + 0.27, 1.0, z));
    g.add(box(0.005, 1.9, 0.005, BLACK, left + 0.522, 1.0, z, false), box(0.02, 0.14, 0.02, lit('#e2e8f0', 0.2, 1), left + 0.535, 1.05, z + 0.04, false));
  }
  const lockerShadow = contactShadow(0.8, 2.0, 0.5);
  lockerShadow.position.set(left + 0.3, 0.004, -0.6);
  g.add(lockerShadow);
  const rules = plate(0.46, 0.62, '#fef3c7', '#0b1e3f', ['RÈGLES', 'DU TP', 'Pas de boisson', 'près du matériel']);
  rules.rotation.y = Math.PI / 2;
  rules.position.set(left + 0.006, 1.6, 2.0);
  const netPlan = plate(0.9, 0.62, '#f8fafc', '#1d4ed8', ['PLAN DE BRASSAGE', 'BAIE TP · PP-01']);
  netPlan.rotation.y = Math.PI / 2;
  netPlan.position.set(left + 0.006, 1.6, 3.4);
  g.add(rules, netPlan);
  // Windows onto the campus on the outside wall.
  for (const z of [1.0, 3.2, 5.0]) {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), new THREE.MeshBasicMaterial({ map: outsideTexture() }));
    sky.rotation.y = -Math.PI / 2;
    sky.position.set(right - 0.012, 1.8, z);
    g.add(box(0.006, 1.3, 1.6, FRAME, right - 0.002, 1.8, z, false), sky);
  }
  return g;
}

/** The administration: two pods of desks facing each other, a low cabinet of binders, windows onto the campus. */
function officeFurniture(): THREE.Group {
  const g = new THREE.Group();
  const left = ROOMS.room.x0 + WALL_T / 2;
  const front = ROOMS.room.z1 - WALL_T / 2;
  for (const cx of [-3.1, 3.1]) {
    for (const dx of [-1.0, 0, 1.0]) g.add(deskAt(cx + dx, 3.1, -1), deskAt(cx + dx, 3.9, 1));
  }
  for (const x of [-3.0, 0, 3.0]) {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.15), new THREE.MeshBasicMaterial({ map: outsideTexture() }));
    sky.rotation.y = Math.PI;
    sky.position.set(x, 1.75, front - 0.012);
    g.add(box(1.9, 1.25, 0.006, FRAME, x, 1.75, front - 0.002, false), sky);
  }
  g.add(box(0.5, 0.85, 2.6, GREY, left + 0.27, 0.425, 1.3), box(0.52, 0.03, 2.65, WOOD, left + 0.28, 0.865, 1.3));
  const colours = ['#1d4ed8', '#fbbf24', '#0b1e3f', '#94a3b8'];
  for (let i = 0; i < 24; i++) g.add(box(0.22, 0.28, 0.05, lit(colours[i % 4] as string, 0.7), left + 0.27, 1.02, 0.3 + i * 0.086));
  const cabinetShadow = contactShadow(0.85, 2.9, 0.45);
  cabinetShadow.position.set(left + 0.3, 0.004, 1.3);
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
  freeze(g);
  return g;
}

export function buildAnnex(floors: boolean): THREE.Group {
  const g = new THREE.Group();
  const lab = buildRoomParts();
  lab.add(labFurniture());
  const name = lettering('SALLE DE TP', 1.5, 0.22, '#0b1e3f');
  name.position.set(1.6, 2.25, -1.59);
  const sub = lettering('CLUB INFORMATIQUE DE L’IST', 1.3, 0.07, '#1d4ed8');
  sub.position.set(1.6, 2.08, -1.59);
  lab.add(name, sub);
  lab.position.z = LAB_Z;
  const labPart = part('part-lab', zoneShell('lab', { lights: true }), lab);
  for (const row of LAB_DESK_ROWS) for (const x of LAB_DESK_X) placeProp(labPart, 'SchoolChair_01', { x, y: 0, z: row + 0.75 + LAB_Z, turn: Math.PI });
  g.add(labPart, part('part-lower', zoneShell('corridor', { lights: true }), corridorDecor(false, floors)));
  if (floors) {
    const office = buildRoomParts();
    office.add(officeFurniture());
    office.position.y = FLOOR_Y;
    const officePart = part('part-office', zoneShell('office', { lights: true }), office);
    for (const cx of [-3.1, 3.1]) {
      for (const dx of [-1.0, 0, 1.0]) {
        placeProp(officePart, 'SchoolChair_01', { x: cx + dx, y: FLOOR_Y, z: 2.45, turn: 0 });
        placeProp(officePart, 'SchoolChair_01', { x: cx + dx, y: FLOOR_Y, z: 4.55, turn: Math.PI });
      }
    }
    const left = ROOMS.room.x0 + WALL_T / 2;
    placeProp(officePart, 'pachira_aquatica_01', { x: left + 0.5, y: FLOOR_Y, z: 5.4, only: ['pachira_aquatica_01_bark_a', 'pachira_aquatica_01_leaves_a'] });
    placeProp(officePart, 'binder_notebook', { x: left + 0.27, y: FLOOR_Y + 0.88, z: 2.45, turn: Math.PI / 2 });
    g.add(part('part-stairs', zoneShell('stairs', { lights: true }), stairDecor()), officePart, part('part-upper', zoneShell('corridor1', { lights: true }), corridorDecor(true, true)));
  }
  return g;
}
