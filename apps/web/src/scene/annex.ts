import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { bake, freeze } from './bake.js';
import { CLASS0_SPOTS, classUpSpots, DOORS, SITE_EXIT_X, SITE_WINGS, SITE_Z, FLOOR_Y, LAB_DESK_ROWS, LAB_Z, ROOMS, WALL as WALL_T, type Door, type Rect } from './building.js';
import { contactShadow, keyboardTexture, photo } from './materials.js';
import { placeAll, placeMany, placeProp } from './props.js';
import { gearModel } from './gear.js';
import { rackRow } from './decor.js';
import { buildRoomParts } from './room.js';
import { zoneShell } from './structure.js';
import { diagramTexture, screenTexture, textTexture } from './textures.js';

/**
 * The rest of the building: the corridor behind the technical room, the lab room across it, and for the missions that
 * need them, the stairs and the first floor with its corridor and offices. All the cabling between rooms is hidden in
 * the walls and ends on patch panels, as in a real building.
 */

const lit = (color: string, roughness = 0.6, metalness = 0.1): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

const STEEL = lit('#475569', 0.45, 0.75);
const BLACK = lit('#1b2028', 0.55, 0.25);
const WOOD = new THREE.MeshStandardMaterial({ ...photo('plywood', 0.7, 0.5), roughness: 0.8 });
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
  const corridor = upper ? ROOMS.corridor1 : ROOMS.corridor;
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
  }
  g.add(doorSigns(y, corridor), wayfinding(upper));
  if (!upper) {
    // The building's way in and out, at the west end of the corridor: glazed double doors, the exit sign over them.
    const end = corridor.x0 + WALL_T / 2;
    const exit = new THREE.Group();
    exit.name = 'exit-campus';
    for (const s of [-1, 1]) {
      const leaf = box(0.05, 2.1, 0.78, lit('#1f2937', 0.35, 0.5), end + 0.026, 1.05, mid + s * 0.4);
      const glass = box(0.052, 1.4, 0.5, lit('#9fb6c8', 0.08, 0.2), end + 0.027, 1.25, mid + s * 0.4, false);
      const bar = box(0.05, 0.035, 0.5, lit('#d1d5db', 0.25, 0.9), end + 0.075, 1.0, mid + s * 0.4, false);
      for (const m of [leaf, glass, bar]) m.userData.exit = true;
      exit.add(leaf, glass, bar);
    }
    const sign = plate(0.6, 0.18, '#15803d', '#ffffff', ['SORTIE']);
    sign.rotation.y = Math.PI / 2;
    sign.position.set(end + 0.006, 2.38, mid);
    exit.add(sign);
    exit.traverse((o) => (o.userData.dynamic = true));
    g.add(exit);
  }
  // At the far end, the stairs (or, without them, a closed door).
  const end = corridor.x1 - WALL_T / 2 - 0.004;
  const stairsSign = plate(0.9, 0.16, '#14532d', '#ffffff', [upper ? 'ESCALIER · RDC' : 'ESCALIER · ÉTAGE 1']);
  stairsSign.rotation.y = -Math.PI / 2;
  stairsSign.position.set(end, y + 2.42, mid);
  g.add(stairsSign);
  if (!stairs) {
    // Kept out of the merged corridor, so that the corridor is the same with or without stairs (one light bake for both).
    const shut = box(0.05, 2.08, 1.98, lit('#8b9bb0', 0.6, 0.2), corridor.x1, y + 1.04, mid);
    shut.userData.dynamic = true;
    g.add(shut);
  }

  // Fire hose cabinet and a notice board, a closed trunking along the ceiling: no cable on show.
  const hose = soft(0.5, 0.7, 0.12, lit('#c62222', 0.4, 0.2), 0.9, y + 1.25, roomFace - 0.06, 0.012);
  const hoseSign = plate(0.34, 0.16, '#ffffff', '#b91c1c', ['INCENDIE']);
  hoseSign.rotation.y = Math.PI;
  hoseSign.position.set(0.9, y + 1.25, roomFace - 0.125);
  g.add(hose, hoseSign);
  g.add(box(corridor.x1 - corridor.x0 - 0.2, 0.09, 0.22, lit('#e8ebef', 0.7), (corridor.x0 + corridor.x1) / 2, y + 2.93, roomFace - 0.14, false));
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
    screen.position.set(0.184, 1.026, 0);
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
  for (const row of LAB_DESK_ROWS) for (const x of LAB_DESK_X) g.add(deskAt(x, row, 1));

  // Projection screen on the back wall, left of the rack, and the projector on the ceiling.
  const map = diagramTexture();
  const projected = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.48), new THREE.MeshStandardMaterial({ map, emissive: '#ffffff', emissiveMap: map, emissiveIntensity: 0.28, roughness: 0.85 }));
  projected.position.set(-4.2, 1.95, -1.572);
  // The screen's case and bar, the projector on its pole and the lockers are models (`art/blender/furniture.py`),
  // placed by `buildAnnex`.
  g.add(projected);

  // Lockers against the left wall, rules and the patching plan above the desks.
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
  return g;
}

