import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Level } from '@patchbay/sim-core';
import { tx } from '../i18n.js';

/** Small finishing touches that make the gear read as real hardware. */

let ventTexture: THREE.CanvasTexture | null = null;

/** Slots of a ventilation grille (shared by every chassis). */
function vents(): THREE.CanvasTexture {
  if (ventTexture) return ventTexture;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#2b3442';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#0b0f17';
  for (let x = 8; x < 248; x += 10) {
    g.beginPath();
    g.roundRect(x, 10, 5, 44, 2.5);
    g.fill();
  }
  ventTexture = new THREE.CanvasTexture(c);
  ventTexture.colorSpace = THREE.SRGBColorSpace;
  return ventTexture;
}

/** A chassis with softened edges instead of a sharp box. */
export function roundedChassis(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.004, h / 4)), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Ventilation grille on the top of a chassis (y = top), set back from the front. */
export function addVents(parent: THREE.Object3D, w: number, top: number, d: number): void {
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.45, d * 0.35), new THREE.MeshStandardMaterial({ map: vents(), roughness: 0.7, metalness: 0.4 }));
  grille.rotation.x = -Math.PI / 2;
  grille.position.set(-w * 0.15, top + 0.0006, -d * 0.12);
  parent.add(grille);
}

/** Rack ears with two screws each, on both sides of the front panel. */
export function addRackEars(parent: THREE.Object3D, w: number, h: number, d: number): void {
  const earMaterial = new THREE.MeshStandardMaterial({ color: '#3b4556', metalness: 0.8, roughness: 0.3 });
  const screwMaterial = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 1, roughness: 0.2 });
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.022, h, 0.003), earMaterial);
    ear.position.set(side * (w / 2 + 0.011), h / 2, d / 2 - 0.004);
    ear.castShadow = true;
    parent.add(ear);
    for (const y of [h * 0.28, h * 0.72]) {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.003, 14), screwMaterial);
      screw.rotation.x = Math.PI / 2;
      screw.position.set(side * (w / 2 + 0.011), y, d / 2 - 0.002);
      parent.add(screw);
    }
  }
}

/** Rubber feet under a desktop unit. */
export function addFeet(parent: THREE.Object3D, w: number, d: number): void {
  const material = new THREE.MeshStandardMaterial({ color: '#0b0f17', roughness: 0.9 });
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
    for (const z of [-d / 2 + 0.03, d / 2 - 0.03]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.004, 16), material);
      foot.position.set(x, -0.002, z);
      parent.add(foot);
    }
  }
}

/** A glowing power button (PC towers). */
export function powerButton(parent: THREE.Object3D, x: number, y: number, z: number): void {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0016, 10, 32), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 2.4 }));
  ring.position.set(x, y, z);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.003, 24), new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.6, roughness: 0.3 }));
  cap.rotation.x = Math.PI / 2;
  cap.position.set(x, y, z);
  parent.add(ring, cap);
}

/**
 * The mission plan, drawn on a whiteboard like a trainer's sketch: the devices and the links to make (no cable
 * types: choosing them is part of the exercise).
 */
