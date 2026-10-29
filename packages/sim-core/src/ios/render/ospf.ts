import type { OspfInterface, OspfRouterView } from '../../engine/ospf.js';
import { maskToPrefix } from '../../protocols/l3/ip.js';
import type { LinkEnvironment } from '../environment.js';
import { shortName } from './vlan.js';

/** Dead timers count down on real routers; without a clock the simulator shows a steady value. */
const DEAD_TIME = '00:00:35';

const areaLabel = (area: number): string => (area === 0 ? 'BACKBONE(0)' : `${area}`);

/** `show ip ospf neighbor` (layout of the course PDF: lab 11.6.1). */
export function renderNeighbors(view: OspfRouterView | undefined): string {
  const rows = (view?.interfaces ?? []).flatMap((i) => i.neighbors);
  if (rows.length === 0) return '';
  return [
    '',
    'Neighbor ID     Pri   State           Dead Time   Address         Interface',
    ...rows.map((n) => {
      const state = `${n.state}/${n.role === '-' ? '  -' : n.role}`;
      return `${n.routerId.padEnd(16)}${String(n.priority).padStart(3)}   ${state.padEnd(16)}${DEAD_TIME.padEnd(12)}${n.address.padEnd(16)}${n.iface}`;
    }),
  ].join('\n');
}

const stateLabel = (i: OspfInterface): string => (i.passive && i.type === 'broadcast' ? 'DR' : i.state);

/** `show ip ospf interface brief` */
export function renderInterfaceBrief(view: OspfRouterView | undefined): string {
  if (!view || view.interfaces.length === 0) return '';
  return [
    'Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C',
    ...view.interfaces.map((i) => {
      const full = i.neighbors.filter((n) => n.state === 'FULL').length;
      const addr = `${i.ip}/${i.type === 'loopback' ? 32 : (maskToPrefix(i.mask) ?? 0)}`;
      return `${shortName(i.name).padEnd(13)}${String(view.processId).padEnd(6)}${String(i.area).padEnd(16)}${addr.padEnd(19)}${String(i.cost).padEnd(6)}${stateLabel(i).padEnd(6)}${full}/${i.neighbors.length}`;
    }),
  ].join('\n');
}

/** `show ip ospf interface [name]`: the lines the course reads (timers are fixed). */
export function renderInterfaceDetail(view: OspfRouterView | undefined, env: LinkEnvironment, only?: string): string {
  if (!view) return '';
  return view.interfaces
    .filter((i) => only === undefined || i.name === only)
    .map((i) => {
      const link = env.linkState(i.name);
      const prefix = i.type === 'loopback' ? 32 : (maskToPrefix(i.mask) ?? 0);
      const lines = [
        `${i.name} is ${link.status}, line protocol is ${link.protocol}`,
        `  Internet address is ${i.ip}/${prefix}, Area ${i.area}`,
      ];
      if (i.type === 'loopback') {
        lines.push(`  Process ID ${view.processId}, Router ID ${view.routerId}, Network Type LOOPBACK, Cost: ${i.cost}`, '  Loopback interface is treated as a stub Host');
        return lines.join('\n');
      }
      const type = i.type === 'p2p' ? 'POINT_TO_POINT' : 'BROADCAST';
      lines.push(`  Process ID ${view.processId}, Router ID ${view.routerId}, Network Type ${type}, Cost: ${i.cost}`);
      if (i.type === 'p2p') {
        lines.push('  Transmit Delay is 1 sec, State POINT_TO_POINT');
      } else {
        lines.push(`  Transmit Delay is 1 sec, State ${stateLabel(i)}, Priority ${i.priority}`);
        if (i.dr) lines.push(`  Designated Router (ID) ${i.dr.routerId}, Interface address ${i.dr.ip}`);
        lines.push(i.bdr ? `  Backup Designated Router (ID) ${i.bdr.routerId}, Interface address ${i.bdr.ip}` : '  No backup designated router on this network');
      }
      lines.push('  Timer intervals configured, Hello 10, Dead 40, Wait 40, Retransmit 5');
      lines.push(i.passive ? '    No Hellos (Passive interface)' : '    Hello due in 00:00:05');
      const adjacent = i.neighbors.filter((n) => n.state === 'FULL').length;
      lines.push(`  Neighbor Count is ${i.neighbors.length}, Adjacent neighbor count is ${adjacent}`);
      for (const n of i.neighbors.filter((x) => x.state === 'FULL')) lines.push(`    Adjacent with neighbor ${n.routerId}${n.role === 'DR' ? '  (Designated Router)' : n.role === 'BDR' ? '  (Backup Designated Router)' : ''}`);
      return lines.join('\n');
    })
    .join('\n');
}

/** `show ip ospf` (first lines, then one block per area). */
export function renderOspfProcess(view: OspfRouterView | undefined): string {
  if (!view) return '';
  if (!view.routerId) return `%OSPF: Router process ${view.processId} is not running, please configure a router-id`;
  const lines = [
    ` Routing Process "ospf ${view.processId}" with ID ${view.routerId}`,
    ' Supports only single TOS(TOS0) routes',
    ' Supports opaque LSA',
  ];
  if (view.isAbr) lines.push(' It is an area border router');
  if (view.isAsbr) lines.push(' It is an autonomous system boundary router');
  lines.push(
    ' SPF schedule delay 5 secs, Hold time between two SPFs 10 secs',
    ` Number of areas in this router is ${view.areas.length}. ${view.areas.length} normal 0 stub 0 nssa`,
    ` Reference bandwidth unit is ${view.config.referenceBandwidth} mbps`,
  );
  for (const area of view.areas) {
    lines.push(`    Area ${areaLabel(area)}`, `        Number of interfaces in this area is ${view.interfaces.filter((i) => i.area === area).length}`);
  }
  return lines.join('\n');
}

/** `show ip protocols` for the OSPF process. */
export function renderProtocols(view: OspfRouterView | undefined): string {
  if (!view) return '';
  const passive = view.interfaces.filter((i) => i.passive).map((i) => `    ${i.name}`);
  const sources = [...new Set(view.interfaces.flatMap((i) => i.neighbors.filter((n) => n.state === 'FULL').map((n) => n.routerId)))];
  return [
    `Routing Protocol is "ospf ${view.processId}"`,
    '  Outgoing update filter list for all interfaces is not set',
    '  Incoming update filter list for all interfaces is not set',
    `  Router ID ${view.routerId ?? '0.0.0.0'}`,
    `  Number of areas in this router is ${view.areas.length}. ${view.areas.length} normal 0 stub 0 nssa`,
    '  Maximum path: 4',
    '  Routing for Networks:',
    ...view.config.networks.map((n) => `    ${n.network} ${n.wildcard} area ${n.area}`),
    ...(passive.length > 0 ? ['  Passive Interface(s):', ...passive] : []),
    '  Routing Information Sources:',
    '    Gateway         Distance      Last Update',
    ...sources.map((s) => `    ${s.padEnd(16)}${'110'.padStart(8)}      00:00:00`),
    '  Distance: (default is 110)',
  ].join('\n');
}
