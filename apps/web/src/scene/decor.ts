import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { contactShadow, outsideTexture, photo, sunPatchTexture } from './materials.js';
import { placeProp } from './props.js';
import { textTexture } from './textures.js';

/**
 * What makes the room a working technical room rather than a set: storage, more cabinets, a technician's desk, wall
 * trunking, panels and signs. Nothing here can be used; the player walks around it (`game/player.ts` has the
 * footprints). Everything is built from simple shapes, with no download.
 */

const lit = (color: string, roughness = 0.6, metalness = 0.1): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

const M = {
  steel: lit('#475569', 0.45, 0.75),
  darkSteel: lit('#2c333e', 0.45, 0.6),
  paintedGrey: lit('#94a3b8', 0.65, 0.2),
  white: lit('#e8ebef', 0.7),
  trunking: lit('#d6dae0', 0.6),
  crate: lit('#334155', 0.6, 0.1),
  crateLid: lit('#22418f', 0.5, 0.12),
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

/** A box with softened edges: what makes an object look made rather than modelled. */
function soft(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, radius = 0.012): THREE.Mesh {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, h / 2.2, w / 2.2, d / 2.2)), material);
  m.position.set(x, y, z);
  m.castShadow = true;
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

/** A spool of cable lying on its side. */
function spool(colour: string, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const cable = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.55 });
  g.add(cylinder(0.09, 0.09, cable, 0, 0, 0, 'z'));
  g.add(cylinder(0.125, 0.008, M.plastic, 0, 0, 0.05, 'z'), cylinder(0.125, 0.008, M.plastic, 0, 0, -0.05, 'z'));
  g.position.set(x, y + 0.125, z);
  return g;
}

/** A coil of patch cable hanging on a hook, flat against a wall facing +z. */
function coil(colour: string, x: number, y: number): THREE.Group {
  const g = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.075 - i * 0.004, 0.0045, 8, 28), material);
    loop.position.set((i - 1) * 0.004, -0.075, 0.012 + i * 0.006);
    loop.castShadow = true;
    g.add(loop);
  }
  g.add(cylinder(0.006, 0.04, M.steel, 0, 0, 0.02, 'z'));
  g.position.set(x, y, 0);
  return g;
}

/** A labelled storage crate: all the same size and lined up, as in a kept stockroom. */
function crate(x: number, y: number, z: number, label: string, w = 0.36, h = 0.26, d = 0.5): THREE.Group {
  const g = new THREE.Group();
  g.add(soft(w, h, d, M.crate, 0, h / 2, 0), soft(w + 0.012, 0.022, d + 0.012, M.crateLid, 0, h, 0, 0.008));
  // A carrying handle on the end.
  g.add(soft(0.012, 0.02, 0.12, M.steel, w / 2 + 0.004, h * 0.86, 0, 0.004));
  const tag = sign(0.26, 0.09, '#f8fafc', '#0b1e3f', [label]);
  tag.rotation.y = Math.PI / 2;
  tag.position.set(w / 2 + 0.002, h * 0.55, 0);
  g.add(tag);
  g.position.set(x, y, z);
  return g;
}

/** Steel shelving along the left wall: labelled crates in straight rows, spools and spare switches in their place. */
function shelving(): THREE.Group {
  const g = new THREE.Group();
  const [x, z0, z1, depth] = [-3.24, 0.15, 2.05, 0.46];
  const levels = [0.14, 0.62, 1.1, 1.58, 2.02];
  for (const z of [z0, (z0 + z1) / 2, z1]) {
    for (const dx of [-depth / 2, depth / 2]) g.add(box(0.035, 2.1, 0.035, M.steel, x + dx, 1.05, z));
  }
  for (const y of levels) g.add(box(depth, 0.025, z1 - z0, M.paintedGrey, x, y, (z0 + z1) / 2));
  const on = (level: number): number => (levels[level] as number) + 0.0125;
  const rows = [0.48, 1.1, 1.72];
  const stock = [['RJ45 CAT6', 'PATCH 1 m', 'PATCH 2 m'], [], ['CONSOLE', 'SÉRIE V.35', 'SFP'], ['ÉTIQUETTES', 'COLLIERS', 'VIS DE BAIE']];
  stock.forEach((labels, level) => labels.forEach((label, i) => g.add(crate(x, on(level), rows[i] as number, label))));
  // Cable spools on the second shelf, and a spare switch on top of each other at the end of it.
  g.add(spool('#2563eb', x, on(1), 0.48), spool('#f59e0b', x, on(1), 1.1));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.33, 0.044, 0.44, M.darkSteel, x, on(1) + 0.024 + i * 0.047, 1.72));
    for (let k = 0; k < 8; k++) g.add(box(0.002, 0.014, 0.018, M.black, x + 0.166, on(1) + 0.024 + i * 0.047, 1.58 + k * 0.04, false));
  }
  const shadow = contactShadow(depth + 0.3, z1 - z0 + 0.3, 0.55);
  shadow.position.set(x, 0.003, (z0 + z1) / 2);
  g.add(shadow);
  return g;
}

