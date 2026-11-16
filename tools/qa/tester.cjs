// The cable tester: missions 4 and 9, what it reads behind each kind of port. node tools/qa/tester.cjs [dir]
const fs = require('fs');
const { open, startMission, wait } = require('./lib.cjs');

const OUT = process.argv[2];

const read = (page) =>
  page.evaluate(() => {
    const p = document.querySelector('.tester-panel');
    return p ? { badge: p.querySelector('.tester-badge')?.textContent, kind: p.querySelector('.tester-kind')?.textContent, length: p.querySelector('.tester-length b')?.textContent ?? null, lines: p.querySelectorAll('.wiremap path, .wiremap line').length } : null;
  });

(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 4);
  const cases = [
    // [what, setup, device, port]
    ['vide', null, 'PC2', 'FastEthernet0'],
    ['droit PC-switch', ['straight', 'PC2', 'FastEthernet0', 'S2', 'FastEthernet0/1'], 'PC2', 'FastEthernet0'],
    ['croisé PC-switch', ['crossover', 'PC3', 'FastEthernet0', 'S2', 'FastEthernet0/2'], 'S2', 'FastEthernet0/2'],
    ['cordon seul', ['straight', 'S1', 'GigabitEthernet0/2', 'PP-TECH', 'P1'], 'S1', 'GigabitEthernet0/2'],
    ['lien brassé', ['straight', 'S2', 'GigabitEthernet0/2', 'PP-TP', 'P1'], 'S2', 'GigabitEthernet0/2'],
    ['panneau nu', null, 'PP-TECH', 'P2'],
    ['console', ['console', 'ADMIN', 'RS232', 'R1', 'Console'], 'R1', 'Console'],
  ];
  const report = {};
  for (const [name, setup, device, port] of cases) {
    await page.evaluate(([setup, device, port]) => {
      const m = window.__patchbay.mission();
      const end = (d, p) => (m.devices.get(d) ?? m.panels.get(d))?.ports.get(p);
      if (setup) {
        const [type, a, ap, b, bp] = setup;
        m.select(type);
        m.plugEnd(end(a, ap));
        m.plugEnd(end(b, bp));
      }
      m.toggleTester();
      m.testPort(end(device, port));
    }, [setup, device, port]);
    await wait(700);
    report[name] = await read(page);
    if (OUT && (name === 'croisé PC-switch' || name === 'lien brassé')) {
      fs.mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: `${OUT}/tester-${name.split(' ')[0]}.png` });
    }
    await page.evaluate(() => window.__patchbay.mission().select(null));
  }
  console.log(JSON.stringify(report, null, 1));
  const want = { vide: 'INFO', 'droit PC-switch': 'RÉUSSI', 'croisé PC-switch': 'À REVOIR', 'cordon seul': 'ÉCHEC', 'lien brassé': 'RÉUSSI', 'panneau nu': 'RÉUSSI', console: 'RÉUSSI' };
  const wrong = Object.entries(want).filter(([k, v]) => report[k]?.badge !== v);
  console.log('wrong', wrong, 'errors', errors);
  await browser.close();
  if (wrong.length || errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
