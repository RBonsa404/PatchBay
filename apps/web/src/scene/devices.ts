import * as THREE from 'three';
import type { DeviceModel, PortSpec } from '@patchbay/sim-core';
import { bake, freeze } from './bake.js';
import { brushedTexture, contactShadow, keyboardTexture, rj45Texture } from './materials.js';
import { BENCH_TOP, RACK, TRAY, WALL_TRUNK } from './room.js';
import { addFeet, addRackEars, addVents, powerButton, roundedChassis } from './details.js';
import { gearModel, type GearName } from './gear.js';
import { atlasLabel, screenTexture } from './textures.js';

export type LedState = 'off' | 'green' | 'amber';

/** A port as the scene knows it: what to click, what to light, where a plug goes. */
export interface PortView {
  device: string;
  port: string;
  spec: PortSpec;
  /** Invisible, generous box for picking. */
  hit: THREE.Mesh;
  /** Laid over the socket, shown only when it is lit: the sockets themselves are merged with the rest of the device. */
  socket: THREE.Mesh;
  /** Its place among the device's LEDs, all drawn together. */
  led?: { mesh: THREE.InstancedMesh; index: number; state: LedState };
  /** Where a plug sits, pointing out of the panel along +Z of the device. */
  mouth: THREE.Object3D;
}

/** Height of a patch panel's bottom in the rack. */
const PANEL_Y = 1.285;

const LED_COLOURS: Record<LedState, [string, number]> = { off: ['#1f2937', 1], green: ['#10b981', 2.5], amber: ['#fbbf24', 2] };

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
  /** Mounted in the rack, rather than standing on the bench. */
  inRack: boolean;
  /** Where its room is along z (0 for the technical room). */
  roomZ: number;
  roomY: number;
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
  socketPlain: THREE.MeshStandardMaterial;
  frame: THREE.MeshStandardMaterial;
  consoleFrame: THREE.MeshStandardMaterial;
  serialPlate: THREE.MeshStandardMaterial;
  pick: THREE.MeshBasicMaterial;
  plastic: THREE.MeshStandardMaterial;
}

let brushedMap: THREE.Texture | null = null;
const brushed = (): THREE.Texture => (brushedMap ??= brushedTexture());
let rj45Map: THREE.Texture | null = null;
const rj45 = (): THREE.Texture => (rj45Map ??= rj45Texture());
let keysMap: THREE.Texture | null = null;
const keys = (): THREE.Texture => (keysMap ??= keyboardTexture());

let shared: Materials | null = null;

/** The same few materials for every device: what lets them merge. */
function materials(): Materials {
  return (shared ??= {
    chassis: new THREE.MeshStandardMaterial({ color: '#7c8796', metalness: 0.35, roughness: 0.62, roughnessMap: brushed() }),
    // Light faces, whatever the light in the rack: the dark sockets must read at a glance.
    panel: new THREE.MeshStandardMaterial({ color: '#c6ccd5', metalness: 0.1, roughness: 0.7, roughnessMap: brushed(), emissive: '#8a93a0', emissiveIntensity: 0.14 }),
    socket: new THREE.MeshStandardMaterial({ map: rj45(), roughness: 0.6 }),
    socketPlain: new THREE.MeshStandardMaterial({ color: '#0a0d12', roughness: 0.6 }),
    frame: new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.2, roughness: 0.5 }),
    consoleFrame: new THREE.MeshStandardMaterial({ color: '#0ea5e9', metalness: 0.1, roughness: 0.5, emissive: '#0ea5e9', emissiveIntensity: 0.25 }),
    serialPlate: new THREE.MeshStandardMaterial({ color: '#93b4dd', metalness: 0.1, roughness: 0.55 }),
    pick: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    plastic: new THREE.MeshStandardMaterial({ color: '#1c222c', metalness: 0.15, roughness: 0.48 }),
  });
}

