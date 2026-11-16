// Frame pacing in one place: browser ticks against drawn frames. node tools/qa/pace.cjs [place]  (QA_VSYNC=1: screen-paced)
const { open, startMission, go, wait } = require('./lib.cjs');
const VIEWS = { lab: [-0.6, -4.4, Math.PI - 0.35, -0.18, 0, 0.82], corridor: [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82], 'data centre': [3.6, 800.8, -0.3, -0.05, 0, 0.82], 'agency hall': [-7.4, 395.4, 2.5, -0.08, 0, 0.82], 'classroom 101': [-1.0, -4.6, -2.6, -0.1, 1, 0.82] };
(async () => {
  const { browser, page } = await open({ uncapped: process.env.QA_VSYNC !== '1' });
  await startMission(page, 4);
  await page.evaluate((q) => window.__patchbay.stage.chooseQuality(q), process.env.QA_QUALITY || 'medium');
  for (const place of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIEWS)) {
    await go(page, VIEWS[place]);
    await wait(1200);
    console.log(place.padEnd(12), await page.evaluate(() => new Promise((res) => {
      const s = window.__patchbay.stage; let ticks = 0, drawn = 0; const gaps = []; let last = performance.now();
      const tick = () => { ticks++; if (t) requestAnimationFrame(tick); }; let t = true; requestAnimationFrame(tick);
      const stop = s.onFrame(() => { drawn++; const n = performance.now(); gaps.push(n - last); last = n; s.wake(); });
      setTimeout(() => { t = false; stop(); gaps.sort((a, b) => a - b); res(JSON.stringify({ ticks: ticks / 2, drawn: drawn / 2, refresh: s.refresh?.toFixed(2), med: gaps[gaps.length >> 1].toFixed(1), p95: gaps[Math.floor(gaps.length * 0.95)].toFixed(1), quality: s.quality, pr: s.renderer.getPixelRatio() })); }, 2000);
    })));
  }
  await browser.close();
})();
