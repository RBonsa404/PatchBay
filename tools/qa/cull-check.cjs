// The culling never hides what can be seen: from many places in every room (several spots, eight directions), the
// view is drawn once as the game draws it and once with the whole building shown; the two pictures must match.
// node tools/qa/cull-check.cjs [mission ...]   (default: missions 4 and 8, the campus with its floor, and the far sites)
const { open, startMission, wait } = require('./lib.cjs');

(async () => {
  const { browser, page } = await open();
  const missions = process.argv.slice(2).map(Number);
  let views = 0;
  const bad = [];
  for (const n of missions.length ? missions : [4, 8]) {
    await page.goto(page.url().split('#')[0]);
    await page.waitForSelector('.menu-item');
    await startMission(page, n);
    await wait(500);
    const report = await page.evaluate(async () => {
      const m = window.__patchbay.mission();
      const s = window.__patchbay.stage;
      m.buildEverything?.();
      const zones = await window.__patchbay.zones();
      const sites = new Set(m.sites());
      const renderer = s.renderer;
      const W = 240;
      const H = 135;
      const target = new (s.composer.renderTarget1.constructor)(W, H);
      const a = new Uint8Array(W * H * 4);
      const b = new Uint8Array(W * H * 4);
      const camera = s.camera;
      const draw = (into) => {
        renderer.setRenderTarget(target);
        renderer.render(s.scene, camera);
        renderer.readRenderTargetPixels(target, 0, 0, W, H, into);
        renderer.setRenderTarget(null);
      };
      const all = [...m.parts.values()].flat();
      const out = [];
      let count = 0;
      for (const z of zones) {
        const r = z.rect;
        const site = r.z0 > 600 ? 'datacenter' : r.z0 > 200 ? 'agence' : 'campus';
        if (!sites.has(site) || !m.player.allowed.has(z.name)) continue;
        for (const [fx, fz] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
          const x = r.x0 + (r.x1 - r.x0) * fx;
          const zz = r.z0 + (r.z1 - r.z0) * fz;
          for (let k = 0; k < 8; k++) {
            const yaw = (k * Math.PI) / 4;
            Object.assign(m.player, { x, z: zz, yaw, pitch: 0, floor: z.y > 0 ? 1 : 0 });
            m.player.y = m.player.shownY = z.y;
            camera.position.copy(m.player.eye);
            camera.rotation.set(-0.08, yaw + Math.PI, 0, 'YXZ');
            camera.updateMatrixWorld();
            m.shown = '';
            m.cull();
            const shown = m.shown;
            const was = all.map((o) => o.visible);
            draw(a);
            // Everything shown, but the lights of the rooms the culling hid stay off: the light must not change.
            const dark = [];
            all.forEach((o, i) => {
              if (was[i]) return;
              o.visible = true;
              o.traverse((l) => {
                if (l.isLight && l.visible) {
                  l.visible = false;
                  dark.push(l);
                }
              });
            });
            draw(b);
            for (const l of dark) l.visible = true;
            all.forEach((o, i) => (o.visible = was[i]));
            let diff = 0;
            for (let i = 0; i < a.length; i += 4) {
              if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) diff++;
            }
            count++;
            if (diff > W * H * 0.003) {
              // Which hidden part was in sight: show each one alone.
              const parts = [...m.parts.entries()].filter(([, objects]) => objects.some((o) => !o.visible));
              const culprits = [];
              for (const [name, objects] of parts) {
                const before = objects.map((o) => o.visible);
                objects.forEach((o) => (o.visible = true));
                const lit = [];
                objects.forEach((o) => o.traverse((l) => { if (l.isLight && l.visible) { l.visible = false; lit.push(l); } }));
                draw(b);
                lit.forEach((l) => (l.visible = true));
                objects.forEach((o, i) => (o.visible = before[i]));
                let d = 0;
                for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) d++;
                if (d > W * H * 0.003) culprits.push(name);
              }
              out.push({ zone: z.name, at: [+x.toFixed(1), +zz.toFixed(1)], yaw: +yaw.toFixed(2), shown, pixels: diff, missing: culprits.join() });
            }
          }
        }
      }
      target.dispose();
      return { count, out };
    });
    views += report.count;
    console.log(`mission ${n}: ${report.count} views, ${report.out.length} hide something in sight`);
    bad.push(...report.out.map((o) => ({ mission: n, ...o })));
  }
  await browser.close();
  if (bad.length) {
    console.log(JSON.stringify(bad.slice(0, 30), null, 1));
    process.exit(1);
  }
  console.log(`${views} views: the culling never hides what can be seen`);
})();
