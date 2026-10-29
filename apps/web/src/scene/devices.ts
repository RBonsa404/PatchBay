import * as THREE from 'three';
import type { DeviceModel, PortSpec } from '@patchbay/sim-core';
import { BENCH_TOP } from './room.js';
import { addFeet, addRackEars, addVents, powerButton, roundedChassis } from './details.js';
import { screenTexture, textTexture } from './textures.js';

export type LedState = 'off' | 'green' | 'amber';

/** A port as the scene knows it: what to click, what to light, where a plug goes. */
export interface PortView {
  device: string;
  port: string;
  spec: PortSpec;
  /** Invisible, generous box for picking. */
  hit: THREE.Mesh;
  /** Visible socket, tinted when hovered. */
  socket: THREE.Mesh;
  led?: THREE.Mesh;
  /** Where a plug sits, pointing out of the panel along +Z of the device. */
  mouth: THREE.Object3D;
}

export type DeviceShape = 'router' | 'switch' | 'pc' | 'laptop' | 'server';

export interface DeviceView {
  id: string;
  shape: DeviceShape;
  root: THREE.Group;
  ports: Map<string, PortView>;
  /** Meshes that open the device's panel when clicked. */
  body: THREE.Object3D[];
  /** Height of the object above its base, to frame the camera. */
  height: number;
  width: number;
  depth: number;
}

const SOCKET: Record<string, [w: number, h: number]> = {
  ethernet: [0.0145, 0.0125],
  console: [0.0145, 0.0125],
  aux: [0.0145, 0.0125],
  serial: [0.026, 0.0095],
  rs232: [0.03, 0.012],
};

interface Materials {
  chassis: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  socket: THREE.MeshStandardMaterial;
  frame: THREE.MeshStandardMaterial;
  consoleFrame: THREE.MeshStandardMaterial;
  serialPlate: THREE.MeshStandardMaterial;
  pick: THREE.MeshBasicMaterial;
  plastic: THREE.MeshStandardMaterial;
}

function materials(): Materials {
  return {
    chassis: new THREE.MeshStandardMaterial({ color: '#2b3442', metalness: 0.65, roughness: 0.38 }),
    panel: new THREE.MeshStandardMaterial({ color: '#1a2230', metalness: 0.5, roughness: 0.45 }),
    socket: new THREE.MeshStandardMaterial({ color: '#03060c', roughness: 0.9 }),
    frame: new THREE.MeshStandardMaterial({ color: '#9aa4b2', metalness: 0.9, roughness: 0.25 }),
    consoleFrame: new THREE.MeshStandardMaterial({ color: '#7dd3fc', metalness: 0.2, roughness: 0.5 }),
    serialPlate: new THREE.MeshStandardMaterial({ color: '#13254a', metalness: 0.5, roughness: 0.4 }),
    pick: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    plastic: new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.1, roughness: 0.6 }),
  };
}

const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, shadow = true): THREE.Mesh => {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = shadow;
  return m;
};

const plane = (w: number, h: number, map: THREE.Texture, emissive = false): THREE.Mesh =>
  new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    emissive
      ? new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.6 }),
  );

/** One socket with its metal surround, LED and pick box, placed on a panel whose face is at z = `face`. */
function addSocket(
  parent: THREE.Object3D,
  m: Materials,
  device: string,
  spec: PortSpec,
  x: number,
  y: number,
  face: number,
  ledAt: 'above' | 'below' | 'none',
): PortView {
  const [w, h] = SOCKET[spec.kind] ?? [0.0145, 0.0125];
  const frameMat = spec.kind === 'console' ? m.consoleFrame : spec.kind === 'serial' ? m.serialPlate : m.frame;
  const frame = mesh(new THREE.BoxGeometry(w + 0.003, h + 0.003, 0.002), frameMat, false);
  frame.position.set(x, y, face + 0.001);
  const socket = mesh(new THREE.BoxGeometry(w, h, 0.0025), m.socket.clone(), false);
  socket.position.set(x, y, face + 0.0016);
  // Slightly bigger than the socket, but never reaching the neighbours (switch ports sit 17 mm apart).
  const hit = new THREE.Mesh(new THREE.BoxGeometry(w + 0.0015, h + 0.004, 0.04), m.pick);
  hit.position.set(x, y, face + 0.01);
  const mouth = new THREE.Object3D();
  mouth.position.set(x, y, face + 0.004);
  parent.add(frame, socket, hit, mouth);

  let led: THREE.Mesh | undefined;
  if (ledAt !== 'none') {
    led = mesh(new THREE.BoxGeometry(0.0042, 0.0026, 0.002), new THREE.MeshStandardMaterial({ color: '#1f2937', emissive: '#000000' }), false);
    led.position.set(x + w / 2 - 0.0025, y + (ledAt === 'above' ? h / 2 + 0.0035 : -h / 2 - 0.0035), face + 0.0012);
    parent.add(led);
  }
  const view: PortView = { device, port: spec.name, spec, hit, socket, mouth, ...(led ? { led } : {}) };
  hit.userData.port = view;
  return view;
}

