import * as THREE from 'three';
import { bake } from './bake.js';
import { contactShadow } from './materials.js';
import { BUILDING, buildRoomParts, doorWall, paintedWall, zTray } from './room.js';
import { textTexture } from './textures.js';

/**
 * The rest of the building, for the missions that use it: the corridor behind the technical room and, across it, the
 * lab room with its own bench, rack and students' tables.
 */

const lit = (color: string, roughness = 0.6, metalness = 0.1): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function lettering(text: string, w: number, h: number, colour: string): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: textTexture(text, { width: 1024, height: Math.round((1024 * h) / w), color: colour, font: `700 ${Math.round((1024 * h) / w * 0.62)}px Poppins, sans-serif` }), transparent: true, roughness: 0.9 }),
  );
}

function corridor(): THREE.Group {
  const g = new THREE.Group();
  const [back, front] = [BUILDING.corridor.back, BUILDING.corridor.front];
  const depth = front - back;
  const mid = (front + back) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, depth), lit('#8f97a3', 0.5, 0.05));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, mid);
  floor.receiveShadow = true;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(9, depth), lit('#e5e7eb', 0.95));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 3, mid);
  g.add(floor, ceiling);

  // Walls on the corridor's side, with a door to each room.
  doorWall(g, 9, front - 0.005, Math.PI);
  doorWall(g, 9, back + 0.005, 0);
  paintedWall(g, depth, -4.5, mid, Math.PI / 2);
  paintedWall(g, depth, 4.5, mid, -Math.PI / 2);

  // Lights, and their fittings.
  const panelMaterial = new THREE.MeshBasicMaterial({ color: '#f8fbff', toneMapped: false });
  for (const x of [-3, 0, 3]) {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), panelMaterial);
    light.rotation.x = Math.PI / 2;
    light.position.set(x, 2.985, mid);
    g.add(light);
  }
  // Two lamps are enough: every light costs on every pixel of the building.
  for (const x of [-2.2, 2.2]) {
    const lamp = new THREE.PointLight('#eaf1ff', 4.5, 7, 1.6);
    lamp.position.set(x, 2.8, mid);
    g.add(lamp);
  }

  // Signs above the doors, an emergency plan, the stairs at the end.
  const toRoom = lettering('SALLE TECHNIQUE', 0.9, 0.11, '#0b1e3f');
  toRoom.rotation.y = Math.PI;
  toRoom.position.set(BUILDING.door.x, 2.25, front - 0.012);
  const toLab = lettering('SALLE DE TP', 0.7, 0.11, '#0b1e3f');
  toLab.position.set(BUILDING.door.x, 2.25, back + 0.012);
  const stairs = lettering('ESCALIER · ÉTAGE 1', 1.1, 0.11, '#1d4ed8');
  stairs.rotation.y = -Math.PI / 2;
  stairs.position.set(4.49, 2.3, mid);
  g.add(toRoom, toLab, stairs);
  g.add(box(0.03, 2.05, 0.95, lit('#7f8da1', 0.6, 0.2), 4.48, 1.025, mid));
  g.add(box(1.2, 0.45, 0.32, lit('#b08a5e', 0.7), 1.0, 0.4, back + 0.2), box(1.2, 0.03, 0.34, lit('#20262f', 0.5), 1.0, 0.45, back + 0.2));
  const shadow = contactShadow(1.5, 0.6, 0.5);
  shadow.position.set(1.0, 0.004, back + 0.2);
  g.add(shadow);
  // The cable tray carrying the link between the two racks.
  g.add(zTray(0.33, back, front));
  return g;
}

/** The lab room's own furniture: rows of students' tables along the right-hand wall. */
function studentTables(): THREE.Group {
  const g = new THREE.Group();
  const wood = lit('#b08a5e', 0.7);
  const steel = lit('#475569', 0.45, 0.75);
  const black = lit('#0e1116', 0.6, 0.2);
  const screen = new THREE.MeshBasicMaterial({ color: '#0d1c33' });
  for (const z of [-0.1, 1.05, 2.2]) {
    g.add(box(0.8, 0.03, 1.0, wood, 2.95, 0.74, z));
    for (const dx of [-0.36, 0.36]) for (const dz of [-0.45, 0.45]) g.add(box(0.03, 0.74, 0.03, steel, 2.95 + dx, 0.37, z + dz));
    // A dark monitor turned towards the room.
    g.add(box(0.03, 0.3, 0.5, black, 3.15, 1.0, z), box(0.05, 0.12, 0.05, black, 3.17, 0.81, z), box(0.14, 0.012, 0.2, black, 3.17, 0.76, z), box(0.12, 0.012, 0.32, black, 2.8, 0.762, z));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.47, 0.27), screen);
    glow.rotation.y = -Math.PI / 2;
    glow.position.set(3.133, 1.0, z);
    g.add(glow);
    const stool = new THREE.Group();
    stool.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 20), black), box(0.03, 0.42, 0.03, steel, 0, -0.22, 0), box(0.3, 0.02, 0.03, steel, 0, -0.43, 0), box(0.03, 0.02, 0.3, steel, 0, -0.43, 0));
    stool.position.set(2.3, 0.45, z);
    g.add(stool);
    const shadow = contactShadow(1.1, 1.2, 0.45);
    shadow.position.set(2.85, 0.004, z);
    g.add(shadow);
  }
  return g;
}

export function buildAnnex(): THREE.Group {
  const g = new THREE.Group();
  const lab = buildRoomParts('front');
  lab.add(studentTables());
  const name = lettering('SALLE DE TP', 1.5, 0.22, '#0b1e3f');
  name.position.set(0, 2.25, -1.59);
  const sub = lettering('CLUB INFORMATIQUE DE L’IST', 1.3, 0.07, '#1d4ed8');
  sub.position.set(0, 2.08, -1.59);
  lab.add(name, sub);
  // The link cable's tray, from the rack to the corridor wall.
  lab.add(zTray(0.33, -0.33, 3.6));
  lab.position.z = BUILDING.annexZ;
  g.add(lab, corridor(), zTray(0.33, -1.6, -0.33));
  bake(g);
  return g;
}
