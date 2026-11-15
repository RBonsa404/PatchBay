// The people in the game: the student seen from behind, then each colleague of the mission's sites, face to face.
// node tools/qa/people.cjs <dir> [mission]  Fails if a model or the animations do not load, or on a page error.
const fs = require('fs');
const path = require('path');
const { open, startMission, hideHud, wait } = require('./lib.cjs');

const OUT = process.argv[2] || 'art/qa/people';
const MISSION = Number(process.argv[3] || 1);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await open();
  await startMission(page, MISSION);
  await hideHud(page);
  const loaded = await page.evaluate(async () => {
    const m = window.__patchbay.mission();
    m.buildEverything?.();
    const all = [m.avatar, ...m.people.map((p) => p.person)].filter(Boolean);
    const ok = await Promise.all(all.map((p) => p.ready));
    return all.map((p, i) => [p.name, ok[i]]);
  });
  console.log('loaded', JSON.stringify(loaded));
  await wait(1500);
  // The student, from behind, standing then walking.
  await page.evaluate(() => {
    const m = window.__patchbay.mission();
    window.__patchbay.stage.wake();
    void m;
  });
  await page.screenshot({ path: path.join(OUT, '00-avatar.jpg'), quality: 82 });
  // Only the colleagues of the floors this mission opens (the others are never shown in it).
  const who = await page.evaluate(() => {
    const m = window.__patchbay.mission();
    return m.people.map((p) => (p.person.root.position.y > 2 && !m.player.canEnter('corridor1') ? null : p.who.model));
  });
  for (let i = 0; i < who.length; i++) {
    if (!who[i]) continue;
    await page.evaluate((i) => {
      const m = window.__patchbay.mission();
      const p = m.people[i];
      const r = p.person.root;
      // Stand 2 m in front of them, looking at their face.
      const yaw = r.rotation.y;
      const x = r.position.x + Math.sin(yaw) * 1.7;
      const z = r.position.z + Math.cos(yaw) * 1.7;
      // The student out of the way: only the colleague in the picture.
      m.avatar?.root.scale.setScalar(0.0001);
      Object.assign(m.player, { x, z, yaw: yaw + Math.PI, pitch: -0.1, floor: r.position.y > 2 ? 1 : 0 });
      m.player.y = r.position.y;
      m.player.floorY = r.position.y;
      m.followZone();
      window.__patchbay.stage.wake();
    }, i);
    await wait(1800);
    await page.screenshot({ path: path.join(OUT, `${String(i + 1).padStart(2, '0')}-${who[i]}.jpg`), quality: 82 });
  }
  console.log(errors.length ? errors : 'no page errors');
  await browser.close();
  if (errors.length || loaded.some(([, ok]) => !ok)) process.exit(1);
})();
