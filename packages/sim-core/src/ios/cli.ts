import { cloneConfig, createDefaultConfig, sameConfig, type DeviceConfig } from '../model/config.js';
import { allCommands, groupHelp } from './commands/index.js';
import { createIsolatedEnvironment, type LinkEnvironment } from './environment.js';
import { complete, compileCommands, help, isNegatable, match, tokenize, type CompiledCommand, type ParseEnv } from './parser.js';
import type { DeviceProfile } from './profiles.js';
import { SUB_CONFIG_MODES, type CliMode, type CommandContext, type PendingPrompt, type Selection } from './types.js';

export interface CliOptions {
  profile: DeviceProfile;
  hostname?: string;
  /** Link state and cabling provider. Defaults to an isolated device with no cables. */
  env?: LinkEnvironment;
}

export interface CliResult {
  /** Text printed by the command (may be empty). */
  output: string;
  /** What the terminal shows where the user types next: the mode prompt, or a question such as `Password: `. */
  prompt: string;
  /** True while the next line must not be echoed (passwords). */
  hiddenInput: boolean;
}

const PROMPT_SUFFIX: Record<CliMode, string> = {
  user: '>',
  privileged: '#',
  config: '(config)#',
  'config-if': '(config-if)#',
  'config-if-range': '(config-if-range)#',
  'config-subif': '(config-subif)#',
  'config-line': '(config-line)#',
  'config-vlan': '(config-vlan)#',
  'config-router': '(config-router)#',
  'config-std-nacl': '(config-std-nacl)#',
  'config-ext-nacl': '(config-ext-nacl)#',
};

const isConfigMode = (mode: CliMode): boolean => mode === 'config' || SUB_CONFIG_MODES.includes(mode);
const isYes = (answer: string): boolean => ['y', 'yes'].includes(answer.trim().toLowerCase());
const isNo = (answer: string): boolean => ['n', 'no'].includes(answer.trim().toLowerCase());
const isDeclined = (answer: string): boolean => answer.trim().toLowerCase().startsWith('n');

/** Thrown by CommandContext.invalid() to unwind a handler; turned into the IOS `Invalid input` message. */
class CliInvalid extends Error {
  constructor(readonly tokenIndex: number) {
    super('invalid input');
  }
}

/** Per-device IOS command line: a mode state machine over a declarative command registry. */
export class Cli {
  readonly profile: DeviceProfile;
  /** running-config */
  config: DeviceConfig;
  /** startup-config (NVRAM); null when absent. */
  startup: DeviceConfig | null = null;
  mode: CliMode = 'user';
  selection: Selection = {};

  private phase: 'active' | 'press-return' = 'active';
  private pending: PendingPrompt | null = null;
  private readonly commands: CompiledCommand[] = compileCommands(allCommands);
  private readonly env: LinkEnvironment;

  constructor(options: CliOptions) {
    this.profile = options.profile;
    this.config = createDefaultConfig(options.profile);
    if (options.hostname) this.config.hostname = options.hostname;
    this.env = options.env ?? createIsolatedEnvironment(() => this.config);
  }

  /** Syslog lines queued by events elsewhere in the network (a neighbour shut down, a cable was plugged…). */
  drainSyslog(): string[] {
    return this.env.drain();
  }

  get prompt(): string {
    if (this.pending) return this.pending.prompt;
    if (this.phase === 'press-return') return '';
    return this.config.hostname + PROMPT_SUFFIX[this.mode];
  }

  /** Open a console session: banner, then the console login if configured. Call once when a terminal attaches. */
  connect(): CliResult {
    return this.result(this.beginSession());
  }

  execute(line: string): CliResult {
    const output = this.dispatch(line);
    // Link changes caused by this command are printed right after it, preceded by a blank line, as on a console.
    const syslog = this.env.commit();
    return this.result(syslog.length === 0 ? output : [...(output === '' ? [''] : [output, '']), ...syslog].join('\n'));
  }

  /** Tab completion for the word being typed; null when there is no unique completion. */
  complete(line: string): string | null {
    const { body, negate } = this.splitNo(line);
    const prefix = line.slice(0, line.length - body.length);
    const done = complete(this.poolFor(this.mode, negate), body, this.envFor(negate), this.allowsNo() && !negate);
    return done === null ? null : prefix + done;
  }

