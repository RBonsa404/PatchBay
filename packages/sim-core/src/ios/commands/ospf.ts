import type { OspfConfig } from '../../model/config.js';
import { renderInterfaceBrief, renderInterfaceDetail, renderNeighbors, renderOspfProcess, renderProtocols } from '../render/ospf.js';
import type { CommandContext, CommandDef } from '../types.js';

const ospfOf = (ctx: CommandContext): OspfConfig => ctx.config.ospf as OspfConfig;

const ROUTER_ID_NOTICE = 'Reload or use "clear ip ospf process" command, for this to take effect';

function originate(always: boolean): CommandDef {
  return {
    modes: ['config-router'],
    syntax: always ? 'default-information originate always' : 'default-information originate',
    help: always ? 'Always advertise default route' : 'Distribute a default route',
    negatable: true,
    run: (ctx) => {
      const ospf = ospfOf(ctx);
      if (ctx.negate) delete ospf.defaultOriginate;
      else ospf.defaultOriginate = { always };
    },
  };
}

export const ospfCommands: CommandDef[] = [
  {
    modes: ['config'],
    syntax: 'router ospf <pid:int:1-65535>',
    help: 'Open Shortest Path First (OSPF)',
    paramHelp: { pid: 'Process ID' },
    negatable: true,
    run: (ctx, args) => {
      if (ctx.profile.family !== 'router') ctx.invalid(0);
      const pid = Number(args.pid);
      if (ctx.negate) {
        if (ctx.config.ospf?.processId === pid) delete ctx.config.ospf;
        return;
      }
      if (ctx.config.ospf && ctx.config.ospf.processId !== pid) {
        return `% PatchBay runs a single OSPF process per router (process ${ctx.config.ospf.processId} is configured)`;
      }
      ctx.config.ospf ??= { processId: pid, networks: [], passiveDefault: false, passive: [], notPassive: [], referenceBandwidth: 100 };
      ctx.setMode('config-router');
    },
  },
  {
    modes: ['config-router'],
    syntax: 'network <network:ip> <wildcard:mask> area <area:int:0-4294967295>',
    help: 'Enable routing on an IP network',
    paramHelp: { network: 'Network number', wildcard: 'OSPF wild card bits', area: 'OSPF area ID as a decimal value' },
    negatable: true,
    run: (ctx, args) => {
      const ospf = ospfOf(ctx);
      const same = (n: { network: string; wildcard: string }): boolean => n.network === args.network && n.wildcard === args.wildcard;
      if (ctx.negate) {
        ospf.networks = ospf.networks.filter((n) => !same(n));
        return;
      }
      const existing = ospf.networks.find(same);
      if (existing) existing.area = Number(args.area);
      else ospf.networks.push({ network: args.network as string, wildcard: args.wildcard as string, area: Number(args.area) });
    },
  },
  {
    modes: ['config-router'],
    syntax: 'router-id <id:ip>',
    help: 'router-id for this OSPF process',
    paramHelp: { id: 'OSPF router-id in IP address format' },
    negatable: true,
    run: (ctx, args) => {
      const ospf = ospfOf(ctx);
      if (ctx.negate) delete ospf.routerId;
      else ospf.routerId = args.id as string;
      // Once the process runs, a new router ID only applies after a restart of the process.
      const active = ctx.env.ospfRouterId();
      if (active !== null && active !== ospf.routerId) return ROUTER_ID_NOTICE;
    },
  },
  {
    modes: ['config-router'],
    syntax: 'passive-interface default',
    help: 'Suppress routing updates on all interfaces',
    negatable: true,
    run: (ctx) => {
      const ospf = ospfOf(ctx);
      ospf.passiveDefault = !ctx.negate;
      ospf.passive = [];
      ospf.notPassive = [];
    },
  },
  {
    modes: ['config-router'],
    syntax: 'passive-interface <name:iface>',
    help: 'Suppress routing updates on an interface',
    paramHelp: { name: 'Interface type and number' },
    negatable: true,
    run: (ctx, args) => {
      const ospf = ospfOf(ctx);
      const name = args.name as string;
      const without = (list: string[]): string[] => list.filter((i) => i !== name);
      if (ospf.passiveDefault) ospf.notPassive = ctx.negate ? [...without(ospf.notPassive), name] : without(ospf.notPassive);
      else ospf.passive = ctx.negate ? without(ospf.passive) : [...without(ospf.passive), name];
    },
  },
  originate(false),
  originate(true),
  {
    modes: ['config-router'],
    syntax: 'auto-cost reference-bandwidth <mbps:int:1-4294967>',
    help: 'Use reference bandwidth method to assign OSPF cost',
    paramHelp: { mbps: 'The reference bandwidth in terms of Mbits per second' },
    negatable: true,
    run: (ctx, args) => {
      ospfOf(ctx).referenceBandwidth = ctx.negate ? 100 : Number(args.mbps);
      return '% OSPF: Reference bandwidth is changed.\n        Please ensure reference bandwidth is consistent across all routers.';
    },
  },
  {
    // Always on in this simulator; accepted so that lab scripts typing it do not fail.
    modes: ['config-router'],
    syntax: 'log-adjacency-changes',
    help: 'Log changes in adjacency state',
    negatable: true,
    run: () => undefined,
  },
  {
    modes: ['privileged'],
    syntax: 'clear ip ospf process',
    help: 'Reset OSPF process',
    run: (ctx) => {
      ctx.ask({
        prompt: 'Reset ALL OSPF processes? [no]: ',
        handler: (answer) => {
          if (['y', 'yes'].includes(answer.trim().toLowerCase())) ctx.env.clearOspf();
        },
      });
    },
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip ospf neighbor',
    help: 'Neighbor list',
    run: (ctx) => renderNeighbors(ctx.env.ospf()),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip ospf interface',
    help: 'Interface information',
    run: (ctx) => renderInterfaceDetail(ctx.env.ospf(), ctx.env),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip ospf interface brief',
    help: 'Brief summary of OSPF interface information',
    run: (ctx) => renderInterfaceBrief(ctx.env.ospf()),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip ospf interface <name:iface>',
    help: 'Interface information',
    paramHelp: { name: 'Interface type and number' },
    run: (ctx, args) => renderInterfaceDetail(ctx.env.ospf(), ctx.env, args.name),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip ospf',
    help: 'OSPF information',
    run: (ctx) => renderOspfProcess(ctx.env.ospf()),
  },
  {
    modes: ['user', 'privileged'],
    syntax: 'show ip protocols',
    help: 'IP routing protocol process parameters and statistics',
    run: (ctx) => renderProtocols(ctx.env.ospf()),
  },
];
