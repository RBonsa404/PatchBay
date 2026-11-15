// « Ma classe » : a teacher opens a class and gives homework, a student joins it, hands in a result, the board shows it.
// Needs the Worker for /api (npx wrangler dev) behind the dev server's proxy (PATCHBAY_API), and the game running.
// Usage : node tools/qa/classe.cjs [dossier]
const fs = require('fs');
const { open, wait } = require('./lib.cjs');

const out = process.argv[2] || 'art/qa/classe';
fs.mkdirSync(out, { recursive: true });

(async () => {
  const teacher = await open();
  const t = teacher.page;
  await t.click('.menu-item:has-text("Ma classe")');
  await t.waitForSelector('.class-grid');
  await wait(600);
  await t.screenshot({ path: `${out}/1-accueil.png` });

  await t.fill('input[name="class"]', 'Licence 2 Réseaux, groupe B');
  await t.fill('input[name="teacher"]', 'M. Ouédraogo');
  await t.click('form:has(input[name="class"]) button[type="submit"]');
  await t.waitForSelector('.class-reveal');
  await wait(600);
  await t.screenshot({ path: `${out}/2-cle.png` });
  const code = (await t.textContent('.class-secret b')).trim();

  await t.click('.dossier footer .btn.primary');
  await t.waitForSelector('.class-board');
  await t.waitForSelector('.class-board .class-empty');
  await t.click('.class-body details summary');
  await t.check('.class-assign-row:nth-child(1) label:nth-of-type(1) input');
  await t.check('.class-assign-row:nth-child(4) label:nth-of-type(1) input');
  await t.check('.class-assign-row:nth-child(7) label:nth-of-type(2) input');
  await t.fill('.class-assign-row:nth-child(7) input[type="date"]', '2030-12-01');
  await t.click('.class-assign-foot .btn');
  await t.waitForFunction(() => /Devoirs enregistrés/.test(document.querySelector('.class-body > p.small')?.textContent ?? ''));

  const student = await open();
  const s = student.page;
  await s.click('.menu-item:has-text("Ma classe")');
  await s.waitForSelector('.class-grid');
  await s.fill('input[name="code"]', code.toLowerCase());
  await s.fill('input[name="name"]', 'Awa Traoré');
  await s.click('form:has(input[name="name"]) button[type="submit"]');
  await s.waitForSelector('.class-task');
  // A finished first mission, as the game hands it in.
  const sent = await s.evaluate(async () => {
    const { classroom } = await import('/src/game/classroom.ts');
    return classroom.report('l01-cablage-console', false, { total: 86, rank: 'B', used: 312, limit: 600, tidiness: { score: 92 } });
  });
  await s.click('.dossier footer .btn:has-text("Actualiser")');
  await wait(1200);
  await s.screenshot({ path: `${out}/3-devoirs.png` });
  // The homework given as an exam opens a briefing that starts only as an exam, and leads back to the class.
  await s.click('.class-task:nth-child(3) .btn');
  await s.waitForSelector('.dossier .check-list');
  await wait(700);
  await s.screenshot({ path: `${out}/3b-examen.png` });
  const examStart = await s.textContent('.dossier footer .btn.primary');
  await s.click('.dossier footer .btn.ghost');
  await s.waitForSelector('.class-task');
  console.log(JSON.stringify({ examStart }));
  await s.click('.dossier footer .btn:has-text("Retour")');
  await s.waitForSelector('.menu-item');
  await wait(600);
  await s.screenshot({ path: `${out}/4-titre.png` });

  await t.click('.class-body details summary');
  await t.click('.dossier footer .btn:has-text("Actualiser")');
  await t.waitForSelector('.class-board td.mark b');
  await wait(600);
  await t.screenshot({ path: `${out}/5-tableau.png` });
  const row = await t.textContent('.class-board tbody tr');

  await s.setViewportSize({ width: 390, height: 844 });
  await s.click('.menu-item:has-text("Ma classe")');
  await s.waitForSelector('.class-task');
  await wait(900);
  await s.screenshot({ path: `${out}/6-telephone.png` });

  console.log(JSON.stringify({ code, sent, row, errors: [...teacher.errors, ...student.errors] }));
  await teacher.browser.close();
  await student.browser.close();
})();
