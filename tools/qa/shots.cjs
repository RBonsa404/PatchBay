// Pictures of the same places every time, to compare rounds of work: node tools/qa/shots.cjs <dir> [tag]
const fs = require('fs');
const { open, startMission, go, hideHud, fps, wait } = require('./lib.cjs');

const OUT = process.argv[2] || 'qa-shots';
const TAG = process.argv[3] || 'r';
const VIEWS = {
  rack: [0, 1.05, Math.PI, -0.12, 0, 2.6],
  switch: [0, 0.85, Math.PI, -0.18, 0, 4.2],
  router: [0, 0.7, Math.PI, -0.62, 0, 3.0],
  bench: [-0.2, 1.1, Math.PI - 0.5, -0.55, 0, 1.6],
  room: [2.7, 3.0, Math.PI + 0.72, -0.2, 0],
  back: [0.6, 0.95, 0.3, -0.12, 0],
  corridor: [3.6, -2.5, -Math.PI / 2, 0.02, 0],
  lab: [-2.6, -4.0, 2.5, -0.15, 0],
  stairs: [4.1, -2.95, Math.PI / 2, 0.12, 0],
  office: [-2.8, 2.9, 2.4, -0.2, 1],
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await open();
  await page.screenshot({ path: `${OUT}/${TAG}-title.png` });
  await startMission(page, 4);
  await page.screenshot({ path: `${OUT}/${TAG}-hud.png` });
  await hideHud(page);
  for (const [name, view] of Object.entries(VIEWS)) {
    await go(page, view);
    await wait(1400);
    await page.screenshot({ path: `${OUT}/${TAG}-${name}.png` });
    if (name === 'room' || name === 'lab') console.log('fps', name, await fps(page));
  }
  console.log('errors', errors);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
