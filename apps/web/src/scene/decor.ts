import * as THREE from 'three';
import { contactShadow } from './materials.js';
import { textTexture } from './textures.js';

/**
 * What makes the room a working technical room rather than a set: storage, more cabinets, a technician's desk, wall
 * trunking, panels and signs. Nothing here can be used; the player walks around it (`game/player.ts` has the
 * footprints). Everything is built from simple shapes, with no download.
 */

const lit = (color: string, roughness = 0.6, metalness = 0.1): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

const M = {
  steel: lit('#475569', 0.45, 0.75),
  darkSteel: lit('#1b2028', 0.5, 0.6),
  paintedGrey: lit('#94a3b8', 0.65, 0.2),
  white: lit('#e8ebef', 0.7),
  trunking: lit('#d6dae0', 0.6),
  cardboard: lit('#a9805a', 0.95),
  cardboardDark: lit('#8f6a48', 0.95),
  tape: lit('#d9c79e', 0.5),
  black: lit('#0e1116', 0.7, 0.2),
  plastic: lit('#20262f', 0.45),
  wood: lit('#b08a5e', 0.7),
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
  const size = Math.min(canvas.height / (lines.length + 0.8), 74);
  c.font = `700 ${Math.round(size)}px Inter, sans-serif`;
  lines.forEach((line, i) => c.fillText(line, canvas.width / 2, (canvas.height * (i + 1)) / (lines.length + 1), canvas.width - 24));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 }));
}

/** A closed cardboard box with its strip of tape; a `label` is printed on the front (+z). */
function carton(w: number, h: number, d: number, x: number, y: number, z: number, turn = 0, label?: string): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, h, d, turn % 2 ? M.cardboardDark : M.cardboard, 0, h / 2, 0));
  g.add(box(w + 0.001, 0.003, 0.05, M.tape, 0, h + 0.001, 0, false));
  if (label) {
    const tag = sign(Math.min(w * 0.6, 0.2), 0.06, '#f8fafc', '#0b1e3f', [label]);
    tag.position.set(0, h * 0.6, d / 2 + 0.002);
    g.add(tag);
  }
  g.position.set(x, y, z);
  g.rotation.y = turn * 0.07;
  return g;
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

