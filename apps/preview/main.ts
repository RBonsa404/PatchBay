import type { Network } from '../../packages/sim-core/src/index.js';
import { build, scenarios, type Scenario } from './scenarios.js';

const $ = <T extends Element = HTMLElement>(id: string): T => document.getElementById(id) as unknown as T;
const SVG = 'http://www.w3.org/2000/svg';

let scenario: Scenario = scenarios[0] as Scenario;
let net: Network;
let active = '';
const screens = new Map<string, string[]>();
const connected = new Set<string>();
const history = new Map<string, string[]>();
let historyPos = 0;
let hidden = false;

const isIos = (id: string): boolean => !!net.device(id).cli;
const log = (id: string, ...lines: string[]): void => {
  const buf = screens.get(id) ?? [];
  buf.push(...lines);
  screens.set(id, buf);
};

function start(s: Scenario): void {
  scenario = s;
  net = build(s);
  screens.clear();
  connected.clear();
  history.clear();
  active = s.nodes.find((n) => n.model !== 'pc')?.id ?? s.nodes[0]!.id;
  $('brief').textContent = s.brief;
  renderAll();
  select(active);
}

// ---- topology ---------------------------------------------------------------------------------------------------

function linkClass(a: { device: string; port: string }, b: { device: string; port: string }): string {
  const up = (e: { device: string; port: string }): boolean =>
    isIos(e.device) ? net.linkState(e.device, e.port).status === 'up' : net.hostLinkUp(e);
  const shut = [a, b].some((e) => isIos(e.device) && net.linkState(e.device, e.port).status === 'administratively down');
  return up(a) && up(b) ? 'up' : shut ? 'shut' : 'down';
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const short = (p: string): string => p.replace('FastEthernet', 'Fa').replace('GigabitEthernet', 'Gi').replace('Serial', 'S');

function renderTopology(): void {
  const svg = $<SVGSVGElement>('topo');
  svg.replaceChildren();
  const at = (id: string) => scenario.nodes.find((n) => n.id === id)!;

  for (const c of scenario.cables) {
    const a = { device: c.a[0], port: c.a[1] };
    const b = { device: c.b[0], port: c.b[1] };
    const p = at(a.device);
    const q = at(b.device);
    svg.append(el('line', { x1: String(p.x), y1: String(p.y), x2: String(q.x), y2: String(q.y), class: `link ${linkClass(a, b)}` }));
    for (const [e, from, to] of [[a, p, q], [b, q, p]] as const) {
      const t = 0.3;
      svg.append(el('text', { x: String(from.x + (to.x - from.x) * t), y: String(from.y + (to.y - from.y) * t - 6), class: 'port', 'text-anchor': 'middle' }, short(e.port)));
    }
    const mid = el('text', { x: String((p.x + q.x) / 2), y: String((p.y + q.y) / 2 + 14), class: 'cable', 'text-anchor': 'middle' }, c.type === 'serial' ? 'série' : c.type === 'crossover' ? 'croisé' : 'droit');
    svg.append(mid);
  }

  for (const n of scenario.nodes) {
    const g = el('g', { class: `node ${n.id === active ? 'active' : ''}`, tabindex: '0', role: 'button', 'aria-label': n.id });
    const kind = n.model === 'pc' ? 'pc' : n.model.startsWith('catalyst') ? 'sw' : 'rt';
    g.append(el('rect', { x: String(n.x - 34), y: String(n.y - 22), width: '68', height: '44', rx: '8', class: `box ${kind}` }));
    g.append(el('text', { x: String(n.x), y: String(n.y + 5), 'text-anchor': 'middle', class: 'name' }, n.id));
    const sub = n.model === 'pc' ? net.device(n.id).host?.ip ?? '' : net.device(n.id).cli!.config.hostname !== n.id ? net.device(n.id).cli!.config.hostname : '';
    if (sub) g.append(el('text', { x: String(n.x), y: String(n.y + 38), 'text-anchor': 'middle', class: 'sub' }, sub));
    g.addEventListener('click', () => select(n.id));
    g.addEventListener('keydown', (ev) => ev.key === 'Enter' && select(n.id));
    svg.append(g);
  }
}

// ---- terminal ---------------------------------------------------------------------------------------------------

function renderTabs(): void {
  const tabs = $('tabs');
  tabs.replaceChildren();
  for (const n of scenario.nodes) {
    const b = document.createElement('button');
    b.textContent = n.id;
    b.className = n.id === active ? 'tab on' : 'tab';
    b.addEventListener('click', () => select(n.id));
    tabs.append(b);
  }
}

function select(id: string): void {
  active = id;
  const ios = isIos(id);
  $('terminal').hidden = !ios;
  $('host').hidden = ios;
  if (ios && !connected.has(id)) {
    connected.add(id);
    const r = net.device(id).cli!.connect();
    if (r.output) log(id, ...r.output.split('\n'));
  }
  if (!ios) fillHost();
  renderAll();
  if (ios) $<HTMLInputElement>('cmd').focus();
}

function paint(): void {
  const cli = net.device(active).cli;
  if (!cli) return;
  const screen = $('screen');
  screen.textContent = (screens.get(active) ?? []).join('\n');
  screen.scrollTop = screen.scrollHeight;
  const last = cli.execute === undefined ? '' : cli.prompt;
  $('prompt').textContent = last;
  $<HTMLInputElement>('cmd').type = hidden ? 'password' : 'text';
}

function flushSyslog(): void {
  for (const n of scenario.nodes) {
    if (!isIos(n.id)) continue;
    const lines = net.device(n.id).cli!.drainSyslog();
    if (lines.length > 0) log(n.id, ...lines);
  }
}

function submit(line: string, raw = false): void {
  const cli = net.device(active).cli!;
  const prompt = cli.prompt;
  const wasHidden = hidden;
  const r = cli.execute(line);
  log(active, prompt + (wasHidden ? '' : line));
  if (r.output) log(active, ...r.output.split('\n'));
  hidden = r.hiddenInput;
  if (!raw && line.trim() && !wasHidden) {
    const h = history.get(active) ?? [];
    h.push(line);
    history.set(active, h);
    historyPos = h.length;
  }
  flushSyslog();
  renderAll();
}

function renderAll(): void {
  renderTabs();
  renderTopology();
  paint();
}

// ---- host (PC) panel --------------------------------------------------------------------------------------------

function fillHost(): void {
  const h = net.device(active).host ?? {};
  $('host-title').textContent = active;
  $<HTMLInputElement>('h-ip').value = h.ip ?? '';
  $<HTMLInputElement>('h-mask').value = h.mask ?? '';
  $<HTMLInputElement>('h-gw').value = h.gateway ?? '';
  $('h-out').textContent = '';
}

// ---- wiring -----------------------------------------------------------------------------------------------------

const cmd = $<HTMLInputElement>('cmd');
$('form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const line = cmd.value;
  cmd.value = '';
  submit(line);
});
cmd.addEventListener('keydown', (ev) => {
  const cli = net.device(active).cli!;
  if (ev.key === '?' && !hidden) {
    ev.preventDefault();
    const out = cli.execute(`${cmd.value}?`);
    log(active, cli.prompt + cmd.value + '?', ...(out.output ? out.output.split('\n') : []));
    paint();
  } else if (ev.key === 'Tab') {
    ev.preventDefault();
    const done = cli.complete(cmd.value);
    if (done !== null) cmd.value = done;
  } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
    ev.preventDefault();
    const h = history.get(active) ?? [];
    historyPos = Math.min(h.length, Math.max(0, historyPos + (ev.key === 'ArrowUp' ? -1 : 1)));
    cmd.value = h[historyPos] ?? '';
  }
});

$('apply').addEventListener('click', () => {
  net.configureHost(active, {
    ip: $<HTMLInputElement>('h-ip').value || undefined,
    mask: $<HTMLInputElement>('h-mask').value || undefined,
    gateway: $<HTMLInputElement>('h-gw').value || undefined,
  } as never);
  renderAll();
});
$('ping').addEventListener('click', () => {
  const dst = $<HTMLInputElement>('h-dst').value.trim();
  const r = net.ping(active, dst);
  $('h-out').textContent = `Envoi de ${r.sent} requêtes vers ${dst}\n${r.symbols}\nRéussite : ${Math.floor((r.received * 100) / r.sent)} % (${r.received}/${r.sent})\n(! réponse, . perdu, U inaccessible, & TTL dépassé)`;
  flushSyslog();
  renderAll();
});

const select_ = $<HTMLSelectElement>('scenario');
for (const s of scenarios) select_.add(new Option(s.title, s.id));
select_.addEventListener('change', () => start(scenarios.find((s) => s.id === select_.value) as Scenario));
$('reset').addEventListener('click', () => start(scenario));

start(scenario);
