import { sameConfig } from '../model/config.js';
import type { Network } from '../model/network.js';
import type { CableType } from '../physical/rules.js';
import { buildRoutingTable, type RouteCode } from '../protocols/l3/routing.js';
import type { ServiceResult } from '../engine/l3.js';
import { parseEnd, type Text } from '../scenario/level.js';

/** What a device's configuration must contain (checked on the structured config, never on typed text). */
export type ConfigCheck =
  | { kind: 'hostname'; equals: string }
  | { kind: 'enable-secret' }
  | { kind: 'console-login' }
  | { kind: 'vty-login' }
  | { kind: 'interface-ip'; interface: string; ip: string; mask: string }
  | { kind: 'clock-rate'; interface: string };

interface Base {
  id: string;
  label: Text;
  /** Shown when the objective fails and the player asks for help. */
  hint?: Text;
  points: number;
}

export type Objective = Base &
  (
    | { type: 'cable'; cable: { type: CableType; a: string; b: string } }
    | { type: 'console'; from: string; to: string }
    | { type: 'link-up'; device: string; port: string }
    | { type: 'config'; device: string; check: ConfigCheck }
    | { type: 'ping'; from: string; to: string; expect: 'success' | 'fail' }
    | { type: 'tcp'; from: string; to: string; port: number; expect: ServiceResult }
    | { type: 'route'; device: string; prefix: string; protocol?: RouteCode }
    | { type: 'saved'; device: string }
  );

/** Why an objective failed, as a stable code the interface translates. */
export type FailureReason =
  | 'no-cable'
  | 'wrong-peer'
  | 'wrong-cable-type'
  | 'serial-reversed'
  | 'no-console'
  | 'link-down'
  | 'missing-config'
  | 'unreachable'
  | 'reachable'
  | 'unexpected-result'
  | 'no-route'
  | 'not-saved';

export interface ObjectiveResult {
  id: string;
  passed: boolean;
  points: number;
  reason?: FailureReason;
}

export interface Evaluation {
  results: ObjectiveResult[];
  score: number;
  maxScore: number;
  /** Every objective passed. */
  complete: boolean;
}

const fail = (reason: FailureReason): Omit<ObjectiveResult, 'id' | 'points'> => ({ passed: false, reason });
const ok = { passed: true };

function check(net: Network, o: Objective): Omit<ObjectiveResult, 'id' | 'points'> {
  switch (o.type) {
    case 'cable': {
      const a = parseEnd(o.cable.a);
      const b = parseEnd(o.cable.b);
      const cable = net.cableAt(a);
      if (!cable) return fail('no-cable');
      const peer = net.peerOf(a);
      if (peer?.device !== b.device || peer.port !== b.port) return fail('wrong-peer');
      if (cable.type !== o.cable.type) return fail('wrong-cable-type');
      // The DCE end decides who provides the clock: the level says which router it must be.
      if (cable.type === 'serial' && (cable.a.device !== a.device || cable.a.port !== a.port)) return fail('serial-reversed');
      return ok;
    }
    case 'console':
      return net.consoleTarget(o.from)?.id === o.to ? ok : fail('no-console');
    case 'link-up': {
      const s = net.linkState(o.device, o.port);
      return s.status === 'up' && s.protocol === 'up' ? ok : fail('link-down');
    }
    case 'config': {
      const config = net.device(o.device).cli?.config;
      if (!config) return fail('missing-config');
      const c = o.check;
      const has = (() => {
        switch (c.kind) {
          case 'hostname':
            return config.hostname === c.equals;
          case 'enable-secret':
            return config.enableSecret !== undefined;
          case 'console-login': {
            const con = config.lines.find((l) => l.id === 'con 0');
            return con?.login === true && con.password !== undefined;
          }
          case 'vty-login':
            return config.lines.filter((l) => l.id.startsWith('vty')).every((l) => l.login && l.password !== undefined);
          case 'interface-ip': {
            const ifc = config.interfaces.find((i) => i.name === c.interface);
            return ifc?.ip?.address === c.ip && ifc.ip.mask === c.mask;
          }
          case 'clock-rate':
            return config.interfaces.find((i) => i.name === c.interface)?.clockRate !== undefined;
        }
      })();
      return has ? ok : fail('missing-config');
    }
    case 'ping': {
      // ARP may cost the first packets of a cold path: three answers out of five count as reachable.
      const received = net.ping(o.from, o.to).received;
      if (o.expect === 'success') return received >= 3 || net.ping(o.from, o.to).received >= 3 ? ok : fail('unreachable');
      return received === 0 ? ok : fail('reachable');
    }
    case 'tcp':
      return net.tcpConnect(o.from, o.to, o.port) === o.expect ? ok : fail('unexpected-result');
    case 'route': {
      const device = net.device(o.device);
      if (!device.cli) return fail('no-route');
      const up = (n: string): boolean => {
        const s = net.linkState(o.device, n);
        return s.status === 'up' && s.protocol === 'up';
      };
      const [network, prefix] = o.prefix.split('/');
      const found = buildRoutingTable(device.cli.config, up, net.ospf.routes(o.device)).some(
        (r) => r.network === network && r.prefix === Number(prefix) && (o.protocol === undefined || r.code === o.protocol),
      );
      return found ? ok : fail('no-route');
    }
    case 'saved': {
      const cli = net.device(o.device).cli;
      return cli?.startup && sameConfig(cli.startup, cli.config) ? ok : fail('not-saved');
    }
  }
}

/**
 * Check every objective against the live network. Pings and connections really run, so they warm ARP caches and NAT
 * tables like a student testing by hand would.
 */
export function evaluate(net: Network, objectives: Objective[]): Evaluation {
  const results = objectives.map((o): ObjectiveResult => {
    const r = check(net, o);
    return { id: o.id, points: r.passed ? o.points : 0, ...r };
  });
  const maxScore = objectives.reduce((n, o) => n + o.points, 0);
  const score = results.reduce((n, r) => n + r.points, 0);
  return { results, score, maxScore, complete: results.every((r) => r.passed) };
}
