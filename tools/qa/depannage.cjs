// Mission 9: find the five faults the way a player would fix them (swap the crossover cable, PC2's gateway, R1's
// clock and NAT, R2's area), and check every ticket closes. node tools/qa/depannage.cjs [dir]
const fs = require('fs');
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');

const OUT = process.argv[2];

(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 9);
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    await hideHud(page);
    await go(page, [-0.2, 1.1, Math.PI - 0.5, -0.55, 0, 1.6]);
    await wait(1600);
    await page.screenshot({ path: `${OUT}/depannage-avant.png` });
  }
  const report = await page.evaluate(() => {
    const m = window.__patchbay.mission();
    const end = (d, p) => m.devices.get(d)?.ports.get(p);
    const link = () => m.net.hostLinkUp({ device: 'PC1', port: 'FastEthernet0' });
    const before = link();
    m.unplug(end('PC1', 'FastEthernet0'));
    m.select('straight');
    m.plugEnd(end('PC1', 'FastEthernet0'));
    m.plugEnd(end('S1', 'FastEthernet0/1'));
    m.select(null);
    m.net.configureHost('PC2', m.level.solution.hosts.PC2);
    for (const id of ['R1', 'R2']) for (const line of m.level.solution.commands[id]) m.net.device(id).cli.execute(line);
    return {
      pc1Before: before,
      pc1After: link(),
      wan: m.net.linkState('R2', 'Serial0/0/0').protocol,
      pc1: m.net.ping('PC1', '203.0.113.1').received,
      campus: m.net.ping('PC2', '192.168.10.10').received,
      internet: m.net.ping('PC2', '203.0.113.1').received,
    };
  });
  console.log(JSON.stringify(report, null, 1));
  if (OUT) {
    await wait(800);
    await page.screenshot({ path: `${OUT}/depannage-apres.png` });
    await go(page, [2.7, 3.0, Math.PI + 0.72, -0.2, 0]);
    await wait(1600);
    await page.screenshot({ path: `${OUT}/depannage-room.png` });
  }
  console.log('errors', errors);
  await browser.close();
  if (errors.length || report.pc1Before || !report.pc1After || report.wan !== 'up' || !report.pc1 || !report.campus || !report.internet) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