function label(parent: THREE.Object3D, text: string, x: number, y: number, face: number, w: number, h: number, color = '#cbd5e1'): void {
  const p = plane(w, h, textTexture(text, { width: Math.round(w * 6000), height: Math.round(h * 6000), color, font: `600 ${Math.round(h * 3600)}px Inter, sans-serif` }));
  p.position.set(x, y, face + 0.0015);
  parent.add(p);
}

function powerLed(parent: THREE.Object3D, x: number, y: number, face: number): void {
  const led = mesh(new THREE.BoxGeometry(0.005, 0.003, 0.002), new THREE.MeshStandardMaterial({ color: '#10b981', emissive: '#10b981', emissiveIntensity: 3 }), false);
  led.position.set(x, y, face + 0.0012);
  parent.add(led);
}

// ---- equipment ---------------------------------------------------------------------------------------------------

const ROUTER_SIZE: Record<string, [w: number, h: number, d: number, label: string]> = {
  'cisco-1841': [0.343, 0.05, 0.27, '1841'],
  'cisco-2911': [0.438, 0.089, 0.3, '2911'],
};

function buildRouter(id: string, model: DeviceModel, m: Materials, view: DeviceView): void {
  const [w, h, d, name] = ROUTER_SIZE[model.id] ?? [0.4, 0.06, 0.3, model.label];
  const chassis = roundedChassis(w, h, d, m.chassis);
  chassis.position.y = h / 2;
  const front = mesh(new THREE.BoxGeometry(w - 0.004, h - 0.004, 0.003), m.panel, false);
  front.position.set(0, h / 2, d / 2 + 0.0005);
  view.root.add(chassis, front);
  view.body.push(chassis, front);
  addVents(view.root, w, h, d);
  view.depth = d;
  const face = d / 2 + 0.002;
  const y = h / 2 - (h > 0.06 ? 0.012 : 0.002);

  label(view.root, `${id} · ${name}`, -w / 2 + 0.055, h / 2 + 0.006, face, 0.08, 0.014, '#e2e8f0');
  powerLed(view.root, -w / 2 + 0.018, h / 2 - 0.008, face);

  const eth = model.ports.filter((p) => p.kind === 'ethernet');
  const serial = model.ports.filter((p) => p.kind === 'serial');
  eth.forEach((p, i) => {
    const x = -w / 2 + 0.12 + i * 0.03;
    view.ports.set(p.name, addSocket(view.root, m, id, p, x, y, face, 'above'));
    label(view.root, p.name.replace('FastEthernet', 'FE ').replace('GigabitEthernet', 'GE '), x, y - 0.0125, face, 0.026, 0.006);
  });
  if (serial.length > 0) {
    const cx = 0.05;
    const plate = mesh(new THREE.BoxGeometry(0.1, Math.min(h - 0.01, 0.038), 0.002), m.serialPlate, false);
    plate.position.set(cx, y, face + 0.0003);
    view.root.add(plate);
    label(view.root, 'HWIC-2T', cx - 0.03, y + 0.014, face + 0.001, 0.03, 0.006, '#7dd3fc');
    serial.forEach((p, i) => {
      const x = cx - 0.022 + i * 0.044;
      view.ports.set(p.name, addSocket(view.root, m, id, p, x, y, face + 0.001, 'above'));
      label(view.root, p.name.replace('Serial', 'S'), x, y - 0.012, face + 0.001, 0.026, 0.006);
    });
  }
  const consolePort = model.ports.find((p) => p.kind === 'console');
  const aux = model.ports.find((p) => p.kind === 'aux');
  if (consolePort) {
    const x = w / 2 - 0.035;
    view.ports.set(consolePort.name, addSocket(view.root, m, id, consolePort, x, y, face, 'none'));
    label(view.root, 'CONSOLE', x, y - 0.0125, face, 0.03, 0.006, '#7dd3fc');
  }
  if (aux) {
    const x = w / 2 - 0.07;
    view.ports.set(aux.name, addSocket(view.root, m, id, aux, x, y, face, 'none'));
    label(view.root, 'AUX', x, y - 0.0125, face, 0.02, 0.006);
  }
  view.height = h;
  view.width = w;
}

