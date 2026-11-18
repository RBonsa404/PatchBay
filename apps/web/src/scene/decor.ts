import * as THREE from 'three';
import { FACE } from './building.js';
import { contactShadow, photo } from './materials.js';
import { placeMany, placeProp } from './props.js';
import { textTexture } from './textures.js';

/**
 * What makes the room a working technical room rather than a set: storage, more cabinets, a technician's desk, wall
 * trunking, panels and signs. Nothing here can be used; the player walks around it (`game/player.ts` has the
 * footprints). The furniture is modelled in Blender (`art/blender/`), the signs are drawn here.
 */

const lit = (color: string, roughness = 0.6, metalness = 0.1): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

const M = {
  steel: lit('#475569', 0.45, 0.75),
  darkSteel: lit('#2c333e', 0.45, 0.6),
  paintedGrey: lit('#94a3b8', 0.65, 0.2),
  white: lit('#e8ebef', 0.7),
  trunking: lit('#d6dae0', 0.6),
  black: lit('#1b2028', 0.6, 0.25),
  plastic: lit('#20262f', 0.45),
  wood: new THREE.MeshStandardMaterial({ ...photo('plywood', 1, 0.5), roughness: 0.8 }),
  amber: lit('#fbbf24', 0.6),
  blue: lit('#1d4ed8', 0.6),
  red: lit('#dc2626', 0.5),
};

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function cylinder(r: number, h: number, material: THREE.Material, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'y'): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), material);
  m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  m.castShadow = true;
  return m;
}

/** A printed sign or poster: a coloured sheet with lines of text. */
function sign(w: number, h: number, background: string, color: string, lines: string[]): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * h) / w);
  const c = canvas.getContext('2d') as CanvasRenderingContext2D;
  c.fillStyle = background;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // The largest size at which the longest line fits: text is never squeezed.
  let size = Math.min(canvas.height / (lines.length + 0.8), 74);
  c.font = `700 ${Math.round(size)}px Inter, sans-serif`;
  const widest = Math.max(...lines.map((line) => c.measureText(line).width));
  if (widest > canvas.width - 36) size *= (canvas.width - 36) / widest;
  c.font = `700 ${Math.round(size)}px Inter, sans-serif`;
  lines.forEach((line, i) => c.fillText(line, canvas.width / 2, (canvas.height * (i + 1)) / (lines.length + 1)));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 }));
}

/**
 * Steel shelving along the left wall, modelled in Blender (`art/blender/shelving.py`): perforated angle posts, five
 * shelves, X bracing, and the stock in straight rows (labelled crates, two reels of cable, spare switches in their boxes).
 */
function shelving(): THREE.Group {
  const g = new THREE.Group();
  const [x, z0, z1, depth] = [-3.24, 0.15, 2.05, 0.46];
  placeProp(g, 'shelving', { x, y: 0, z: (z0 + z1) / 2, turn: Math.PI / 2 });
  const shadow = contactShadow(depth + 0.3, z1 - z0 + 0.3, 0.55);
  shadow.position.set(x, 0.003, (z0 + z1) / 2);
  g.add(shadow);
  return g;
}

/**
 * Three closed network cabinets bayed against the right wall, facing the room, modelled in Blender
 * (`art/blender/network_cabinet.py`, the 650 mm deep variant): perforated door through which the patch panels, the
 * cabled switches, the servers and the UPS show with their LEDs lit; the bay's name plate on the door's top band.
 */
function cabinetRow(): THREE.Group {
  const g = new THREE.Group();
  const [w, d] = [0.6, 0.65];
  const x = 3.5 - d / 2 - 0.02;
  const bays = [0.02, 0.62, 1.22];
  placeMany(g, 'network-cabinet-wall', bays.map((z) => ({ x, y: 0, z, turn: -Math.PI / 2 })));
  bays.forEach((z, n) => {
    const tag = sign(0.2, 0.05, '#0b1e3f', '#e2e8f0', [`BAIE-0${n + 2}`]);
    tag.rotation.y = -Math.PI / 2;
    tag.position.set(x - d / 2 - 0.021, 1.898, z);
    g.add(tag);
  });
  const shadow = contactShadow(d + 0.35, bays.length * w + 0.3, 0.6);
  shadow.position.set(x, 0.003, 0.62);
  g.add(shadow);
  return g;
}

