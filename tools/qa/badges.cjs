// The badges on the results: mission 1 finished twice in the same browser (the first time: « Première réussite » and the
// other new badges; the second, faster: « Record personnel »). node tools/qa/badges.cjs <dir>
const fs = require('fs');
const { open, startMission, wait } = require('./lib.cjs');

const OUT = process.argv[2] || 'art/qa/badges';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await open();
  const runs = [];
  for (const [i, left] of [[1, 0.3], [2, 0.8]]) {
    await startMission(page, 1);
    await wait(1200);
    // Finish as a network that works, with the time left set: the results come from the real end of a mission.
    await page.evaluate((share) => {
      const m = window.__patchbay.mission();
      m.remaining = m.limit * share;
      m.finish({ complete: true, score: 100, results: [] }, false);
    }, left);
    await page.waitForSelector('.results', { timeout: 15000 });
    await wait(2200);
    const badges = await page.$$eval('.badge', (els) => els.map((e) => e.textContent));
    runs.push(badges);
    console.log('run', i, badges);
    await page.screenshot({ path: `${OUT}/results-${i}.png` });
    // Back to the title, as a player who comes back later (the browser keeps the badges).
    await page.reload();
    await wait(1500);
  }
  await browser.close();
  const [first, second] = runs;
  const ok = first.some((b) => b.includes('Première réussite') && b.includes('Nouveau')) && second.some((b) => b.includes('Record personnel')) && !second.some((b) => b.includes('Première'));
  console.log(ok ? 'badges ok' : 'badges WRONG', 'errors', errors);
  if (!ok || errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