/** The administration: two pods of desks facing each other, a low cabinet of binders, windows onto the campus. */
function officeFurniture(): THREE.Group {
  const g = new THREE.Group();
  const left = ROOMS.room.x0 + WALL_T / 2;
  for (const cx of [-3.1, 3.1]) {
    for (const dx of [-1.0, 0, 1.0]) g.add(deskAt(cx + dx, 3.1, -1), deskAt(cx + dx, 3.9, 1));
  }
  const cabinetShadow = contactShadow(0.85, 2.9, 0.45);
  cabinetShadow.position.set(left + 0.3, 0.004, 1.3);
  const name = lettering('ADMINISTRATION', 1.9, 0.22, '#0b1e3f');
  name.position.set(0, 2.25, -1.59);
  g.add(cabinetShadow, name);
  return g;
}

/** The sign over each doorway of this corridor, and a flag sign beside it seen from along the corridor. */
function doorSigns(y: number, corridor: Rect): THREE.Group {
  const g = new THREE.Group();
  for (const d of DOORS) {
    if (!d.label || Math.abs(d.y - y) > 0.01 || d.along !== 'x' || d.x < corridor.x0 || d.x > corridor.x1) continue;
    // Only the doors in this corridor's own walls.
    if (Math.abs(d.z - corridor.z0) > 0.01 && Math.abs(d.z - corridor.z1) > 0.01) continue;
    const north = Math.abs(d.z - corridor.z0) < 0.01;
    const face = north ? corridor.z0 + WALL_T / 2 + 0.006 : corridor.z1 - WALL_T / 2 - 0.006;
    const over = plate(Math.max(0.9, d.label.length * 0.06), 0.14, '#0b1e3f', '#ffffff', [d.label]);
    over.rotation.y = north ? 0 : Math.PI;
    over.position.set(d.x, y + 2.36, face);
    g.add(over);
    // The flag: two faces back to back on a small bracket, across the corridor's length.
    const out = north ? 1 : -1;
    g.add(box(0.02, 0.02, 0.36, STEEL, d.x + d.width / 2 + 0.25, y + 2.62, face + out * 0.18, false));
    for (const side of [-1, 1]) {
      const flag = plate(0.62, 0.2, '#1d4ed8', '#ffffff', [d.label]);
      flag.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      flag.position.set(d.x + d.width / 2 + 0.25 + side * 0.006, y + 2.48, face + out * 0.34);
      g.add(flag);
    }
  }
  return g;
}

/** Direction signs hanging from the ceiling, so that nobody gets lost: what lies each way along the corridor. */
function wayfinding(upper: boolean): THREE.Group {
  const g = new THREE.Group();
  const y = upper ? FLOOR_Y : 0;
  const mid = (ROOMS.corridor.z0 + ROOMS.corridor.z1) / 2;
  const hang = (x: number, east: string[], west: string[]): void => {
    g.add(box(0.012, 0.3, 0.012, STEEL, x, y + 2.85, mid - 0.5, false), box(0.012, 0.3, 0.012, STEEL, x, y + 2.85, mid + 0.5, false));
    const towardEast = plate(1.4, 0.36, '#14532d', '#ffffff', east);
    towardEast.rotation.y = -Math.PI / 2;
    towardEast.position.set(x - 0.008, y + 2.52, mid);
    const towardWest = plate(1.4, 0.36, '#14532d', '#ffffff', west);
    towardWest.rotation.y = Math.PI / 2;
    towardWest.position.set(x + 0.008, y + 2.52, mid);
    g.add(box(0.012, 0.38, 1.42, lit('#0f3d22', 0.6), x, y + 2.52, mid), towardEast, towardWest);
  };
  if (upper) {
    hang(5.2, ['ESCALIER  →'], ['←  ADMINISTRATION', '←  COURS 101 · 102']);
    hang(-1.5, ['ESCALIER · COURS 102  →'], ['←  ADMINISTRATION · COURS 101']);
  } else {
    hang(5.2, ['ESCALIER  →'], ['←  SALLE DE TP · SALLE TECHNIQUE', '←  COURS · DÉTENTE · TOILETTES']);
    hang(-6.4, ['SALLE TECHNIQUE · TP · ESCALIER  →'], ['←  COURS 001 · DÉTENTE · TOILETTES']);
  }
  return g;
}

