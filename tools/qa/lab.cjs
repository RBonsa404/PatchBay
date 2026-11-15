// The lab seen from its back and close to a desk: node tools/qa/lab.cjs <dir>
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');
const OUT = process.argv[2] || 'art/qa';
const VIEWS = {
  'lab-back': [-0.6, -4.4, Math.PI - 0.35, -0.18, 0, 0.82],
  'lab-desk': [-2.9, -5.0, Math.PI - 0.7, -0.45, 0, 1.0],
  'lab-side': [6.3, -4.6, Math.PI + 0.75, -0.15, 0, 0.82],
};
(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  await hideHud(page);
  for (const [name, view] of Object.entries(VIEWS)) {
    await go(page, view);
    await wait(1500);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  console.log(JSON.stringify({ errors }));
  await browser.close();
})();
