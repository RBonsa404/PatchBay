import { z } from 'zod';

// Mirrors `Level` and `Objective` from @patchbay/sim-core. Levels are data from files: they are validated here, at the
// boundary, before the engine ever sees them.

const text = z.object({ fr: z.string().min(1), en: z.string().min(1).optional() }).strict();
const ipv4 = z.string().regex(/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/, 'adresse IPv4 attendue');
const end = z.string().regex(/^[^:\s]+:[^:\s]+$/, 'attendu : APPAREIL:PORT');
const cableType = z.enum(['straight', 'crossover', 'console', 'serial']);
const cable = z.object({ type: cableType, a: end, b: end }).strict();
const host = z
  .object({
    ip: ipv4.optional(),
    mask: ipv4.optional(),
    gateway: ipv4.optional(),
    services: z.object({ tcp: z.array(z.number().int()).optional(), udp: z.array(z.number().int()).optional() }).strict().optional(),
  })
  .strict();

const configCheck = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hostname'), equals: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('enable-secret') }).strict(),
  z.object({ kind: z.literal('console-login') }).strict(),
  z.object({ kind: z.literal('vty-login') }).strict(),
  z.object({ kind: z.literal('interface-ip'), interface: z.string(), ip: ipv4, mask: ipv4 }).strict(),
  z.object({ kind: z.literal('clock-rate'), interface: z.string() }).strict(),
]);

const base = { id: z.string().min(1), label: text, hint: text.optional(), points: z.number().int().min(0) };

const objective = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('cable'), cable }).strict(),
  z.object({ ...base, type: z.literal('console'), from: z.string(), to: z.string() }).strict(),
  z.object({ ...base, type: z.literal('link-up'), device: z.string(), port: z.string() }).strict(),
  z.object({ ...base, type: z.literal('config'), device: z.string(), check: configCheck }).strict(),
  z.object({ ...base, type: z.literal('ping'), from: z.string(), to: ipv4, expect: z.enum(['success', 'fail']) }).strict(),
  z.object({ ...base, type: z.literal('tcp'), from: z.string(), to: ipv4, port: z.number().int(), expect: z.enum(['open', 'refused', 'unreachable', 'timeout']) }).strict(),
  z.object({ ...base, type: z.literal('route'), device: z.string(), prefix: z.string().regex(/^[\d.]+\/\d{1,2}$/), protocol: z.enum(['C', 'S', 'O', 'O IA', 'O E2']).optional() }).strict(),
  z.object({ ...base, type: z.literal('saved'), device: z.string() }).strict(),
]);

export const levelSchema = z
  .object({
    id: z.string().regex(/^l\d{2}-[a-z0-9-]+$/, 'id du type l01-nom'),
    version: z.number().int().min(1),
    title: text,
    brief: text,
    story: text.optional(),
    difficulty: z.number().int().min(1).max(5),
    timeLimit: z.number().int().positive().optional(),
    settings: z.object({ strictMdix: z.boolean() }).strict(),
    devices: z
      .array(
        z
          .object({
            id: z.string().min(1),
            model: z.string().min(1),
            label: text.optional(),
            position: z.tuple([z.number(), z.number(), z.number()]).optional(),
          })
          .strict(),
      )
      .min(1),
    inventory: z.object({ cables: z.record(cableType, z.number().int().min(0)) }).strict(),
    initial: z
      .object({
        cables: z.array(cable),
        hosts: z.record(z.string(), host),
        commands: z.record(z.string(), z.array(z.string())),
      })
      .strict(),
    objectives: z.array(objective).min(1),
    hints: z.array(z.object({ text, afterSeconds: z.number().int().min(0).optional() }).strict()),
    solution: z
      .object({
        cables: z.array(cable),
        commands: z.record(z.string(), z.array(z.string())),
        hosts: z.record(z.string(), host).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((level, ctx) => {
    const ids = new Set(level.devices.map((d) => d.id));
    const known = (device: string, path: (string | number)[]): void => {
      if (!ids.has(device)) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `appareil inconnu : ${device}` });
    };
    level.objectives.forEach((o, i) => {
      if (level.objectives.findIndex((x) => x.id === o.id) !== i) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['objectives', i, 'id'], message: `id en double : ${o.id}` });
      if ('device' in o) known(o.device, ['objectives', i, 'device']);
      if ('from' in o) known(o.from, ['objectives', i, 'from']);
    });
    for (const [i, c] of [...level.initial.cables, ...level.solution.cables].entries()) {
      known(c.a.split(':')[0] as string, ['cables', i, 'a']);
      known(c.b.split(':')[0] as string, ['cables', i, 'b']);
    }
  });
