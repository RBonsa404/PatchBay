import * as THREE from 'three';
import clubLogoUrl from '../assets/club-logo-512.webp';
import dedsecLogoUrl from '../assets/dedsec/dedsec-logo-sombre.svg';
import { bake } from './bake.js';
import { DOOR_HEIGHT, DOORS, FACE, FLOOR_Y, LAB_Z, ROOMS, roomOrigin as originOf } from './building.js';
import { zoneShell } from './structure.js';
import { buildDecor } from './decor.js';
import { contactShadow, esdMatNormal, esdMatTexture, paintTexture, perforatedTexture, photo, photoRelief } from './materials.js';
import { placeProp } from './props.js';
import { textTexture } from './textures.js';

/** Height of the bench top, in metres: devices in the levels are placed relative to it. */
export const BENCH_TOP = 0.76;

/**
 * The floor-standing 19-inch rack behind the bench. Rack-mounted devices are pushed back so that their front panel
 * (and their ears) sit against the front rails at `frontZ`.
 */
export const RACK = { x: 0, frontZ: -0.36, depth: 0.6, height: 1.5, railX: 0.236 } as const;

/** The overhead ladder tray along the back wall (its rungs' height and its centre line), and the ladder that drops
 * from it to the top of the rack: what carries cables from the rack to the walls. */
export const TRAY = { y: 2.55, z: -1.6 + 0.3 } as const;
export const LADDER = { x: 0.24, z: -1.06 } as const;
/** The wall trunking beside a box on the back wall (x from the box's centre), down from the tray to under the box. */
export const WALL_TRUNK = { dx: 0.17, z: -1.575, bottom: 0.8 } as const;

/** The vertical cable managers beside the rack's rails (centre, from the rack's axis, and width). */
export const MANAGER = { x: 0.325, width: 0.06 } as const;

const RACK_UNIT = 0.0445;
/** The free part of the rack: above the UPS, below the patch panel. */
const RACK_FREE = { from: 0.07 + RACK_UNIT * 3, to: 1.335 } as const;

/** The technical room's inner faces (see `building.ts`). */
const ROOM = { width: FACE.right - FACE.left, back: FACE.back, front: FACE.front, height: 3 } as const;

/** The building around the technical room, as the rest of the game knows it (the plan itself is `building.ts`). */
export const BUILDING = {
  annexZ: LAB_Z,
  floorY: FLOOR_Y,
  corridor: { back: ROOMS.corridor.z0, front: ROOMS.corridor.z1 },
  door: { x: (DOORS[0] as { x: number }).x, width: (DOORS[0] as { width: number }).width, height: DOOR_HEIGHT },
} as const;

/** Where the room containing a world position starts: everything in a room is laid out as in the technical room. */
export const roomOrigin = originOf;

let paintMaterial: THREE.Material | null = null;
const wallPaint = (): THREE.Material => new THREE.MeshStandardMaterial({ map: paintTexture(), ...photoRelief('painted_plaster_wall', 3, 1.3), normalScale: new THREE.Vector2(0.22, 0.22), roughness: 0.95 });
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
  dadoMaterial ??= new THREE.MeshStandardMaterial({ map: paintTexture(), color: '#aab2bd', ...photoRelief('painted_plaster_wall', 3, 0.5), normalScale: new THREE.Vector2(0.16, 0.16), roughness: 0.7 });
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

/** A room's bench, rack and cable tray, laid out as in the technical room (its walls come from `structure.ts`). */
export function buildRoomParts(): THREE.Group {
  const g = new THREE.Group();
  g.add(bench(), rack(), cableTray());
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
  room.add(zoneShell('room', { raisedFloor: true, lights: true }), bench(), rack(), serverCabinet(), cableTray(), wallItems(), decor);
  decor.traverse((o) => {
    if (o.userData.doorSign) mainDoor?.add(o.userData.doorSign as THREE.Object3D);
  });
  bake(room);
  return room;
}

