// Mission 8: cable the leased line (DCE at the campus) and the branch PC, type both routers' configuration in their
// consoles, then check OSPF across areas and the shared Internet access. node tools/qa/site-distant.cjs [dir]
const fs = require('fs');
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');

const OUT = process.argv[2];
const CABLES = [
  ['serial', 'R1', 'Serial0/0/1', 'R2', 'Serial0/0/0'],
  ['crossover', 'PC2', 'FastEthernet0', 'R2', 'FastEthernet0/0'],
];

(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 8);
  const report = await page.evaluate((cables) => {
    const m = window.__patchbay.mission();
    const end = (d, p) => m.devices.get(d)?.ports.get(p);
    const missing = cables.flatMap(([, a, ap, b, bp]) => [[a, ap], [b, bp]]).filter(([d, p]) => !end(d, p)).map((x) => x.join(':'));
    for (const [type, a, ap, b, bp] of cables) {
      m.select(type);
      m.plugEnd(end(a, ap));
      m.plugEnd(end(b, bp));
    }
    m.select(null);
    for (const id of ['R1', 'R2']) for (const line of m.level.solution.commands[id]) m.net.device(id).cli.execute(line);
    const routes = m.net.device('R2').cli.execute('show ip route').output;
    return {
      missing,
      wan: m.net.linkState('R2', 'Serial0/0/0').protocol,
      ia: /O IA\s+192\.168\.10\.0/.test(routes),
      e2: /O\*E2\s+0\.0\.0\.0/.test(routes),
      campus: m.net.ping('PC2', '192.168.10.10').received,
      internet: m.net.ping('PC2', '203.0.113.1').received,
      routes,
    };
  }, CABLES);
  console.log(JSON.stringify(report, null, 1));
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    await hideHud(page);
    const views = { bench: [-0.2, 1.1, Math.PI - 0.5, -0.55, 0, 1.6], room: [2.7, 3.0, Math.PI + 0.72, -0.2, 0], rack: [0, 1.05, Math.PI, -0.12, 0, 2.6] };
    for (const [name, view] of Object.entries(views)) {
      await go(page, view);
      await wait(1600);
      await page.screenshot({ path: `${OUT}/site-distant-${name}.png` });
    }
  }
  console.log('errors', errors);
  await browser.close();
  if (report.missing.length || errors.length || report.wan !== 'up' || !report.ia || !report.e2 || !report.campus || !report.internet) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
