import type { CableEnd, HostConfig } from '../model/network.js';
import { Network } from '../model/network.js';
import type { CableType } from '../physical/rules.js';
import type { Objective } from '../validation/objectives.js';

/** Player-facing text: French first, English when available. */
export interface Text {
  fr: string;
  en?: string;
}

/** `"R1:FastEthernet0/0"` — a device id and one of its ports. For serial cables, `a` is the DCE end. */
export interface LevelCable {
  type: CableType;
  a: string;
  b: string;
}

export interface LevelDevice {
  id: string;
  model: string;
  label?: Text;
  /** Where the 3D scene places it (metres). Optional: the engine does not care. */
  position?: [number, number, number];
}

/**
 * A level is pure data: what is on the bench, what is already done, what the player must achieve, and a reference
 * solution (used by tests and by the teacher mode; the game never shows it to students unless asked).
 */
export interface Level {
  id: string;
  /** Bumped when objectives change, so saved progress can be invalidated. */
  version: number;
  title: Text;
  brief: Text;
  /** Narrative shown before the mission (the story thread of the campaign). */
  story?: Text;
  difficulty: number;
  settings: { strictMdix: boolean };
  devices: LevelDevice[];
  /** Cables the player can take from the inventory. */
  inventory: { cables: Partial<Record<CableType, number>> };
  initial: {
    cables: LevelCable[];
    hosts: Record<string, HostConfig>;
    /** IOS commands already applied when the level starts (e.g. a pre-configured router). */
    commands: Record<string, string[]>;
  };
  objectives: Objective[];
  hints: { text: Text; afterSeconds?: number }[];
  solution: {
    cables: LevelCable[];
    commands: Record<string, string[]>;
    hosts?: Record<string, HostConfig>;
  };
}

export function parseEnd(text: string): CableEnd {
  const at = text.indexOf(':');
  if (at <= 0) throw new Error(`Bad cable end "${text}" (expected DEVICE:PORT)`);
  return { device: text.slice(0, at), port: text.slice(at + 1) };
}

function plug(net: Network, cables: LevelCable[]): void {
  for (const c of cables) {
    const r = net.connect(c.type, parseEnd(c.a), parseEnd(c.b));
    if (!r.ok) throw new Error(`Cannot plug ${c.type} ${c.a} - ${c.b}: ${r.error}`);
  }
}

function type(net: Network, commands: Record<string, string[]>): void {
  for (const [id, lines] of Object.entries(commands)) {
    const cli = net.device(id).cli;
    if (!cli) throw new Error(`${id} has no command line`);
    for (const line of lines) cli.execute(line);
    cli.drainSyslog();
  }
}

/** The network as the player finds it when the level starts. */
export function buildLevel(level: Level): Network {
  const net = new Network({ strictMdix: level.settings.strictMdix });
  for (const d of level.devices) net.addDevice(d.id, d.model);
  plug(net, level.initial.cables);
  for (const [id, host] of Object.entries(level.initial.hosts)) net.configureHost(id, host);
  type(net, level.initial.commands);
  return net;
}

/** Play the reference solution on top of the starting network. */
export function applySolution(net: Network, level: Level): void {
  plug(net, level.solution.cables);
  for (const [id, host] of Object.entries(level.solution.hosts ?? {})) net.configureHost(id, host);
  type(net, level.solution.commands);
}
