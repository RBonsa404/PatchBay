// Adaptive music: the scene and the piece follow the game (menu, cabling, console open, last minute, end, troubleshooting).
// node tools/qa/music.cjs
const { open, startMission, wait } = require('./lib.cjs');

const MENU = ['exploration-theme', 'starfield-romance', 'first-light-particles', 'synth'];
const CABLING = ['calm-ambient-1', 'calm-ambient-2', 'calm-ambient-3', 'synth'];
const TROUBLE = ['synth', 'calm-ambient-3', 'contemplation'];

(async () => {
  const failures = [];
  const check = (what, ok, seen) => {
    console.log(ok ? 'ok  ' : 'FAIL', what, JSON.stringify(seen));
    if (!ok) failures.push(what);
  };
  const state = (page) => page.evaluate(() => {
    const s = window.__patchbay.sound;
    return { ...s.currentScene, track: s.track, db: Math.round(s.level()) };
  });

  const { browser, page, errors } = await open();
  await page.mouse.click(5, 5);
  await wait(1500);
  let s = await state(page);
  check('menu music', s.scene === 'menu' && MENU.includes(s.track), s);

  await startMission(page, 4);
  await wait(1000);
  s = await state(page);
  check('cabling music', s.scene === 'cabling' && !s.focus && CABLING.includes(s.track), s);

  // A console open (its panel in the page) muffles the same piece.
  const before = s.track;
  await page.evaluate(() => document.body.append(Object.assign(document.createElement('div'), { className: 'terminal qa-fake' })));
  await wait(800);
  s = await state(page);
  check('configuring muffles, same piece', s.focus && s.track === before, s);
  await page.evaluate(() => document.querySelector('.qa-fake')?.remove());
  await wait(800);
  s = await state(page);
  check('back to cabling', !s.focus && s.track === before, s);

  await page.evaluate(() => (window.__patchbay.mission().remaining = 45));
  await wait(1500);
  s = await state(page);
  check('last minute turns urgent', s.scene === 'urgent' && s.track === 'synth', s);
  await wait(3000);
  s = await state(page);
  check('urgent music is heard', s.db > -60, s);

  await page.evaluate(() => (window.__patchbay.mission().remaining = 0.3));
  await wait(1200);
  s = await state(page);
  check('timeout plays the ending phrase', s.track === 'stinger' && s.scene === 'menu', s);
  await wait(6000);
  s = await state(page);
  check('menu music under the results', MENU.includes(s.track), s);
  errors.length && console.log('errors', errors);
  await browser.close();

  const second = await open();
  await second.page.mouse.click(5, 5);
  await startMission(second.page, 9);
  await wait(1000);
  s = await state(second.page);
  check('troubleshooting music', s.scene === 'troubleshoot' && TROUBLE.includes(s.track), s);
  await second.browser.close();

  const all = [...errors, ...second.errors];
  if (all.length) console.log('errors', all);
  if (failures.length || all.length) process.exit(1);
  console.log('adaptive music ok');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
