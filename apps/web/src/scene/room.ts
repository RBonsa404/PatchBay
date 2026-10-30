import * as THREE from 'three';
import clubLogoUrl from '../assets/club-logo-512.webp';
import { bake } from './bake.js';
import { buildDecor } from './decor.js';
import { ceilingTexture, contactShadow, esdMatNormal, esdMatTexture, laminateTexture, paintTexture, perforatedTexture, plasterNormal, rackRailTexture, raisedFloorNormal, raisedFloorTexture } from './materials.js';
import { textTexture } from './textures.js';

/** Height of the bench top, in metres: devices in the levels are placed relative to it. */
export const BENCH_TOP = 0.76;

/**
 * The floor-standing 19-inch rack behind the bench. Rack-mounted devices are pushed back so that their front panel
 * (and their ears) sit against the front rails at `frontZ`.
 */
export const RACK = { x: 0, frontZ: -0.36, depth: 0.6, height: 1.5, railX: 0.236 } as const;

/** The vertical cable managers beside the rack's rails (centre, from the rack's axis, and width). */
export const MANAGER = { x: 0.325, width: 0.06 } as const;

const RACK_UNIT = 0.0445;
/** The free part of the rack: above the UPS, below the patch panel. */
const RACK_FREE = { from: 0.07 + RACK_UNIT * 3, to: 1.335 } as const;

const ROOM = { width: 7, back: -1.6, front: 3.6, height: 3 } as const;

/** The building around the technical room: a corridor behind its back wall, and the lab room across it. */
export const BUILDING = {
  annexZ: -7,
  floorY: 3.3,
  corridor: { back: -3.4, front: -1.6 },
  door: { x: -2.95, width: 0.92, height: 2.05 },
  /** Two flights side by side, from x = 4.5 to the landing, split along z. */
  stairs: { flightEnd: 7, landingEnd: 8, split: -2.5, back: -3.4, front: -1.6, rise: 3.3 },
} as const;

/** Where the room containing a world position starts: everything in a room is laid out as in the technical room. */
export function roomOrigin(y: number, z: number): { y: number; z: number } {
  return { y: y > BUILDING.floorY - 0.1 ? BUILDING.floorY : 0, z: z < BUILDING.corridor.back ? BUILDING.annexZ : 0 };
}

let paintMaterial: THREE.Material | null = null;
const wallPaint = (): THREE.Material => new THREE.MeshStandardMaterial({ map: paintTexture(), normalMap: plasterNormal(), normalScale: new THREE.Vector2(0.1, 0.1), roughness: 0.82 });
let dadoMaterial: THREE.Material | null = null;

/** A painted wall with its skirting board and the club's colours as a band at hand height. */
export function paintedWall(g: THREE.Object3D, w: number, x: number, z: number, ry: number): void {
  paintMaterial ??= wallPaint();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.height), paintMaterial);
  m.position.set(x, ROOM.height / 2, z);
  m.rotation.y = ry;
  m.receiveShadow = true;
  g.add(m);
  // The lower part of the wall in a darker, harder-wearing paint, under the club's colours.
  dadoMaterial ??= new THREE.MeshStandardMaterial({ color: '#aab2bd', map: paintTexture(), normalMap: plasterNormal(), normalScale: new THREE.Vector2(0.08, 0.08), roughness: 0.55 });
  const dado = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.1), dadoMaterial);
  dado.position.set(x, 0.55, z);
  dado.rotation.y = ry;
  dado.receiveShadow = true;
  dado.translateZ(0.0015);
  g.add(dado);
  const skirting = box(w, 0.1, 0.015, steel('#39414d', 0.55, 0.3), false);
  const band = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.05), new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.8 }));
  const thin = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.012), new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.8 }));
  const inward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  for (const [obj, y, off] of [[skirting, 0.05, 0.008], [band, 1.12, 0.002], [thin, 1.165, 0.002]] as const) {
    obj.position.set(x, y, z).addScaledVector(inward, off);
    obj.rotation.y = ry;
    g.add(obj);
  }
}