function buildSwitch(id: string, model: DeviceModel, m: Materials, view: DeviceView): void {
  const [w, h, d] = [0.445, 0.044, 0.236];
  const chassis = roundedChassis(w, h, d, m.chassis);
  chassis.position.y = h / 2;
  const front = mesh(new THREE.BoxGeometry(w - 0.004, h - 0.004, 0.003), m.panel, false);
  front.position.set(0, h / 2, d / 2 + 0.0005);
  view.root.add(chassis, front);
  view.body.push(chassis, front);
  addVents(view.root, w, h, d);
  view.depth = d;
  const face = d / 2 + 0.002;
  label(view.root, `${id} · 2960`, -w / 2 + 0.045, h / 2 + 0.008, face, 0.07, 0.012, '#e2e8f0');
  powerLed(view.root, -w / 2 + 0.015, h / 2 - 0.006, face);

  const fast = model.ports.filter((p) => p.name.startsWith('FastEthernet'));
  fast.forEach((p) => {
    const n = Number(p.name.split('/')[1]);
    const column = Math.floor((n - 1) / 2);
    const top = n % 2 === 1;
    const x = -0.135 + column * 0.0172 + Math.floor(column / 6) * 0.008;
    const y = h / 2 + (top ? 0.0092 : -0.0092);
    view.ports.set(p.name, addSocket(view.root, m, id, p, x, y, face, top ? 'above' : 'below'));
  });
  label(view.root, '1 – 24', -0.135 + 5.5 * 0.0172, h / 2 - 0.0185, face, 0.03, 0.005, '#94a3b8');
  model.ports
    .filter((p) => p.name.startsWith('GigabitEthernet'))
    .forEach((p, i) => {
      const x = w / 2 - 0.085 + i * 0.022;
      view.ports.set(p.name, addSocket(view.root, m, id, p, x, h / 2 + 0.004, face, 'above'));
      label(view.root, `Gi0/${i + 1}`, x, h / 2 - 0.0105, face, 0.02, 0.005);
    });
  const consolePort = model.ports.find((p) => p.kind === 'console');
  if (consolePort) {
    const x = w / 2 - 0.025;
    view.ports.set(consolePort.name, addSocket(view.root, m, id, consolePort, x, h / 2 + 0.004, face, 'none'));
    label(view.root, 'CON', x, h / 2 - 0.0105, face, 0.016, 0.005, '#7dd3fc');
  }
  view.height = h;
  view.width = w;
}

function buildDesktop(id: string, model: DeviceModel, m: Materials, view: DeviceView, caption: string): void {
  // Tower on the right, monitor on the left; the tower's ports face the player.
  const tower = roundedChassis(0.17, 0.36, 0.34, m.plastic);
  tower.position.set(0.2, 0.18, 0);
  const stripe = mesh(new THREE.BoxGeometry(0.004, 0.28, 0.002), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 1.6 }), false);
  stripe.position.set(0.15, 0.2, 0.171);
  const screenFrame = mesh(new THREE.BoxGeometry(0.46, 0.29, 0.02), m.plastic);
  screenFrame.position.set(-0.12, 0.27, -0.02);
  const screen = plane(0.43, 0.26, screenTexture([caption, '', '> ipconfig']), true);
  screen.position.set(-0.12, 0.27, -0.009);
  const stand = mesh(new THREE.BoxGeometry(0.04, 0.12, 0.03), m.chassis);
  stand.position.set(-0.12, 0.06, -0.03);
  const base = mesh(new THREE.BoxGeometry(0.18, 0.01, 0.12), m.chassis);
  base.position.set(-0.12, 0.005, -0.02);
  const keyboard = mesh(new THREE.BoxGeometry(0.34, 0.015, 0.11), m.plastic);
  keyboard.position.set(-0.12, 0.0075, 0.16);
  const bay = mesh(new THREE.BoxGeometry(0.12, 0.004, 0.002), m.chassis, false);
  bay.position.set(0.21, 0.29, 0.171);
  view.root.add(tower, stripe, screenFrame, screen, stand, base, keyboard, bay);
  powerButton(view.root, 0.21, 0.25, 0.172);
  view.depth = 0.34;
  view.body.push(tower, screenFrame, screen, keyboard);
  const face = 0.17;
  const nic = model.ports.find((p) => p.kind === 'ethernet');
  const rs232 = model.ports.find((p) => p.kind === 'rs232');
  if (nic) {
    view.ports.set(nic.name, addSocket(view.root, m, id, nic, 0.2, 0.09, face, 'above'));
    label(view.root, 'LAN', 0.2, 0.074, face, 0.02, 0.006);
  }
  if (rs232) {
    view.ports.set(rs232.name, addSocket(view.root, m, id, rs232, 0.2, 0.045, face, 'none'));
    label(view.root, 'RS232', 0.2, 0.03, face, 0.024, 0.006, '#7dd3fc');
  }
  label(view.root, id, 0.2, 0.33, face, 0.05, 0.012, '#e2e8f0');
  view.height = 0.42;
  view.width = 0.6;
}