/** Steel shelving along the left wall, loaded with stock: cartons, spools and spare gear. */
function shelving(): THREE.Group {
  const g = new THREE.Group();
  const [x, z0, z1, depth] = [-3.24, 0.15, 2.05, 0.46];
  const levels = [0.14, 0.62, 1.1, 1.58, 2.02];
  for (const z of [z0, (z0 + z1) / 2, z1]) {
    for (const dx of [-depth / 2, depth / 2]) g.add(box(0.035, 2.1, 0.035, M.steel, x + dx, 1.05, z));
  }
  for (const y of levels) g.add(box(depth, 0.025, z1 - z0, M.paintedGrey, x, y, (z0 + z1) / 2));
  const on = (level: number): number => (levels[level] as number) + 0.0125;
  g.add(
    carton(0.36, 0.3, 0.42, x, on(0), 0.42, 0, 'RJ45 CAT6'),
    carton(0.36, 0.26, 0.36, x + 0.01, on(0), 0.95, 1),
    carton(0.34, 0.34, 0.44, x, on(0), 1.5, 2, 'PATCH 2 m'),
    spool('#2563eb', x, on(1), 0.42),
    spool('#f59e0b', x, on(1), 0.8),
    spool('#94a3b8', x, on(1), 1.18),
    carton(0.34, 0.28, 0.42, x, on(1), 1.68, 3, 'SFP'),
    carton(0.34, 0.22, 0.34, x, on(2), 0.42, 4, 'CONSOLE'),
    carton(0.34, 0.32, 0.4, x, on(2), 1.02, 1),
    carton(0.3, 0.2, 0.3, x, on(3), 1.5, 2),
    carton(0.34, 0.36, 0.5, x, on(3), 0.55, 3, 'ARCHIVES'),
  );
  // Spare switches stacked on the shelf: dark 1U boxes with a row of ports.
  for (let i = 0; i < 3; i++) {
    g.add(box(0.33, 0.044, 0.44, M.darkSteel, x, on(2) + 0.024 + i * 0.047, 1.62));
    for (let k = 0; k < 8; k++) g.add(box(0.002, 0.014, 0.018, M.black, x + 0.166, on(2) + 0.024 + i * 0.047, 1.48 + k * 0.04, false));
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
  const back = box(0.55, 0.33, 0.025, M.black, x - 0.1, top + 0.3, z + 0.14);
  screen.rotation.y = Math.PI;
  screen.position.set(x - 0.1, top + 0.3, z + 0.126);
  const screenBase = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshBasicMaterial({ color: '#07111f' }));
  screenBase.rotation.y = Math.PI;
  screenBase.position.set(x - 0.1, top + 0.3, z + 0.1265);
  g.add(back, screenBase, screen, box(0.05, 0.14, 0.05, M.black, x - 0.1, top + 0.08, z + 0.16), box(0.2, 0.012, 0.16, M.black, x - 0.1, top + 0.024, z + 0.16));
  g.add(box(0.4, 0.016, 0.13, M.plastic, x - 0.1, top + 0.026, z - 0.12), box(0.06, 0.02, 0.09, M.plastic, x + 0.17, top + 0.028, z - 0.12));
  const binders = ['#1d4ed8', '#fbbf24', '#0b1e3f', '#1d4ed8', '#94a3b8'];
  binders.forEach((colour, i) => g.add(box(0.05, 0.28, 0.2, lit(colour, 0.7), x + 0.42 + i * 0.056, top + 0.158, z + 0.2)));
  g.add(cylinder(0.04, 0.095, M.white, x + 0.3, top + 0.066, z - 0.1));

  // Chair: five spokes on the floor, a column, a seat and a back.
  const chair = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const spoke = box(0.3, 0.02, 0.04, M.black, 0, 0.07, 0);
    spoke.rotation.y = (i * Math.PI * 2) / 5;
    spoke.translateX(0.14);
    chair.add(spoke, cylinder(0.024, 0.04, M.black, Math.cos((i * Math.PI * 2) / 5) * 0.28, 0.024, -Math.sin((i * Math.PI * 2) / 5) * 0.28));
  }
  chair.add(cylinder(0.024, 0.34, M.steel, 0, 0.26, 0), box(0.44, 0.07, 0.42, M.plastic, 0, 0.46, 0), box(0.4, 0.46, 0.05, M.plastic, 0, 0.8, -0.22));
  chair.position.set(x - 0.05, 0, z - 0.72);
  chair.rotation.y = 0.5;
  const chairShadow = contactShadow(0.8, 0.8, 0.5);
  chairShadow.position.set(x - 0.05, 0.003, z - 0.72);
  const deskShadow = contactShadow(1.8, 1, 0.5);
  deskShadow.position.set(x, 0.003, z);
  g.add(chair, chairShadow, deskShadow);

  // Window onto the corridor, with its blind half down and daylight behind.
  const wz = 3.59;
  const frame = box(1.5, 1.2, 0.03, M.paintedGrey, 1.85, 1.65, wz, false);
  const light = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshBasicMaterial({ color: '#dfeaf7' }));
  light.rotation.y = Math.PI;
  light.position.set(1.85, 1.65, wz - 0.017);
  g.add(frame, light);
  for (let i = 0; i < 14; i++) g.add(box(1.4, 0.004, 0.022, M.white, 1.85, 2.18 - i * 0.043, wz - 0.03, false));
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
  g.add(carton(0.3, 0.16, 0.26, 3.25, 0.88, 2.25, 1), box(0.22, 0.12, 0.3, M.red, 3.25, 0.94, 2.9));
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
  const clockX = -1.95;
  g.add(cylinder(0.14, 0.02, M.white, clockX, 2.38, back + 0.012, 'z'), cylinder(0.148, 0.012, M.black, clockX, 2.38, back + 0.008, 'z'));
  const hour = box(0.011, 0.075, 0.003, M.black, clockX + 0.018, 2.41, back + 0.024, false);
  hour.rotation.z = -0.5;
  const minute = box(0.008, 0.115, 0.003, M.black, clockX - 0.04, 2.41, back + 0.026, false);
  minute.rotation.z = 0.8;
  g.add(hour, minute);
  const esd = sign(0.26, 0.17, '#1d4ed8', '#ffffff', ['ZONE ESD', 'BRACELET OBLIGATOIRE']);
  esd.position.set(0.72, 1.62, back + 0.002);
  const reserved = sign(0.3, 0.12, '#0b1e3f', '#fbbf24', ['ACCÈS RÉSERVÉ']);
  reserved.position.set(-2.95, 1.62, back + 0.048);
  g.add(esd, reserved);

  // Ceiling: an air duct with its grilles, a smoke detector.
  g.add(box(4.8, 0.26, 0.42, M.paintedGrey, -0.4, 2.86, 3.15));
  for (const x of [-2.2, -0.4, 1.4]) g.add(box(0.5, 0.012, 0.3, M.darkSteel, x, 2.725, 3.15, false));
  g.add(cylinder(0.065, 0.035, M.white, -0.6, 2.98, 1.4));
  return g;
}