/** Lab bench: steel frame (modelled), laminate top covered by an anti-static mat, a drawer unit and a lower shelf. */
function bench(): THREE.Group {
  const g = new THREE.Group();
  const [w, d, z] = [3.2, 1.1, 0.25];
  const laminate = new THREE.MeshStandardMaterial({ ...photo('plywood', 1.6, 0.6), roughness: 0.8 });
  const top = box(w, 0.04, d, laminate);
  top.position.set(0, BENCH_TOP - 0.022, z);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.003, d - 0.1), new THREE.MeshStandardMaterial({ map: esdMatTexture(), normalMap: esdMatNormal(), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.72 }));
  mat.position.set(0, BENCH_TOP - 0.0005, z);
  mat.receiveShadow = true;
  // Grounding cord from the mat's stud down the back edge.
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16), steel('#e2e8f0', 0.2, 1));
  stud.position.set(w / 2 - 0.12, BENCH_TOP + 0.002, z - d / 2 + 0.1);
  g.add(top, mat, stud);

  // Legs on levelling feet, stretchers, aprons and the three-drawer pedestal: `art/blender/bench_frame.py`.
  placeProp(g, 'bench-frame', { x: 0, y: 0, z });
  const shelf = box(w - 0.14, 0.02, d - 0.2, laminate);
  shelf.position.set(0, 0.16, z);
  g.add(shelf);

  const shadow = contactShadow(w + 0.3, d + 0.35, 0.45);
  shadow.position.set(0, 0.002, z);
  g.add(shadow);
  return g;
}

/**
 * Floor-standing rack, open at the front. Its frame is modelled in Blender (`art/blender/rack_frame.py`): folded corner
 * posts, front and rear rails punched with cage-nut holes and numbered unit by unit, a roof with fans and a brush entry,
 * a ventilated plinth on levelling feet, the vertical cable managers and a brush panel. Only the side panels' perforated
 * sheets are drawn here (a texture for their thousands of holes). The UPS sits at the bottom, a patch panel at the top.
 */
