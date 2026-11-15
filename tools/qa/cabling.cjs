// Mission 4: lay every cable the way a player would, and check what the game says. node tools/qa/cabling.cjs [dir]
const fs = require('fs');
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');

const OUT = process.argv[2];
const CABLES = [
  ['straight', 'S1', 'GigabitEthernet0/2', 'PP-TECH', 'P1'],
  ['straight', 'S2', 'GigabitEthernet0/2', 'PP-TP', 'P1'],
  ['straight', 'S1', 'FastEthernet0/24', 'PP-TECH', 'P2'],
  ['straight', 'S3', 'GigabitEthernet0/2', 'PP-ADM', 'P1'],
  ['straight', 'S1', 'GigabitEthernet0/1', 'R1', 'GigabitEthernet0/0'],
  ['straight', 'PC2', 'FastEthernet0', 'S2', 'FastEthernet0/1'],
  ['straight', 'PC3', 'FastEthernet0', 'S2', 'FastEthernet0/2'],
  ['straight', 'PC4', 'FastEthernet0', 'S3', 'FastEthernet0/1'],
  ['straight', 'PC5', 'FastEthernet0', 'S3', 'FastEthernet0/2'],
  ['console', 'ADMIN', 'RS232', 'R1', 'Console'],
];

(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  const report = await page.evaluate((cables) => {
    const m = window.__patchbay.mission();
    const end = (d, p) => (m.devices.get(d) ?? m.panels.get(d))?.ports.get(p);
    const lit = () => [...m.devices.values(), ...m.panels.values()].reduce((n, v) => n + [...v.ports.values()].filter((p) => p.socket.visible).length, 0);
    const missing = cables.flatMap(([, a, ap, b, bp]) => [[a, ap], [b, bp]]).filter(([d, p]) => !end(d, p)).map((x) => x.join(':'));
    m.select('straight');
    const hintsWithCable = lit();
    for (const [type, a, ap, b, bp] of cables) {
      m.select(type);
      m.plugEnd(end(a, ap));
      m.plugEnd(end(b, bp));
    }
    m.select(null);
    return { missing, hintsWithCable, hintsAfter: lit(), cables: m.net.cables.length, cords: m.cords.length };
  }, CABLES);
  console.log(JSON.stringify(report));
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    await hideHud(page);
    await go(page, [0, 0.85, Math.PI, -0.22, 0, 3.6]);
    await wait(1600);
    await page.screenshot({ path: `${OUT}/cabling-rack.png` });
  }
  console.log('errors', errors);
  await browser.close();
  if (report.missing.length || errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