/** Things standing on the floor: cartons, a tool trolley, a bin, a stepladder, safety tape, and the bench's lower shelf. */
function floor(): THREE.Group {
  const g = new THREE.Group();

  // Cartons awaiting unpacking, near the door end of the room.
  g.add(carton(0.52, 0.4, 0.42, -2.55, 0, 1.0, 1, 'CISCO 2911'), carton(0.46, 0.36, 0.4, -2.58, 0.4, 1.02, 2, 'CAT 2960'), carton(0.44, 0.3, 0.38, -2.5, 0, 1.55, 3));
  const stackShadow = contactShadow(0.9, 1.2, 0.5);
  stackShadow.position.set(-2.53, 0.003, 1.28);
  g.add(stackShadow);

  // Tool trolley to the right of the bench.
  const [tx, tz] = [2.2, 0.75];
  for (const dx of [-0.26, 0.26]) {
    for (const dz of [-0.18, 0.18]) {
      g.add(box(0.022, 0.8, 0.022, M.steel, tx + dx, 0.47, tz + dz), cylinder(0.035, 0.03, M.black, tx + dx, 0.035, tz + dz, 'x'));
    }
  }
  for (const y of [0.22, 0.5, 0.86]) g.add(box(0.56, 0.02, 0.4, M.blue, tx, y, tz));
  g.add(box(0.36, 0.14, 0.2, M.red, tx - 0.05, 0.94, tz), box(0.14, 0.018, 0.018, M.steel, tx - 0.05, 1.03, tz, false), box(0.17, 0.1, 0.14, M.amber, tx - 0.05, 0.56, tz), spool('#2563eb', tx + 0.15, 0.23, tz));
  const trolleyShadow = contactShadow(0.85, 0.7, 0.5);
  trolleyShadow.position.set(tx, 0.003, tz);
  g.add(trolleyShadow);

  // Bin, and a small stepladder folded against the wall.
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.38, 20), M.darkSteel);
  bin.position.set(0.25, 0.19, 3.3);
  bin.castShadow = true;
  const binShadow = contactShadow(0.5, 0.5, 0.5);
  binShadow.position.set(0.25, 0.003, 3.3);
  g.add(bin, binShadow);
  const ladder = new THREE.Group();
  for (const dx of [-0.2, 0.2]) ladder.add(box(0.035, 1.8, 0.018, M.amber, dx, 0.9, 0));
  for (let i = 0; i < 5; i++) ladder.add(box(0.4, 0.02, 0.06, M.steel, 0, 0.32 + i * 0.32, 0.01));
  ladder.position.set(1.95, 0.002, -1.5);
  ladder.rotation.x = -0.05;
  g.add(ladder);

  // Yellow and black floor tape marking the clearance in front of the cabinets.
  const tape = lit('#eab308', 0.7);
  g.add(box(0.05, 0.002, 2.2, tape, 2.6, 0.003, 0.62, false), box(0.05, 0.002, 1.1, tape, 2.2, 0.003, -1.05, false));

  // The bench's lower shelf: cartons and spools, as in any lab.
  g.add(carton(0.4, 0.26, 0.34, -1.05, 0.17, 0.25, 1), carton(0.3, 0.22, 0.3, -0.6, 0.17, 0.3, 2, 'CÂBLES'), spool('#f59e0b', 0.0, 0.17, 0.3), spool('#2563eb', 0.35, 0.17, 0.3));
  return g;
}

export function buildDecor(): THREE.Group {
  const g = new THREE.Group();
  g.add(shelving(), cabinetRow(), desk(), walls(), floor());
  return g;
}
