// The PCs and laptops modelled in Blender, seen close with their cables plugged in: node tools/qa/hosts.cjs [dir]
// Checks that every host port has its socket (a pick box at the model's marker) and that the screen picture is drawn.
const fs = require('fs');
const { open, startMission, hideHud, wait } = require('./lib.cjs');

const OUT = process.argv[2] || 'art/qa';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { browser, page, errors } = await open();
  await startMission(page, 1);
  await hideHud(page);
  const report = await page.evaluate(() => {
    const m = window.__patchbay.mission();
    const out = {};
    for (const [id, v] of m.devices) {
      if (v.shape !== 'pc' && v.shape !== 'laptop' && v.shape !== 'server') continue;
      out[id] = { shape: v.shape, ports: [...v.ports.keys()], size: [v.width, v.height, v.depth].map((n) => Math.round(n * 1000)), screens: v.root.children.filter((o) => o.isMesh && o.material?.map && o.material.toneMapped === false).length };
    }
    const end = (d, p) => m.devices.get(d)?.ports.get(p);
    m.select('straight');
    m.plugEnd(end('PC1', 'FastEthernet0'));
    m.plugEnd(end('S1', 'FastEthernet0/1'));
    m.select('console');
    m.plugEnd(end('ADMIN', 'RS232'));
    m.plugEnd(end('R1', 'Console'));
    m.select(null);
    return out;
  });
  console.log(JSON.stringify(report));
  for (const id of ['PC1', 'ADMIN']) {
    await page.evaluate((id) => {
      const m = window.__patchbay.mission();
      m.focusOn(m.devices.get(id), true);
    }, id);
    await wait(2500);
    await page.screenshot({ path: `${OUT}/host-${id}.png` });
  }
  const missing = Object.entries(report).filter(([, v]) => v.ports.length === 0 || v.screens !== 1);
  console.log('missing', missing, 'errors', errors);
  await browser.close();
  if (missing.length || errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
