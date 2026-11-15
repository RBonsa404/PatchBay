// The building's rooms seen from where a visitor stands: node tools/qa/rooms.cjs [dir]
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');
const OUT = process.argv[2] || 'art/qa';
const VIEWS = {
  'corridor-west': [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82],
  classroom0: [-7.0, 5.3, -1.95, -0.12, 0, 0.82],
  lounge: [-8.75, -4.35, Math.PI, -0.1, 0, 0.82],
  toilets: [-12.25, -4.4, Math.PI - 0.3, -0.1, 0, 0.82],
  classroom101: [-1.0, -4.6, -2.6, -0.1, 1, 0.82],
  'corridor-up': [6.3, -2.84, -Math.PI / 2, 0.02, 1, 0.82],
  'lab-windows': [-4.0, -8.6, Math.PI / 2 + 0.2, -0.05, 0, 0.82],
  'office-windows': [0, 1.0, 0.2, -0.05, 1, 0.82],
};
(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  await hideHud(page);
  for (const [name, view] of Object.entries(VIEWS)) {
    await go(page, view);
    await wait(2500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  console.log(JSON.stringify({ errors }));
  await browser.close();
})();
