import * as THREE from 'three';

/**
 * Surface textures of the technical room, drawn on a canvas at start-up (nothing to download, works offline). They
 * aim at real materials — painted plaster, raised-floor tiles, an anti-static mat, perforated steel — rather than
 * a sci-fi look.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function texture(c: HTMLCanvasElement, repeatX = 1, repeatY = repeatX, colour = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (colour) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

/** Fine grain: specks of lighter and darker paint, so flat surfaces do not look like plastic. */
/** A tangent-space normal map from a height field: `height(x, y)` in 0..1, tiling. */
function normalMap(size: number, repeatX: number, repeatY: number, strength: number, height: (x: number, y: number) => number): THREE.CanvasTexture {
  const [c, g] = canvas(size, size);
  const image = g.createImageData(size, size);
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) field[y * size + x] = height(x, y);
  const at = (x: number, y: number): number => field[((y + size) % size) * size + ((x + size) % size)] as number;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = (-dx / len + 1) * 127.5;
      image.data[i + 1] = (dy / len + 1) * 127.5;
      image.data[i + 2] = (1 / len + 1) * 127.5;
      image.data[i + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  return texture(c, repeatX, repeatY, false);
}

/** Smooth tiling noise: a few octaves of a value grid. */
function noise(size: number, seed: number, cells: number): (x: number, y: number) => number {
  const rnd = seeded(seed);
  const grid = Float32Array.from({ length: cells * cells }, () => rnd());
  const v = (x: number, y: number): number => grid[((y + cells) % cells) * cells + ((x + cells) % cells)] as number;
  const fade = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    const [fx, fy] = [(x / size) * cells, (y / size) * cells];
    const [ix, iy] = [Math.floor(fx), Math.floor(fy)];
    const [tx, ty] = [fade(fx - ix), fade(fy - iy)];
    return (v(ix, iy) * (1 - tx) + v(ix + 1, iy) * tx) * (1 - ty) + (v(ix, iy + 1) * (1 - tx) + v(ix + 1, iy + 1) * tx) * ty;
  };
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number, strength = 0.05): void {
  const rnd = seeded(seed);
  for (let i = 0; i < amount; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${rnd() * strength})` : `rgba(0,0,0,${rnd() * strength})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

/** Painted wall: a warm off-white, with soft unevenness rather than specks. */
export function paintTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#e6e7e6';
  g.fillRect(0, 0, 1024, 1024);
  const n = noise(1024, 3, 12);
  const image = g.getImageData(0, 0, 1024, 1024);
  for (let y = 0; y < 1024; y++) {
    for (let x = 0; x < 1024; x++) {
      const shade = (n(x, y) - 0.5) * 7;
      const i = (y * 1024 + x) * 4;
      image.data[i] = (image.data[i] as number) + shade;
      image.data[i + 1] = (image.data[i + 1] as number) + shade;
      image.data[i + 2] = (image.data[i + 2] as number) + shade;
    }
  }
  g.putImageData(image, 0, 0);
  return texture(c, 2, 1);
}