function rack(): THREE.Group {
  const g = new THREE.Group();
  const { x, frontZ, depth, height } = RACK;
  const midZ = frontZ - depth / 2;

  placeProp(g, 'rack-frame', { x, y: 0, z: midZ });
  // The side sheets, outside the posts and behind the cable managers, between the plinth and the roof.
  const sheet = new THREE.MeshStandardMaterial({ map: perforatedTexture(), roughness: 0.6, metalness: 0.6 });
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.004, height - 0.11, 0.515), sheet);
    panel.position.set(x + side * 0.3075, 0.07 + (height - 0.11) / 2, midZ - 0.0125);
    panel.castShadow = true;
    g.add(panel);
  }

  // The UPS at the bottom (`art/blender/ups.py`) and the 24-port patch panel at the top (`art/blender/patch_panel.py`),
  // their ears against the front rails; `rackFillers` closes the units the level's own gear leaves free.
  placeProp(g, 'ups', { x, y: 0.07, z: frontZ - 0.2265 });
  placeProp(g, 'gear/patch-panel-24', { x, y: 1.335, z: frontZ - 0.0424 });

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
  // Carcass, door frame, handle, name plate and fourteen servers: `art/blender/server_cabinet.py`. The glass stays
  // here, see-through, in the door's opening.
  placeProp(g, 'server-cabinet', { x: 0, y: 0, z: 0 });
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, h - 0.3, 0.006),
    new THREE.MeshStandardMaterial({ color: '#0b1220', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.4, depthWrite: false }),
  );
  glass.position.set(0, 0.14 + (h - 0.3) / 2, d / 2 + 0.006);
  g.add(glass);
  const shadow = contactShadow(w + 0.3, d + 0.3, 0.6);
  shadow.position.y = 0.003;
  g.add(shadow);
  g.position.set(ROOM.width / 2 - 0.75, 0, ROOM.back + d / 2 + 0.05);
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
  // The drop: a short vertical ladder from the tray down to the top of the rack, so that no cable crosses the air.
  const dropTop = y;
  const dropBottom = RACK.height + 0.02;
  for (const dx of [-0.1, 0.1]) {
    const rail = box(0.008, dropTop - dropBottom, 0.05, yellow);
    rail.position.set(LADDER.x + dx, (dropTop + dropBottom) / 2, LADDER.z);
    g.add(rail);
  }
  for (let ry = dropBottom + 0.12; ry < dropTop - 0.05; ry += 0.25) {
    const rung = box(0.2, 0.012, 0.025, yellow, false);
    rung.position.set(LADDER.x, ry, LADDER.z - 0.012);
    g.add(rung);
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

/** An SVG drawn once into a canvas texture, at a size that stays sharp on a wall. */
function svgTexture(url: string, w: number, h: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const image = new Image();
  image.onload = () => {
    canvas.getContext('2d')?.drawImage(image, 0, 0, w, h);
    texture.needsUpdate = true;
  };
  image.src = url;
  return texture;
}

/** Club logo, painted lettering, a door, an air conditioner and a fire extinguisher. */
function wallItems(): THREE.Group {
  const g = new THREE.Group();
  const z = ROOM.back + 0.005;

  // The club's logo in a navy frame (its white background would wash out under the lights), and its name above the rack.
  const logoTex = new THREE.TextureLoader().load(clubLogoUrl);
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = 4;
  const frame = box(0.66, 0.66, 0.02, new THREE.MeshStandardMaterial({ color: '#0b1e3f', roughness: 0.6 }));
  frame.position.set(1.3, 1.72, z + 0.01);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ map: logoTex, color: '#b4b4b4', roughness: 0.9, envMapIntensity: 0 }));
  logo.position.set(1.3, 1.72, z + 0.021);
  g.add(frame, logo);
  // DEDSEC TECHNOLOGIES, who built the room: its dark logo on a night-blue plaque, as its charter asks.
  const plaque = box(0.44, 0.56, 0.02, new THREE.MeshStandardMaterial({ color: '#050a18', roughness: 0.5 }));
  plaque.position.set(-2.05, 1.66, z + 0.01);
  const dedsec = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.507), new THREE.MeshStandardMaterial({ map: svgTexture(dedsecLogoUrl, 560, 710), roughness: 0.8, envMapIntensity: 0 }));
  dedsec.position.set(-2.05, 1.66, z + 0.021);
  g.add(plaque, dedsec);

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
  // A double door: the wide leaf on its hinge, the narrow one kept shut.
  const { x: doorX, width: doorW } = BUILDING.door;
  const doorH = BUILDING.door.height - 0.01;
  const leafMaterial = new THREE.MeshStandardMaterial({ color: '#8b9bb0', roughness: 0.6, metalness: 0.2 });
  const wide = doorW * 0.62;
  const hinge = new THREE.Group();
  hinge.position.set(doorX - doorW / 2, 0, z + 0.005);
  const door = box(wide, doorH, 0.04, leafMaterial);
  door.position.set(wide / 2, doorH / 2, 0);
  const lever = box(0.14, 0.02, 0.03, steel('#e2e8f0', 0.2, 1), false);
  lever.position.set(wide - 0.11, 1.02, 0.035);
  hinge.add(door, lever);
  const narrow = box(doorW - wide, doorH, 0.04, leafMaterial);
  narrow.position.set(doorX + doorW / 2 - (doorW - wide) / 2, doorH / 2, z + 0.005);
  g.add(narrow);
  hinge.userData.dynamic = true;
  mainDoor = hinge;
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.12), new THREE.MeshBasicMaterial({ map: textTexture('SORTIE', { width: 320, height: 120, color: '#ffffff', font: '700 64px Inter, sans-serif' }), color: '#22c55e', toneMapped: false }));
  exit.position.set(doorX, 2.32, z + 0.003);
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
  placeProp(g, 'korean_fire_extinguisher_01', { x: -ROOM.width / 2 + 0.23, y: 0, z: -0.6, turn: Math.PI / 2 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.6 }));
  sign.rotation.y = Math.PI / 2;
  sign.position.set(-ROOM.width / 2 + 0.003, 1.3, -0.6);
  g.add(sign);
  return g;
}
