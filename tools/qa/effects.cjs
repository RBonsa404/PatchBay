// What each post effect costs, one frame forced to finish: node tools/qa/effects.cjs [place]
const { open, startMission, go, wait } = require('./lib.cjs');
const VIEWS = { corridor: [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82], lab: [-0.6, -4.4, Math.PI - 0.35, -0.18, 0, 0.82], 'data centre': [3.6, 800.8, -0.3, -0.05, 0, 0.82] };
(async () => {
  const { browser, page } = await open();
  await startMission(page, 4);
  await page.evaluate((q) => window.__patchbay.stage.chooseQuality(q), process.env.QA_QUALITY || 'medium');
  for (const place of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIEWS)) {
    await go(page, VIEWS[place]);
    await wait(2000);
    console.log(place.padEnd(12), await page.evaluate(() => {
      const s = window.__patchbay.stage; const gl = s.renderer.getContext(); const px = new Uint8Array(4);
      const time = () => { for (let i = 0; i < 5; i++) s.composer.render(0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const a = performance.now(); for (let i = 0; i < 40; i++) { s.composer.render(0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return ((performance.now() - a) / 40).toFixed(2); };
      const out = [`all ${time()}`];
      for (const p of s.composer.passes) { if (!p.enabled) continue; p.enabled = false; out.push(`-${p.constructor.name} ${time()}`); p.enabled = true; }
      const all = []; s.composer.passes.forEach((p) => { all.push(p.enabled); if (p.constructor.name !== 'RenderPass' && p.constructor.name !== 'OutputPass') p.enabled = false; });
      out.push(`render only ${time()}`); s.composer.passes.forEach((p, i) => (p.enabled = all[i]));
      return out.join(' | ');
    }));
  }
  await browser.close();
})();