/** A row of closed cabinets along the right wall, facing the room, with a few live LEDs behind the mesh. */
function cabinetRow(): THREE.Group {
  const g = new THREE.Group();
  const leds = ['#22c55e', '#38bdf8', '#22c55e', '#fbbf24'];
  [-0.05, 0.62, 1.29].forEach((z, n) => {
    const [w, h, d] = [0.66, 2.05, 0.65];
    const x = 3.5 - w / 2 - 0.02;
    g.add(box(w, h, d, M.black, x, h / 2, z));
    const door = box(0.006, h - 0.1, d - 0.06, M.darkSteel, x - w / 2 - 0.003, h / 2, z);
    g.add(door);
    // Perforated front: rows of dark slots, and the machines' LEDs through them.
    for (let i = 0; i < 28; i++) {
      const slot = new THREE.Mesh(new THREE.PlaneGeometry(d - 0.16, 0.026), new THREE.MeshBasicMaterial({ color: '#05070a' }));
      slot.rotation.y = -Math.PI / 2;
      slot.position.set(x - w / 2 - 0.0065, 0.2 + i * 0.062, z);
      g.add(slot);
      if ((i + n) % 3 === 0) {
        for (let k = 0; k < 2; k++) {
          const led = new THREE.Mesh(new THREE.CircleGeometry(0.004, 8), new THREE.MeshBasicMaterial({ color: leds[(i + k + n) % 4], toneMapped: false }));
          led.rotation.y = -Math.PI / 2;
          led.position.set(x - w / 2 - 0.007, 0.2 + i * 0.062, z + 0.17 + k * 0.02);
          g.add(led);
        }
      }
    }
    g.add(box(0.03, 0.2, 0.025, M.steel, x - w / 2 - 0.018, 1.1, z - d / 2 + 0.06, false));
    const tag = sign(0.2, 0.05, '#0b1e3f', '#e2e8f0', [`BAIE-0${n + 2}`]);
    tag.rotation.y = -Math.PI / 2;
    tag.position.set(x - w / 2 - 0.007, 1.92, z);
    g.add(tag);
  });
  const shadow = contactShadow(1.0, 2.3, 0.6);
  shadow.position.set(3.1, 0.003, 0.62);
  g.add(shadow);
  return g;
}

