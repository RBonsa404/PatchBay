import * as THREE from 'three';

/** Textures drawn on a canvas at start-up: nothing to download, works offline, and follows the club charter. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

function toTexture(c: HTMLCanvasElement, repeat = 1, colour = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  if (colour) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  return tex;
}

/** A deterministic pseudo-random sequence, so the room looks the same at every start. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function floorTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#0d1528';
  g.fillRect(0, 0, 512, 512);
  const rnd = seeded(7);
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(148, 163, 184, ${rnd() * 0.05})`;
    g.fillRect(rnd() * 512, rnd() * 512, 2, 2);
  }
  g.strokeStyle = 'rgba(56, 189, 248, 0.10)';
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 128) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 512);
    g.moveTo(0, i);
    g.lineTo(512, i);
    g.stroke();
  }
  return toTexture(c, 6);
}

/** The club's printed-circuit motif: traces with right-angle turns ending in pads. */
export function circuitTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#0b1e3f');
  bg.addColorStop(1, '#070d1e');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 512);
  const rnd = seeded(42);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    let x = Math.round((rnd() * 1024) / 16) * 16;
    let y = Math.round((rnd() * 512) / 16) * 16;
    g.strokeStyle = `rgba(56, 189, 248, ${0.10 + rnd() * 0.22})`;
    g.lineWidth = rnd() < 0.2 ? 3 : 1.6;
    g.beginPath();
    g.moveTo(x, y);
    for (let step = 0; step < 5; step++) {
      const len = 16 * (2 + Math.floor(rnd() * 8));
      if (rnd() < 0.5) x += rnd() < 0.5 ? len : -len;
      else y += rnd() < 0.5 ? len : -len;
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = 'rgba(56, 189, 248, 0.55)';
    g.beginPath();
    g.arc(x, y, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(c);
}

/** Text on a transparent background (labels on devices, the club sign). */
export function textTexture(
  text: string,
  options: { font?: string; color?: string; width?: number; height?: number; align?: CanvasTextAlign; glow?: string } = {},
): THREE.CanvasTexture {
  const w = options.width ?? 512;
  const h = options.height ?? 128;
  const [c, g] = canvas(w, h);
  g.font = options.font ?? `600 ${Math.round(h * 0.42)}px Poppins, Inter, sans-serif`;
  g.fillStyle = options.color ?? '#e2e8f0';
  g.textAlign = options.align ?? 'center';
  g.textBaseline = 'middle';
  if (options.glow) {
    g.shadowColor = options.glow;
    g.shadowBlur = h * 0.18;
  }
  const x = g.textAlign === 'left' ? h * 0.1 : g.textAlign === 'right' ? w - h * 0.1 : w / 2;
  g.fillText(text, x, h / 2);
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** A screen showing a few lines in the console font (monitors, laptop lid). */
export function screenTexture(lines: string[], accent = '#38bdf8'): THREE.CanvasTexture {
  const [c, g] = canvas(512, 320);
  const bg = g.createLinearGradient(0, 0, 512, 320);
  bg.addColorStop(0, '#0b1e3f');
  bg.addColorStop(1, '#050a17');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 320);
  g.fillStyle = accent;
  g.fillRect(0, 0, 512, 26);
  g.fillStyle = '#050a17';
  g.font = '600 15px "JetBrains Mono", monospace';
  g.fillText('PatchBay', 12, 18);
  g.fillStyle = '#cbd5e1';
  g.font = '18px "JetBrains Mono", monospace';
  lines.forEach((line, i) => g.fillText(line, 16, 64 + i * 28));
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** The slide on the lab's projection screen: the two VLANs of the course, drawn the way a teacher would. */
export function diagramTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 632);
  g.fillStyle = '#f8fafc';
  g.fillRect(0, 0, 1024, 632);
  g.fillStyle = '#0b1e3f';
  g.fillRect(0, 0, 1024, 84);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 40px Poppins, sans-serif';
  g.fillText('VLAN et trunk 802.1Q', 512, 44);
  const link = (points: [number, number][], colour: string, width = 5): void => {
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  const node = (x: number, y: number, w: number, colour: string, text: string): void => {
    g.fillStyle = colour;
    g.fillRect(x - w / 2, y - 30, w, 60);
    g.fillStyle = '#ffffff';
    g.font = '600 28px Poppins, sans-serif';
    g.fillText(text, x, y + 1);
  };
  const [v10, v20] = ['#1d4ed8', '#b45309'];
  link([[512, 180], [512, 310]], '#0b1e3f', 9);
  for (const [sw, a, b] of [[300, 130, 400], [724, 624, 894]] as const) {
    link([[512, 310], [sw, 310]], '#0b1e3f', 9);
    link([[sw, 310], [a, 480]], v10);
    link([[sw, 310], [b, 480]], v20);
    node(sw, 310, 130, '#334155', sw < 512 ? 'S1' : 'S2');
    node(a, 510, 120, v10, 'PC');
    node(b, 510, 120, v20, 'PC');
  }
  node(512, 170, 130, '#0b1e3f', 'R1');
  g.font = '600 26px Poppins, sans-serif';
  g.fillStyle = v10;
  g.fillText('VLAN 10', 330, 590);
  g.fillStyle = v20;
  g.fillText('VLAN 20', 694, 590);
  g.fillStyle = '#0b1e3f';
  g.fillText('trunk', 610, 285);
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const ATLAS_SIZE = 2048;
interface AtlasPage {
  texture: THREE.CanvasTexture;
  g: CanvasRenderingContext2D;
  x: number;
  y: number;
  row: number;
}
const atlasPages: AtlasPage[] = [];
const atlasLabels = new Map<string, AtlasLabel>();

export interface AtlasLabel {
  texture: THREE.CanvasTexture;
  /** Left, bottom, right, top of the label in the texture. */
  uv: [number, number, number, number];
}

function atlasRoom(w: number, h: number): AtlasPage {
  let page = atlasPages[atlasPages.length - 1];
  if (page && page.x + w + 4 > ATLAS_SIZE) {
    page.x = 0;
    page.y += page.row + 4;
    page.row = 0;
  }
  if (!page || page.y + h + 4 > ATLAS_SIZE) {
    const [c, g] = canvas(ATLAS_SIZE, ATLAS_SIZE);
    const texture = toTexture(c);
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
    page = { texture, g, x: 0, y: 0, row: 0 };
    atlasPages.push(page);
  }
  return page;
}

/**
 * The silkscreen of the devices: hundreds of tiny words. All on one shared texture, each drawn once, so that they merge
 * into a single draw call per device instead of one texture and one draw call per word.
 */
export function atlasLabel(text: string, w: number, h: number, color: string, font: string): AtlasLabel {
  const key = [text, w, h, color, font].join('|');
  const known = atlasLabels.get(key);
  if (known) return known;
  const page = atlasRoom(w, h);
  const { g, x, y } = page;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x + w / 2, y + h / 2);
  g.restore();
  page.texture.needsUpdate = true;
  page.x += w + 4;
  page.row = Math.max(page.row, h);
  const label: AtlasLabel = { texture: page.texture, uv: [x / ATLAS_SIZE, 1 - (y + h) / ATLAS_SIZE, (x + w) / ATLAS_SIZE, 1 - y / ATLAS_SIZE] };
  atlasLabels.set(key, label);
  return label;
}
