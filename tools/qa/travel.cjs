// Going from the campus to the agency in mission 8: the list of sites, the trip on the map, the arrival.
// node tools/qa/travel.cjs [dir]
const { open, startMission, wait } = require('./lib.cjs');
const OUT = process.argv[2] || 'art/qa';
(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 8);
  await page.keyboard.press('KeyG');
  await page.waitForSelector('.travel-card');
  await page.screenshot({ path: `${OUT}/travel-choose.png` });
  await page.click('.site-item');
  await wait(1200);
  await page.screenshot({ path: `${OUT}/travel-leave-a.png` });
  await wait(1800);
  await page.screenshot({ path: `${OUT}/travel-leave-b.png` });
  await page.waitForSelector('.trip-screen', { timeout: 15000 });
  await wait(2000);
  await page.screenshot({ path: `${OUT}/travel-trip.png` });
  await page.waitForFunction(() => !document.querySelector('.trip-screen'), null, { timeout: 15000 });
  await wait(1200);
  await page.screenshot({ path: `${OUT}/travel-arrive.png` });
  await page.waitForFunction(() => !document.body.classList.contains('cinematic'), null, { timeout: 15000 });
  await wait(1000);
  await page.screenshot({ path: `${OUT}/travel-arrived.png` });
  const where = await page.evaluate(() => { const p = window.__patchbay.mission().player; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2) }; });
  console.log(JSON.stringify({ where, errors: errors.filter((e) => !/changed since/.test(e)) }));
  await browser.close();
  if (where.z < 300) process.exit(1);
})();
