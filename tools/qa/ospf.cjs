// Mission 5: patch the three routers the way a player would, type the OSPF configuration in their consoles, and check
// what the game says (links, neighbours, score). node tools/qa/ospf.cjs [dir] — with a dir, also takes the captures.
const fs = require('fs');
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');

const OUT = process.argv[2];
const CABLES = [
  ['straight', 'R1', 'GigabitEthernet0/1', 'PP-TECH', 'P1'],
  ['straight', 'R2', 'GigabitEthernet0/1', 'PP-TP', 'P1'],
  ['straight', 'R1', 'GigabitEthernet0/2', 'PP-TECH', 'P2'],
  ['straight', 'R3', 'GigabitEthernet0/1', 'PP-ADM', 'P1'],
  ['straight', 'R2', 'GigabitEthernet0/2', 'PP-TP', 'P2'],
  ['straight', 'R3', 'GigabitEthernet0/2', 'PP-ADM', 'P2'],
  ['straight', 'PC1', 'FastEthernet0', 'R1', 'GigabitEthernet0/0'],
  ['straight', 'PC2', 'FastEthernet0', 'R2', 'GigabitEthernet0/0'],
  ['straight', 'PC3', 'FastEthernet0', 'R3', 'GigabitEthernet0/0'],
];

(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 5);
  const report = await page.evaluate((cables) => {
    const m = window.__patchbay.mission();
    const end = (d, p) => (m.devices.get(d) ?? m.panels.get(d))?.ports.get(p);
    const missing = cables.flatMap(([, a, ap, b, bp]) => [[a, ap], [b, bp]]).filter(([d, p]) => !end(d, p)).map((x) => x.join(':'));
    for (const [type, a, ap, b, bp] of cables) {
      m.select(type);
      m.plugEnd(end(a, ap));
      m.plugEnd(end(b, bp));
    }
    m.select(null);
    const links = ['R1:GigabitEthernet0/1', 'R1:GigabitEthernet0/2', 'R2:GigabitEthernet0/2'].map((e) => {
      const [device, port] = e.split(':');
      return `${e} ${m.net.linkState(device, port).protocol}`;
    });
    const commands = m.level.solution.commands;
    for (const [device, lines] of Object.entries(commands)) {
      const cli = m.net.device(device).cli;
      for (const line of lines) cli.execute(line);
    }
    const neighbours = ['R1', 'R2', 'R3'].map((r) => `${r}: ${m.net.ospf.view(r).interfaces.flatMap((i) => i.neighbors.map((n) => `${n.routerId} ${n.state}`)).join(', ')}`);
    const route = m.net.device('R1').cli.execute('show ip route').output.split('\n').filter((l) => l.startsWith('O')).join(' | ');
    const labels = [...m.panels.values()].map((p) => `${p.id}`);
    return { missing, links, cables: m.net.cables.length, cords: m.cords.length, neighbours, route, labels };
  }, CABLES);
  console.log(JSON.stringify(report, null, 1));
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    await hideHud(page);
    const views = {
      'rack-tech': [0, 0.85, Math.PI, -0.22, 0, 3.6],
      'router-tech': [0, 1.05, Math.PI, -0.12, 0, 2.6],
      'rack-lab': [0, -10 + 0.85, Math.PI, -0.22, 0, 3.6],
      'rack-office': [0, 0.85, Math.PI, -0.22, 1, 3.6],
      room: [2.7, 3.0, Math.PI + 0.72, -0.2, 0],
    };
    for (const [name, view] of Object.entries(views)) {
      await go(page, view);
      await wait(1600);
      await page.screenshot({ path: `${OUT}/ospf-${name}.png` });
    }
  }
  console.log('errors', errors);
  await browser.close();
  const bad = report.missing.length || errors.length || report.links.some((l) => !l.endsWith(' up')) || report.neighbours.some((n) => (n.match(/FULL/g) ?? []).length !== 2);
  if (bad) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
