import * as THREE from 'three';
import type { SiteName } from './building.js';
import { textTexture } from './textures.js';

/**
 * The trip between two sites, seen from the sky: Burkina Faso in relief (the sand of the north turning to the green of
 * the south), its towns as points of light, a few clouds, and the road taken drawn as a line of light the camera
 * follows from the start to the end. Built once, far from the buildings, and shown only during a trip.
 */

/** Where the journey's map stands in the world: well away from every building. */
const ORIGIN = new THREE.Vector3(5000, 0, 5000);
/** Scene units per degree of longitude or latitude. */
const K = 40;

const OUTLINE: [number, number][] = [
  [-5.52, 10.44], [-5.4, 11.0], [-5.2, 11.4], [-4.75, 11.95], [-4.4, 12.7], [-3.95, 13.4], [-3.4, 13.7], [-2.9, 13.65], [-2.0, 14.2],
  [-1.7, 14.5], [-0.8, 15.08], [0.25, 14.95], [0.6, 14.5], [0.95, 13.9], [1.05, 13.3], [0.95, 13.05], [2.17, 12.7], [2.4, 12.25],
  [2.1, 11.75], [1.4, 11.45], [0.9, 11.0], [0.0, 11.0], [-0.6, 10.95], [-1.1, 11.0], [-2.9, 9.9], [-3.6, 9.9], [-4.3, 9.6], [-4.7, 9.7],
  [-5.0, 10.2],
];
const TOWNS: [string, number, number][] = [
  ['Ouagadougou', -1.52, 12.37], ['Bobo-Dioulasso', -4.3, 11.18], ['Koudougou', -2.36, 12.25], ['Ouahigouya', -2.42, 13.58],
  ['Banfora', -4.76, 10.63], ['Kaya', -1.08, 13.09], ['Tenkodogo', -0.37, 11.78], ['Fada N’Gourma', 0.35, 12.06], ['Dédougou', -3.46, 12.46],
];
export const SITE_LONLAT: Record<SiteName, [number, number]> = { campus: [-1.52, 12.37], agence: [-4.3, 11.18], datacenter: [-1.44, 12.31] };

/** A point of the map in world coordinates, `h` units above the land. */
export function mapPoint([lon, lat]: [number, number], h = 0): THREE.Vector3 {
  return new THREE.Vector3(ORIGIN.x + (lon + 1.5) * K, ORIGIN.y + 2 + h, ORIGIN.z - (lat - 12.3) * K);
}