type SocketLight = 'hint' | 'hover' | 'ok' | 'bad';
const SOCKET_LIGHTS: Record<SocketLight, [colour: string, intensity: number]> = { hint: ['#22c55e', 1.1], hover: ['#e2e8f0', 0.7], ok: ['#38bdf8', 1.8], bad: ['#ef4444', 1.8] };
const socketLights = new Map<string, THREE.MeshStandardMaterial>();

function socketLight(mode: SocketLight, plain: boolean): THREE.MeshStandardMaterial {
  const key = `${mode}${plain}`;
  let material = socketLights.get(key);
  if (!material) {
    const [colour, intensity] = SOCKET_LIGHTS[mode];
    material = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: colour, emissiveIntensity: intensity, ...(plain ? { color: '#0a0d12' } : { map: rj45() }) });
    socketLights.set(key, material);
  }
  return material;
}

/** The LEDs waiting to be drawn together, once the device being built has all its ports. */
let pendingLeds: { view: PortView; x: number; y: number; z: number }[] = [];
const LED_SHAPE = new THREE.BoxGeometry(0.0042, 0.0026, 0.002);
const LED_MATERIAL = new THREE.MeshBasicMaterial({ toneMapped: false });
const ledColour = new THREE.Color();

function addLeds(root: THREE.Object3D): void {
  if (pendingLeds.length === 0) return;
  const mesh = new THREE.InstancedMesh(LED_SHAPE, LED_MATERIAL, pendingLeds.length);
  const place = new THREE.Matrix4();
  pendingLeds.forEach(({ view, x, y, z }, index) => {
    mesh.setMatrixAt(index, place.makeTranslation(x, y, z));
    mesh.setColorAt(index, ledColour.set(LED_COLOURS.off[0]));
    view.led = { mesh, index, state: 'off' };
  });
  mesh.userData.dynamic = true;
  root.add(mesh);
  pendingLeds = [];
}

const labelMaterials = new Map<THREE.Texture, THREE.MeshStandardMaterial>();

function labelMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  let material = labelMaterials.get(map);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.6, depthWrite: false });
    labelMaterials.set(map, material);
  }
  return material;
}

/** What is clicked on a device is an invisible copy of each part: the visible parts merge with the rest. */
function pickCopies(view: DeviceView, m: Materials): void {
  view.body = view.body.map((part) => {
    const pick = new THREE.Mesh((part as THREE.Mesh).geometry, m.pick);
    pick.position.copy(part.position);
    pick.quaternion.copy(part.quaternion);
    pick.scale.copy(part.scale);
    pick.visible = false;
    pick.userData.dynamic = true;
    part.parent?.add(pick);
    return pick;
  });
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
  // Serial and console DB connectors have no RJ45 contacts.
  const plain = spec.kind === 'serial' || spec.kind === 'rs232';
  const body = mesh(new THREE.BoxGeometry(w, h, 0.0025), plain ? m.socketPlain : m.socket, false);
  body.position.set(x, y, face + 0.0016);
  const socket = new THREE.Mesh(new THREE.PlaneGeometry(w, h), socketLight('hover', plain));
  socket.position.set(x, y, face + 0.0031);
  socket.visible = false;
  socket.userData.plain = plain;
  // Slightly bigger than the socket, but never reaching the neighbours (switch ports sit 17 mm apart).
  const hit = new THREE.Mesh(new THREE.BoxGeometry(w + 0.0015, h + 0.004, 0.04), m.pick);
  hit.position.set(x, y, face + 0.01);
  const mouth = new THREE.Object3D();
  mouth.position.set(x, y, face + 0.004);
  parent.add(frame, body, socket, hit, mouth);

  const view: PortView = { device, port: spec.name, spec, hit, socket, mouth };
  if (ledAt !== 'none') pendingLeds.push({ view, x: x + w / 2 - 0.0025, y: y + (ledAt === 'above' ? h / 2 + 0.0035 : -h / 2 - 0.0035), z: face + 0.0012 });
  hit.userData.port = view;
  return view;
}