/** The technician's desk against the front wall: monitor, keyboard, binders, a chair, and a window onto the corridor. */
function desk(): THREE.Group {
  const g = new THREE.Group();
  const [x, z, top] = [-0.9, 3.2, 0.74];
  g.add(box(1.5, 0.035, 0.7, M.wood, x, top, z));
  for (const dx of [-0.7, 0.7]) g.add(box(0.04, top, 0.62, M.steel, x + dx, top / 2, z));
  g.add(box(0.42, 0.56, 0.55, M.paintedGrey, x + 0.48, 0.3, z));
  for (let i = 0; i < 3; i++) g.add(box(0.1, 0.012, 0.012, M.steel, x + 0.48, 0.47 - i * 0.17, z - 0.282, false));
  // Monitor turned towards the chair, with a dim terminal.
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshBasicMaterial({ map: textTexture('$ show running-config', { width: 512, height: 296, color: '#7dd3fc', font: '400 26px "JetBrains Mono", monospace' }), color: '#ffffff', transparent: true }));
  const back = soft(0.55, 0.33, 0.025, M.black, x - 0.1, top + 0.3, z + 0.14, 0.01);
  screen.rotation.y = Math.PI;
  screen.position.set(x - 0.1, top + 0.3, z + 0.126);
  const screenBase = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshBasicMaterial({ color: '#07111f' }));
  screenBase.rotation.y = Math.PI;
  screenBase.position.set(x - 0.1, top + 0.3, z + 0.1265);
  g.add(back, screenBase, screen, box(0.05, 0.14, 0.05, M.black, x - 0.1, top + 0.08, z + 0.16), box(0.2, 0.012, 0.16, M.black, x - 0.1, top + 0.024, z + 0.16));
  g.add(box(0.4, 0.016, 0.13, M.plastic, x - 0.1, top + 0.026, z - 0.12), box(0.06, 0.02, 0.09, M.plastic, x + 0.17, top + 0.028, z - 0.12));
  const binders = ['#1d4ed8', '#fbbf24', '#0b1e3f', '#1d4ed8', '#94a3b8'];
  binders.forEach((colour, i) => g.add(box(0.05, 0.28, 0.2, lit(colour, 0.7), x + 0.42 + i * 0.056, top + 0.158, z + 0.2)));
  placeProp(g, 'clipboard', { x: x + 0.34, y: top + 0.018, z: z - 0.1, turn: 0.2 });
  placeProp(g, 'desk_lamp_arm_01', { x: x - 0.55, y: top + 0.1, z: z + 0.16, turn: 0.6, scale: 0.75 });

  // Chair: five spokes on the floor, a column, a seat and a back.
  const chair = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const spoke = box(0.3, 0.02, 0.04, M.black, 0, 0.07, 0);
    spoke.rotation.y = (i * Math.PI * 2) / 5;
    spoke.translateX(0.14);
    chair.add(spoke, cylinder(0.024, 0.04, M.black, Math.cos((i * Math.PI * 2) / 5) * 0.28, 0.024, -Math.sin((i * Math.PI * 2) / 5) * 0.28));
  }
  chair.add(cylinder(0.024, 0.34, M.steel, 0, 0.26, 0), soft(0.46, 0.08, 0.44, M.plastic, 0, 0.47, 0, 0.035), soft(0.42, 0.48, 0.06, M.plastic, 0, 0.82, -0.22, 0.028), soft(0.05, 0.3, 0.02, M.steel, 0, 0.62, -0.25, 0.008));
  chair.position.set(x - 0.05, 0, z - 0.72);
  chair.rotation.y = 0.5;
  const chairShadow = contactShadow(0.8, 0.8, 0.5);
  chairShadow.position.set(x - 0.05, 0.003, z - 0.72);
  const deskShadow = contactShadow(1.8, 1, 0.5);
  deskShadow.position.set(x, 0.003, z);
  g.add(chair, chairShadow, deskShadow);

  // The window: the campus outside, the blind half down, and the daylight it lets in.
  const wz = 3.59;
  g.add(box(1.5, 1.2, 0.03, M.paintedGrey, 1.85, 1.65, wz, false));
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshBasicMaterial({ map: outsideTexture() }));
  outside.rotation.y = Math.PI;
  outside.position.set(1.85, 1.65, wz - 0.017);
  g.add(outside, box(0.03, 1.1, 0.02, M.paintedGrey, 1.85, 1.65, wz - 0.022, false), box(1.46, 0.05, 0.1, M.white, 1.85, 1.08, wz - 0.05));
  for (let i = 0; i < 12; i++) g.add(box(1.4, 0.004, 0.024, M.white, 1.85, 2.18 - i * 0.034, wz - 0.03, false));
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.2), new THREE.MeshBasicMaterial({ map: sunPatchTexture(), transparent: true, depthWrite: false, opacity: 0.55, toneMapped: false }));
  patch.rotation.x = -Math.PI / 2;
  patch.rotation.z = Math.PI;
  patch.position.set(1.75, 0.006, 2.45);
  patch.renderOrder = -1;
  g.add(patch);
  return g;
}

