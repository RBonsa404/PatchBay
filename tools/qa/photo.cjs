// Photo mode: K opens it, the clock stops, the HUD goes, the camera flies but never through a wall nor far away,
// Enter saves a signed PNG, K closes it and the game goes on. node tools/qa/photo.cjs [dir]
const fs = require('fs');
const path = require('path');
const { open, startMission, wait } = require('./lib.cjs');

const OUT = process.argv[2];

(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  const state = () =>
    page.evaluate(() => {
      const m = window.__patchbay.mission();
      const c = window.__patchbay.stage.camera;
      const hud = document.querySelector('.hud');
      return {
        photo: !!document.querySelector('.photo-mode'),
        hudShown: !!hud && getComputedStyle(hud).display !== 'none',
        remaining: Math.round(m.remaining * 10) / 10,
        cam: [c.position.x, c.position.y, c.position.z].map((v) => Math.round(v * 100) / 100),
        player: [m.player.x, m.player.z].map((v) => Math.round(v * 100) / 100),
        focal: document.querySelector('.photo-focal')?.textContent ?? null,
      };
    });
  const problems = [];
  await page.keyboard.press('KeyK');
  await wait(400);
  const opened = await state();
  if (!opened.photo || opened.hudShown) problems.push('photo mode did not open cleanly');
  await wait(2000);
  const later = await state();
  if (Math.abs(later.remaining - opened.remaining) > 0.15) problems.push(`clock ran in photo mode (${opened.remaining} → ${later.remaining})`);
  // Fly forward for a long time: the camera stops at a wall or 6 m from the student, never beyond.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await wait(5000);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  await page.keyboard.down('Space');
  await wait(4000);
  await page.keyboard.up('Space');
  const flown = await state();
  const far = Math.hypot(flown.cam[0] - flown.player[0], flown.cam[2] - flown.player[1]);
  if (far > 6.05) problems.push(`camera ${far.toFixed(2)} m from the student`);
  if (flown.cam[1] > 2.75) problems.push(`camera through the ceiling (${flown.cam[1]})`);
  // Turn back toward the room, zoom a little, a filter, then the shot.
  await page.mouse.move(800, 450);
  await page.mouse.down();
  await page.mouse.move(1300, 520, { steps: 10 });
  await page.mouse.up();
  await page.mouse.wheel(0, -300);
  await page.click('.photo-chip[data-filter="warm"]', { timeout: 10000 });
  await wait(600);
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: path.join(OUT, 'photo-mode.png') });
  }
  const download = page.waitForEvent('download', { timeout: 15000 });
  await page.keyboard.press('Enter');
  const file = await download;
  const name = file.suggestedFilename();
  if (!/^ist-network-lab-\d{4}-\d\d-\d\d-\d\dh\d\d-\d\d\.png$/.test(name)) problems.push(`odd file name ${name}`);
  const saved = OUT ? path.join(OUT, 'photo-saved.png') : path.join(require('os').tmpdir(), name);
  await file.saveAs(saved);
  const size = fs.statSync(saved).size;
  const head = fs.readFileSync(saved).subarray(0, 24);
  const width = head.readUInt32BE(16);
  if (size < 100000 || width < 1920) problems.push(`photo too small (${size} bytes, ${width} px wide)`);
  await wait(500);
  await page.keyboard.press('KeyK');
  await wait(600);
  const closed = await state();
  if (closed.photo || !closed.hudShown) problems.push('photo mode did not close cleanly');
  await wait(1500);
  const after = await state();
  if (after.remaining >= closed.remaining) problems.push('clock did not restart');
  console.log(JSON.stringify({ opened, flown, name, size, width, closed: { photo: closed.photo, hud: closed.hudShown } }));
  console.log('problems', problems, 'errors', errors);
  await browser.close();
  if (problems.length || errors.length) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