/** Suspended ceiling: 60 cm mineral tiles with fine pits, on a white metal grid. */
export function ceilingTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#e8e7e3';
  g.fillRect(0, 0, 512, 512);
  const rnd = seeded(41);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(90, 90, 95, ${0.1 + rnd() * 0.22})`;
    g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
  }
  // The grid, with the shadow it throws on the tile.
  g.fillStyle = 'rgba(0, 0, 0, 0.16)';
  g.fillRect(0, 10, 512, 4);
  g.fillRect(10, 0, 4, 512);
  g.fillStyle = '#f7f7f5';
  g.fillRect(0, 0, 512, 10);
  g.fillRect(0, 0, 10, 512);
  return texture(c, 1, 1);
}

/** The outside, seen from a window: a pale sky over the campus, in late-afternoon light. */
export function outsideTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 640);
  const sky = g.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, '#9fc7ee');
  sky.addColorStop(0.62, '#e8f0f4');
  sky.addColorStop(0.7, '#f7ead6');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 640);
  const sun = g.createRadialGradient(780, 330, 10, 780, 330, 340);
  sun.addColorStop(0, 'rgba(255, 244, 214, 0.95)');
  sun.addColorStop(1, 'rgba(255, 244, 214, 0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, 1024, 640);
  const rnd = seeded(51);
  // Out of focus, as seen from inside: buildings far away in the haze, then the nearer trees.
  g.filter = 'blur(5px)';
  for (let x = -20; x < 1024; ) {
    const w = 50 + rnd() * 120;
    const h = 40 + rnd() * 130;
    g.fillStyle = `rgba(${150 + rnd() * 30}, ${160 + rnd() * 25}, ${170 + rnd() * 20}, 0.85)`;
    g.fillRect(x, 470 - h, w, h + 40);
    x += w + rnd() * 24;
  }
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(${70 + rnd() * 40}, ${100 + rnd() * 40}, ${60 + rnd() * 30}, 0.9)`;
    g.beginPath();
    g.arc(rnd() * 1024, 500 + rnd() * 50, 22 + rnd() * 40, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#c9b48f';
  g.fillRect(-20, 556, 1064, 110);
  g.filter = 'none';
  const t = texture(c, 1, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** A soft warm patch: daylight falling on the floor from a window. */
export function sunPatchTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = g.createLinearGradient(0, 0, 0, 256);
  r.addColorStop(0, 'rgba(255, 236, 200, 0.5)');
  r.addColorStop(1, 'rgba(255, 236, 200, 0)');
  g.fillStyle = r;
  g.fillRect(28, 0, 200, 256);
  g.globalCompositeOperation = 'destination-in';
  const side = g.createLinearGradient(0, 0, 256, 0);
  side.addColorStop(0.05, 'rgba(0,0,0,0)');
  side.addColorStop(0.25, 'rgba(0,0,0,1)');
  side.addColorStop(0.75, 'rgba(0,0,0,1)');
  side.addColorStop(0.95, 'rgba(0,0,0,0)');
  g.fillStyle = side;
  g.fillRect(0, 0, 256, 256);
  const t = texture(c, 1, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Raised floor: 60 cm grey tiles with dark seams; one tile in four is a perforated airflow tile. */
export function raisedFloorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 1024);
  const tile = 512;
  const rnd = seeded(11);
  for (let ty = 0; ty < 2; ty++) {
    for (let tx = 0; tx < 2; tx++) {
      const x0 = tx * tile;
      const y0 = ty * tile;
      const shade = 150 + Math.floor(rnd() * 10);
      g.fillStyle = `rgb(${shade - 6}, ${shade - 2}, ${shade + 6})`;
      g.fillRect(x0, y0, tile, tile);
      if (tx === 1 && ty === 0) {
        g.fillStyle = 'rgba(30, 36, 46, 0.75)';
        for (let y = y0 + 40; y < y0 + tile - 30; y += 22) {
          for (let x = x0 + 40; x < x0 + tile - 30; x += 22) {
            g.beginPath();
            g.arc(x, y, 6, 0, Math.PI * 2);
            g.fill();
          }
        }
      }
      // Bevel: light top-left, dark bottom-right, black seam.
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x0, y0, tile, 6);
      g.fillRect(x0, y0, 6, tile);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x0, y0 + tile - 6, tile, 6);
      g.fillRect(x0 + tile - 6, y0, 6, tile);
      g.fillStyle = '#20252e';
      g.fillRect(x0, y0, tile, 2);
      g.fillRect(x0, y0, 2, tile);
    }
  }
  grain(g, 1024, 1024, 9000, 5, 0.025);
  const t = texture(c, 1, 1);
  // Once it has loaded, real concrete gives the tiles their wear and small marks.
  const wear = new Image();
  wear.onload = (): void => {
    // In grey and faint: the wear of a floor that is looked after, not a change of colour.
    g.filter = 'grayscale(1)';
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.3;
    g.drawImage(wear, 0, 0, 1024, 1024);
    g.filter = 'none';
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    t.needsUpdate = true;
  };
  wear.src = `${import.meta.env.BASE_URL}textures/smooth_concrete_floor_diff.jpg`;
  return t;
}

/** Relief of the raised floor: the tiles' bevelled edges and the holes of the airflow tile. */
export function raisedFloorNormal(): THREE.CanvasTexture {
  const tile = 256;
  return normalMap(512, 1, 1, 3.2, (x, y) => {
    const [tx, ty] = [x % tile, y % tile];
    const edge = Math.min(tx, ty, tile - 1 - tx, tile - 1 - ty);
    let h = Math.min(1, edge / 3);
    if (x >= tile && y < tile && tx > 20 && tx < tile - 15 && ty > 20 && ty < tile - 15) {
      const [px, py] = [(tx - 20) % 11, (ty - 20) % 11];
      if (Math.hypot(px - 5, py - 5) < 3) h -= 0.6;
    }
    return h;
  });
}

/** Blue-grey anti-static mat on the workbench: a fine even surface with a stitched edge. */
export function esdMatTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(2048, 1024);
  g.fillStyle = '#46566b';
  g.fillRect(0, 0, 2048, 1024);
  grain(g, 2048, 1024, 26000, 9, 0.022);
  g.strokeStyle = 'rgba(255,255,255,0.14)';
  g.lineWidth = 3;
  g.setLineDash([16, 10]);
  g.strokeRect(14, 14, 2020, 996);
  return texture(c);
}