function label(parent: THREE.Object3D, text: string, x: number, y: number, face: number, w: number, h: number, color = '#1e293b'): void {
  const { texture, uv: [u0, v0, u1, v1] } = atlasLabel(text, Math.round(w * 6000), Math.round(h * 6000), color, `600 ${Math.round(h * 3600)}px Inter, sans-serif`);
  const shape = new THREE.PlaneGeometry(w, h);
  (shape.attributes.uv as THREE.BufferAttribute).set([u0, v1, u1, v1, u0, v0, u1, v0]);
  const p = new THREE.Mesh(shape, labelMaterial(texture));
  p.position.set(x, y, face + 0.0015);
  parent.add(p);
}

function panelScrew(parent: THREE.Object3D, m: Materials, x: number, y: number, face: number): void {
  const screw = mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.0012, 10), m.frame, false);
  screw.rotation.x = Math.PI / 2;
  screw.position.set(x, y, face + 0.0006);
  parent.add(screw);
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
  if (buildFromGear(model.id === 'cisco-1841' ? 'router-1841' : 'router-2911', id, model, m, view, `${id} · ${name}`)) return;
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

  label(view.root, `${id} · ${name}`, -w / 2 + 0.055, h / 2 + 0.006, face, 0.08, 0.014, '#0f172a');
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
    label(view.root, 'HWIC-2T', cx - 0.03, y + 0.014, face + 0.001, 0.03, 0.006, '#075985');
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
    label(view.root, 'CONSOLE', x, y - 0.0125, face, 0.03, 0.006, '#075985');
  }
  if (aux) {
    const x = w / 2 - 0.07;
    view.ports.set(aux.name, addSocket(view.root, m, id, aux, x, y, face, 'none'));
    label(view.root, 'AUX', x, y - 0.0125, face, 0.02, 0.006);
  }
  // Status LEDs with their silkscreen, panel screws, and on the 2U chassis the empty module slots under their plates.
  label(view.root, 'SYS', -w / 2 + 0.018, h / 2 - 0.016, face, 0.016, 0.005, '#334155');
  for (const [sx, sy] of [[-w / 2 + 0.007, h - 0.007], [w / 2 - 0.007, h - 0.007], [-w / 2 + 0.007, 0.007], [w / 2 - 0.007, 0.007]] as const) panelScrew(view.root, m, sx, sy, face);
  if (h > 0.06) {
    for (const [i, slot] of ['EHWIC 1', 'EHWIC 2'].entries()) {
      const cx = -0.055 + i * 0.155;
      const blank = mesh(new THREE.BoxGeometry(0.145, 0.022, 0.0015), m.chassis, false);
      blank.position.set(cx, h - 0.016, face + 0.0003);
      view.root.add(blank);
      label(view.root, slot, cx - 0.045, h - 0.016, face + 0.0008, 0.034, 0.007, '#334155');
      for (const dx of [-0.067, 0.067]) panelScrew(view.root, m, cx + dx, h - 0.016, face + 0.0006);
    }
    label(view.root, 'SERVICE · USB', -w / 2 + 0.05, 0.012, face, 0.05, 0.006, '#475569');
  }
  view.height = h;
  view.width = w;
}

/** A socket that is part of a Blender model: only what the game adds to it (its light, its pick box, its mouth). */
function modelSocket(parent: THREE.Object3D, m: Materials, device: string, spec: PortSpec, at: THREE.Vector3, led: THREE.Vector3 | null): PortView {
  const plain = spec.kind === 'serial' || spec.kind === 'rs232';
  const [w, h] = spec.kind === 'serial' ? [0.022, 0.008] : [0.0117, 0.01];
  // The marker stands 4 mm in front of the socket's face.
  const socket = new THREE.Mesh(new THREE.PlaneGeometry(w, h), socketLight('hover', plain));
  socket.position.set(at.x, at.y, at.z - 0.0035);
  socket.visible = false;
  socket.userData.plain = plain;
  const hit = new THREE.Mesh(new THREE.BoxGeometry(w + 0.0015, h + 0.004, 0.04), m.pick);
  hit.position.set(at.x, at.y, at.z + 0.006);
  const mouth = new THREE.Object3D();
  mouth.position.copy(at);
  parent.add(socket, hit, mouth);
  const view: PortView = { device, port: spec.name, spec, hit, socket, mouth };
  if (led) pendingLeds.push({ view, x: led.x, y: led.y, z: led.z + 0.0004 });
  hit.userData.port = view;
  return view;
}