export function buildWhiteboard(level: Level, roomZ = 0): THREE.Group {
  const group = new THREE.Group();
  const W = 1280;
  const H = 860;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#f4f6f8';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#e9edf2';
  for (let i = 0; i < 40; i++) g.fillRect((i * 97) % W, (i * 53) % H, 140, 2);

  g.fillStyle = '#1d4ed8';
  g.font = '700 46px Poppins, sans-serif';
  g.fillText(tx(level.title), 50, 80);
  g.fillStyle = '#b45309';
  g.font = '600 26px Inter, sans-serif';
  g.fillText('Plan de la mission', 52, 122);

  // Lay the devices out like the room: rack gear on the top row, desk gear below, ordered left to right. A mission
  // across rooms gets one half of the board per room.
  const place = new Map<string, [number, number]>();
  const split = level.devices.some((d) => d.room);
  const lay = (list: typeof level.devices, x0: number, x1: number): void => {
    const row = (items: typeof level.devices, y: number): void => {
      const sorted = [...items].sort((a, b) => (a.position?.[0] ?? 0) - (b.position?.[0] ?? 0));
      sorted.forEach((d, i) => place.set(d.id, [x0 + ((i + 1) * (x1 - x0)) / (sorted.length + 1), y]));
    };
    row(list.filter((d) => d.model !== 'pc' && d.model !== 'server'), 330);
    row(list.filter((d) => d.model === 'pc' || d.model === 'server'), 650);
  };
  if (split) {
    lay(level.devices.filter((d) => !d.room), 0, W / 2);
    lay(level.devices.filter((d) => d.room), W / 2, W);
    g.strokeStyle = '#94a3b8';
    g.lineWidth = 3;
    g.setLineDash([12, 12]);
    g.beginPath();
    g.moveTo(W / 2, 150);
    g.lineTo(W / 2, H - 40);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#475569';
    g.font = '600 26px Inter, sans-serif';
    g.fillText('Salle technique', 50, 190);
    g.fillText('Salle de TP', W / 2 + 30, 190);
  } else {
    lay(level.devices, 0, W);
  }

  g.lineWidth = 6;
  g.lineCap = 'round';
  for (const cable of [...level.initial.cables, ...level.solution.cables]) {
    const [ad, ap] = cable.a.split(':') as [string, string];
    const [bd, bp] = cable.b.split(':') as [string, string];
    const a = place.get(ad);
    const b = place.get(bd);
    if (!a || !b) continue;
    g.strokeStyle = cable.type === 'console' ? '#0284c7' : '#334155';
    g.setLineDash(cable.type === 'console' ? [18, 14] : []);
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#b91c1c';
    g.font = '600 24px "JetBrains Mono", monospace';
    const short = (p: string): string => p.replace('FastEthernet', 'Fa').replace('GigabitEthernet', 'Gi').replace('Serial', 'S').replace('Console', 'CON');
    // Close to each device, so that the labels of neighbouring links do not run together.
    g.fillText(short(ap), a[0] + (b[0] - a[0]) * 0.3 - 40, a[1] + (b[1] - a[1]) * 0.3 - 12);
    g.fillText(short(bp), a[0] + (b[0] - a[0]) * 0.7 - 40, a[1] + (b[1] - a[1]) * 0.7 - 12);
  }

  const boxHalf = split ? 66 : 90;
  for (const d of level.devices) {
    const p = place.get(d.id);
    if (!p) continue;
    const isRouter = d.model.startsWith('cisco');
    const isSwitch = d.model.startsWith('catalyst');
    g.fillStyle = '#ffffff';
    g.strokeStyle = isRouter ? '#1d4ed8' : isSwitch ? '#b45309' : '#334155';
    g.lineWidth = 5;
    g.beginPath();
    if (isRouter) g.arc(p[0], p[1], split ? 50 : 62, 0, Math.PI * 2);
    else g.roundRect(p[0] - boxHalf, p[1] - 48, boxHalf * 2, 96, 16);
    g.fill();
    g.stroke();
    g.fillStyle = '#0f172a';
    g.font = split ? '700 26px Poppins, sans-serif' : '700 34px Poppins, sans-serif';
    g.textAlign = 'center';
    g.fillText(d.id, p[0], p[1] + 12);
    g.textAlign = 'left';
  }

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.86), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.35, metalness: 0 }));
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.92, 0.02), new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8, roughness: 0.3 }));
  frame.position.z = -0.011;
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.02, 0.05), new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.8, roughness: 0.3 }));
  tray.position.set(0, -0.47, 0.015);
  board.userData.whiteboard = true;
  frame.userData.whiteboard = true;
  group.add(frame, board, tray);
  group.position.set(-1.75, 1.62, -1.57 + roomZ);
  return group;
}
