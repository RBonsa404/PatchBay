// Never the street inside a room: in every mission, right at its start (before the building's later parts have had an
// idle moment to be built, the worst case), the player is put in each room they can reach, looking each way; every
// part of the building in sight must be built and drawn. Fails on the first room seen through.
// node tools/qa/no-void.cjs [first mission] [last mission]
const { open, wait } = require('./lib.cjs');

const FIRST = Number(process.argv[2] || 1);

async function start(page, n) {
  await page.goto(page.url().split('#')[0]);
  await page.waitForSelector('.menu-item');
  await page.click('.menu-item:has-text("Parcours")');
  await page.waitForSelector('.mission-row');
  const exists = await page.$(`.mission-row[data-mission="${n}"]`);
  if (!exists) return false;
  await page.click(`.mission-row[data-mission="${n}"]`);
  await wait(300);
  await page.click('.dossier footer .btn.primary');
  await page.waitForSelector('.hud-timer');
  // No waiting for idle time: the rooms are visited at once.
  await wait(200);
  return true;
}

(async () => {
  const { browser, page, errors } = await open();
  const last = Number(process.argv[3] || 99);
  const failures = [];
  let missions = 0;
  for (let n = FIRST; n <= last; n++) {
    if (!(await start(page, n))) break;
    missions++;
    const report = await page.evaluate(async () => {
      const m = window.__patchbay.mission();
      if (!m.building) return { building: false, seen: [] };
      const zones = await window.__patchbay.zones();
      const sites = new Set(m.sites());
      const out = [];
      for (const z of zones) {
        const r = z.rect;
        const site = r.z0 > 600 ? 'datacenter' : r.z0 > 200 ? 'agence' : 'campus';
        if (!sites.has(site)) continue;
        if (!m.player.allowed.has(z.name)) continue;
        const x = (r.x0 + r.x1) / 2;
        const zz = (r.z0 + r.z1) / 2;
        for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          Object.assign(m.player, { x, z: zz, yaw, pitch: 0, floor: z.y > 0 ? 1 : 0 });
          m.player.y = z.y;
          m.stage.camera.position.copy(m.player.eye);
          m.stage.camera.rotation.set(0, yaw, 0, 'YXZ');
          m.stage.camera.updateMatrixWorld();
          m.shown = '';
          m.cull();
          const missing = m.shown.split(',').filter((p) => p && !m.parts.has(p));
          const hidden = m.shown.split(',').filter((p) => m.parts.has(p) && m.parts.get(p).some((o) => !o.visible));
          if (missing.length || hidden.length) out.push({ zone: z.name, yaw, missing, hidden });
        }
      }
      return { building: true, seen: out };
    });
    const bad = report.seen;
    console.log(`mission ${n}: ${report.building ? (bad.length ? `${bad.length} views see through` : 'every room built') : 'single room'}`);
    for (const b of bad) failures.push({ mission: n, ...b });
  }
  const voids = errors.filter((e) => /never built/.test(e));
  console.log(`${missions} missions checked`);
  if (missions === 0) failures.push({ error: 'no mission could be started' });
  if (failures.length || voids.length) {
    console.log(JSON.stringify(failures.slice(0, 20), null, 1), voids);
    await browser.close();
    process.exit(1);
  }
  console.log('no room ever seen through');
  await browser.close();
})();