/**
 * Build a device from its Blender model: its meshes, then a socket at each `port:` marker. Its other markers, by name,
 * or null if there is no model. With `tagOnMarker`, the hostname goes exactly on the `tag` marker (a PC's tower front),
 * rather than on the front of the whole box.
 */
function buildFromGear(name: GearName, id: string, model: DeviceModel, m: Materials, view: DeviceView, tag: string, tagColour = '#0f172a', tagOnMarker = false): Map<string, THREE.Object3D> | null {
  const source = gearModel(name);
  if (!source) return null;
  const copy = source.clone(true);
  view.root.add(copy);
  view.root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(copy).getSize(new THREE.Vector3());
  [view.width, view.height, view.depth] = [size.x, size.y, size.z];
  const markers = new Map<string, THREE.Object3D>();
  copy.traverse((o) => {
    const label = (o.userData.name as string | undefined) ?? o.name;
    if (label.startsWith('port:') || label.startsWith('led:') || label.startsWith('note:') || label === 'tag' || label === 'screen') markers.set(label, o);
    else if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      view.body.push(o);
    }
  });
  const local = (o: THREE.Object3D): THREE.Vector3 => view.root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
  for (const spec of model.ports) {
    const at = markers.get(`port:${spec.name}`);
    if (!at) continue;
    const led = markers.get(`led:${spec.name}`);
    view.ports.set(spec.name, modelSocket(view.root, m, id, spec, local(at), led ? local(led) : null));
  }
  // The hostname on a printed tag, where the model marks it (else between the console and the ports).
  const spot = markers.get('tag');
  const at = spot ? local(spot) : new THREE.Vector3(-view.width / 2 + 0.13, view.height * 0.62, view.depth / 2);
  label(view.root, tag, at.x, at.y, tagOnMarker && spot ? at.z : view.depth / 2, tagOnMarker ? 0.06 : 0.07, tagOnMarker ? 0.01 : 0.012, tagColour);
  return markers;
}

/**
 * A PC or a laptop from its Blender model, with the picture the game draws on its screen where the model's `screen`
 * marker stands, facing the way it faces. False if the model is not loaded.
 */
function hostFromGear(name: 'bench-pc' | 'laptop', id: string, model: DeviceModel, m: Materials, view: DeviceView, lines: string[], size: [number, number]): boolean {
  const markers = buildFromGear(name, id, model, m, view, id, '#e2e8f0', true);
  const spot = markers?.get('screen');
  if (!markers || !spot) return markers !== null;
  const screen = plane(size[0], size[1], screenTexture(lines), true);
  const local = new THREE.Matrix4().copy(view.root.matrixWorld).invert().multiply(spot.matrixWorld);
  const scale = new THREE.Vector3();
  local.decompose(screen.position, screen.quaternion, scale);
  view.root.add(screen);
  view.body.push(screen);
  return true;
}

/**
 * A patch panel from its Blender model: the building's links arrive on its first ports, and where each one goes is
 * written in the label window above its group of six, as a technician writes it with a marker.
 */
function panelFromGear(id: string, ports: { name: string; label: string }[], m: Materials, view: DeviceView): boolean {
  if (!buildFromGear('patch-panel-24', id, { ports: ports.map((p) => ({ name: p.name, kind: 'ethernet' as const })) } as unknown as DeviceModel, m, view, id, '#fbbf24')) return false;
  const copy = view.root.children.find((o) => o.type === 'Group' || o.type === 'Object3D' || (o as THREE.Mesh).isMesh);
  const notes = new Map<string, THREE.Vector3>();
  copy?.traverse((o) => {
    const label = (o.userData.name as string | undefined) ?? o.name;
    if (label.startsWith('note:')) notes.set(label.slice(5), view.root.worldToLocal(o.getWorldPosition(new THREE.Vector3())));
  });
  const groups = new Map<number, string[]>();
  for (const p of ports) {
    const n = Number(p.name.slice(1));
    if (!p.label || !Number.isFinite(n)) continue;
    const group = Math.floor((n - 1) / 6);
    groups.set(group, [...(groups.get(group) ?? []), `${n} : ${p.label}`]);
  }
  for (const [group, lines] of groups) {
    const first = notes.get(`P${group * 6 + 1}`);
    const last = notes.get(`P${group * 6 + 6}`);
    if (!first || !last) continue;
    label(view.root, lines.join('   ·   '), (first.x + last.x) / 2, first.y, view.depth / 2 + 0.0004, 0.09, 0.0058, '#0f172a');
  }
  return true;
}

