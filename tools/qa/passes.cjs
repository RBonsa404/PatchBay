// Draw calls of one frame, split between the shadow maps and the rest: node tools/qa/passes.cjs [place]
const { open, startMission, go, wait } = require('./lib.cjs');
const VIEWS = { corridor: [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82], lab: [-0.6, -4.4, Math.PI - 0.35, -0.18, 0, 0.82], 'technical room': [0.4, 3.5, Math.PI, -0.15, 0, 0.82] };
(async () => {
  const { browser, page } = await open();
  await startMission(page, 4);
  for (const quality of ['medium', 'high']) {
    await page.evaluate((q) => window.__patchbay.stage.chooseQuality(q), quality);
    for (const place of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VIEWS)) {
      await go(page, VIEWS[place]);
      await wait(1500);
      console.log(quality.padEnd(7), place.padEnd(15), await page.evaluate(() => {
        const s = window.__patchbay.stage; const r = s.renderer; const i = r.info;
        const lights = []; s.scene.traverseVisible((o) => { if (o.isLight && o.castShadow) lights.push(`${o.type}${o.shadow.autoUpdate === false ? '(static)' : ''} ${o.shadow.mapSize.x}`); });
        const sm = r.shadowMap; const realRender = sm.render.bind(sm); let shadowCalls = 0;
        sm.render = (...a) => { const before = i.render.calls; realRender(...a); shadowCalls += i.render.calls - before; };
        i.autoReset = false; i.reset();
        sm.needsUpdate = true;
        s.composer.render(0.016);
        const total = i.render.calls; i.autoReset = true; sm.render = realRender;
        let meshes = 0, casters = 0; s.scene.traverseVisible((o) => { if (o.isMesh) { meshes++; if (o.castShadow) casters++; } });
        return `${total} calls, ${shadowCalls} for shadows; visible meshes ${meshes}, casting ${casters}; shadow lights: ${lights.join(', ')}; autoUpdate ${sm.autoUpdate}`;
      }));
    }
  }
  await browser.close();
})();