/** A wall along x, centred on x = 0, with the doorway of the building cut out of it. */
export function doorWall(g: THREE.Object3D, width: number, z: number, ry: number): void {
  const { x: doorX, width: doorW, height: doorH } = BUILDING.door;
  const [left, right] = [-width / 2, width / 2];
  paintedWall(g, doorX - doorW / 2 - left, (left + doorX - doorW / 2) / 2, z, ry);
  paintedWall(g, right - doorX - doorW / 2, (right + doorX + doorW / 2) / 2, z, ry);
  paintMaterial ??= wallPaint();
  const lintel = new THREE.Mesh(new THREE.PlaneGeometry(doorW, ROOM.height - doorH), paintMaterial);
  lintel.position.set(doorX, (ROOM.height + doorH) / 2, z);
  lintel.rotation.y = ry;
  g.add(lintel);
  // The frame: two jambs and a head, on both faces.
  const frame = steel('#475569', 0.5, 0.5);
  for (const dx of [-doorW / 2 - 0.02, doorW / 2 + 0.02]) {
    const jamb = box(0.04, doorH + 0.04, 0.06, frame);
    jamb.position.set(doorX + dx, (doorH + 0.04) / 2, z);
    g.add(jamb);
  }
  const head = box(doorW + 0.08, 0.04, 0.06, frame);
  head.position.set(doorX, doorH + 0.02, z);
  g.add(head);
}

let mainDoor: THREE.Group | null = null;

/** The door of the technical room stays shut in the missions that take place in that room alone. */
export function setMainDoorOpen(open: boolean): void {
  // Wide open, flat against the corridor's wall.
  if (mainDoor) mainDoor.rotation.y = open ? Math.PI * 0.96 : 0;
}

/** A room's shell, bench, rack and cable tray; `door` says which wall has the doorway. */
export function buildRoomParts(door: 'back' | 'front'): THREE.Group {
  const g = new THREE.Group();
  g.add(shell(door), bench(), rack(), cableTray());
  return g;
}

const box = (w: number, h: number, d: number, material: THREE.Material, shadows = true): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
};

const steel = (color: string, roughness = 0.4, metalness = 0.75): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/**
 * The technical room of the club: painted walls, a raised floor, ceiling LED panels and a cable tray, a lab bench
 * with an anti-static mat, a floor-standing rack behind it, a server cabinet, and the club's logo on the wall.
 * Built once; levels only add devices and cables.
 */
export function buildRoom(): THREE.Group {
  const room = new THREE.Group();
  room.name = 'technical-room';
  const decor = buildDecor();
  room.add(shell('back'), bench(), rack(), serverCabinet(), cableTray(), wallItems(), decor);
  decor.traverse((o) => {
    if (o.userData.doorSign) mainDoor?.add(o.userData.doorSign as THREE.Object3D);
  });
  bake(room);
  return room;
}

/** Floor, walls, ceiling and lights. */
function shell(door: 'back' | 'front'): THREE.Group {
  const g = new THREE.Group();
  const depth = ROOM.front - ROOM.back;

  const floorTex = raisedFloorTexture();
  floorTex.repeat.set(ROOM.width / 1.2, depth / 1.2);
  const floorNormal = raisedFloorNormal();
  floorNormal.repeat.set(ROOM.width / 1.2, depth / 1.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, depth), new THREE.MeshStandardMaterial({ map: floorTex, normalMap: floorNormal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.3, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (ROOM.front + ROOM.back) / 2;
  floor.receiveShadow = true;
  g.add(floor);

  if (door === 'back') {
    doorWall(g, ROOM.width, ROOM.back, 0);
    paintedWall(g, ROOM.width, 0, ROOM.front, Math.PI);
  } else {
    paintedWall(g, ROOM.width, 0, ROOM.back, 0);
    doorWall(g, ROOM.width, ROOM.front, Math.PI);
  }
  paintedWall(g, depth, -ROOM.width / 2, (ROOM.front + ROOM.back) / 2, Math.PI / 2);
  paintedWall(g, depth, ROOM.width / 2, (ROOM.front + ROOM.back) / 2, -Math.PI / 2);

  const tiles = ceilingTexture();
  tiles.repeat.set(ROOM.width / 0.6, depth / 0.6);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, depth), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.95 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, ROOM.height, (ROOM.front + ROOM.back) / 2);
  g.add(ceiling);

  // LED panels set in the ceiling (the stage's key light comes from the one above the bench).
  const panelMaterial = new THREE.MeshBasicMaterial({ color: '#f8fbff', toneMapped: false });
  const frameMaterial = steel('#cbd5e1', 0.5, 0.3);
  for (const [x, z] of [[-1.5, 0.3], [0.4, 0.6], [2.2, 0.3], [-1.5, 2.2], [0.4, 2.4], [2.2, 2.2]] as const) {
    const frame = box(0.64, 0.02, 0.64, frameMaterial, false);
    frame.position.set(x, ROOM.height - 0.01, z);
    const light = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58), panelMaterial);
    light.rotation.x = Math.PI / 2;
    light.position.set(x, ROOM.height - 0.021, z);
    g.add(frame, light);
  }
  return g;
}

