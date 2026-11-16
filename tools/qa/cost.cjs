// Cost of one frame (CPU + graphics chip, forced to finish) with parts of the scene hidden in turn. node tools/qa/cost.cjs [place]
const { open, startMission, go, wait } = require('./lib.cjs');
const VIEWS = { corridor: [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82], 'technical room': [0.4, 3.5, Math.PI, -0.15, 0, 0.82], lab: [-0.6, -4.4, Math.PI - 0.35, -0.18, 0, 0.82] };
(async () => {
  const { browser, page } = await open();
  await startMission(page, 4);
  await page.evaluate((q) => window.__patchbay.stage.chooseQuality(q), process.env.QA_QUALITY || 'medium');
  await go(page, VIEWS[process.argv[2] || 'corridor']);
  await wait(2500);
  console.log(await page.evaluate(() => {
    const s = window.__patchbay.stage; const gl = s.renderer.getContext(); const px = new Uint8Array(4);
    const time = () => { for (let i = 0; i < 5; i++) s.composer.render(0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); const a = performance.now(); for (let i = 0; i < 30; i++) { s.composer.render(0.016); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } return ((performance.now() - a) / 30).toFixed(2); };
    const out = ['all ' + time() + ' ms'];
    const tops = []; const walk = (g, d) => { for (const o of g.children) { if (!o.visible) continue; if (o.name && !o.name.includes("#")) tops.push(o); if (d < 2) walk(o, d + 1); } }; walk(s.scene, 0); tops.splice(30);
    for (const o of tops) { o.visible = false; out.push(`- ${o.name}: ${time()}`); o.visible = true; }
    const people = []; s.scene.traverse((o) => { if (o.name.startsWith('person-') && o.visible) people.push(o); });
    people.forEach((o) => (o.visible = false)); out.push('- all people: ' + time()); people.forEach((o) => (o.visible = true));
    const shadowed = []; s.scene.traverse((o) => { if (o.isMesh && o.receiveShadow) { shadowed.push(o); } });
    const lights = []; s.scene.traverse((o) => { if (o.isLight && o.castShadow) lights.push(o); });
    lights.forEach((l) => (l.castShadow = false)); s.renderer.shadowMap.needsUpdate = true; out.push('- shadows off: ' + time()); lights.forEach((l) => (l.castShadow = true)); s.renderer.shadowMap.needsUpdate = true;
    const pr = s.renderer.getPixelRatio(); s.renderer.setPixelRatio(0.5); s.composer.setPixelRatio(0.5); out.push('- quarter pixels: ' + time()); s.renderer.setPixelRatio(pr); s.composer.setPixelRatio(pr);
    return out.join('\n');
  }));
  await browser.close();
})();
