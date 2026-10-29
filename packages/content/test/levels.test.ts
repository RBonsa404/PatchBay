import { describe, expect, it } from 'vitest';
import { applySolution, buildLevel, catalog, evaluate, parseEnd, type Level, type Network } from '../../sim-core/src/index.js';
import { campaign, parseLevel } from '../src/index.js';

const resultOf = (net: Network, level: Level, id: string) => evaluate(net, level.objectives).results.find((r) => r.id === id)!;

describe('MVP campaign', () => {
  it('has the two levels decided for the MVP, in order', () => {
    expect(campaign.map((l) => l.id)).toEqual(['l01-cablage-console', 'l02-relier-deux-reseaux']);
  });

  for (const level of campaign) {
    describe(level.id, () => {
      it('scores 100 points in total', () => {
        expect(level.objectives.reduce((n, o) => n + o.points, 0)).toBe(100);
      });

      it('only uses models and ports that exist', () => {
        for (const d of level.devices) expect(catalog[d.model], d.model).toBeDefined();
        for (const c of [...level.initial.cables, ...level.solution.cables]) {
          for (const end of [parseEnd(c.a), parseEnd(c.b)]) {
            const model = catalog[level.devices.find((d) => d.id === end.device)!.model]!;
            expect(model.ports.map((p) => p.name), `${end.device}:${end.port}`).toContain(end.port);
          }
        }
      });

      it('gives the player enough cables for the solution', () => {
        for (const c of level.solution.cables) {
          const used = level.solution.cables.filter((x) => x.type === c.type).length;
          expect(level.inventory.cables[c.type] ?? 0, c.type).toBeGreaterThanOrEqual(used);
        }
      });

      it('is not already solved when it starts', () => {
        const ev = evaluate(buildLevel(level), level.objectives);
        expect(ev.complete).toBe(false);
        expect(ev.score).toBeLessThan(ev.maxScore);
      });

      it('is fully solved by its reference solution', () => {
        const net = buildLevel(level);
        applySolution(net, level);
        const ev = evaluate(net, level.objectives);
        expect(ev.results.filter((r) => !r.passed)).toEqual([]);
        expect(ev.score).toBe(100);
        expect(ev.complete).toBe(true);
      });
    });
  }
});

describe('level 1: cabling and console', () => {
  const level = campaign[0]!;

  it('catches a crossover cable between the PC and the switch, and the ping fails', () => {
    const net = buildLevel(level);
    applySolution(net, { ...level, solution: { ...level.solution, cables: level.solution.cables.slice(1) } });
    net.connect('crossover', { device: 'PC1', port: 'FastEthernet0' }, { device: 'S1', port: 'FastEthernet0/1' });
    expect(resultOf(net, level, 'cable-pc1')).toMatchObject({ passed: false, reason: 'wrong-cable-type' });
    expect(resultOf(net, level, 'ping')).toMatchObject({ passed: false, reason: 'unreachable' });
  });

  it('catches a forgotten save and a forgotten no shutdown', () => {
    const net = buildLevel(level);
    const commands = level.solution.commands.R1!.filter((c) => c !== 'no shutdown' && !c.startsWith('copy') && c !== '');
    applySolution(net, { ...level, solution: { ...level.solution, commands: { R1: commands } } });
    expect(resultOf(net, level, 'gi0-up')).toMatchObject({ passed: false, reason: 'link-down' });
    expect(resultOf(net, level, 'saved')).toMatchObject({ passed: false, reason: 'not-saved' });
    expect(resultOf(net, level, 'hostname').passed).toBe(true);
  });
});

describe('level 2: linking two networks', () => {
  const level = campaign[1]!;

  it('catches a reversed serial cable (the DCE end on R2)', () => {
    const net = buildLevel(level);
    applySolution(net, { ...level, solution: { ...level.solution, cables: level.solution.cables.slice(0, 2) } });
    net.connect('serial', { device: 'R2', port: 'Serial0/0/0' }, { device: 'R1', port: 'Serial0/0/0' });
    expect(resultOf(net, level, 'cable-serial')).toMatchObject({ passed: false, reason: 'serial-reversed' });
    // R1 has a clock rate configured but is the DTE now: the line protocol stays down
    expect(resultOf(net, level, 'serial-up')).toMatchObject({ passed: false, reason: 'link-down' });
  });

  it('catches the missing return route: the ping fails although R1 knows the way', () => {
    const net = buildLevel(level);
    const r2 = level.solution.commands.R2!.filter((c) => !c.startsWith('ip route'));
    applySolution(net, { ...level, solution: { ...level.solution, commands: { ...level.solution.commands, R2: r2 } } });
    expect(resultOf(net, level, 'route-r1').passed).toBe(true);
    expect(resultOf(net, level, 'route-r2')).toMatchObject({ passed: false, reason: 'no-route' });
    expect(resultOf(net, level, 'ping')).toMatchObject({ passed: false, reason: 'unreachable' });
  });
});

describe('parseLevel', () => {
  it('rejects a malformed id', () => {
    const broken = JSON.parse(JSON.stringify(campaign[0])) as Record<string, unknown>;
    broken.id = 'Level One';
    expect(() => parseLevel(broken)).toThrow(/id : id du type l01-nom/);
  });

  // Cross-references are checked once the shape is valid (Zod runs refinements last).
  it('lists every unknown device and duplicate objective id', () => {
    const broken = JSON.parse(JSON.stringify(campaign[0])) as Record<string, unknown>;
    (broken.objectives as { id: string; device?: string }[])[4]!.device = 'R9';
    (broken.objectives as { id: string }[])[1]!.id = 'cable-pc1';
    expect(() => parseLevel(broken)).toThrow(/id en double : cable-pc1[\s\S]*appareil inconnu : R9|appareil inconnu : R9[\s\S]*id en double : cable-pc1/);
  });

  it('rejects unknown fields and bad addresses', () => {
    const broken = JSON.parse(JSON.stringify(campaign[1])) as Record<string, unknown>;
    (broken.initial as { hosts: Record<string, { ip: string }> }).hosts.PC1!.ip = '192.168.1.300';
    broken.secret = true;
    expect(() => parseLevel(broken)).toThrow(/adresse IPv4 attendue[\s\S]*secret|secret[\s\S]*adresse IPv4 attendue/);
  });
});
