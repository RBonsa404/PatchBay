// The far sites' buildings, room by room: node tools/qa/sites.cjs [dir]
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');
const OUT = process.argv[2] || 'art/qa';
const S = { agence: 400, datacenter: 800 };
const VIEWS = {
  'agence-hall': [-7.4, S.agence - 4.6, 2.5, -0.08, 0, 0.82],
  'agence-corridor': [6.2, S.agence - 2.84, -Math.PI / 2, 0.02, 0, 0.82],
  'agence-office': [0.6, S.agence - 4.8, Math.PI + 0.5, -0.1, 0, 0.82],
  'agence-meeting': [4.0, S.agence - 4.6, Math.PI - 0.5, -0.15, 0, 0.82],
  'agence-toilets': [6.6, S.agence - 4.5, Math.PI + 0.6, -0.1, 0, 0.82],
  'agence-room': [3.2, S.agence + 4.6, Math.PI + 0.62, -0.12, 0, 0.82],
  'dc-office': [0.6, S.datacenter - 4.8, -2.4, -0.05, 0, 0.82],
  'dc-room': [3.6, S.datacenter + 0.8, -0.3, -0.05, 0, 0.82],
};
(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  await hideHud(page);
  for (const [name, view] of Object.entries(VIEWS)) {
    await go(page, view);
    await wait(1600);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  console.log(JSON.stringify({ errors: errors.filter((e) => !/changed since/.test(e)) }));
  await browser.close();
})();
