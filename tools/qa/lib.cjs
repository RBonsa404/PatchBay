// Shared helpers for the visual and gameplay checks: Edge without a window, driven by playwright-core.
// The game must be running (npm run dev -w @patchbay/web, port 5180), or pass another address in QA_URL.
const { chromium } = require('playwright-core');

const URL = process.env.QA_URL || 'http://127.0.0.1:5180/';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open({ width = 1600, height = 900, soft = false, uncapped = false } = {}) {
  const args = soft ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'];
  if (uncapped) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  const browser = await chromium.launch({ executablePath: EDGE, headless: true, args });
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('patchbay.tutorial.done', 'l01-cablage-console');
  });
  await page.reload();
  await page.waitForSelector('.menu-item');
  await page.waitForFunction(() => !document.getElementById('boot'));
  return { browser, page, errors };
}

/** Start mission `n` (1-based) from the missions screen and wait until it is on screen. */
async function startMission(page, n, exam = false) {
  await page.click('.menu-item:has-text("Parcours")');
  await wait(500);
  await page.click(`.mission-row[data-mission="${n}"]`);
  await wait(500);
  await page.click(exam ? '.dossier footer .btn:not(.primary)' : '.dossier footer .btn.primary');
  await page.waitForSelector('.hud-timer');
  await page.waitForFunction(() => !document.getElementById('boot') && document.querySelectorAll('#boot').length === 0);
  await wait(4500);
}

/** Put the player somewhere and look a given way: [x, z, yaw, pitch, upstairs, zoom]. */
function go(page, [x, z, yaw, pitch, floor = 0, zoom = 0.82]) {
  return page.evaluate(([x, z, yaw, pitch, floor, zoom]) => {
    const m = window.__patchbay.mission();
    m.buildEverything?.();
    const p = m.player;
    Object.assign(p, { x, z, yaw, pitch, floor });
    p.y = floor ? 3.3 : 0;
    m.zoom = zoom;
    m.followZone();
    window.__patchbay.stage.wake();
  }, [x, z, yaw, pitch, floor, zoom]);
}

function hideHud(page) {
  return page.addStyleTag({ content: '.hud-top,.objectives,.inventory,.toasts,.hud-timer,.mission-banner,.coach{display:none!important}' });
}

/** Frames drawn per second over `ms`, keeping the game awake as if the player were moving. */
function fps(page, ms = 2000) {
  return page.evaluate((ms) => new Promise((res) => {
    const s = window.__patchbay.stage;
    let n = 0;
    const stop = s.onFrame(() => { n++; s.wake(); });
    setTimeout(() => { stop(); res(Math.round(n / (ms / 1000))); }, ms);
  }), ms);
}

module.exports = { open, startMission, go, hideHud, fps, wait, URL };