  private result(output: string): CliResult {
    return { output, prompt: this.prompt, hiddenInput: this.pending?.hidden === true };
  }

  private dispatch(line: string): string {
    if (this.pending) {
      const pending = this.pending;
      this.pending = null;
      return pending.handler(line) ?? '';
    }
    if (this.phase === 'press-return') return this.beginSession();

    const text = line.trimEnd();
    if (text.trim() === '') return '';
    if (text.endsWith('?')) return this.helpFor(text.slice(0, -1));
    return this.runLine(text, this.prompt.length, this.mode);
  }

  // ---- command parsing -------------------------------------------------------------------------------------------

  private splitNo(text: string): { body: string; negate: boolean } {
    const m = /^(\s*)no\s+/i.exec(text);
    if (!m || !this.allowsNo()) return { body: text, negate: false };
    return { body: text.slice(m[0].length), negate: true };
  }

  private allowsNo(): boolean {
    return isConfigMode(this.mode);
  }

  private envFor(negate: boolean): ParseEnv {
    return { profile: this.profile, negate, groupHelp };
  }

  /** Commands valid in `mode`; in sub-modes of config, global config commands are also accepted (listed last). */
  private poolFor(mode: CliMode, negate: boolean): CompiledCommand[] {
    const ok = (c: CompiledCommand): boolean => !negate || isNegatable(c);
    const own = this.commands.filter((c) => c.def.modes.includes(mode) && ok(c));
    if (!SUB_CONFIG_MODES.includes(mode)) return own;
    return [...own, ...this.commands.filter((c) => !c.def.modes.includes(mode) && c.def.modes.includes('config') && ok(c))];
  }

  private helpFor(body: string): string {
    const { body: rest, negate } = this.splitNo(body);
    return help(this.poolFor(this.mode, negate), rest, this.envFor(negate), this.allowsNo() && !negate);
  }

  private runLine(text: string, column0: number, mode: CliMode): string {
    const tokens = tokenize(text);
    const configMode = isConfigMode(mode);
    const first = tokens[0]?.text.toLowerCase();

    // `do <exec command>` from any configuration mode.
    if (configMode && first === 'do') {
      const second = tokens[1];
      if (!second) return '% Incomplete command.';
      const savedMode = this.mode;
      const savedSelection = this.selection;
      this.mode = 'privileged';
      try {
        return this.runLine(text.slice(second.start), column0 + second.start, 'privileged');
      } finally {
        this.mode = savedMode;
        this.selection = savedSelection;
      }
    }

    let body = text;
    let column = column0;
    let negate = false;
    if (configMode && first === 'no') {
      const second = tokens[1];
      if (!second) return '% Incomplete command.';
      negate = true;
      body = text.slice(second.start);
      column += second.start;
    }

    const caret = (tokenIndex: number): string => {
      const tok = tokenize(body)[tokenIndex] ?? tokenize(body)[0];
      return `${' '.repeat(column + (tok?.start ?? 0))}^\n% Invalid input detected at '^' marker.`;
    };

    const m = match(this.poolFor(mode, negate), body, this.envFor(negate));
    switch (m.kind) {
      case 'invalid':
        return caret(m.at);
      case 'ambiguous':
        return `% Ambiguous command:  "${text.trim()}"`;
      case 'incomplete':
        return '% Incomplete command.';
      case 'ok': {
        if (!m.cmd.def.modes.includes(mode)) {
          this.mode = 'config';
          this.selection = {};
        }
        try {
          return m.cmd.def.run(this.contextFor(negate), m.args) ?? '';
        } catch (e) {
          if (e instanceof CliInvalid) return caret(e.tokenIndex);
          throw e;
        }
      }
    }
  }

