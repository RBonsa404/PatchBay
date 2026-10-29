import type { Cli, Network } from '@patchbay/sim-core';
import { t } from '../i18n.js';
import { h, ui } from './dom.js';

/** The side panel: one at a time (console, PC settings, or a notice). */
let current: HTMLElement | null = null;

export function closePanel(): void {
  current?.remove();
  current = null;
}

function panel(title: string, body: Node[]): HTMLElement {
  closePanel();
  current = h(
    'div',
    { class: 'panel glass', role: 'dialog', 'aria-label': title },
    h('header', {}, h('h3', {}, title), h('button', { class: 'btn small', onclick: closePanel }, t('panel.close'))),
    ...body,
  );
  ui().append(current);
  return current;
}

export function showNotice(title: string, text: string): void {
  panel(title, [h('p', { class: 'notice' }, text)]);
}

/**
 * IOS console of a device. Every device keeps its own scrollback (`screens`), so switching between routers keeps
 * what was typed, and syslog lines that arrive while the console is closed are waiting when it reopens.
 */
export class Consoles {
  private readonly screens = new Map<string, string[]>();
  private readonly connected = new Set<string>();
  private readonly history = new Map<string, string[]>();
  private refresh: (() => void) | null = null;

  constructor(private readonly net: Network, private readonly onCommand: () => void) {}

  append(deviceId: string, lines: string[]): void {
    if (lines.length === 0) return;
    this.screens.set(deviceId, [...(this.screens.get(deviceId) ?? []), ...lines]);
    this.refresh?.();
  }

  /** Pick up syslog lines queued on every device (a neighbour went down, a cable was plugged…). */
  collectSyslog(): void {
    for (const device of this.net.devices.values()) {
      if (device.cli) this.append(device.id, device.cli.drainSyslog());
    }
  }

  open(deviceId: string, via: string): void {
    const cli = this.net.device(deviceId).cli as Cli;
    if (!this.connected.has(deviceId)) {
      this.connected.add(deviceId);
      const r = cli.connect();
      if (r.output) this.append(deviceId, r.output.split('\n'));
    }
    const screen = h('pre', { 'aria-live': 'polite' });
    const prompt = h('span', { class: 'prompt' });
    const input: HTMLInputElement = h('input', { 'aria-label': 'Commande', spellcheck: 'false', autocomplete: 'off' });
    let position = 0;

    const paint = (): void => {
      screen.textContent = (this.screens.get(deviceId) ?? []).join('\n');
      screen.scrollTop = screen.scrollHeight;
      prompt.textContent = cli.prompt;
    };
    this.refresh = paint;

    const run = (line: string, raw = false): void => {
      const before = cli.prompt;
      const hidden = input.type === 'password';
      const r = cli.execute(line);
      this.append(deviceId, [before + (hidden ? '' : line), ...(r.output ? r.output.split('\n') : [])]);
      input.type = r.hiddenInput ? 'password' : 'text';
      if (!raw && line.trim() && !hidden) {
        const list = [...(this.history.get(deviceId) ?? []), line];
        this.history.set(deviceId, list);
        position = list.length;
      }
      this.collectSyslog();
      this.onCommand();
      paint();
    };

    const form = h(
      'form',
      {
        onsubmit: (e: Event) => {
          e.preventDefault();
          const line = input.value;
          input.value = '';
          run(line);
        },
      },
      prompt,
      input,
    );
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === '?' && input.type !== 'password') {
        e.preventDefault();
        const r = cli.execute(`${input.value}?`);
        this.append(deviceId, [cli.prompt + input.value + '?', ...(r.output ? r.output.split('\n') : [])]);
        paint();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const done = cli.complete(input.value);
        if (done !== null) input.value = done;
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const list = this.history.get(deviceId) ?? [];
        position = Math.max(0, Math.min(list.length, position + (e.key === 'ArrowUp' ? -1 : 1)));
        input.value = list[position] ?? '';
      }
      e.stopPropagation(); // keep camera shortcuts away while typing
    });

    const el = panel(`${t('panel.consoleOf')} ${deviceId} · ${via}`, [
      h('div', { class: 'terminal', onclick: () => input.focus() }, screen, form),
      h('div', { class: 'help' }, t('panel.help')),
    ]);
    el.addEventListener('remove', () => (this.refresh = null));
    paint();
    input.focus();
  }
}

/** IP settings and ping of a PC, plus a shortcut to the console it is cabled to. */
export function showHostPanel(net: Network, deviceId: string, onChange: () => void, openConsole: (() => void) | null): void {
  const host = net.device(deviceId).host ?? {};
  const field = (label: string, value: string | undefined): [HTMLElement, HTMLInputElement] => {
    const input: HTMLInputElement = h('input', { value: value ?? '', spellcheck: 'false', inputmode: 'decimal' });
    return [h('label', { class: 'field' }, h('span', {}, label), input), input];
  };
  const [ipRow, ip] = field(t('host.ip'), host.ip);
  const [maskRow, mask] = field(t('host.mask'), host.mask);
  const [gwRow, gw] = field(t('host.gateway'), host.gateway);
  const [dstRow, dst] = field(t('host.pingTo'), '');
  const output = h('div', { class: 'cmd-output' });

  const apply = (): void => {
    const settings: { ip?: string; mask?: string; gateway?: string; services?: { tcp?: number[]; udp?: number[] } } = {};
    if (ip.value.trim()) settings.ip = ip.value.trim();
    if (mask.value.trim()) settings.mask = mask.value.trim();
    if (gw.value.trim()) settings.gateway = gw.value.trim();
    if (host.services) settings.services = host.services;
    try {
      net.configureHost(deviceId, settings);
      output.textContent = t('host.applied');
      onChange();
    } catch (err) {
      output.textContent = (err as Error).message;
    }
  };
  const ping = (): void => {
    const target = dst.value.trim();
    if (!target) return;
    const r = net.ping(deviceId, target, 4);
    const lost = r.sent - r.received;
    output.textContent = [
      `${t('host.pingSending')} ${target}`,
      '',
      r.symbols,
      '',
      t('host.pingStats', { sent: r.sent, received: r.received, lost }),
      '',
      t('host.pingLegend'),
    ].join('\n');
    onChange();
  };
  dst.addEventListener('keydown', (e) => e.key === 'Enter' && ping());

  panel(`${t('host.title')} ${deviceId}`, [
    ipRow,
    maskRow,
    gwRow,
    h('div', { class: 'title-actions', style: { justifyContent: 'flex-start' } }, h('button', { class: 'btn small', onclick: apply }, t('host.apply')), openConsole ? h('button', { class: 'btn small', onclick: openConsole }, t('host.openConsole')) : null),
    h('div', { style: { height: '14px' } }),
    dstRow,
    h('button', { class: 'btn small primary', onclick: ping }, t('host.ping')),
    output,
  ]);
}
