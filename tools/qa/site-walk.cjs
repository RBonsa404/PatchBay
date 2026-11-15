// Walk through each far site's building, from the street door to the technical room and every room: no wall in the
// way, no door too narrow. node tools/qa/site-walk.cjs
const { open, startMission } = require('./lib.cjs');
const S = { agence: 400, datacenter: 800 };
const route = (z) => [
  ['hall', -5.5, z - 7.6], ['hall to corridor', -5.5, z - 2.84], ['corridor east', 3.0, z - 2.84], ['into the meeting room', 2.75, z - 5.2],
  ['back to the corridor', 2.75, z - 2.84], ['to the toilets door', 5.75, z - 2.84], ['into the toilets', 5.75, z - 5.0], ['out', 5.75, z - 2.84],
  ['to the office door', -1, z - 2.84], ['into the office', -1, z - 6.0],
  ['out of the office', -1, z - 2.84], ['to the technical room door', -4.6, z - 2.84], ['into the technical room', -4.6, z + 0.6], ['to the bench', -2.0, z + 1.0],
];
(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  await page.evaluate(() => window.__patchbay.mission().buildEverything());
  let failed = 0;
  for (const [site, z] of Object.entries(S)) {
    await page.evaluate((z) => window.__patchbay.mission().player.place(-5.5, z - 8.4, 0), z);
    for (const [name, x, tz] of route(z)) {
      const at = await page.evaluate(([tx, tz]) => {
        const p = window.__patchbay.mission().player;
        for (let t = 0; t < 14; t += 1 / 60) {
          const dx = tx - p.x;
          const dz = tz - p.z;
          if (Math.hypot(dx, dz) < 0.15) break;
          p.yaw = Math.atan2(dx, dz);
          p.update(1 / 60, { x: 0, y: 1, run: false });
        }
        return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) };
      }, [x, tz]);
      const ok = Math.hypot(at.x - x, at.z - tz) < 0.3;
      if (!ok) failed++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${site}: ${name} ${JSON.stringify(at)}`);
    }
  }
  console.log('errors', errors.filter((e) => !/changed since/.test(e)));
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
