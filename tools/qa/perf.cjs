// Frame rate, draw calls and triangles where the player stands most: node tools/qa/perf.cjs
const { open, startMission, go, fps, wait } = require('./lib.cjs');
const VIEWS = {
  'technical room': [0.4, 3.5, Math.PI, -0.15, 0, 0.82],
  corridor: [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82],
  lab: [-0.6, -4.4, Math.PI - 0.35, -0.18, 0, 0.82],
  'classroom 101': [-1.0, -4.6, -2.6, -0.1, 1, 0.82],
  'agency hall': [-7.4, 395.4, 2.5, -0.08, 0, 0.82],
  'data centre': [3.6, 800.8, -0.3, -0.05, 0, 0.82],
};
(async () => {
  const { browser, page } = await open({ uncapped: process.env.QA_VSYNC !== '1' });
  await startMission(page, 4);
  for (const quality of ['high', 'medium']) {
    await page.evaluate((q) => window.__patchbay.stage.chooseQuality(q), quality);
    for (const [name, view] of Object.entries(VIEWS)) {
      await go(page, view);
      await wait(700);
      const rate = await fps(page, 1500);
      // Count everything drawn in one frame, every pass included.
      const info = await page.evaluate(() => new Promise((res) => {
        const s = window.__patchbay.stage;
        const i = s.renderer.info;
        i.autoReset = false;
        i.reset();
        const stop = s.onFrame(() => {
          requestAnimationFrame(() => {
            stop();
            const out = { calls: i.render.calls, triangles: i.render.triangles };
            i.autoReset = true;
            res(out);
          });
        });
        s.wake();
      }));
      console.log(`${quality.padEnd(6)} ${name.padEnd(16)} ${String(rate).padStart(3)} fps  ${String(info.calls).padStart(4)} calls  ${Math.round(info.triangles / 1000)}k tris`);
    }
  }
  await browser.close();
})();
