// Step 3 of the light bake: Blender's raw textures of light become WebP pictures, with the manifest the game reads.
// Reads art/bake/ (bake.json, <part>.raw, <part>.bin); writes apps/web/src/assets/lightmaps/.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SRC = path.join(__dirname, '../../art/bake');
const OUT = path.join(__dirname, '../../apps/web/src/assets/lightmaps');
// What one unit of Blender's diffuse light is worth in the game: pi turns it into irradiance, the rest is taste.
const INTENSITY = Number(process.env.LIGHT || 1.25);
// The stairwell has only its window: a little more light, so that the steps can be seen.
const GAIN = { 'part-stairs': 1.8 };

(async () => {
  const bake = JSON.parse(fs.readFileSync(path.join(SRC, 'bake.json'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage();
  const manifest = { intensity: INTENSITY, parts: {} };
  for (const [part, info] of Object.entries(bake)) {
    const raw = fs.readFileSync(path.join(SRC, `${part}.raw`));
    const webp = await page.evaluate(([b64, size]) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const img = ctx.createImageData(size, size);
      // Blender's first row is the bottom of the picture.
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const s = ((size - 1 - y) * size + x) * 3;
          const d = (y * size + x) * 4;
          img.data[d] = bytes[s];
          img.data[d + 1] = bytes[s + 1];
          img.data[d + 2] = bytes[s + 2];
          img.data[d + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return canvas.toDataURL('image/webp', 0.9).split(',')[1];
    }, [raw.toString('base64'), info.size]);
    fs.writeFileSync(path.join(OUT, `${part}.webp`), Buffer.from(webp, 'base64'));
    fs.copyFileSync(path.join(SRC, `${part}.bin`), path.join(OUT, `${part}.bin`));
    manifest.parts[part] = { image: `${part}.webp`, coords: `${part}.bin`, scale: info.scale * (GAIN[part] || 1), meshes: info.meshes };
    console.log(part, Math.round(Buffer.from(webp, 'base64').length / 1024), 'Ko');
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
