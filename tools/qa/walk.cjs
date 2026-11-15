// Walk the building as a player would, with the real movement code: through the doors, up and down the stairs.
// node tools/qa/walk.cjs [dir]  (a picture at each waypoint when a folder is given). Fails if a waypoint is not reached.
const fs = require('fs');
const { open, startMission, hideHud, wait } = require('./lib.cjs');

const OUT = process.argv[2];
// [name, x, z, expected floor height]: the player walks straight to each one in turn.
const ROUTE = [
  ['in front of the door', -4.6, 0.3, 0],
  ['through the door', -4.6, -2.84, 0],
  ['end of the corridor', 6.4, -2.84, 0],
  ['stair hall', 7.45, -2.84, 0],
  ['foot of the first flight', 7.45, -1.7, 0],
  ['top of the first flight', 11.2, -1.7, 1.65],
  ['across the landing', 11.6, -3.2, 1.65],
  ['top of the second flight', 7.6, -3.2, 3.3],
  ['upper corridor', 5.5, -2.84, 3.3],
  ['administration door', -4.6, -2.84, 3.3],
  ['into the administration', -4.6, 0.5, 3.3],
  ['out of the administration', -4.6, -2.84, 3.3],
  ['back along the upper corridor', 6.4, -2.84, 3.3],
  ['back down: the gallery', 7.45, -3.2, 3.3],
  ['down the second flight', 11.4, -3.2, 1.65],
  ['top of the first flight again', 11.2, -1.7, 1.65],
  ['down the first flight', 7.5, -1.7, 0],
  ['stair hall again', 7.45, -2.84, 0],
  ['back into the corridor', 6.4, -2.84, 0],
  ['in front of the lab door', 0, -3.2, 0],
  ['into the lab', 0, -5.6, 0],
];

(async () => {
  if (OUT) fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  await hideHud(page);
  await page.evaluate(() => window.__patchbay.mission().player.place(-1.0, 1.75, 0));
  let failed = 0;
  for (const [i, [name, x, z, y]] of ROUTE.entries()) {
    const at = await page.evaluate(([tx, tz]) => {
      const p = window.__patchbay.mission().player;
      p.pitch = 0;
      for (let t = 0; t < 14; t += 1 / 60) {
        const dx = tx - p.x;
        const dz = tz - p.z;
        if (Math.hypot(dx, dz) < 0.12) break;
        p.yaw = Math.atan2(dx, dz);
        p.update(1 / 60, { x: 0, y: 1, run: false });
      }
      return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), y: +p.floorY.toFixed(2) };
    }, [x, z]);
    const ok = Math.hypot(at.x - x, at.z - z) < 0.3 && Math.abs(at.y - y) < 0.2;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(at)}`);
    if (OUT) {
      await page.evaluate(() => {
        const m = window.__patchbay.mission();
        m.followZone();
        window.__patchbay.stage.wake();
      });
      await wait(900);
      await page.screenshot({ path: `${OUT}/walk-${String(i).padStart(2, '0')}.png` });
    }
  }
  console.log('errors', errors.filter((e) => !/since the light was baked/.test(e)));
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