/** The land's colour: sand in the north, savanna, the green south-west; a grain of fields and bush. */
function landTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, '#d2bf93');
  grad.addColorStop(0.4, '#b3a874');
  grad.addColorStop(0.7, '#869a5f');
  grad.addColorStop(1, '#5f8448');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 1024);
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    const [x, y, r] = [rnd() * 1024, rnd() * 1024, 1 + rnd() * 5];
    g.fillStyle = `rgba(${rnd() > 0.5 ? '70, 90, 40' : '160, 120, 70'}, ${0.05 + rnd() * 0.12})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A soft round glow, for towns, the travelling light and the clouds. */
function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const r = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  r.addColorStop(0, inner);
  r.addColorStop(1, outer);
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

let built: THREE.Group | null = null;

/** The map, built the first time a trip needs it. */
export function journeyMap(): THREE.Group {
  if (built) return built;
  const g = new THREE.Group();
  g.name = 'journey';
  // Sky: a gradient dome, haze at the horizon.
  const skyGeometry = new THREE.SphereGeometry(1400, 32, 16);
  const colours: number[] = [];
  const pos = skyGeometry.attributes.position as THREE.BufferAttribute;
  const [top, horizon] = [new THREE.Color('#4f8fd6'), new THREE.Color('#dfe6ee')];
  for (let i = 0; i < pos.count; i++) {
    const c = horizon.clone().lerp(top, THREE.MathUtils.clamp(pos.getY(i) / 700, 0, 1) ** 0.6);
    colours.push(c.r, c.g, c.b);
  }
  skyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  const sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.position.copy(ORIGIN);
  // The neighbouring countries, pale; the country itself in relief.
  const around = new THREE.Mesh(new THREE.CircleGeometry(1300, 64), new THREE.MeshStandardMaterial({ color: '#a7a58c', roughness: 1 }));
  around.rotation.x = -Math.PI / 2;
  around.position.copy(ORIGIN);
  const shape = new THREE.Shape(OUTLINE.map(([lon, lat]) => new THREE.Vector2((lon + 1.5) * K, (lat - 12.3) * K)));
  const land = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: true, bevelSize: 0.8, bevelThickness: 0.6, bevelSegments: 2 });
  land.rotateX(-Math.PI / 2);
  // Texture coordinates over the country's box, north at the top of the picture.
  const lpos = land.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(lpos.count * 2);
  for (let i = 0; i < lpos.count; i++) {
    uv[i * 2] = (lpos.getX(i) / K + 7) / 10;
    uv[i * 2 + 1] = (-lpos.getZ(i) / K + 3) / 6;
  }
  land.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const country = new THREE.Mesh(land, [new THREE.MeshStandardMaterial({ map: landTexture(), roughness: 0.95 }), new THREE.MeshStandardMaterial({ color: '#8c6d4a', roughness: 0.9 })]);
  country.position.copy(ORIGIN);
  const border = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(OUTLINE.map((p) => mapPoint(p, 0.3))),
    new THREE.LineBasicMaterial({ color: '#fef3c7', transparent: true, opacity: 0.8 }),
  );
  g.add(sky, around, country, border);
  // Towns: a glow and their name.
  const glow = glowTexture('rgba(255, 240, 200, 1)', 'rgba(255, 200, 120, 0)');
  for (const [name, lon, lat] of TOWNS) {
    const big = name === 'Ouagadougou' || name === 'Bobo-Dioulasso';
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, fog: false }));
    light.scale.setScalar(big ? 9 : 5);
    light.position.copy(mapPoint([lon, lat], 1));
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(name, { width: 512, height: 96, color: '#0b1e3f', font: `${big ? 700 : 600} 56px Poppins, sans-serif` }), transparent: true, depthWrite: false, fog: false }));
    label.scale.set(big ? 26 : 18, big ? 4.9 : 3.4, 1);
    label.position.copy(mapPoint([lon, lat], big ? 7 : 5));
    g.add(light, label);
  }
  // Clouds drifting a little above the land.
  const cloud = glowTexture('rgba(255, 255, 255, 0.85)', 'rgba(255, 255, 255, 0)');
  let seed = 3;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloud, transparent: true, depthWrite: false, opacity: 0.55 + rnd() * 0.3 }));
    c.scale.set(40 + rnd() * 50, 16 + rnd() * 14, 1);
    c.position.copy(mapPoint([-5.6 + rnd() * 8, 9.6 + rnd() * 5.4], 28 + rnd() * 26));
    c.userData.drift = 0.6 + rnd();
    c.name = 'cloud';
    g.add(c);
  }
  g.visible = false;
  built = g;
  return g;
}

/** The road from one site to the other, as a curve over the map (a gentle arc, like a flight path). */
export function journeyPath(from: SiteName, to: SiteName): THREE.CatmullRomCurve3 {
  const [a, b] = [mapPoint(SITE_LONLAT[from], 1.2), mapPoint(SITE_LONLAT[to], 1.2)];
  const far = a.distanceTo(b);
  const mid = a.clone().lerp(b, 0.5);
  mid.y += Math.max(1.5, far * 0.12);
  return new THREE.CatmullRomCurve3([a, a.clone().lerp(mid, 0.5).setY(a.y + (mid.y - a.y) * 0.7), mid, b.clone().lerp(mid, 0.5).setY(b.y + (mid.y - b.y) * 0.7), b]);
}

/** The line of light along the path, drawn up to `t` (0 → 1), and the bright head at its end. */
export function journeyTrail(curve: THREE.CatmullRomCurve3): { group: THREE.Group; draw: (t: number) => THREE.Vector3 } {
  const group = new THREE.Group();
  const tube = new THREE.TubeGeometry(curve, 160, 0.55, 8, false);
  const line = new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ color: '#fbbf24', toneMapped: false, fog: false }));
  const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 1.6, 8, false), new THREE.MeshBasicMaterial({ color: '#fde68a', transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false, fog: false }));
  const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255, 250, 220, 1)', 'rgba(251, 191, 36, 0)'), transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  head.scale.setScalar(10);
  group.add(line, halo, head);
  const total = tube.index ? tube.index.count : 0;
  return {
    group,
    draw: (t) => {
      const n = Math.floor((total * t) / 6) * 6;
      tube.setDrawRange(0, n);
      (halo.geometry as THREE.TubeGeometry).setDrawRange(0, n);
      const p = curve.getPointAt(Math.min(1, Math.max(0, t)));
      head.position.copy(p);
      return p;
    },
  };
}

export const JOURNEY_ORIGIN = ORIGIN;
