import { t, type Key } from '../i18n.js';
import { cordText } from '../game/cabling.js';
import type { CableTest } from '../game/tester.js';
import { panel } from './panels.js';
import { h } from './dom.js';

/** T568B colours of pins 1 to 8: white-orange, orange, white-green, blue, white-blue, green, white-brown, brown. */
const PIN_COLOUR = ['#fdba74', '#f97316', '#86efac', '#3b82f6', '#93c5fd', '#16a34a', '#d6b48a', '#92400e'];
const STRIPED = new Set([0, 2, 4, 6]);
const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** The tester's screen: pins 1-8 here on the left, at the remote unit on the right, a wire for each continuity. */
function wiremapDrawing(map: (number | null)[]): SVGSVGElement {
  const row = 17;
  const top = 18;
  const [x0, x1] = [34, 206];
  const root = svg('svg', { viewBox: `0 0 240 ${top + row * 8}`, class: 'wiremap', role: 'img', 'aria-label': t('tester.wiremap') });
  const head = (x: number, key: Key): void => {
    const label = svg('text', { x, y: 10, 'text-anchor': 'middle', class: 'wm-head' });
    label.textContent = t(key);
    root.append(label);
  };
  head(x0, 'tester.near');
  head(x1, 'tester.far');
  map.forEach((far, i) => {
    const y = top + i * row;
    const colour = PIN_COLOUR[i] as string;
    if (far === null) {
      // No continuity: a stub that stops short, and a cross where the wire breaks.
      root.append(svg('line', { x1: x0 + 8, y1: y, x2: 96, y2: y, stroke: colour, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      root.append(svg('path', { d: `M100 ${y - 4}l8 8m0 -8l-8 8`, stroke: '#ef4444', 'stroke-width': 2 }));
    } else {
      const y2 = top + (far - 1) * row;
      root.append(svg('path', { d: `M${x0 + 8} ${y}C120 ${y} 120 ${y2} ${x1 - 8} ${y2}`, fill: 'none', stroke: colour, 'stroke-width': 3, 'stroke-linecap': 'round' }));
      if (STRIPED.has(i)) root.append(svg('path', { d: `M${x0 + 8} ${y}C120 ${y} 120 ${y2} ${x1 - 8} ${y2}`, fill: 'none', stroke: '#f8fafc', 'stroke-width': 3, 'stroke-dasharray': '3 5' }));
    }
    for (const [x, pin] of [[x0, i + 1], [x1, i + 1]] as const) {
      root.append(svg('circle', { cx: x, cy: y, r: 6.5, class: 'wm-pin' }));
      const n = svg('text', { x, y: y + 3.5, 'text-anchor': 'middle', class: 'wm-num' });
      n.textContent = String(pin);
      root.append(n);
    }
  });
  return root;
}

/** Advice that judges the cable against its two ports: left out of an exam, where that is the student's job. */
const JUDGED = new Set(['ok', 'autoMdix', 'autoMdixStraight', 'needCrossover', 'needStraight']);

/** Show what the tester read at `where` (« R1 · GigabitEthernet0/1 »). `to` names the far panel of a building cable. */
export function showTester(where: string, test: CableTest, exam: boolean, to = ''): void {
  const verdict = exam && JUDGED.has(test.reason) ? 'info' : test.verdict;
  const badge = exam && JUDGED.has(test.reason) ? t('tester.measured') : t(`tester.${verdict}` as Key);
  const length = test.length !== undefined ? cordText(test.length) : null;
  const screen = h(
    'div',
    { class: `tester-screen ${verdict}` },
    h('div', { class: 'tester-top' }, h('span', { class: 'tester-brand' }, 'LINK·TEST'), h('span', { class: `tester-badge ${verdict}` }, badge)),
    h('strong', { class: 'tester-kind' }, t(`tester.kind.${test.kind}` as Key)),
    test.wiremap.length ? wiremapDrawing(test.wiremap) : null,
    length ? h('div', { class: 'tester-length' }, h('span', {}, t(test.kind === 'open' ? 'tester.openAt' : 'tester.length')), h('b', {}, length)) : null,
  );
  const advice = exam && JUDGED.has(test.reason) ? null : h('p', { class: 'tester-advice' }, t(`tester.reason.${test.reason}` as Key, { to }));
  const el = panel(`${t('tester.name')} · ${where}`, [screen, advice ?? h('p', { class: 'tester-advice muted' }, t('tester.examNote'))], 'tester');
  el.classList.add('tester-panel');
}
