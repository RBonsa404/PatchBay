// The guided tour, stop by stop: node tools/qa/tour.cjs <dir>
const fs = require('fs');
const { open, wait } = require('./lib.cjs');

const OUT = process.argv[2] || 'qa-shots';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await open();
  await page.screenshot({ path: `${OUT}/tour-title.png` });
  await page.click('.menu-item:has-text("Visite guidée")');
  await page.waitForSelector('.tour-guide');
  await page.waitForFunction(() => document.querySelectorAll('#boot').length === 0);
  await wait(4500);
  const stops = await page.$$eval('.tour-guide .dots i', (d) => d.length);
  for (let i = 0; i < stops; i++) {
    await wait(i === 0 ? 300 : 2200);
    await page.screenshot({ path: `${OUT}/tour-${String(i + 1).padStart(2, '0')}.png` });
    const zone = await page.evaluate(() => {
      const m = window.__patchbay.mission();
      return `${m.player.x.toFixed(2)},${m.player.z.toFixed(2)},${m.player.y.toFixed(2)}`;
    });
    console.log('stop', i + 1, 'player', zone);
    if (i < stops - 1) await page.click('.tour-guide footer .btn.primary');
  }
  console.log('errors', errors);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