/** Lab bench: steel frame, laminate top covered by an anti-static mat, a drawer unit and a lower shelf. */
function bench(): THREE.Group {
  const g = new THREE.Group();
  const [w, d, z] = [3.2, 1.1, 0.25];
  const laminate = new THREE.MeshStandardMaterial({ map: laminateTexture(), roughness: 0.38 });
  const top = box(w, 0.04, d, laminate);
  top.position.set(0, BENCH_TOP - 0.022, z);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.003, d - 0.1), new THREE.MeshStandardMaterial({ map: esdMatTexture(), normalMap: esdMatNormal(), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.72 }));
  mat.position.set(0, BENCH_TOP - 0.0005, z);
  mat.receiveShadow = true;
  // Grounding cord from the mat's stud down the back edge.
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16), steel('#e2e8f0', 0.2, 1));
  stud.position.set(w / 2 - 0.12, BENCH_TOP + 0.002, z - d / 2 + 0.1);
  g.add(top, mat, stud);

  const frame = steel('#475569', 0.45, 0.8);
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) {
    for (const zz of [z - d / 2 + 0.06, z + d / 2 - 0.06]) {
      const leg = box(0.045, BENCH_TOP - 0.04, 0.045, frame);
      leg.position.set(x, (BENCH_TOP - 0.04) / 2, zz);
      g.add(leg);
    }
    const rail = box(0.035, 0.035, d - 0.1, frame);
    rail.position.set(x, 0.14, z);
    g.add(rail);
  }
  const apron = box(w - 0.1, 0.06, 0.02, frame);
  apron.position.set(0, BENCH_TOP - 0.07, z - d / 2 + 0.07);
  const shelf = box(w - 0.14, 0.02, d - 0.2, laminate);
  shelf.position.set(0, 0.16, z);
  g.add(apron, shelf);

  // Drawer unit under the right-hand side, with handles.
  const cabinetMaterial = steel('#64748b', 0.5, 0.5);
  const drawers = box(0.45, 0.55, 0.6, cabinetMaterial);
  drawers.position.set(1.1, 0.17 + 0.275, z + 0.1);
  g.add(drawers);
  for (let i = 0; i < 3; i++) {
    const handle = box(0.16, 0.012, 0.02, steel('#cbd5e1', 0.25, 1), false);
    handle.position.set(1.1, 0.62 - i * 0.18, z + 0.41);
    const seam = box(0.44, 0.003, 0.002, steel('#334155', 0.6, 0.3), false);
    seam.position.set(1.1, 0.53 - i * 0.18, z + 0.401);
    g.add(handle, seam);
  }
  const shadow = contactShadow(w + 0.3, d + 0.35, 0.45);
  shadow.position.set(0, 0.002, z);
  g.add(shadow);
  return g;
}

/**
 * Floor-standing rack, open at the front: corner posts, front rails with cage-nut holes, perforated sides, top and
 * plinth. The lower units hold a UPS and blanking panels; a patch panel and a cable manager sit at the top.
 */