function buildSwitch(id: string, model: DeviceModel, m: Materials, view: DeviceView): void {
  if (buildFromGear('switch-2960', id, model, m, view, `${id} · 2960`)) return;
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
  label(view.root, `${id} · 2960`, -w / 2 + 0.045, h / 2 + 0.008, face, 0.07, 0.012, '#0f172a');
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
  label(view.root, '1 – 24', -0.135 + 5.5 * 0.0172, h / 2 - 0.0185, face, 0.03, 0.005, '#334155');
  // The mode button and its column of status LEDs, as on the real panel.
  const mode = mesh(new THREE.BoxGeometry(0.009, 0.005, 0.002), m.frame, false);
  mode.position.set(-w / 2 + 0.018, h / 2 - 0.016, face + 0.001);
  view.root.add(mode);
  ['SYST', 'STAT', 'SPD'].forEach((name, i) => {
    const led = mesh(new THREE.BoxGeometry(0.003, 0.002, 0.0015), new THREE.MeshStandardMaterial({ color: i === 0 ? '#10b981' : '#1f2937', emissive: i === 0 ? '#10b981' : '#000000', emissiveIntensity: 2 }), false);
    led.position.set(-w / 2 + 0.032 + i * 0.014, h / 2 - 0.012, face + 0.001);
    view.root.add(led);
    label(view.root, name, -w / 2 + 0.032 + i * 0.014, h / 2 - 0.0175, face, 0.013, 0.004, '#334155');
  });
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
    label(view.root, 'CON', x, h / 2 - 0.0105, face, 0.016, 0.005, '#075985');
  }
  view.height = h;
  view.width = w;
}

function buildDesktop(id: string, model: DeviceModel, m: Materials, view: DeviceView, caption: string): void {
  if (hostFromGear('bench-pc', id, model, m, view, [caption, '', '> ipconfig'], [0.44, 0.262])) return;
  // Without its model: tower on the right, monitor on the left; the tower's ports face the player.
  const tower = roundedChassis(0.17, 0.36, 0.34, m.panel);
  tower.position.set(0.2, 0.18, 0);
  const stripe = mesh(new THREE.BoxGeometry(0.004, 0.28, 0.002), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 1.6 }), false);
  stripe.position.set(0.15, 0.2, 0.171);
  // A thin-bezel monitor on a neck and foot, its keyboard and mouse.
  const screenFrame = roundedChassis(0.45, 0.275, 0.016, m.plastic);
  screenFrame.position.set(-0.12, 0.275, -0.02);
  const screen = plane(0.44, 0.262, screenTexture([caption, '', '> ipconfig']), true);
  // A few millimetres in front of the bezel: closer, the two would flicker in and out at a distance.
  screen.position.set(-0.12, 0.275, -0.0085);
  const stand = roundedChassis(0.034, 0.14, 0.02, m.chassis);
  stand.position.set(-0.12, 0.07, -0.04);
  const base = roundedChassis(0.17, 0.008, 0.12, m.chassis);
  base.position.set(-0.12, 0.004, -0.03);
  const keyboard = roundedChassis(0.34, 0.012, 0.115, m.plastic);
  keyboard.position.set(-0.12, 0.006, 0.16);
  const caps = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.106), new THREE.MeshStandardMaterial({ map: keys(), roughness: 0.55 }));
  caps.rotation.x = -Math.PI / 2;
  caps.position.set(-0.12, 0.0145, 0.16);
  const mouse = roundedChassis(0.055, 0.02, 0.09, m.plastic);
  mouse.position.set(0.1, 0.01, 0.17);
  const bay = mesh(new THREE.BoxGeometry(0.12, 0.004, 0.002), m.chassis, false);
  bay.position.set(0.21, 0.29, 0.171);
  view.root.add(tower, stripe, screenFrame, screen, stand, base, keyboard, caps, mouse, bay);
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
    label(view.root, 'RS232', 0.2, 0.03, face, 0.024, 0.006, '#075985');
  }
  label(view.root, id, 0.2, 0.33, face, 0.05, 0.012, '#0f172a');
  view.height = 0.42;
  view.width = 0.6;
}