  private contextFor(negate: boolean): CommandContext {
    // Getters must read the live Cli state (handlers can outlive a single command via `ask`).
    const live = (): Cli => this;
    return {
      profile: this.profile,
      env: this.env,
      get config() {
        return live().config;
      },
      get startup() {
        return live().startup;
      },
      get mode() {
        return live().mode;
      },
      get selection() {
        return live().selection;
      },
      negate,
      setMode: (mode, selection) => {
        this.mode = mode;
        this.selection = selection ?? {};
      },
      ask: (prompt) => {
        this.pending = prompt;
      },
      askPassword: (options) => this.askPassword(options),
      saveStartup: () => {
        this.startup = cloneConfig(this.config);
      },
      eraseStartup: () => {
        this.startup = null;
      },
      isDirty: () => this.isDirty(),
      reload: () => this.startReload(),
      logout: () => this.logout(),
      invalid: (tokenIndex) => {
        throw new CliInvalid(tokenIndex);
      },
    };
  }

  // ---- sessions, passwords, reload -------------------------------------------------------------------------------

  private isDirty(): boolean {
    const reference = this.startup ?? createDefaultConfig(this.profile);
    return !sameConfig(this.config, reference);
  }

  private askPassword(options: {
    expected: string;
    badMessage: string;
    onSuccess(): string | void;
    onFail?(): string | void;
  }): void {
    let attempts = 0;
    const ask = (): void => {
      this.pending = {
        prompt: 'Password: ',
        hidden: true,
        handler: (line) => {
          if (line === options.expected) return options.onSuccess() ?? '';
          attempts += 1;
          if (attempts >= 3) return `% ${options.badMessage}` + (options.onFail ? `\n${options.onFail() ?? ''}` : '');
          ask();
          return '';
        },
      };
    };
    ask();
  }

  private beginSession(): string {
    this.phase = 'active';
    this.mode = 'user';
    this.selection = {};
    const parts: string[] = [];
    if (this.config.motd) parts.push(this.config.motd.join('\n'));

    const con = this.config.lines.find((l) => l.id === 'con 0');
    if (con?.login) {
      if (con.password === undefined) {
        this.phase = 'press-return';
        parts.push('Password required, but none set');
      } else {
        parts.push('\nUser Access Verification\n');
        this.askPassword({ expected: con.password, badMessage: 'Bad passwords', onSuccess: () => '', onFail: () => this.beginSession() });
      }
    }
    return parts.join('\n');
  }

  private logout(): string {
    this.phase = 'press-return';
    this.mode = 'user';
    this.selection = {};
    return `\n${this.config.hostname} con0 is now available\n\nPress RETURN to get started.`;
  }

  private startReload(): void {
    const confirmReload = (): void => {
      this.pending = {
        prompt: 'Proceed with reload? [confirm]',
        handler: (answer) => (isDeclined(answer) ? '' : this.restart()),
      };
    };
    if (!this.isDirty()) {
      confirmReload();
      return;
    }
    const askSave = (): void => {
      this.pending = {
        prompt: 'System configuration has been modified. Save? [yes/no]: ',
        handler: (answer) => {
          if (isYes(answer)) {
            this.startup = cloneConfig(this.config);
            confirmReload();
            return 'Building configuration...\n[OK]';
          }
          if (isNo(answer)) {
            confirmReload();
            return '';
          }
          askSave();
          return "% Please answer 'yes' or 'no'.";
        },
      };
    };
    askSave();
  }

  private restart(): string {
    this.config = this.startup ? cloneConfig(this.startup) : createDefaultConfig(this.profile);
    this.env.reset();
    this.mode = 'user';
    this.selection = {};
    const header = '%SYS-5-RELOAD: Reload requested by console. Reload Reason: Reload Command.';
    if (this.startup) {
      this.phase = 'press-return';
      return `${header}\n\nPress RETURN to get started!`;
    }

    const askDialog = (): void => {
      this.pending = {
        prompt: 'Would you like to enter the initial configuration dialog? [yes/no]: ',
        handler: (answer) => {
          if (isYes(answer)) {
            this.phase = 'press-return';
            return "% The initial configuration dialog is not available in PatchBay; continuing without it.\n\nPress RETURN to get started!";
          }
          if (isNo(answer)) {
            this.phase = 'press-return';
            return '\nPress RETURN to get started!';
          }
          askDialog();
          return "% Please answer 'yes' or 'no'.";
        },
      };
    };
    askDialog();
    return header;
  }
}