/** The mat's fine pebble texture. */
export function esdMatNormal(): THREE.CanvasTexture {
  const n = noise(256, 61, 128);
  return normalMap(256, 18, 6, 1.1, n);
}

/** Rack mounting rail: a steel strip with square cage-nut holes, three per rack unit. */
export function rackRailTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 512);
  g.fillStyle = '#5b6574';
  g.fillRect(0, 0, 64, 512);
  g.fillStyle = '#0d1117';
  const unit = 512 / 12;
  for (let u = 0; u < 12; u++) {
    for (const k of [0.17, 0.5, 0.83]) g.fillRect(22, u * unit + k * unit - 4, 20, 8);
  }
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(0, 0, 4, 512);
  return texture(c, 1, 1);
}

/** Perforated steel (cabinet doors, side panels): a dense hexagonal grid of holes. */
export function perforatedTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#20262f';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#05070a';
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 32; col++) {
      g.beginPath();
      g.arc(col * 8 + (row % 2) * 4 + 2, row * 8 + 2, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  return texture(c, 6, 14);
}

/** Soft dark blob laid under objects: the contact shadow that keeps them from floating. */
let contactTexture: THREE.CanvasTexture | null = null;
export function contactShadowTexture(): THREE.CanvasTexture {
  if (contactTexture) return contactTexture;
  const [c, g] = canvas(256, 256);
  const r = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  r.addColorStop(0, 'rgba(0,0,0,0.85)');
  r.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  contactTexture = new THREE.CanvasTexture(c);
  return contactTexture;
}

/** A contact shadow of `w` × `d` metres, to place just above the surface the object rests on. */
export function contactShadow(w: number, d: number, opacity = 0.55): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: contactShadowTexture(), transparent: true, opacity, depthWrite: false, color: '#000000' }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -1;
  return m;
}

/** A round, soft speck of dust. */
export function dustTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(32, 32);
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** An RJ45 socket seen from the front: a dark cavity, the clip's notch, eight gold contacts. */
export function rj45Texture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#05070a';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#10141b';
  g.fillRect(6, 12, 52, 44);
  g.fillStyle = '#05070a';
  g.fillRect(22, 44, 20, 12);
  g.fillStyle = '#8f7433';
  for (let i = 0; i < 8; i++) g.fillRect(11 + i * 5.6, 15, 3, 13);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** A keyboard's top: rows of keycaps. */
export function keyboardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 170);
  g.fillStyle = '#10141b';
  g.fillRect(0, 0, 512, 170);
  const row = (y: number, h: number, keys: number[]): void => {
    let x = 8;
    for (const w of keys) {
      g.fillStyle = '#2a313c';
      g.beginPath();
      g.roundRect(x, y, w * 26 - 3, h, 3);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.09)';
      g.fillRect(x + 2, y + 1, w * 26 - 7, 2);
      x += w * 26;
    }
  };
  const many = (n: number, w = 1): number[] => Array.from({ length: n }, () => w);
  row(8, 18, many(18, 1));
  row(32, 28, [...many(14), 1.6, ...many(3)]);
  row(64, 28, [1.5, ...many(13), 1.1, ...many(3)]);
  row(96, 28, [1.8, ...many(12), 1.8, ...many(3)]);
  row(128, 28, [1.2, 1.2, 1.2, 6.5, 1.2, 1.2, 1.2, 1.2, ...many(3)]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Brushed steel: fine streaks in the roughness, for chassis and panels. */
export function brushedTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#b0b0b0';
  g.fillRect(0, 0, 512, 128);
  const rnd = seeded(71);
  for (let i = 0; i < 700; i++) {
    const v = 120 + rnd() * 110;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(rnd() * 512, rnd() * 128, 40 + rnd() * 180, 1);
  }
  return texture(c, 1, 1, false);
}

const photoLoader = new THREE.TextureLoader();

/**
 * A surface photographed for real (Poly Haven, CC0: see ASSETS.md): colour, relief and roughness. The files load in
 * the background, and the material shows its plain colour until then.
 */
export function photoRelief(name: string, repeatX = 1, repeatY = repeatX): { normalMap: THREE.Texture; roughnessMap: THREE.Texture } {
  const { normalMap, roughnessMap } = photo(name, repeatX, repeatY);
  return { normalMap, roughnessMap };
}

export function photo(name: string, repeatX = 1, repeatY = repeatX): { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture } {
  const load = (kind: string, colour: boolean): THREE.Texture => {
    const t = photoLoader.load(`${import.meta.env.BASE_URL}textures/${name}_${kind}.jpg`);
    if (colour) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = 8;
    return t;
  };
  return { map: load('diff', true), normalMap: load('nor', false), roughnessMap: load('rough', false) };
}