function buildLaptop(id: string, model: DeviceModel, m: Materials, view: DeviceView, caption: string): void {
  if (hostFromGear('laptop', id, model, m, view, [caption, '', 'Console série prête', '> _'], [0.3, 0.19])) return;
  const base = roundedChassis(0.33, 0.016, 0.23, m.chassis);
  base.position.y = 0.01;
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.105), new THREE.MeshStandardMaterial({ map: keys(), roughness: 0.55 }));
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0.0205, -0.02);
  const lid = new THREE.Group();
  const lidShell = roundedChassis(0.33, 0.22, 0.008, m.chassis);
  lidShell.position.y = 0.11;
  const screen = plane(0.3, 0.19, screenTexture([caption, '', 'Console série prête', '> _']), true);
  screen.position.set(0, 0.11, 0.0072);
  lid.add(lidShell, screen);
  lid.position.set(0, 0.02, -0.115);
  lid.rotation.x = -0.28;
  const pad = mesh(new THREE.BoxGeometry(0.1, 0.001, 0.06), new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.3, roughness: 0.35 }), false);
  pad.position.set(0, 0.0186, 0.075);
  view.root.add(base, deck, lid, pad);
  view.depth = 0.23;
  view.body.push(base, deck, lidShell, screen);
  const face = 0.115;
  const rs232 = model.ports.find((p) => p.kind === 'rs232');
  const nic = model.ports.find((p) => p.kind === 'ethernet');
  if (rs232) {
    view.ports.set(rs232.name, addSocket(view.root, m, id, rs232, 0.1, 0.01, face, 'none'));
    label(view.root, 'RS232', 0.1, -0.003, face, 0.024, 0.006, '#075985');
  }
  if (nic) view.ports.set(nic.name, addSocket(view.root, m, id, nic, 0.05, 0.01, face, 'above'));
  view.height = 0.24;
  view.width = 0.36;
}

/** Build the 3D model of a device from its catalog entry. `caption` is shown on screens (PCs, laptops). */
export function buildDevice(id: string, model: DeviceModel, position: [number, number, number] | undefined, caption: string, roomZ = 0, roomY = 0): DeviceView {
  const m = materials();
  const shape: DeviceShape =
    model.kind === 'router' ? 'router' : model.kind === 'switch' ? 'switch' : model.kind === 'server' ? 'server' : id.toUpperCase().startsWith('ADMIN') ? 'laptop' : 'pc';
  const view: DeviceView = { id, shape, root: new THREE.Group(), ports: new Map(), body: [], height: 0.1, width: 0.4, depth: 0.3, inRack: false, roomZ: 0, roomY: 0 };
  view.root.name = id;

  if (shape === 'router') buildRouter(id, model, m, view);
  else if (shape === 'switch') buildSwitch(id, model, m, view);
  else if (shape === 'laptop') buildLaptop(id, model, m, view, caption);
  else buildDesktop(id, model, m, view, caption);

  const [x, y, z] = position ?? [0, BENCH_TOP, 0];
  // Rack-mounted gear keeps its height; everything else stands on the bench.
  const inRack = (shape === 'router' || shape === 'switch') && Math.abs(x) < 0.3 && z < -0.15;
  view.inRack = inRack;
  if (inRack) addRackEars(view.root, view.width, view.height, view.depth);
  else if (shape === 'router' || shape === 'switch') addFeet(view.root, view.width, view.depth);
  // Desktop units stand on their feet, 4 mm above the bench, over a soft contact shadow. Rack gear is pushed back so
  // its ears rest against the rack's front rails.
  const lift = shape === 'router' || shape === 'switch' ? 0.004 : 0;
  if (!inRack) {
    const [sw, sd] = shape === 'pc' ? [0.62, 0.5] : shape === 'laptop' ? [0.42, 0.34] : [view.width + 0.08, view.depth + 0.08];
    const shadow = contactShadow(sw, sd, 0.5);
    shadow.position.y = 0.0012 - lift;
    view.root.add(shadow);
  }
  view.root.position.set(x, (inRack ? y : BENCH_TOP + lift) + roomY, (inRack ? RACK.frontZ - view.depth / 2 : z) + roomZ);
  view.roomZ = roomZ;
  view.roomY = roomY;
  // Everything visible on a device is merged, but for its screens' own pictures and the sockets while lit.
  pickCopies(view, m);
  for (const b of view.body) b.userData.device = id;
  for (const port of view.ports.values()) {
    port.hit.visible = false;
    port.hit.userData.dynamic = true;
    port.socket.userData.dynamic = true;
  }
  addLeds(view.root);
  bake(view.root);
  freeze(view.root);
  return view;
}