/** Wall furniture: trunking and sockets, electrical panel, pegboard, notice board, clock, signs, ceiling details. */
function walls(): THREE.Group {
  const g = new THREE.Group();
  const back = -1.595;

  // White trunking along the walls, with sockets at regular intervals and drops from the ceiling.
  g.add(box(3.9, 0.06, 0.03, M.trunking, -0.45, 0.42, back + 0.015, false), box(0.05, 2.15, 0.025, M.trunking, -2.3, 1.82, back + 0.012, false));
  for (const x of [-2.1, -1.2, 0.7, 1.2]) {
    g.add(box(0.075, 0.075, 0.012, M.white, x, 0.42, back + 0.034, false), box(0.016, 0.022, 0.003, M.black, x, 0.42, back + 0.041, false));
  }
  g.add(box(0.03, 0.06, 3.2, M.trunking, -3.482, 0.42, 2.0, false));
  g.add(box(0.03, 0.06, 2.0, M.trunking, 3.482, 0.42, 2.6, false));

  // Electrical panel on the left wall: a grey cabinet, a window on the breakers, a warning sign.
  const lx = -3.47;
  g.add(box(0.1, 0.8, 0.56, M.paintedGrey, lx, 1.45, -1.12));
  g.add(box(0.004, 0.3, 0.42, M.black, lx + 0.052, 1.56, -1.12, false));
  for (let i = 0; i < 9; i++) g.add(box(0.008, 0.08, 0.026, i % 4 === 3 ? M.red : M.white, lx + 0.056, 1.6, -1.27 + i * 0.037, false));
  for (let i = 0; i < 9; i++) g.add(box(0.008, 0.08, 0.026, M.white, lx + 0.056, 1.48, -1.27 + i * 0.037, false));
  const danger = sign(0.2, 0.12, '#fbbf24', '#0b0f17', ['DANGER', 'ÉLECTRIQUE']);
  danger.rotation.y = Math.PI / 2;
  danger.position.set(lx + 0.053, 1.22, -1.12);
  g.add(danger);
  g.add(cylinder(0.018, 0.75, M.trunking, lx, 2.25, -1.25), cylinder(0.018, 0.75, M.trunking, lx, 2.25, -1.0));

  // Pegboard above a low cupboard on the right wall: crimping tools, testers, coils of cable.
  const peg = new THREE.Group();
  peg.add(box(1.25, 0.8, 0.012, lit('#3b4757', 0.8), 0, 1.65, 0, false));
  peg.add(coil('#2563eb', -0.42, 1.92), coil('#f59e0b', -0.18, 1.92), coil('#7dd3fc', 0.06, 1.92));
  // A crimper, a tester and pliers: their shapes against the board.
  peg.add(box(0.035, 0.2, 0.018, M.red, 0.28, 1.72, 0.015), box(0.035, 0.2, 0.018, M.red, 0.33, 1.72, 0.015), box(0.07, 0.07, 0.022, M.steel, 0.305, 1.84, 0.018));
  peg.add(box(0.1, 0.16, 0.03, M.amber, 0.5, 1.76, 0.02), box(0.07, 0.05, 0.002, M.black, 0.5, 1.8, 0.036, false));
  peg.add(box(0.13, 0.03, 0.015, M.blue, -0.3, 1.45, 0.012), box(0.03, 0.03, 0.02, M.steel, -0.22, 1.45, 0.014), box(0.16, 0.022, 0.015, M.amber, 0.02, 1.45, 0.012), box(0.14, 0.022, 0.015, M.red, 0.26, 1.45, 0.012));
  peg.rotation.y = -Math.PI / 2;
  peg.position.set(3.487, 0, 2.6);
  g.add(peg);
  g.add(box(0.45, 0.85, 1.25, M.paintedGrey, 3.26, 0.425, 2.6));
  g.add(box(0.46, 0.03, 1.28, M.wood, 3.25, 0.865, 2.6));
  g.add(box(0.004, 0.75, 0.003, M.black, 3.031, 0.42, 2.6, false));
  for (const dz of [-0.06, 0.06]) g.add(box(0.016, 0.12, 0.016, M.steel, 3.025, 0.5, 2.6 + dz, false));
  // A real toolbox and a multimeter on the cupboard.
  placeProp(g, 'metal_toolbox', { x: 3.25, y: 0.88, z: 2.25, turn: -Math.PI / 2 });
  placeProp(g, 'retro_multimeter', { x: 3.25, y: 0.88, z: 2.95, turn: -Math.PI / 2 - 0.25, scale: 0.8 });
  const cupboardShadow = contactShadow(0.8, 1.6, 0.5);
  cupboardShadow.position.set(3.2, 0.003, 2.6);
  g.add(cupboardShadow);

  // Notice board on the left wall: pinned sheets and a network plan.
  const board = box(0.018, 0.8, 1.15, lit('#8a6a48', 0.95), -3.49, 1.55, 2.85, false);
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
    sheet.position.set(-3.479, y, z);
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
  g.add(box(4.8, 0.26, 0.42, M.paintedGrey, -0.4, 2.86, 3.15));
  for (const x of [-2.2, -0.4, 1.4]) g.add(box(0.5, 0.012, 0.3, M.darkSteel, x, 2.725, 3.15, false));
  g.add(cylinder(0.065, 0.035, M.white, -0.6, 2.98, 1.4));
  return g;
}

/** The floor stays clear: only the safety tape, a bin beside the desk, and tidy crates on the bench's lower shelf. */
function floor(): THREE.Group {
  const g = new THREE.Group();
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.38, 20), M.darkSteel);
  bin.position.set(0.25, 0.19, 3.3);
  bin.castShadow = true;
  const binShadow = contactShadow(0.5, 0.5, 0.5);
  binShadow.position.set(0.25, 0.003, 3.3);
  g.add(bin, binShadow);

  // Yellow floor tape marking the clearance in front of the cabinets.
  const tape = lit('#eab308', 0.7);
  g.add(box(0.05, 0.002, 2.2, tape, 2.6, 0.003, 0.62, false), box(0.05, 0.002, 1.1, tape, 2.2, 0.003, -1.05, false));

  // The bench's lower shelf: three crates in a row, labels to the front.
  ['OUTILLAGE', 'TESTEURS', 'CORDONS'].forEach((label, i) => {
    const c = crate(-1.15 + i * 0.68, 0.17, 0.3, label, 0.5, 0.24, 0.42);
    c.rotation.y = -Math.PI / 2;
    g.add(c);
  });
  return g;
}

export function buildDecor(): THREE.Group {
  const g = new THREE.Group();
  g.add(shelving(), cabinetRow(), desk(), walls(), floor());
  return g;
}
