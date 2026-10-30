import { runHostCommand, SHELL_PROMPT, type Cli, type Network, type ShellResult } from '@patchbay/sim-core';
import { t } from '../i18n.js';
import { h, ui } from './dom.js';

/** The side panel: one at a time (console, PC settings, or a notice). */
let current: HTMLElement | null = null;
let currentKey: string | null = null;

/** What the side panel shows: `console:R1`, `host:PC1`, `notice`, or null when closed. */
export const openPanelKey = (): string | null => currentKey;

/** Wraps an action whose traffic the game animates (a console command, a ping from a PC). */
export type Around = (action: () => void) => void;

export function closePanel(): void {
  current?.remove();
  current = null;
  currentKey = null;
}

export function panel(title: string, body: Node[], key = 'notice'): HTMLElement {
  closePanel();
  currentKey = key;
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

  constructor(private readonly net: Network, private readonly onCommand: () => void, private readonly around: Around = (a) => a()) {}

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
      let output = '';
      let hiddenNext = false;
      this.around(() => {
        const r = cli.execute(line);
        output = r.output;
        hiddenNext = r.hiddenInput;
      });
      this.append(deviceId, [before + (hidden ? '' : line), ...(output ? output.split('\n') : [])]);
      input.type = hiddenNext ? 'password' : 'text';
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
    ], `console:${deviceId}`);
    el.addEventListener('remove', () => (this.refresh = null));
    paint();
    input.focus();
  }
}

/** Scrollback and history of each PC's command prompt, kept while the mission lasts. */
const hostScreens = new Map<string, string[]>();
const hostHistory = new Map<string, string[]>();

/** Forget the PCs' prompts (a new mission starts). */
export function resetHostShells(): void {
  hostScreens.clear();
  hostHistory.clear();
}

/** IP settings and command prompt of a PC, plus a shortcut to the console it is cabled to. */
export function showHostPanel(net: Network, deviceId: string, onChange: () => void, openConsole: (() => void) | null, around: Around = (a) => a()): void {
  const host = net.device(deviceId).host ?? {};
  const field = (label: string, value: string | undefined): [HTMLElement, HTMLInputElement] => {
    const input: HTMLInputElement = h('input', { value: value ?? '', spellcheck: 'false', inputmode: 'decimal' });
    return [h('label', { class: 'field' }, h('span', {}, label), input), input];
  };
  const [ipRow, ip] = field(t('host.ip'), host.ip);
  const [maskRow, mask] = field(t('host.mask'), host.mask);
  const [gwRow, gw] = field(t('host.gateway'), host.gateway);
  const status = h('div', { class: 'help' });

  const apply = (): void => {
    const settings: { ip?: string; mask?: string; gateway?: string; services?: { tcp?: number[]; udp?: number[] } } = {};
    if (ip.value.trim()) settings.ip = ip.value.trim();
    if (mask.value.trim()) settings.mask = mask.value.trim();
    if (gw.value.trim()) settings.gateway = gw.value.trim();
    if (host.services) settings.services = host.services;
    try {
      net.configureHost(deviceId, settings);
      status.textContent = t('host.applied');
      onChange();
    } catch (err) {
      status.textContent = (err as Error).message;
    }
  };

  // The command prompt: ipconfig, ping, tracert, arp -a, as on a French Windows.
  const lines = hostScreens.get(deviceId) ?? [t('host.shellBanner'), ''];
  hostScreens.set(deviceId, lines);
  const screen = h('pre', { 'aria-live': 'polite' });
  const input: HTMLInputElement = h('input', { 'aria-label': 'Commande', spellcheck: 'false', autocomplete: 'off' });
  const history = hostHistory.get(deviceId) ?? [];
  hostHistory.set(deviceId, history);
  let position = history.length;
  const paint = (): void => {
    screen.textContent = lines.join('\n');
    screen.scrollTop = screen.scrollHeight;
  };
  const run = (line: string): void => {
    let result: ShellResult = { output: '' };
    around(() => {
      result = runHostCommand(net, deviceId, line);
    });
    if (result.clear) lines.length = 0;
    else lines.push(SHELL_PROMPT + line, ...(result.output ? result.output.split('\n') : []), '');
    if (line.trim()) {
      history.push(line);
      position = history.length;
    }
    paint();
    onChange();
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
    h('span', { class: 'prompt' }, SHELL_PROMPT),
    input,
  );
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      position = Math.max(0, Math.min(history.length, position + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[position] ?? '';
    }
    e.stopPropagation();
  });

  panel(`${t('host.title')} ${deviceId}`, [
    h('div', { class: 'host-settings' }, ipRow, maskRow, gwRow),
    h(
      'div',
      { class: 'title-actions', style: { justifyContent: 'flex-start', marginBottom: '10px' } },
      h('button', { class: 'btn small', onclick: apply }, t('host.apply')),
      h('button', { class: 'btn small', onclick: () => run('ipconfig /renew') }, t('host.dhcp')),
      openConsole ? h('button', { class: 'btn small', onclick: openConsole }, t('host.openConsole')) : null,
      status,
    ),
    h('div', { class: 'terminal', onclick: () => input.focus() }, screen, form),
    h('div', { class: 'help' }, t('host.shellHelp')),
  ], `host:${deviceId}`);
  paint();
  input.focus();
}

export interface PortEntry {
  name: string;
  busy: boolean;
  pick(): void;
}

/**
 * Every device and port as a plain list: the whole game can be played with the keyboard or a screen reader, without
 * aiming at anything in the room.
 */
export function showPortList(devices: { id: string; open(): void; ports: PortEntry[] }[]): void {
  panel(t('ports.title'), [
    h('p', { class: 'notice' }, t('ports.hint')),
    h(
      'div',
      { class: 'port-list' },
      ...devices.map((d) =>
        h(
          'section',
          {},
          h('header', {}, h('h4', {}, d.id), h('button', { class: 'btn ghost small', onclick: () => d.open() }, t('ports.open'))),
          h(
            'div',
            { class: 'ports' },
            ...d.ports.map((port) =>
              h('button', { class: `port-chip${port.busy ? ' busy' : ''}`, onclick: () => port.pick() }, port.busy ? `${port.name} · ${t('ports.unplug')}` : port.name),
            ),
          ),
        ),
      ),
    ),
  ], 'ports');
  (document.querySelector('.port-list button') as HTMLElement | null)?.focus();
}