/** Bottom and top of each device mounted in the rack, for the fillers to close the units around them. */
export function rackOccupied(views: DeviceView[], roomZ = 0, roomY = 0): [number, number][] {
  return views.filter((v) => v.inRack && v.roomZ === roomZ && v.roomY === roomY).map((v) => [v.root.position.y - roomY, v.root.position.y - roomY + v.height]);
}

/** A 1U patch panel just under the rack's own: numbered sockets, where the building's fixed cabling arrives. */
export function buildPatchPanel(id: string, ports: { name: string; label: string }[], roomZ = 0, roomY = 0): DeviceView {
  const m = materials();
  const [w, h, d] = [0.445, 0.044, 0.05];
  const view: DeviceView = { id, shape: 'switch', root: new THREE.Group(), ports: new Map(), body: [], height: h, width: w, depth: d, inRack: true, roomZ, roomY };
  view.root.name = id;
  if (panelFromGear(id, ports, m, view)) {
    view.root.position.set(0, PANEL_Y + roomY, RACK.frontZ - view.depth / 2 + roomZ);
    addRackEars(view.root, view.width, view.height, view.depth);
    pickCopies(view, m);
    for (const b of view.body) b.userData.device = id;
    for (const port of view.ports.values()) {
      port.hit.visible = false;
      port.hit.userData.dynamic = true;
      port.socket.userData.dynamic = true;
    }
    bake(view.root);
    freeze(view.root);
    return view;
  }
  const chassis = mesh(new THREE.BoxGeometry(w, h, d), m.panel);
  chassis.position.y = h / 2;
  view.root.add(chassis);
  view.body.push(chassis);
  addRackEars(view.root, w, h, d);
  const face = d / 2 + 0.001;
  label(view.root, id, -w / 2 + 0.04, h / 2, face, 0.06, 0.012, '#92400e');
  ports.forEach((p, i) => {
    const x = w / 2 - 0.07 - (ports.length - 1 - i) * 0.05;
    const spec: PortSpec = { name: p.name, kind: 'ethernet' };
    view.ports.set(p.name, addSocket(view.root, m, id, spec, x, h / 2 + 0.005, face, 'none'));
    label(view.root, String(i + 1), x, h / 2 - 0.012, face, 0.012, 0.007, '#0f172a');
    if (p.label) label(view.root, p.label, x, h / 2 + 0.0165, face, 0.046, 0.006, '#1e293b');
  });
  view.root.position.set(0, PANEL_Y + roomY, RACK.frontZ - d / 2 + roomZ);
  pickCopies(view, m);
  for (const b of view.body) b.userData.device = id;
  for (const port of view.ports.values()) {
    port.hit.visible = false;
    port.hit.userData.dynamic = true;
    port.socket.userData.dynamic = true;
  }
  bake(view.root);
  freeze(view.root);
  return view;
}

