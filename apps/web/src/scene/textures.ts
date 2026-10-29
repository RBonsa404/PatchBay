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
  tex.anisotropy = 8;
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