/** The technician's desk against the front wall: monitor, keyboard, binders, a chair, and a window onto the corridor. */
function desk(): THREE.Group {
  const g = new THREE.Group();
  // Against the front wall, under the window (as `building.ts` stops the player around it).
  // In the front left corner, clear of the second row of racks, under its window.
  const [x, z, top] = [-4.5, FACE.front - 0.4, 0.74];
  // Modelled (`art/blender/tech_desk.py`): laminate top on a C-leg frame, drawer pedestal on castors, monitor on its
  // stand, keyboard and mouse, labelled binders. Turned so that the seat side faces the room.
  placeProp(g, 'tech-desk', { x, y: 0, z, turn: Math.PI });
  // The monitor's picture: a dim terminal, on the model's screen face.
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshBasicMaterial({ map: textTexture('$ show running-config', { width: 512, height: 296, color: '#7dd3fc', font: '400 26px "JetBrains Mono", monospace' }), color: '#ffffff', transparent: true }));
  screen.rotation.y = Math.PI;
  screen.position.set(x - 0.1, top + 0.305, z + 0.124);
  const screenBase = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshBasicMaterial({ color: '#07111f' }));
  screenBase.rotation.y = Math.PI;
  screenBase.position.set(x - 0.1, top + 0.305, z + 0.126);
  g.add(screenBase, screen);
  placeProp(g, 'clipboard', { x: x + 0.34, y: top + 0.018, z: z - 0.1, turn: 0.2 });
  placeProp(g, 'desk_lamp_arm_01', { x: x - 0.55, y: top + 0.1, z: z + 0.16, turn: 0.6, scale: 0.75 });

  placeProp(g, 'SchoolChair_01', { x: x - 0.05, y: 0, z: z - 0.72, turn: 0.25 });
  const chairShadow = contactShadow(0.8, 0.8, 0.5);
  chairShadow.position.set(x - 0.05, 0.003, z - 0.72);
  const deskShadow = contactShadow(1.8, 1, 0.5);
  deskShadow.position.set(x, 0.003, z);
  g.add(chairShadow, deskShadow);

  return g;
}

/** Wall furniture: trunking and sockets, electrical panel, pegboard, notice board, clock, signs, ceiling details. */
function walls(): THREE.Group {
  const g = new THREE.Group();
  const back = FACE.back + 0.005;

  // White trunking along the walls, with sockets at regular intervals and drops from the ceiling.
  g.add(box(3.9, 0.06, 0.03, M.trunking, -0.45, 0.42, back + 0.015, false), box(0.05, 2.15, 0.025, M.trunking, -2.3, 1.82, back + 0.012, false));
  for (const x of [-2.1, -1.2, 0.7, 1.2]) {
    g.add(box(0.075, 0.075, 0.012, M.white, x, 0.42, back + 0.034, false), box(0.016, 0.022, 0.003, M.black, x, 0.42, back + 0.041, false));
  }
  g.add(box(0.03, 0.06, 5.6, M.trunking, FACE.left + 0.018, 0.42, 2.8, false));
  g.add(box(0.03, 0.06, 3.0, M.trunking, FACE.right - 0.018, 0.42, 4.2, false));

  // Electrical panel on the left wall, modelled (`art/blender/electrical_panel.py`): breakers behind the door's window,
  // the danger plate, the conduits up to the ceiling.
  placeProp(g, 'electrical-panel', { x: FACE.left + 0.03, y: 1.05, z: -1.12, turn: Math.PI / 2 });

  // The tool wall on the right wall, modelled (`art/blender/tool_wall.py`): a low steel cupboard with two doors under a
  // pegboard on stand-offs, the cabling tools on their hooks (coils of cable, crimper, tester, cutters, punch-down
  // tool, screwdrivers). The cupboard's wooden top is drawn here, with the bench's plywood.
  const rx = FACE.right - 3.5;
  placeProp(g, 'tool-wall', { x: FACE.right, y: 0, z: 2.6, turn: -Math.PI / 2 });
  g.add(box(0.46, 0.03, 1.28, M.wood, 3.25 + rx, 0.865, 2.6));
  // A real toolbox and a multimeter on the cupboard.
  placeProp(g, 'metal_toolbox', { x: 3.25 + rx, y: 0.88, z: 2.25, turn: -Math.PI / 2 });
  placeProp(g, 'retro_multimeter', { x: 3.25 + rx, y: 0.88, z: 2.95, turn: -Math.PI / 2 - 0.25, scale: 0.8 });
  const cupboardShadow = contactShadow(0.8, 1.6, 0.5);
  cupboardShadow.position.set(3.2 + rx, 0.003, 2.6);
  g.add(cupboardShadow);

  // Notice board on the left wall: pinned sheets and a network plan.
  const board = box(0.018, 0.8, 1.15, lit('#8a6a48', 0.95), FACE.left + 0.01, 1.55, 2.85, false);
  g.add(board);
  const sheets: [string[], string, number, number][] = [
    [['PLANNING', 'TP RÉSEAUX'], '#f8fafc', 2.5, 1.72],
    [['RÈGLES', 'SALLE TECHNIQUE'], '#fef3c7', 2.85, 1.72],
    [['VLAN 10 · 20 · 99'], '#dbeafe', 3.2, 1.75],
    [['CODE COULEUR', 'CÂBLES'], '#f8fafc', 2.65, 1.36],
    [['SAUVEGARDE ?', 'copy run start'], '#fde68a', 3.05, 1.36],
  ];
  for (const [lines, colour, z, y] of sheets) {
    const sheet = sign(0.27, 0.27, colour, '#0b1e3f', lines);
    sheet.rotation.y = Math.PI / 2;
    sheet.position.set(FACE.left + 0.021, y, z);
    g.add(sheet);
  }

  // Back wall: a clock, safety signs, a rack diagram.
  placeProp(g, 'wall_clock', { x: -1.95, y: 2.38, z: back });
  const esd = sign(0.26, 0.17, '#1d4ed8', '#ffffff', ['ZONE ESD', 'BRACELET OBLIGATOIRE']);
  esd.position.set(0.72, 1.62, back + 0.002);
  const reserved = sign(0.3, 0.12, '#0b1e3f', '#fbbf24', ['ACCÈS RÉSERVÉ']);
  reserved.position.set(0.46, 1.62, 0.022);
  g.add(esd);
  // The sign rides on the door's leaf: added once the room is assembled.
  g.userData.doorSign = reserved;

  placeProp(g, 'security_camera_01', { x: 0.75, y: 2.62, z: back + 0.32, turn: 0.35 });
  placeProp(g, 'fire_alarm', { x: -2.32, y: 1.45, z: back + 0.002 });

  // Ceiling: an air duct with its grilles, a smoke detector.
  g.add(box(4.8, 0.26, 0.42, M.paintedGrey, -0.4, 2.86, FACE.front - 0.45));
  for (const x of [-2.2, -0.4, 1.4]) g.add(box(0.5, 0.012, 0.3, M.darkSteel, x, 2.725, FACE.front - 0.45, false));
  g.add(cylinder(0.065, 0.035, M.white, -0.6, 2.98, 1.4));
  return g;
}

