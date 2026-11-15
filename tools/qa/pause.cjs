// The pause menu and the settings screen: Escape pauses and stops the clock, settings open from title and pause.
const { open, startMission, wait } = require('./lib.cjs');

(async () => {
  const { browser, page, errors } = await open();
  await page.click('.menu-item:nth-child(3)');
  await page.waitForSelector('.settings-card');
  await page.screenshot({ path: 'art/qa/settings.png' });
  await page.click('.settings-card .btn.primary');
  await page.waitForSelector('.menu-item');
  await startMission(page, 1);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.pause-card');
  const t0 = await page.textContent('.hud-timer');
  await wait(2500);
  const t1 = await page.textContent('.hud-timer');
  await page.screenshot({ path: 'art/qa/pause.png' });
  await page.click('.pause-card .menu-item.primary');
  await wait(2500);
  const t2 = await page.textContent('.hud-timer');
  console.log(JSON.stringify({ paused: t0 === t1, runsAgain: t1 !== t2, t0, t1, t2, errors }));
  await browser.close();
})();
