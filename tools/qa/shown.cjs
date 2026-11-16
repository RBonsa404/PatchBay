// Which parts of the building are drawn from each place (portal culling): node tools/qa/shown.cjs
const { open, startMission, go, wait } = require('./lib.cjs');
const VIEWS = {
  'technical room': [0.4, 3.5, Math.PI, -0.15, 0, 0.82],
  corridor: [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82],
  'corridor east': [0.5, -2.84, Math.PI / 2, 0.02, 0, 0.82],
  lab: [-0.6, -4.4, Math.PI - 0.35, -0.18, 0, 0.82],
};
(async () => {
  const { browser, page } = await open();
  await startMission(page, 4);
  for (const [name, view] of Object.entries(VIEWS)) {
    await go(page, view);
    await wait(900);
    console.log(name.padEnd(15), await page.evaluate(() => {
      const m = window.__patchbay.mission(); const c = window.__patchbay.stage.camera;
      return `${m.shown}   player ${m.player.x.toFixed(1)},${m.player.z.toFixed(1)} camera ${c.position.x.toFixed(1)},${c.position.y.toFixed(1)},${c.position.z.toFixed(1)}`;
    }));
  }
  await browser.close();
})();
