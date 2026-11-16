// CPU profile of two seconds in one place, summed by function (self time): node tools/qa/cpu.cjs [place]
const { open, startMission, go, wait } = require('./lib.cjs');
const VIEWS = { lab: [-0.6, -4.4, Math.PI - 0.35, -0.18, 0, 0.82], corridor: [0.5, -2.84, -Math.PI / 2, 0.02, 0, 0.82], 'data centre': [3.6, 800.8, -0.3, -0.05, 0, 0.82] };
(async () => {
  const { browser, page } = await open({ uncapped: true });
  await startMission(page, 4);
  await page.evaluate(() => window.__patchbay.stage.chooseQuality('medium'));
  await go(page, VIEWS[process.argv[2] || 'lab']);
  await wait(800);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await page.evaluate(() => { const s = window.__patchbay.stage; window.__keep = setInterval(() => s.wake(), 50); });
  await cdp.send('Profiler.start');
  await wait(2500);
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); });
  const total = [...self.values()].reduce((a, b) => a + b, 0);
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log((v / total * 100).toFixed(1).padStart(5) + '%', k);
  await browser.close();
})();
