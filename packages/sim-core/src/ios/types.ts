import type { DeviceConfig } from '../model/config.js';
import type { LinkEnvironment } from './environment.js';
import type { DeviceProfile } from './profiles.js';

export type CliMode =
  | 'user'
  | 'privileged'
  | 'config'
  | 'config-if'
  | 'config-line'
  | 'config-vlan'
  | 'config-router'
  | 'config-std-nacl'
  | 'config-ext-nacl';

/** Sub-modes of global configuration: global commands typed there run as if in `config`. */
export const SUB_CONFIG_MODES: readonly CliMode[] = [
  'config-if',
  'config-line',
  'config-vlan',
  'config-router',
  'config-std-nacl',
  'config-ext-nacl',
];

export type Args = Record<string, string>;

export interface Selection {
  /** Canonical interface name in config-if. */
  interface?: string;
  /** Line ids (see LineConfig.id) in config-line. */
  lines?: string[];
}

/** An input request: the next line the user types goes to `handler` instead of the command parser. */
export interface PendingPrompt {
  /** Text shown where the prompt would be (e.g. `Password:`, or '' while entering a banner). */
  prompt: string;
  hidden?: boolean;
  handler(line: string): string | void;
}

export interface CommandContext {
  readonly profile: DeviceProfile;
  /** Link state, cabling and MAC addresses as seen from this device. */
  readonly env: LinkEnvironment;
  readonly config: DeviceConfig;
  readonly startup: DeviceConfig | null;
  readonly mode: CliMode;
  readonly selection: Selection;
  /** True when the command was typed with a leading `no`. */
  readonly negate: boolean;
  setMode(mode: CliMode, selection?: Selection): void;
  ask(prompt: PendingPrompt): void;
  askPassword(options: {
    expected: string;
    badMessage: string;
    onSuccess(): string | void;
    onFail?(): string | void;
  }): void;
  saveStartup(): void;
  eraseStartup(): void;
  isDirty(): boolean;
  /** Start the reload flow (save question, confirmation, restart). */
  reload(): void;
  logout(): string;
  /** Reject the command as IOS would, with the caret under the given token (index within the command, excluding `no`). */
  invalid(tokenIndex: number): never;
}

export interface CommandDef {
  /** Modes in which the command is valid. */
  modes: CliMode[];
  /**
   * Words separated by spaces. Literals are matched by unique prefix; `<name:type>` or `<name:int:min-max>` is a parameter.
   * Types: word, int, ip, mask, iface, text (rest of line).
   */
  syntax: string;
  help: string;
  /** Descriptions for `?` on a parameter, by parameter name. */
  paramHelp?: Record<string, string>;
  /** Accepts `no <syntax>`; with `no`, trailing parameters become optional. */
  negatable?: boolean;
  run(ctx: CommandContext, args: Args): string | void;
}
