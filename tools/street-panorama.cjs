// The campus's town seen through its windows, photographed from the modelled street of the campus (not from a
// foreign one): the game renders it (see apps/web/src/scene/street-panorama.ts) and this saves it in its place.
// The game must be running (npm run dev -w @patchbay/web, port 5180). Run again after changing the street.
//   node tools/street-panorama.cjs [out.jpg]
const fs = require('fs');
const path = require('path');
const { open, startMission } = require('./qa/lib.cjs');
const OUT = process.argv[2] || path.join(__dirname, '../apps/web/public/textures/outside/panorama-campus.jpg');
(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  const url = await page.evaluate(() => window.__patchbay.streetPanorama());
  fs.writeFileSync(OUT, Buffer.from(url.split(',')[1], 'base64'));
  console.log(JSON.stringify({ out: OUT, bytes: fs.statSync(OUT).size, errors }));
  await browser.close();
})();