/** A classroom's board, desks in rows facing it, the teacher's desk, windows. */
function classroom(r: Rect, y: number, board: { x: number; z: number; turn: number }, desks: { x: number; z: number }[], chairTurn: number, chairOffset: [number, number], teacher: { x: number; z: number; turn: number }, windows: THREE.Object3D[], props: Placed[]): THREE.Group {
  const g = new THREE.Group();
  props.push({ name: 'whiteboard', at: { x: board.x, y, z: board.z, turn: board.turn } });
  for (const d of desks) {
    props.push({ name: 'SchoolDesk_01', at: { x: d.x, y, z: d.z, turn: chairTurn } });
    props.push({ name: 'SchoolChair_01', at: { x: d.x + chairOffset[0], y, z: d.z + chairOffset[1], turn: chairTurn } });
    const shadow = contactShadow(0.9, 1.3, 0.35);
    shadow.position.set(d.x + chairOffset[0] / 2, y + 0.004, d.z + chairOffset[1] / 2);
    g.add(shadow);
  }
  props.push({ name: 'SchoolDesk_01', at: { x: teacher.x, y, z: teacher.z, turn: teacher.turn, scale: 1.25 } });
  props.push({ name: 'plastic_monobloc_chair_01', at: { x: teacher.x - Math.sin(teacher.turn) * 0.7, y, z: teacher.z - Math.cos(teacher.turn) * 0.7, turn: teacher.turn } });
  if (windows.length) g.add(...windows);
  void r;
  return g;
}

interface Placed {
  name: string;
  at: { x: number; y: number; z: number; turn?: number; scale?: number; only?: string[] };
}

/** The ground floor's west wing: classroom 001, the toilets and the lounge. */
function westWing(props: Placed[]): THREE.Group {
  const g = new THREE.Group();
  const c = ROOMS.classroom0;
  const desks: { x: number; z: number }[] = [];
  desks.push(...CLASS0_SPOTS);
  g.add(
    classroom(c, 0, { x: c.x0 + WALL_T / 2 + 0.01, z: 2.1, turn: Math.PI / 2 }, desks, -Math.PI / 2, [0.55, 0], { x: -12.9, z: 2.0, turn: Math.PI / 2 }, [], props),
  );
  // Toilets: three cubicles along the back wall, the washbasins on the east wall, a floor of light tiles.
  const t = ROOMS.toilets;
  for (const x of [-13.45, -12.5, -11.55]) props.push({ name: 'wc', at: { x, y: 0, z: t.z0 + WALL_T / 2 + 0.76, turn: 0 } });
  props.push({ name: 'washbasin', at: { x: t.x1 - WALL_T / 2 - 0.26, y: 0, z: -6.0, turn: -Math.PI / 2 } });
  const tiles = new THREE.Mesh(new THREE.PlaneGeometry(t.x1 - t.x0 - WALL_T, t.z1 - t.z0 - WALL_T), new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.35 }));
  tiles.rotation.x = -Math.PI / 2;
  tiles.position.set((t.x0 + t.x1) / 2, 0.004, (t.z0 + t.z1) / 2);
  g.add(tiles);
  // Lounge: a sofa under the windows, a low table and two armchairs, the drinks machine, coffee on a cart.
  const l = ROOMS.lounge;
  const back = l.z0 + WALL_T / 2;
  props.push({ name: 'Sofa_01', at: { x: -8.75, y: 0, z: back + 0.38, turn: 0 } });
  props.push({ name: 'modern_coffee_table_01', at: { x: -8.75, y: 0, z: -7.65, turn: Math.PI / 2 } });
  props.push({ name: 'modern_arm_chair_01', at: { x: -9.85, y: 0, z: -6.95, turn: Math.PI / 2 + 0.35 } });
  props.push({ name: 'modern_arm_chair_01', at: { x: -7.65, y: 0, z: -6.95, turn: -Math.PI / 2 - 0.35 } });
  props.push({ name: 'vending', at: { x: l.x0 + WALL_T / 2 + 0.41, y: 0, z: -5.2, turn: Math.PI / 2 } });
  props.push({ name: 'CoffeeCart_01', at: { x: l.x1 - WALL_T / 2 - 0.55, y: 0, z: -5.45, turn: -Math.PI / 2, only: ['CoffeeCart_01_cart'] } });
  props.push({ name: 'metal_trash_can', at: { x: -7.4, y: 0, z: -4.45, scale: 0.8, only: ['metal_trash_can'] } });
  const lounge = lettering('SALLE DE DÉTENTE', 1.6, 0.16, '#0b1e3f');
  lounge.rotation.y = Math.PI / 2;
  lounge.position.set(l.x0 + WALL_T / 2 + 0.004, 2.45, -7.0);
  g.add(lounge);
  return g;
}

