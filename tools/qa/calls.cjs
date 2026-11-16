// What makes the draw calls in one place: visible meshes grouped by their top-level group. node tools/qa/calls.cjs [place]
const { open, startMission, go, wait } = require('./lib.cjs');
const VIEWS = { corridor: [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82], 'technical room': [0.4, 3.5, Math.PI, -0.15, 0, 0.82], lab: [-0.6, -4.4, Math.PI - 0.35, -0.18, 0, 0.82] };
(async () => {
  const { browser, page } = await open();
  await startMission(page, 4);
  await page.evaluate(() => window.__patchbay.stage.chooseQuality('medium'));
  await go(page, VIEWS[process.argv[2] || 'corridor']);
  await wait(1500);
  console.log(await page.evaluate(() => {
    const s = window.__patchbay.stage; const cam = s.camera; const THREE = s.renderer.constructor;
    cam.updateMatrixWorld();
    const m = new cam.projectionMatrix.constructor().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const fr = new (window.__patchbay.THREE?.Frustum || Object)();
    const out = new Map(); let total = 0; const mats = new Map();
    const fru = s.__frustum || null;
    s.scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isLine && !o.isPoints) return;
      if (o.frustumCulled && o.geometry) { o.geometry.boundingSphere || o.geometry.computeBoundingSphere(); }
      let top = o; const path = [];
      while (top.parent && top.parent !== s.scene) { path.unshift(top.name || top.type); top = top.parent; }
      const key = (top.name || top.type) + ' / ' + (path[1] || path[0] || '');
      const n = Array.isArray(o.material) ? o.material.length : 1;
      out.set(key, (out.get(key) || 0) + n * (o.isInstancedMesh ? 1 : 1)); total += n;
      const mk = Array.isArray(o.material) ? 'multi' : o.material.type; mats.set(mk, (mats.get(mk) || 0) + 1);
    });
    return 'visible draw objects (no culling): ' + total + '\n' + [...out.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => String(v).padStart(5) + ' ' + k).join('\n') + '\n' + JSON.stringify([...mats]);
  }));
  await browser.close();
})();
