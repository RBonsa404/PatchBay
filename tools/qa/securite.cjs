// Mission 7: plug the console cable, type R1's hardening in its console, then test from the student and teacher PCs
// with the same commands a player would type (curl, ssh, telnet). node tools/qa/securite.cjs [dir]
const fs = require('fs');
const { open, startMission, go, hideHud, wait } = require('./lib.cjs');

const OUT = process.argv[2];

(async () => {
  const { browser, page, errors } = await open();
  await startMission(page, 7);
  const report = await page.evaluate(() => {
    const m = window.__patchbay.mission();
    const end = (d, p) => m.devices.get(d)?.ports.get(p);
    const missing = [['ADMIN', 'RS232'], ['R1', 'Console']].filter(([d, p]) => !end(d, p)).map((x) => x.join(':'));
    m.select('console');
    m.plugEnd(end('ADMIN', 'RS232'));
    m.plugEnd(end('R1', 'Console'));
    m.select(null);
    const before = { ssh: m.net.tcpConnect('PC1', '192.168.10.10', 22), telnet: m.net.tcpConnect('PC1', '192.168.20.1', 23) };
    const cli = m.net.device('R1').cli;
    for (const line of m.level.solution.commands.R1) cli.execute(line);
    return {
      missing,
      console: m.net.consoleTarget('ADMIN')?.id ?? null,
      before,
      after: {
        web: m.net.tcpConnect('PC1', '192.168.10.10', 80),
        ssh: m.net.tcpConnect('PC1', '192.168.10.10', 22),
        telnetStudent: m.net.tcpConnect('PC1', '192.168.20.1', 23),
        telnetProf: m.net.tcpConnect('PROF', '192.168.10.1', 23),
      },
      acl: cli.execute('show access-lists').output,
    };
  });
  console.log(JSON.stringify(report, null, 1));
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    await hideHud(page);
    const views = { bench: [-0.2, 1.1, Math.PI - 0.5, -0.55, 0, 1.6], room: [2.7, 3.0, Math.PI + 0.72, -0.2, 0], rack: [0, 1.05, Math.PI, -0.12, 0, 2.6] };
    for (const [name, view] of Object.entries(views)) {
      await go(page, view);
      await wait(1600);
      await page.screenshot({ path: `${OUT}/securite-${name}.png` });
    }
  }
  console.log('errors', errors);
  await browser.close();
  const a = report.after;
  const ok = !report.missing.length && !errors.length && report.console === 'R1' && report.before.ssh === 'open' && a.web === 'open' && a.ssh === 'unreachable' && a.telnetStudent === 'refused' && a.telnetProf === 'open';
  if (!ok) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
