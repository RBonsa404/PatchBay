// Step 1 of the light bake: the still parts of the building, as the game builds them, for Blender.
// The game must be running (npm run dev -w @patchbay/web). Writes art/bake/scene.json (not kept in git).
const fs = require('fs');
const path = require('path');
const { open, startMission } = require('../qa/lib.cjs');

(async () => {
  const { browser, page, errors } = await open();
  // Mission 4 has the whole building: both floors, every room.
  await startMission(page, 4);
  const scene = await page.evaluate(() => window.__patchbay.exportStatic());
  const out = path.join(__dirname, '../../art/bake');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify(scene));
  const parts = {};
  for (const m of scene.meshes) parts[m.part] = (parts[m.part] || 0) + 1;
  console.log('meshes per part', parts, 'lights', scene.lights.length);
  if (errors.length) console.log('errors', errors);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
