import * as THREE from 'three';
import { circuitTexture, floorTexture, textTexture } from './textures.js';

/** Height of the bench top, in metres: devices in the levels are placed relative to it. */
export const BENCH_TOP = 0.76;

const box = (w: number, h: number, d: number, material: THREE.Material): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/**
 * The technical room: floor, back wall with the club's circuit motif, a workbench, a 19-inch rack behind it, the
 * club sign and a hanging lamp. Built once; levels only add devices and cables on top.
 */
export function buildRoom(): THREE.Group {
  const room = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.82, metalness: 0.05 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 4.5),
    new THREE.MeshStandardMaterial({ map: circuitTexture(), roughness: 0.9, emissive: '#38bdf8', emissiveIntensity: 0.06 }),
  );
  wall.position.set(0, 2.25, -1.6);
  wall.receiveShadow = true;
  room.add(wall);

  // Workbench: dark laminate top with a slim cyan edge light along the front.
  const top = box(3.4, 0.05, 1.1, new THREE.MeshStandardMaterial({ color: '#111a2e', roughness: 0.72, metalness: 0.15 }));
  top.position.set(0, BENCH_TOP - 0.025, 0.25);
  room.add(top);
  const edge = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 0.006, 0.006),
    new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 2.2 }),
  );
  edge.position.set(0, BENCH_TOP - 0.03, 0.805);
  room.add(edge);
  const legMaterial = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.7, roughness: 0.35 });
  for (const x of [-1.6, 1.6]) {
    for (const z of [-0.22, 0.72]) {
      const leg = box(0.05, BENCH_TOP - 0.05, 0.05, legMaterial);
      leg.position.set(x, (BENCH_TOP - 0.05) / 2, z);
      room.add(leg);
    }
  }

  // Open 19-inch rack, behind the bench centre: the router and the switch are mounted in it.
  const rackMaterial = new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.8, roughness: 0.3 });
  for (const x of [-0.255, 0.255]) {
    for (const z of [-0.18, -0.62]) {
      const post = box(0.03, 1.05, 0.03, rackMaterial);
      post.position.set(x, BENCH_TOP + 0.525, z);
      room.add(post);
    }
  }
  const capTop = box(0.54, 0.03, 0.47, rackMaterial);
  capTop.position.set(0, BENCH_TOP + 1.05, -0.4);
  room.add(capTop);
  const shelf = box(0.51, 0.012, 0.44, rackMaterial);
  shelf.position.set(0, BENCH_TOP + 0.005, -0.4);
  room.add(shelf);

  // The club sign glowing on the wall.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.32),
    new THREE.MeshBasicMaterial({
      map: textTexture("CLUB INFORMATIQUE DE L'IST", { width: 1400, height: 200, color: '#e0f2fe', glow: '#38bdf8', font: '700 92px Poppins, sans-serif' }),
      transparent: true,
      toneMapped: false,
    }),
  );
  sign.position.set(0, 2.55, -1.58);
  room.add(sign);
  const underline = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.012), new THREE.MeshBasicMaterial({ color: '#fbbf24', toneMapped: false }));
  underline.position.set(0, 2.36, -1.579);
  room.add(underline);

  // Hanging lamp above the key light.
  const shade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.28, 0.18, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
  );
  shade.position.set(0.4, 3.0, 1.3);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), new THREE.MeshBasicMaterial({ color: '#fff1dd', toneMapped: false }));
  bulb.position.set(0.4, 2.93, 1.3);
  room.add(shade, bulb);

  return room;
}