function rack(): THREE.Group {
  const g = new THREE.Group();
  const { x, frontZ, depth, height, railX } = RACK;
  const backZ = frontZ - depth;
  const midZ = frontZ - depth / 2;
  const black = steel('#2a303a', 0.42, 0.65);

  for (const px of [-0.29, 0.29]) {
    for (const pz of [frontZ + 0.005, backZ + 0.015]) {
      const post = box(0.03, height, 0.03, black);
      post.position.set(x + px, height / 2, pz);
      g.add(post);
    }
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.008, height - 0.12, depth - 0.06), new THREE.MeshStandardMaterial({ map: perforatedTexture(), roughness: 0.6, metalness: 0.6 }));
    side.position.set(x + px * 1.03, height / 2, midZ);
    side.castShadow = true;
    g.add(side);
  }
  const top = box(0.62, 0.04, depth, black);
  top.position.set(x, height - 0.02, midZ);
  const plinth = box(0.62, 0.06, depth, black);
  plinth.position.set(x, 0.03, midZ);
  g.add(top, plinth);

  const railTex = rackRailTexture();
  railTex.repeat.set(1, (height - 0.1) / 0.534);
  const railMaterial = new THREE.MeshStandardMaterial({ map: railTex, roughness: 0.4, metalness: 0.8 });
  for (const side of [-1, 1]) {
    const rail = box(0.026, height - 0.1, 0.004, railMaterial);
    rail.position.set(x + side * (railX + 0.003), height / 2, frontZ - 0.006);
    g.add(rail);
  }

  // The UPS at the bottom; `rackFillers` closes the units the level's own gear leaves free.
  const unit = RACK_UNIT;
  const ups = box(0.44, unit * 3 - 0.002, 0.45, steel('#1f2937', 0.5, 0.4));
  ups.position.set(x, 0.07 + (unit * 3) / 2, frontZ - 0.225);
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.025), new THREE.MeshBasicMaterial({ color: '#7dd3fc', toneMapped: false }));
  lcd.position.set(x - 0.12, 0.07 + unit * 1.8, frontZ + 0.0005);
  const upsLed = new THREE.Mesh(new THREE.CircleGeometry(0.003, 12), new THREE.MeshBasicMaterial({ color: '#22c55e', toneMapped: false }));
  upsLed.position.set(x + 0.15, 0.07 + unit * 1.5, frontZ + 0.0005);
  g.add(ups, lcd, upsLed);

  // Vertical cable managers on both sides: a back and fingers, so cables run down the rack instead of across it.
  const duct = steel('#111418', 0.6, 0.3);
  for (const side of [-1, 1]) {
    const back = box(MANAGER.width, height - 0.14, 0.006, duct);
    back.position.set(x + side * MANAGER.x, height / 2, frontZ - 0.05);
    const outer = box(0.004, height - 0.14, 0.06, duct, false);
    outer.position.set(x + side * (MANAGER.x + MANAGER.width / 2), height / 2, frontZ - 0.02);
    g.add(back, outer);
    for (let y = 0.12; y < height - 0.08; y += 0.0445 * 2) {
      const finger = box(0.012, 0.012, 0.06, duct, false);
      finger.position.set(x + side * (MANAGER.x - MANAGER.width / 2), y, frontZ - 0.02);
      g.add(finger);
    }
  }

  // Patch panel (24 sockets) and a brush cable manager above the gear.
  const patchY = 1.335;
  const patch = box(0.465, unit - 0.003, 0.05, steel('#232a35', 0.45, 0.6));
  patch.position.set(x, patchY + unit / 2, frontZ - 0.025);
  g.add(patch);
  const socketMaterial = new THREE.MeshBasicMaterial({ color: '#05070a' });
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.01), socketMaterial);
    s.position.set(x - 0.19 + (i % 12) * 0.016 + (i >= 12 ? 0.19 : 0), patchY + unit / 2, frontZ + 0.0006);
    g.add(s);
  }
  const brush = box(0.465, unit - 0.003, 0.03, steel('#1a1e25', 0.9, 0.1));
  brush.position.set(x, patchY + unit * 1.5, frontZ - 0.015);
  g.add(brush);

  const shadow = contactShadow(0.85, depth + 0.25, 0.6);
  shadow.position.set(x, 0.003, midZ);
  g.add(shadow);
  return g;
}

/**
 * Closes the rack's free units around the gear of a level (`occupied`: bottom and top of each device, in metres), as
 * in a real rack: blanking panels, vented panels, horizontal cable managers and a fibre drawer. Nothing stays empty.
 */