/** Upstairs over the lab: classrooms 101 and 102. */
function upperClasses(props: Placed[]): THREE.Group {
  const g = new THREE.Group();
  for (const [r, side] of [[ROOMS.classroom1, -1], [ROOMS.classroom2, 1]] as const) {
    const desks: { x: number; z: number }[] = [];
    desks.push(...classUpSpots(r));
    const middle = (r.x0 + r.x1) / 2;
    g.add(classroom(r, FLOOR_Y, { x: middle, z: r.z0 + WALL_T / 2 + 0.01, turn: 0 }, desks, Math.PI, [0, 0.55], { x: middle + side * 2.2, z: -10.75, turn: 0 }, [], props));
  }
  return g;
}

/**
 * Another site's room, laid out like the technical room around its own origin: the bench and the rack, the operator's
 * box on the wall (placed by the mission), the site's name, the door to the street. The agency has two office desks
 * and windows onto Bobo-Dioulasso; the operator's data centre a row of server racks and no window.
 */
function siteInterior(site: 'agence' | 'datacenter', props: Placed[]): THREE.Group {
  const g = new THREE.Group();
  const z0 = SITE_Z[site];
  const parts = buildRoomParts();
  parts.position.z = z0;
  g.add(parts);
  const back = -1.6 + 0.004 + z0;
  const name = lettering(site === 'agence' ? 'AGENCE DE BOBO-DIOULASSO' : 'CENTRE DE DONNÉES', 2.6, 0.2, '#0b1e3f');
  name.position.set(-2.6, 2.4, back);
  const sub = lettering(site === 'agence' ? 'IST · SITE DISTANT' : 'OPÉRATEUR · FOURNISSEUR D’ACCÈS', 2.0, 0.08, '#1d4ed8');
  sub.position.set(-2.6, 2.22, back);
  g.add(name, sub);
  if (site === 'agence') {
    for (const x of [2.6, 4.2]) {
      g.add(deskAt(x, z0 + 4.2, -1));
      props.push({ name: 'SchoolChair_01', at: { x, y: 0, z: z0 + 3.45, turn: 0 } });
    }
  } else {
    const row = rackRow();
    row.position.z = z0;
    g.add(row);
  }
  return g;
}

/**
 * The rest of a far site's building: the corridor with its signs, the entrance hall (counter, waiting sofa, the door to
 * the street, which is the way to the other sites), an office, a meeting room, the toilets.
 */
