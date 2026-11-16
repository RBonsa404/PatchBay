// Heaviest visible meshes in one place (triangles, full path). node tools/qa/calls2.cjs [place]
const { open, startMission, go, wait } = require('./lib.cjs');
const VIEWS = { corridor: [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82], 'technical room': [0.4, 3.5, Math.PI, -0.15, 0, 0.82] };
(async () => {
  const { browser, page } = await open();
  await startMission(page, 4);
  await page.evaluate(() => window.__patchbay.stage.chooseQuality('medium'));
  await go(page, VIEWS[process.argv[2] || 'corridor']);
  await wait(1500);
  console.log(await page.evaluate(() => {
    const s = window.__patchbay.stage; const rows = []; const byRoot = new Map();
    s.scene.traverseVisible((o) => {
      if (!o.isMesh) return;
      const g = o.geometry; const tris = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
      const path = []; let p = o; while (p && p !== s.scene) { path.unshift(p.name || p.type[0]); p = p.parent; }
      const pos = o.getWorldPosition(o.position.clone());
      rows.push([tris, path.slice(0, 5).join('/'), pos.x.toFixed(0) + ',' + pos.z.toFixed(0), o.castShadow ? 'S' : '']);
      const k = path.slice(0, 3).join('/'); const v = byRoot.get(k) || [0, 0]; v[0]++; v[1] += tris; byRoot.set(k, v);
    });
    rows.sort((a, b) => b[0] - a[0]);
    return rows.slice(0, 25).map((r) => `${Math.round(r[0] / 1000)}k ${r[3]} ${r[2]} ${r[1]}`).join('\n') + '\n---\n' + [...byRoot.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 25).map(([k, v]) => `${v[0]} meshes ${Math.round(v[1] / 1000)}k ${k}`).join('\n');
  }));
  await browser.close();
})();