export function rackFillers(occupied: [number, number][], z = 0, y = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, y, z);
  const { x, frontZ } = RACK;
  const blank = steel('#2c333e', 0.5, 0.55);
  const dark = new THREE.MeshBasicMaterial({ color: '#05070a' });
  const screw = steel('#94a3b8', 0.3, 1);
  const panel = (y: number, h: number, kind: number): void => {
    const face = box(0.465, h - 0.003, 0.004, blank, false);
    face.position.set(x, y + h / 2, frontZ - 0.002);
    g.add(face);
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.002, 10), screw);
      s.rotation.x = Math.PI / 2;
      s.position.set(x + side * 0.222, y + h / 2, frontZ + 0.001);
      g.add(s);
    }
    if (kind === 1) {
      // Vented panel: rows of slots.
      for (let i = 0; i < 16; i++) {
        const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.018, h * 0.42), dark);
        slot.position.set(x - 0.18 + i * 0.024, y + h / 2, frontZ + 0.0004);
        g.add(slot);
      }
    } else if (kind === 2) {
      // Horizontal cable manager: a row of fingers.
      for (let i = 0; i < 9; i++) {
        const finger = box(0.012, h * 0.62, 0.022, blank, false);
        finger.position.set(x - 0.192 + i * 0.048, y + h / 2, frontZ + 0.011);
        g.add(finger);
      }
    } else if (kind === 3) {
      // Fibre drawer with its handle and label.
      const handle = box(0.09, 0.008, 0.012, steel('#475569', 0.6, 0.4), false);
      handle.position.set(x, y + h / 2, frontZ + 0.006);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.012), new THREE.MeshBasicMaterial({ map: textTexture('FIBRE', { width: 200, height: 48, color: '#e2e8f0', font: '600 34px Inter, sans-serif' }), transparent: true }));
      tag.position.set(x - 0.14, y + h / 2, frontZ + 0.0006);
      g.add(handle, tag);
    }
  };
  const KINDS = [0, 1, 0, 2, 0, 3, 1, 0, 2];
  let next = 0;
  let from: number = RACK_FREE.from;
  for (const [bottom, top] of [...occupied.slice().sort((p, q) => p[0] - q[0]), [RACK_FREE.to, RACK_FREE.to] as [number, number]]) {
    const free = bottom - from;
    if (free > 0.012) {
      const count = Math.max(1, Math.floor(free / RACK_UNIT + 0.001));
      for (let i = 0; i < count; i++) panel(from + (i * free) / count, free / count, KINDS[next++ % KINDS.length] as number);
    }
    from = Math.max(from, top);
  }
  bake(g);
  return g;
}

/** A tall server cabinet with a smoked glass door and blinking servers inside. */
function serverCabinet(): THREE.Group {
  const g = new THREE.Group();
  const [w, h, d] = [0.6, 2.0, 0.9];
  const body = box(w, h, d, steel('#262c35', 0.45, 0.6));
  body.position.set(0, h / 2, 0);
  g.add(body);
  const inner = box(w - 0.06, h - 0.12, 0.01, steel('#05070a', 0.8, 0.2), false);
  inner.position.set(0, h / 2, d / 2 - 0.05);
  g.add(inner);
  const ledColours = ['#22c55e', '#22c55e', '#38bdf8', '#fbbf24'];
  for (let i = 0; i < 14; i++) {
    const server = box(w - 0.1, 0.085, 0.02, steel('#1f2937', 0.45, 0.6), false);
    const y = 0.15 + i * 0.12;
    server.position.set(0, y, d / 2 - 0.035);
    g.add(server);
    for (let k = 0; k < 3; k++) {
      const led = new THREE.Mesh(new THREE.CircleGeometry(0.004, 10), new THREE.MeshBasicMaterial({ color: ledColours[(i + k) % 4], toneMapped: false }));
      led.position.set(0.17 + k * 0.018, y + 0.02, d / 2 - 0.024);
      g.add(led);
    }
  }
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.04, h - 0.08, 0.006),
    new THREE.MeshStandardMaterial({ color: '#0b1220', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.4 }),
  );
  glass.position.set(0, h / 2, d / 2 + 0.004);
  const handle = box(0.02, 0.22, 0.03, steel('#cbd5e1', 0.25, 1), false);
  handle.position.set(-w / 2 + 0.06, h * 0.55, d / 2 + 0.02);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.06),
    new THREE.MeshBasicMaterial({ map: textTexture('SRV-01 · IST', { width: 512, height: 100, color: '#e2e8f0', font: '600 48px "JetBrains Mono", monospace' }), transparent: true }),
  );
  label.position.set(0, h - 0.1, d / 2 + 0.008);
  const shadow = contactShadow(w + 0.3, d + 0.3, 0.6);
  shadow.position.y = 0.003;
  g.add(glass, handle, label, shadow);
  g.position.set(2.75, 0, ROOM.back + d / 2 + 0.05);
  return g;
}

/** Yellow ladder cable tray along the back wall, carrying bundles of blue cables into the cabinet. */
function cableTray(): THREE.Group {
  const g = new THREE.Group();
  const yellow = steel('#eab308', 0.45, 0.5);
  const [length, y, z, width] = [5.6, 2.55, ROOM.back + 0.3, 0.3];
  for (const side of [-1, 1]) {
    const rail = box(length, 0.05, 0.008, yellow);
    rail.position.set(0.1, y, z + side * width / 2);
    g.add(rail);
  }
  for (let x = -2.6; x <= 2.8; x += 0.3) {
    const rung = box(0.025, 0.012, width, yellow, false);
    rung.position.set(x, y - 0.02, z);
    g.add(rung);
  }
  for (const [x, z2] of [[-1.5, 0], [1.6, 0]] as const) {
    const rod = box(0.012, ROOM.height - y, 0.012, steel('#94a3b8'), false);
    rod.position.set(x, (ROOM.height + y) / 2, z + z2);
    g.add(rod);
  }
  const blue = new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.5 });
  for (let i = 0; i < 9; i++) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, length - 0.6, 6), blue);
    cable.rotation.z = Math.PI / 2;
    cable.position.set(0.4, y - 0.005 + (i % 3) * 0.008, z - 0.04 + Math.floor(i / 3) * 0.02);
    g.add(cable);
  }
  return g;
}

