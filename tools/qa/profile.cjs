// Where a frame's time goes, place by place: scripts (each frame handler) against drawing. node tools/qa/profile.cjs
const { open, startMission, go, wait } = require('./lib.cjs');
const VIEWS = {
  corridor: [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82],
  lab: [-0.6, -4.4, Math.PI - 0.35, -0.18, 0, 0.82],
  'data centre': [3.6, 800.8, -0.3, -0.05, 0, 0.82],
};
(async () => {
  const { browser, page } = await open({ uncapped: true });
  await startMission(page, 4);
  await page.evaluate(() => window.__patchbay.stage.chooseQuality('medium'));
  for (const [name, view] of Object.entries(VIEWS)) {
    await go(page, view);
    await wait(800);
    const r = await page.evaluate(() => new Promise((res) => {
      const s = window.__patchbay.stage;
      const handlers = [...s.frameHandlers];
      const cost = new Map();
      const wrapped = handlers.map((fn, i) => {
        const w = (dt, t) => { const a = performance.now(); fn(dt, t); cost.set(i, (cost.get(i) || 0) + performance.now() - a); };
        return w;
      });
      s.frameHandlers.clear?.(); for (const w of wrapped) s.frameHandlers.add(w);
      const render = s.composer.render.bind(s.composer);
      let drawMs = 0, n = 0, gaps = [], last = performance.now();
      s.composer.render = (dt) => { const a = performance.now(); render(dt); s.renderer.getContext().finish?.(); drawMs += performance.now() - a; n++; gaps.push(a - last); last = a; s.wake(); };
      s.wake();
      setTimeout(() => {
        s.composer.render = render; s.frameHandlers.clear(); for (const h of handlers) s.frameHandlers.add(h);
        const top = [...cost.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([i, ms]) => `${handlers[i].name || i}:${(ms / n).toFixed(2)}`);
        gaps.sort((a, b) => a - b);
        res({ n, draw: (drawMs / n).toFixed(2), median: gaps[gaps.length >> 1].toFixed(1), p95: gaps[Math.floor(gaps.length * 0.95)].toFixed(1), top });
      }, 2000);
    }));
    console.log(name.padEnd(12), JSON.stringify(r));
  }
  await browser.close();
})();
