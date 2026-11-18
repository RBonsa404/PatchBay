// People are solid: the player walks into Ibrahim (standing, in the lounge) and stops at arm's length instead of
// going through him; standing in the corridor in Seydou's way, he stops in front of the player, then walks on.
// node tools/qa/bump.cjs [dir]  Fails if anyone is walked through, or on a page error.
const fs = require('fs');
const path = require('path');
const { open, startMission, go, wait } = require('./lib.cjs');

const OUT = process.argv[2] || 'art/qa/bump';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  const failures = [];
  // Ibrahim stands at (-9.6, -6.4): start 1.1 m east of him (the lounge spans x -10.5 to -7), facing him, and walk on for three seconds.
  await go(page, [-8.5, -6.4, -Math.PI / 2, -0.1]);
  await wait(800);
  await page.keyboard.down('KeyW');
  let closest = Infinity;
  for (let i = 0; i < 30; i++) {
    await wait(100);
    const d = await page.evaluate(() => {
      const m = window.__patchbay.mission();
      const r = m.people.find((p) => p.who.model === 'ibrahim').person.root.position;
      return Math.hypot(m.player.x - r.x, m.player.z - r.z);
    });
    closest = Math.min(closest, d);
  }
  await page.keyboard.up('KeyW');
  console.log('closest to Ibrahim', closest.toFixed(2));
  if (closest < 0.5) failures.push(`walked into Ibrahim (${closest.toFixed(2)} m)`);
  await page.screenshot({ path: path.join(OUT, '01-ibrahim.jpg'), quality: 82 });

  // Seydou walks along z = -2.6: stand on his way, facing him, and watch him stop.
  const seydou = () => page.evaluate(() => {
    const m = window.__patchbay.mission();
    const p = m.people.find((q) => q.who.model === 'seydou');
    return { x: p.person.root.position.x, z: p.person.root.position.z, waiting: p.waiting };
  });
  let s = await seydou();
  const towards = await page.evaluate(() => {
    const p = window.__patchbay.mission().people.find((q) => q.who.model === 'seydou');
    return p.who.walk[p.leg % p.who.walk.length][0] > p.person.root.position.x ? 1 : -1;
  });
  const stand = s.x + towards * 2.2;
  await go(page, [stand, -2.6, towards > 0 ? -Math.PI / 2 : Math.PI / 2, -0.1]);
  let nearest = Infinity;
  let stopped = false;
  for (let i = 0; i < 40; i++) {
    await wait(100);
    s = await seydou();
    nearest = Math.min(nearest, Math.abs(s.x - stand));
    stopped ||= s.waiting;
  }
  console.log('Seydou nearest', nearest.toFixed(2), 'stopped', stopped);
  if (!stopped || nearest < 0.5) failures.push(`Seydou walked through the player (${nearest.toFixed(2)} m)`);
  await page.screenshot({ path: path.join(OUT, '02-seydou.jpg'), quality: 82 });
  // Step aside: he goes on his way.
  await go(page, [stand, -1.6, Math.PI, -0.1]);
  await wait(1500);
  const after = await seydou();
  console.log('Seydou after', after.waiting ? 'still waiting' : 'walking on');
  if (after.waiting) failures.push('Seydou never walked on');
  console.log(errors.length ? errors : 'no page errors');
  console.log(failures.length ? failures : 'nobody walked through');
  await browser.close();
  if (errors.length || failures.length) process.exit(1);
})();