/** Club logo, painted lettering, a door, an air conditioner and a fire extinguisher. */
function wallItems(): THREE.Group {
  const g = new THREE.Group();
  const z = ROOM.back + 0.005;

  // The club's logo in a navy frame (its white background would wash out under the lights), and its name above the rack.
  const logoTex = new THREE.TextureLoader().load(clubLogoUrl);
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = 8;
  const frame = box(0.66, 0.66, 0.02, new THREE.MeshStandardMaterial({ color: '#0b1e3f', roughness: 0.6 }));
  frame.position.set(1.3, 1.72, z + 0.01);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ map: logoTex, color: '#b4b4b4', roughness: 0.9, envMapIntensity: 0 }));
  logo.position.set(1.3, 1.72, z + 0.021);
  g.add(frame, logo);

  const name = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.22),
    new THREE.MeshStandardMaterial({
      map: textTexture("CLUB INFORMATIQUE DE L'IST", { width: 1600, height: 150, color: '#0b1e3f', font: '700 104px Poppins, sans-serif' }),
      transparent: true,
      roughness: 0.9,
    }),
  );
  name.position.set(0, 2.25, z + 0.001);
  const sub = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.08),
    new THREE.MeshStandardMaterial({
      map: textTexture('SALLE TECHNIQUE · RÉSEAUX', { width: 1200, height: 60, color: '#1d4ed8', font: '600 40px Inter, sans-serif' }),
      transparent: true,
    }),
  );
  sub.position.set(0, 2.08, z + 0.001);
  g.add(name, sub);

  // Door on the back wall, left.
  // The leaf swings on its hinge, on the left of the doorway.
  const { x: doorX, width: doorW, height: doorH } = BUILDING.door;
  const hinge = new THREE.Group();
  hinge.position.set(doorX - doorW / 2, 0, z + 0.005);
  const door = box(doorW, doorH, 0.04, new THREE.MeshStandardMaterial({ color: '#8b9bb0', roughness: 0.6, metalness: 0.2 }));
  door.position.set(doorW / 2, doorH / 2, 0);
  const lever = box(0.14, 0.02, 0.03, steel('#e2e8f0', 0.2, 1), false);
  lever.position.set(doorW - 0.11, 1.02, 0.035);
  hinge.add(door, lever);
  hinge.userData.dynamic = true;
  mainDoor = hinge;
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.12), new THREE.MeshBasicMaterial({ map: textTexture('SORTIE', { width: 320, height: 120, color: '#ffffff', font: '700 64px Inter, sans-serif' }), color: '#22c55e', toneMapped: false }));
  exit.position.set(-2.95, 2.3, z + 0.003);
  g.add(hinge, exit);

  // Split air conditioner high on the wall: a server room is kept cool.
  const ac = box(0.9, 0.28, 0.2, new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.5 }));
  ac.position.set(1.95, 2.55, z + 0.1);
  const vent = box(0.8, 0.02, 0.02, steel('#cbd5e1', 0.5, 0.3), false);
  vent.position.set(1.95, 2.43, z + 0.2);
  const acLed = new THREE.Mesh(new THREE.CircleGeometry(0.004, 10), new THREE.MeshBasicMaterial({ color: '#38bdf8', toneMapped: false }));
  acLed.position.set(2.32, 2.5, z + 0.201);
  g.add(ac, vent, acLed);

  // Fire extinguisher on the left wall with its sign.
  const x = -ROOM.width / 2 + 0.12;
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 24), new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.35, metalness: 0.2 }));
  bottle.position.set(x, 0.75, -0.6);
  bottle.castShadow = true;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 16), steel('#111827'));
  head.position.set(x, 1.04, -0.6);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.6 }));
  sign.rotation.y = Math.PI / 2;
  sign.position.set(-ROOM.width / 2 + 0.003, 1.3, -0.6);
  g.add(bottle, head, sign);
  return g;
}