function buildLaptop(id: string, model: DeviceModel, m: Materials, view: DeviceView, caption: string): void {
  const base = mesh(new THREE.BoxGeometry(0.33, 0.02, 0.23), m.chassis);
  base.position.y = 0.01;
  const keys = mesh(new THREE.BoxGeometry(0.29, 0.002, 0.11), m.plastic, false);
  keys.position.set(0, 0.021, -0.02);
  const lid = new THREE.Group();
  const lidShell = mesh(new THREE.BoxGeometry(0.33, 0.22, 0.01), m.chassis);
  lidShell.position.y = 0.11;
  const screen = plane(0.3, 0.19, screenTexture([caption, '', 'Console série prête', '> _']), true);
  screen.position.set(0, 0.11, 0.0055);
  lid.add(lidShell, screen);
  lid.position.set(0, 0.02, -0.115);
  lid.rotation.x = -0.28;
  const pad = mesh(new THREE.BoxGeometry(0.1, 0.001, 0.06), new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.3, roughness: 0.35 }), false);
  pad.position.set(0, 0.0205, 0.075);
  view.root.add(base, keys, lid, pad);
  view.depth = 0.23;
  view.body.push(base, keys, lidShell, screen);
  const face = 0.115;
  const rs232 = model.ports.find((p) => p.kind === 'rs232');
  const nic = model.ports.find((p) => p.kind === 'ethernet');
  if (rs232) {
    view.ports.set(rs232.name, addSocket(view.root, m, id, rs232, 0.1, 0.01, face, 'none'));
    label(view.root, 'RS232', 0.1, -0.003, face, 0.024, 0.006, '#7dd3fc');
  }
  if (nic) view.ports.set(nic.name, addSocket(view.root, m, id, nic, 0.05, 0.01, face, 'above'));
  view.height = 0.24;
  view.width = 0.36;
}

/** Build the 3D model of a device from its catalog entry. `caption` is shown on screens (PCs, laptops). */
export function buildDevice(id: string, model: DeviceModel, position: [number, number, number] | undefined, caption: string): DeviceView {
  const m = materials();
  const shape: DeviceShape =
    model.kind === 'router' ? 'router' : model.kind === 'switch' ? 'switch' : model.kind === 'server' ? 'server' : id.toUpperCase().startsWith('ADMIN') ? 'laptop' : 'pc';
  const view: DeviceView = { id, shape, root: new THREE.Group(), ports: new Map(), body: [], height: 0.1, width: 0.4, depth: 0.3 };
  view.root.name = id;

  if (shape === 'router') buildRouter(id, model, m, view);
  else if (shape === 'switch') buildSwitch(id, model, m, view);
  else if (shape === 'laptop') buildLaptop(id, model, m, view, caption);
  else buildDesktop(id, model, m, view, caption);

  const [x, y, z] = position ?? [0, BENCH_TOP, 0];
  // Rack-mounted gear keeps its height; everything else stands on the bench.
  const inRack = (shape === 'router' || shape === 'switch') && Math.abs(x) < 0.3 && z < -0.15;
  if (inRack) addRackEars(view.root, view.width, view.height, view.depth);
  else if (shape === 'router' || shape === 'switch') addFeet(view.root, view.width, view.depth);
  // Desktop units stand on their feet, 4 mm above the bench.
  view.root.position.set(x, inRack ? y : BENCH_TOP + (shape === 'router' || shape === 'switch' ? 0.004 : 0), z);
  for (const b of view.body) b.userData.device = id;
  return view;
}

const LED_COLOURS: Record<LedState, [string, number]> = { off: ['#1f2937', 0], green: ['#10b981', 4], amber: ['#fbbf24', 3.5] };

export function setLed(port: PortView, state: LedState): void {
  if (!port.led) return;
  const material = port.led.material as THREE.MeshStandardMaterial;
  const [colour, intensity] = LED_COLOURS[state];
  material.color.set(state === 'off' ? colour : '#0b1e3f');
  material.emissive.set(state === 'off' ? '#000000' : colour);
  material.emissiveIntensity = intensity;
}

/** Tint a socket: cyan when it can take the cable in hand, red when it cannot, back to black otherwise. */
export function highlightSocket(port: PortView, mode: 'none' | 'ok' | 'bad'): void {
  const material = port.socket.material as THREE.MeshStandardMaterial;
  const colour = mode === 'ok' ? '#38bdf8' : mode === 'bad' ? '#ef4444' : '#000000';
  material.emissive.set(colour);
  material.emissiveIntensity = mode === 'none' ? 0 : 1.8;
}