/** The floor stays clear: only the safety tape, a bin beside the desk, and tidy crates on the bench's lower shelf. */
function floor(): THREE.Group {
  const g = new THREE.Group();
  // The office bin, modelled (`art/blender/wastebin.py`): rolled rim, liner folded over it, crumpled paper inside.
  placeProp(g, 'wastebin', { x: -3.35, y: 0, z: FACE.front - 0.3 });
  const binShadow = contactShadow(0.5, 0.5, 0.5);
  binShadow.position.set(-3.35, 0.003, FACE.front - 0.3);
  g.add(binShadow);

  // Yellow floor tape marking the clearance in front of the cabinets.
  const tape = lit('#eab308', 0.7);
  g.add(box(0.05, 0.002, 2.2, tape, FACE.right - 0.9, 0.003, 0.62, false), box(0.05, 0.002, 1.1, tape, FACE.right - 1.3, 0.003, -1.05, false));

  // The bench's lower shelf: three crates in a row, labels to the front (`art/blender/bench_crates.py`).
  placeProp(g, 'bench-crates', { x: -0.47, y: 0.17, z: 0.3 });
  return g;
}

/** How far the room's walls moved out from where these pieces were first laid out (3.5 m either side). */
const LEFT = FACE.left + 3.5;
const RIGHT = FACE.right - 3.5;

export function buildDecor(): THREE.Group {
  const g = new THREE.Group();
  const left = shelving();
  left.position.x = LEFT;
  const right = cabinetRow();
  right.position.x = RIGHT;
  const front = desk();
  g.add(left, right, front, walls(), floor(), rackRow());
  return g;
}

/**
 * A second row of racks across the room, as in a real network room: ten closed cabinets bayed side by side, modelled in
 * Blender (`art/blender/network_cabinet.py`): perforated front and rear doors, patch fields cabled to the switches,
 * servers and UPS with their LEDs behind them, the power strips at the back. One draw call per material for the row.
 */
export function rackRow(): THREE.Group {
  const g = new THREE.Group();
  const [w, d, z] = [0.6, 0.9, 3.7];
  const xs = Array.from({ length: 10 }, (_, n) => -2.7 + n * w);
  placeMany(g, 'network-cabinet', xs.map((x) => ({ x, y: 0, z, turn: Math.PI })));
  xs.forEach((x, n) => {
    const tag = sign(0.24, 0.06, '#0b1e3f', '#e2e8f0', [`BAIE-${String(n + 5).padStart(2, '0')}`]);
    tag.rotation.y = Math.PI;
    tag.position.set(x, 1.898, z - d / 2 - 0.021);
    g.add(tag);
  });
  // A cable tray over the row, the cold aisle's yellow tape in front of it.
  g.add(box(6.1, 0.06, 0.4, lit('#fbbf24', 0.6, 0.3), 0, 2.35, z));
  const tape = lit('#eab308', 0.7);
  g.add(box(6.1, 0.002, 0.05, tape, 0, 0.003, z - d / 2 - 0.6, false));
  const shadow = contactShadow(6.4, 1.3, 0.6);
  shadow.position.set(0, 0.003, z);
  g.add(shadow);
  return g;
}
