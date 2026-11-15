// Mission 6: cable the club's Internet access the way a player would (the DCE end of the serial cable first, at the
// ISP), type R1's configuration in its console, and check what the game says. node tools/qa/internet.cjs [dir]
const fs = require('fs');
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');

const OUT = process.argv[2];
const CABLES = [
  ['serial', 'FAI', 'Serial0/0/0', 'R1', 'Serial0/0/0'],
  ['straight', 'S1', 'GigabitEthernet0/1', 'R1', 'GigabitEthernet0/0'],
  ['straight', 'PC1', 'FastEthernet0', 'S1', 'FastEthernet0/1'],
  ['straight', 'SRV', 'FastEthernet0', 'S1', 'FastEthernet0/2'],
];

(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 6);
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
    const cli = m.net.device('R1').cli;
    for (const line of m.level.solution.commands.R1) cli.execute(line);
    m.net.dhcpRenew('PC1');
    return {
      missing,
      serial: m.net.linkState('R1', 'Serial0/0/0').protocol,
      pc1: m.net.device('PC1').host.ip,
      web: m.net.tcpConnect('PC1', '203.0.113.10', 80),
      published: m.net.tcpConnect('EXT', '198.51.100.5', 80),
      nat: cli.execute('show ip nat translations').output.split('\n').length - 1,
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
      await page.screenshot({ path: `${OUT}/internet-${name}.png` });
    }
  }
  console.log('errors', errors);
  await browser.close();
  if (report.missing.length || errors.length || report.serial !== 'up' || report.web !== 'open' || report.published !== 'open') process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
