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
function grain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed: number, strength = 0.05): void {
  const rnd = seeded(seed);
  for (let i = 0; i < amount; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${rnd() * strength})` : `rgba(0,0,0,${rnd() * strength})`;
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

/** Painted wall: off-white with a slight blue cast and a little texture. */
export function paintTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#d9dee6';
  g.fillRect(0, 0, 512, 512);
  grain(g, 512, 512, 9000, 3, 0.035);
  return texture(c, 4, 2);
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
  grain(g, 1024, 1024, 26000, 5, 0.06);
  return texture(c, 1, 1);
}

/** Grey-blue anti-static mat on the workbench, with its grounding stud corner. */
export function esdMatTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = '#3c4a5c';
  g.fillRect(0, 0, 1024, 512);
  grain(g, 1024, 512, 30000, 9, 0.07);
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 3;
  g.strokeRect(10, 10, 1004, 492);
  return texture(c);
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

/** Wood-look laminate for the bench edge and the shelves. */
export function laminateTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#b08a62';
  g.fillRect(0, 0, 512, 128);
  const rnd = seeded(21);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${rnd() < 0.5 ? '90,60,35' : '220,190,150'}, ${0.08 + rnd() * 0.12})`;
    g.lineWidth = 1 + rnd() * 2;
    const y = rnd() * 128;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(170, y + rnd() * 10 - 5, 340, y + rnd() * 10 - 5, 512, y + rnd() * 6 - 3);
    g.stroke();
  }
  return texture(c, 3, 1);
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
