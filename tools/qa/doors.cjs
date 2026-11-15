// Looking through doorways into the rooms across: the far room must be drawn, never the town outside.
// node tools/qa/doors.cjs [dir]
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');
const OUT = process.argv[2] || 'art/qa';
const VIEWS = {
  'room-to-lab': [-4.6, 0.8, Math.PI, 0.0, 0, 0.82],
  'lab-to-room': [-4.6, -5.0, 0.15, 0.0, 0, 0.82],
  'classroom-to-lounge': [-10, -0.4, Math.PI + 0.25, 0.0, 0, 0.82],
  'office-to-class': [-4.6, 0.6, Math.PI, 0.0, 1, 0.82],
};
(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  await hideHud(page);
  for (const [name, view] of Object.entries(VIEWS)) {
    await go(page, view);
    await wait(1200);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  console.log(JSON.stringify({ errors: errors.filter((e) => !/changed since/.test(e)) }));
  await browser.close();
})();
