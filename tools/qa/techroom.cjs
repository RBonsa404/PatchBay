// The technical room's tool wall (cupboard and pegboard), the technician's desk and the bin, modelled in Blender:
// node tools/qa/techroom.cjs [dir]
const fs = require('fs');
const { open, startMission, go, hideHud, fps, wait } = require('./lib.cjs');

const OUT = process.argv[2] || 'qa-shots';
const VIEWS = {
  'tool-wall': [4.1, 2.6, Math.PI / 2, 0.05, 0, 0.82],
  'tool-wall-near': [4.7, 1.9, Math.PI / 2 + 0.35, -0.05, 0, 0.5],
  desk: [-4.2, 4.0, 0.25, -0.15, 0, 0.82],
  'desk-near': [-4.0, 4.6, -0.35, -0.3, 0, 0.5],
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  await hideHud(page);
  for (const [name, view] of Object.entries(VIEWS)) {
    await go(page, view);
    await wait(1600);
    await page.screenshot({ path: `${OUT}/techroom-${name}.png` });
  }
  console.log('fps', await fps(page));
  console.log('errors', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
