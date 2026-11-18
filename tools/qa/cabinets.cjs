// The closed network cabinets (row across the room, three against the right wall), modelled in Blender: node tools/qa/cabinets.cjs [dir]
const fs = require('fs');
const { open, startMission, go, hideHud, fps, wait } = require('./lib.cjs');

const OUT = process.argv[2] || 'qa-shots';
const VIEWS = {
  row: [0, 1.6, 0, 0.02, 0, 0.82],
  'row-near': [-1.4, 2.75, 0.25, -0.05, 0, 0.5],
  'row-rear': [1.0, 5.4, Math.PI, 0.02, 0, 0.6],
  wall: [3.7, 0.6, Math.PI / 2, 0.02, 0, 0.82],
  'wall-near': [4.6, 0.3, Math.PI / 2 + 0.3, -0.1, 0, 0.5],
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  await hideHud(page);
  for (const [name, view] of Object.entries(VIEWS)) {
    await go(page, view);
    await wait(1600);
    await page.screenshot({ path: `${OUT}/cabinets-${name}.png` });
  }
  console.log('fps', await fps(page));
  console.log('errors', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