function siteWing(site: 'agence' | 'datacenter', props: Placed[]): THREE.Group {
  const g = new THREE.Group();
  const w = SITE_WINGS[site];
  const z0 = SITE_Z[site];
  const dc = site === 'datacenter';
  g.add(doorSigns(0, w.corridor));
  // The hall: the street door shut in the outside wall, the exit sign over it, the site's name.
  const back = w.hall.z0 + WALL_T / 2;
  const exit = new THREE.Group();
  exit.name = `exit-${site}`;
  for (const s of [-1, 1]) {
    const leaf = box(0.78, 2.1, 0.05, lit('#1f2937', 0.35, 0.5), SITE_EXIT_X + s * 0.4, 1.05, back + 0.026);
    leaf.userData.exit = true;
    const glass = box(0.5, 1.4, 0.052, lit('#9fb6c8', 0.08, 0.2), SITE_EXIT_X + s * 0.4, 1.25, back + 0.027, false);
    glass.userData.exit = true;
    const bar = box(0.5, 0.035, 0.05, lit('#d1d5db', 0.25, 0.9), SITE_EXIT_X + s * 0.4, 1.0, back + 0.075, false);
    bar.userData.exit = true;
    exit.add(leaf, glass, bar);
  }
  const sign = plate(0.6, 0.18, '#15803d', '#ffffff', ['SORTIE']);
  sign.position.set(SITE_EXIT_X, 2.38, back + 0.006);
  exit.add(sign);
  exit.traverse((o) => (o.userData.dynamic = true));
  g.add(exit);
  const name = lettering(dc ? 'OPÉRATEUR · CENTRE DE DONNÉES' : 'IST · AGENCE DE BOBO-DIOULASSO', 2.6, 0.16, '#0b1e3f');
  name.rotation.y = -Math.PI / 2;
  name.position.set(w.hall.x1 - WALL_T / 2 - 0.006, 2.35, -7.6 + z0);
  g.add(name);
  props.push({ name: 'reception', at: { x: -3.62, y: 0, z: -7.6 + z0, turn: -Math.PI / 2 } });
  props.push({ name: 'SchoolChair_01', at: { x: -3.25, y: 0, z: -7.2 + z0, turn: -Math.PI / 2 } });
  props.push({ name: 'Sofa_01', at: { x: -7.58, y: 0, z: -6.8 + z0, turn: Math.PI / 2 } });
  props.push({ name: 'modern_coffee_table_01', at: { x: -6.85, y: 0, z: -6.8 + z0, scale: 0.8 } });
  // The office (the agency's management, or the operator's network operations): two desks under the window.
  for (const x of [-2.0, 0]) {
    g.add(deskAt(x, -8.65 + z0, 1));
    props.push({ name: 'SchoolChair_01', at: { x, y: 0, z: -7.9 + z0, turn: Math.PI } });
  }
  if (dc) {
    // The operations room's wall of screens: the network's map and its alarms.
    for (const [i, dz] of [-1.2, 0, 1.2].entries()) {
      const lines = [
        ['SUPERVISION · LIGNES LOUÉES', '', 'LS-0331 CAMPUS ↔ BOBO   UP', 'LS-0332 CAMPUS ↔ OPÉRATEUR UP', 'LS-0410 KOUDOUGOU      UP'],
        ['RÉSEAU NATIONAL', '', 'OUAGA ── BOBO ── BANFORA', '   │', 'KOUDOUGOU ── OUAHIGOUYA'],
        ['ALARMES', '', 'Aucune alarme active', '', 'Trafic : 38 % du lien'],
      ][i] as string[];
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.64), new THREE.MeshBasicMaterial({ map: screenTexture(lines), color: '#ffffff', toneMapped: false }));
      screen.rotation.y = Math.PI / 2;
      screen.position.set(w.office.x0 + WALL_T / 2 + 0.045, 1.75, -6.6 + z0 + dz);
      g.add(box(0.04, 0.7, 1.16, BLACK, w.office.x0 + WALL_T / 2 + 0.02, 1.75, -6.6 + z0 + dz), screen);
    }
  }
  // The meeting room: the table along the room, three chairs each side.
  props.push({ name: 'meeting', at: { x: 2.75, y: 0, z: -6.6 + z0, turn: Math.PI / 2 } });
  for (const dz of [-0.8, 0, 0.8]) {
    props.push({ name: 'SchoolChair_01', at: { x: 2.0, y: 0, z: -6.6 + z0 + dz, turn: Math.PI / 2 } });
    props.push({ name: 'SchoolChair_01', at: { x: 3.5, y: 0, z: -6.6 + z0 + dz, turn: -Math.PI / 2 } });
  }
  const board = plate(1.6, 0.9, '#f8fafc', '#1d4ed8', dc ? ['PLAN DE CONTINUITÉ', 'LIGNES LOUÉES · CLIENTS'] : ['RÉUNION DU LUNDI', 'LIAISON AVEC LE CAMPUS']);
  board.position.set(2.75, 1.6, w.meeting.z1 - WALL_T / 2 - 0.006);
  board.rotation.y = Math.PI;
  g.add(board);
  // The toilets: two cubicles, the washbasins on the partition.
  for (const x of [5.05, 6.05]) props.push({ name: 'wc', at: { x, y: 0, z: w.toilets.z0 + WALL_T / 2 + 0.76, turn: 0 } });
  props.push({ name: 'washbasin', at: { x: w.toilets.x0 + WALL_T / 2 + 0.26, y: 0, z: -5.6 + z0, turn: Math.PI / 2 } });
  const t = w.toilets;
  const tiles = new THREE.Mesh(new THREE.PlaneGeometry(t.x1 - t.x0 - WALL_T, t.z1 - t.z0 - WALL_T), new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.35 }));
  tiles.rotation.x = -Math.PI / 2;
  tiles.position.set((t.x0 + t.x1) / 2, 0.004, (t.z0 + t.z1) / 2);
  g.add(tiles);
  return g;
}