/**
 * The operator's box (NTU) on the back wall of a site, right of the rack: where a leased line comes in. Its one serial
 * socket takes the router's V.35 cable; the line to the other site is the operator's.
 */
export function buildNtu(id: string, ports: { name: string; label: string }[], roomZ = 0, roomY = 0, slot = 0): DeviceView {
  const m = materials();
  const view: DeviceView = { id, shape: 'switch', root: new THREE.Group(), ports: new Map(), body: [], height: 0.17, width: 0.24, depth: 0.055, inRack: false, roomZ, roomY };
  view.root.name = id;
  const spec = { ports: ports.map((p) => ({ name: p.name, kind: 'serial' as const })) } as unknown as DeviceModel;
  if (!buildFromGear('ntu', id, spec, m, view, ports[0]?.label ? `${id} · ${ports[0].label}` : id, '#1d4ed8')) {
    const chassis = mesh(new THREE.BoxGeometry(0.24, 0.17, 0.055), m.panel);
    chassis.position.y = 0.085;
    view.root.add(chassis);
    view.body.push(chassis);
    ports.forEach((p, i) => view.ports.set(p.name, addSocket(view.root, m, id, { name: p.name, kind: 'serial' }, -0.05 + i * 0.1, 0.045, 0.03, 'none')));
  }
  // On the wall behind the bench, just right of the rack, at hand height (clear of the posters above).
  // A second operator's box (another line) goes beside the first.
  view.root.position.set(0.8 + slot * 0.5, 0.95 + roomY, -1.6 + 0.034 + roomZ);
  // The wall trunking beside it, white PVC with its lid, from the overhead tray down to just under the box: the
  // operator's line and the router's cable both run inside it.
  const pvc = new THREE.MeshStandardMaterial({ color: '#eef0f2', roughness: 0.5 });
  const [bottom, top] = [WALL_TRUNK.bottom - 0.95, TRAY.y + 0.03 - 0.95];
  const trunk = mesh(new THREE.BoxGeometry(0.06, top - bottom, 0.05), pvc);
  trunk.position.set(WALL_TRUNK.dx, (top + bottom) / 2, WALL_TRUNK.z - view.root.position.z + roomZ);
  const lid = mesh(new THREE.BoxGeometry(0.064, top - bottom, 0.006), pvc, false);
  lid.position.set(WALL_TRUNK.dx, (top + bottom) / 2, trunk.position.z + 0.026);
  const cap = mesh(new THREE.BoxGeometry(0.066, 0.012, 0.056), pvc, false);
  cap.position.set(WALL_TRUNK.dx, bottom - 0.006, trunk.position.z);
  view.root.add(trunk, lid, cap);
  pickCopies(view, m);
  for (const b of view.body) b.userData.device = id;
  for (const port of view.ports.values()) {
    port.hit.visible = false;
    port.hit.userData.dynamic = true;
    port.socket.userData.dynamic = true;
  }
  return view;
}

export function setLed(port: PortView, state: LedState): void {
  if (!port.led || port.led.state === state) return;
  port.led.state = state;
  const [colour, intensity] = LED_COLOURS[state];
  port.led.mesh.setColorAt(port.led.index, ledColour.set(colour).multiplyScalar(intensity));
  (port.led.mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
}

/** A link LED flickering with the traffic. */
export function flickerLed(port: PortView): void {
  if (port.led?.state !== 'green') return;
  port.led.mesh.setColorAt(port.led.index, ledColour.set(LED_COLOURS.green[0]).multiplyScalar(1 + Math.random() * 2.5));
  (port.led.mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
}

/** Tint a socket: green where the cable in hand can go, cyan when pointed at and able to take it, red when not, soft white with empty hands. */
export function highlightSocket(port: PortView, mode: 'none' | SocketLight): void {
  port.socket.visible = mode !== 'none';
  if (mode !== 'none') port.socket.material = socketLight(mode, port.socket.userData.plain as boolean);
}
