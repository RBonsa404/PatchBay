// The stock shelving, the bench's crates and the electrical panel, modelled in Blender: node tools/qa/storage.cjs [dir]
const fs = require('fs');
const { open, startMission, go, hideHud, fps, wait } = require('./lib.cjs');

const OUT = process.argv[2] || 'qa-shots';
const VIEWS = {
  shelving: [-3.7, 1.1, -Math.PI / 2, -0.08, 0],
  'shelving-near': [-4.6, 0.6, -Math.PI / 2 - 0.35, -0.12, 0, 0.5],
  panel: [-4.6, -0.7, -Math.PI / 2 - 0.25, 0.08, 0, 0.5],
  'bench-crates': [-0.5, 1.6, Math.PI, -0.45, 0, 0.6],
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  await hideHud(page);
  for (const [name, view] of Object.entries(VIEWS)) {
    await go(page, view);
    await wait(1600);
    await page.screenshot({ path: `${OUT}/storage-${name}.png` });
  }
  console.log('fps', await fps(page));
  console.log('errors', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
