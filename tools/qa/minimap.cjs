// The plan in its corner, on each floor: node tools/qa/minimap.cjs [dir]
const { open, startMission, go, wait } = require('./lib.cjs');
const OUT = process.argv[2] || 'art/qa';
(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  await go(page, [-9.0, -2.84, -Math.PI / 2, 0.02, 0, 0.82]);
  await wait(1200);
  await page.screenshot({ path: `${OUT}/minimap-ground.png` });
  await go(page, [3.0, -2.84, Math.PI, 0.02, 1, 0.82]);
  await wait(1200);
  await page.screenshot({ path: `${OUT}/minimap-up.png` });
  console.log(JSON.stringify({ errors: errors.filter((e) => !/changed since/.test(e)) }));
  await browser.close();
})();
