// The time of day: the lab of missions 4, 5 and 6 (morning, noon, evening). node tools/qa/daytime.cjs <dir>
const fs = require('fs');
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');

const OUT = process.argv[2] || 'art/qa/daytime';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const errors = [];
  for (const n of [4, 5, 6]) {
    const { browser, page, errors: e } = await open();
    await startMission(page, n);
    const hour = await page.evaluate(() => document.querySelector('.mission-hour')?.textContent ?? '');
    await hideHud(page);
    // The lab faces east (morning sun), classroom 001 south (noon), classroom 101 west (evening).
    const views = { lab: [1.2, -7.2, Math.PI / 2 - 0.25, -0.32, 0], c001: [-10, 1.5, 0.3, -0.3, 0], c101: [-1.5, -7.6, -Math.PI / 2 + 0.25, -0.32, 1] };
    // Mission 6 has no upstairs (its classrooms are never built): the ground floor only.
    if (n === 6) delete views.c101;
    for (const [name, view] of Object.entries(views)) {
      await go(page, view);
      await wait(1600);
      await page.screenshot({ path: `${OUT}/m${n}-${name}.png` });
    }
    console.log('mission', n, hour);
    errors.push(...e);
    await browser.close();
  }
  console.log('errors', errors);
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