/** Light, square floor tiles with grey joints, for the toilets. */
function tileTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d') as CanvasRenderingContext2D;
  c.fillStyle = '#9aa3ad';
  c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < 4; k++) {
      const v = 226 + ((i * 7 + k * 13) % 9);
      c.fillStyle = `rgb(${v}, ${v + 2}, ${v + 4})`;
      c.fillRect(i * 128 + 3, k * 128 + 3, 122, 122);
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 10);
  return t;
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
  placeMany(labPart, 'SchoolChair_01', LAB_DESK_ROWS.flatMap((row) => LAB_DESK_X.map((x) => ({ x, y: 0, z: row + 0.75 + LAB_Z, turn: Math.PI }))));
  const labLeft = ROOMS.lab.x0 + WALL_T / 2;
  placeProp(labPart, 'screen_case', { x: -4.2, y: 0, z: -1.6 + LAB_Z, turn: 0 });
  placeProp(labPart, 'projector', { x: -4.2, y: 0, z: 2.5 + LAB_Z, turn: Math.PI });
  placeProp(labPart, 'lockers', { x: labLeft + 0.27, y: 0, z: -0.6 + LAB_Z, turn: Math.PI / 2 });
  g.add(labPart, part('part-lower', zoneShell('corridor', { lights: true }), corridorDecor(false, floors)));
  if (floors) {
    const office = buildRoomParts();
    office.add(officeFurniture());
    office.position.y = FLOOR_Y;
    const officePart = part('part-office', zoneShell('office', { lights: true }), office);
    placeMany(officePart, 'SchoolChair_01', [-3.1, 3.1].flatMap((cx) => [-1.0, 0, 1.0].flatMap((dx) => [{ x: cx + dx, y: FLOOR_Y, z: 2.45, turn: 0 }, { x: cx + dx, y: FLOOR_Y, z: 4.55, turn: Math.PI }])));
    const left = ROOMS.room.x0 + WALL_T / 2;
    placeProp(officePart, 'binder_cabinet', { x: left + 0.27, y: FLOOR_Y, z: 1.3, turn: Math.PI / 2 });
    placeProp(officePart, 'binder_notebook', { x: left + 0.27, y: FLOOR_Y + 0.88, z: 2.45, turn: Math.PI / 2 });
    g.add(part('part-stairs', zoneShell('stairs', { lights: true }), stairDecor()), officePart, part('part-upper', zoneShell('corridor1', { lights: true }), corridorDecor(true, true)));
  }

  return g;
}

/**
 * The parts of the building that no mission works in, built one at a time once the mission is on screen (see
 * `Mission.buildLater`): the campus's west wing and upstairs classrooms, and each far site when the player first goes
 * there. Nothing is built that the player cannot reach.
 */
export function buildWestWing(): THREE.Group {
  const props: Placed[] = [];
  const west = part('part-west', zoneShell('classroom0', { lights: true }), zoneShell('toilets', { lights: true }), zoneShell('lounge', { lights: true }), westWing(props));
  placeAll(west, props);
  return west;
}

export function buildClassrooms(): THREE.Group {
  const props: Placed[] = [];
  const classes = part('part-classes', zoneShell('classroom1', { lights: true }), zoneShell('classroom2', { lights: true }), upperClasses(props));
  placeAll(classes, props);
  return classes;
}

/** A far site: its technical room, and the rest of its building. */
export function buildSite(site: 'agence' | 'datacenter'): THREE.Group[] {
  const props: Placed[] = [];
  const sitePart = part(`part-${site}`, zoneShell(site, { lights: true, raisedFloor: site === 'datacenter' }), siteInterior(site, props));
  placeAll(sitePart, props);
  const wingProps: Placed[] = [];
  const wing = part(`part-${site}-wing`, ...(['corridor', 'hall', 'office', 'meeting', 'toilets'] as const).map((room) => zoneShell(`${site}-${room}`, { lights: true })), siteWing(site, wingProps));
  placeAll(wing, wingProps);
  return [sitePart, wing];
}
