import { describe, expect, it } from 'vitest';
import { Network } from '../src/index.js';
import { run } from './fixtures.js';

const e = (device: string, port: string) => ({ device, port });
const NIC = 'FastEthernet0';
const cli = (net: Network, id: string) => net.device(id).cli!;
const out = (net: Network, id: string, line: string) => cli(net, id).execute(line).output;
const conf = (net: Network, id: string, ...lines: string[]) => run(net, id, ['enable', 'configure terminal', ...lines, 'end']);

/**
 * docs/references/Configuration de base OSPF.pdf (lab 11.6.1): a triangle of serial links.
 * R1 S0/0/0 (DCE) - R2 S0/0/0, R1 S0/0/1 (DCE) - R3 S0/0/0, R2 S0/0/1 (DCE) - R3 S0/0/1, a PC on each LAN.
 */
function triangle(withOspf = true): Network {
  const net = new Network({ strictMdix: true });
  for (const id of ['R1', 'R2', 'R3']) net.addDevice(id, 'cisco-1841');
  for (const id of ['PC1', 'PC2', 'PC3']) net.addDevice(id, 'pc');
  net.connect('serial', e('R1', 'Serial0/0/0'), e('R2', 'Serial0/0/0'));
  net.connect('serial', e('R1', 'Serial0/0/1'), e('R3', 'Serial0/0/0'));
  net.connect('serial', e('R2', 'Serial0/0/1'), e('R3', 'Serial0/0/1'));
  for (const [r, pc] of [['R1', 'PC1'], ['R2', 'PC2'], ['R3', 'PC3']] as const) net.connect('crossover', e(r, 'FastEthernet0/0'), e(pc, NIC));
  const ifc = (name: string, ip: string, mask: string, ...extra: string[]) => [`interface ${name}`, `ip address ${ip} ${mask}`, ...extra, 'no shutdown'];
  conf(net, 'R1', 'hostname R1', ...ifc('fa0/0', '172.16.1.17', '255.255.255.240'), ...ifc('s0/0/0', '192.168.10.1', '255.255.255.252', 'clock rate 64000'), ...ifc('s0/0/1', '192.168.10.5', '255.255.255.252', 'clock rate 64000'));
  conf(net, 'R2', 'hostname R2', ...ifc('fa0/0', '10.10.10.1', '255.255.255.0'), ...ifc('s0/0/0', '192.168.10.2', '255.255.255.252'), ...ifc('s0/0/1', '192.168.10.9', '255.255.255.252', 'clock rate 64000'));
  conf(net, 'R3', 'hostname R3', ...ifc('fa0/0', '172.16.1.33', '255.255.255.248'), ...ifc('s0/0/0', '192.168.10.6', '255.255.255.252'), ...ifc('s0/0/1', '192.168.10.10', '255.255.255.252'));
  net.configureHost('PC1', { ip: '172.16.1.20', mask: '255.255.255.240', gateway: '172.16.1.17' });
  net.configureHost('PC2', { ip: '10.10.10.10', mask: '255.255.255.0', gateway: '10.10.10.1' });
  net.configureHost('PC3', { ip: '172.16.1.35', mask: '255.255.255.248', gateway: '172.16.1.33' });
  if (withOspf) {
    conf(net, 'R1', 'router ospf 1', 'network 172.16.1.16 0.0.0.15 area 0', 'network 192.168.10.0 0.0.0.3 area 0', 'network 192.168.10.4 0.0.0.3 area 0');
    conf(net, 'R2', 'router ospf 1', 'network 10.10.10.0 0.0.0.255 area 0', 'network 192.168.10.0 0.0.0.3 area 0', 'network 192.168.10.8 0.0.0.3 area 0');
    conf(net, 'R3', 'router ospf 1', 'network 172.16.1.32 0.0.0.7 area 0', 'network 192.168.10.4 0.0.0.3 area 0', 'network 192.168.10.8 0.0.0.3 area 0');
  }
  for (const id of ['R1', 'R2', 'R3']) cli(net, id).drainSyslog();
  return net;
}

describe('lab 11.6.1: basic OSPF', () => {
  it('logs the adjacency when the network statement covering the link is added', () => {
    const net = triangle(false);
    conf(net, 'R1', 'router ospf 1', 'network 172.16.1.16 0.0.0.15 area 0', 'network 192.168.10.0 0.0.0.3 area 0', 'network 192.168.10.4 0.0.0.3 area 0');
    run(net, 'R2', ['enable', 'configure terminal', 'router ospf 1', 'network 10.10.10.0 0.0.0.255 area 0']);
    expect(cli(net, 'R2').execute('network 192.168.10.0 0.0.0.3 area 0').output).toBe(
      '\n%OSPF-5-ADJCHG: Process 1, Nbr 192.168.10.5 on Serial0/0/0 from LOADING to FULL, Loading Done',
    );
    // R1 hears about it too, on its own console
    // R2's router ID is its highest interface address, 192.168.10.9
    expect(cli(net, 'R1').drainSyslog()).toEqual(['%OSPF-5-ADJCHG: Process 1, Nbr 192.168.10.9 on Serial0/0/0 from LOADING to FULL, Loading Done']);
  });

  it('elects router IDs from the highest interface address and lists point-to-point neighbours', () => {
    const net = triangle();
    expect(out(net, 'R1', 'show ip ospf neighbor')).toBe(
      [
        '',
        'Neighbor ID     Pri   State           Dead Time   Address         Interface',
        '192.168.10.9      0   FULL/  -        00:00:35    192.168.10.2    Serial0/0/0',
        '192.168.10.10     0   FULL/  -        00:00:35    192.168.10.6    Serial0/0/1',
      ].join('\n'),
    );
    expect(out(net, 'R3', 'show ip protocols')).toContain('  Router ID 192.168.10.10');
  });

  it('builds the routing table of the PDF, with both equal-cost paths to 192.168.10.8/30', () => {
    const net = triangle();
    const routes = out(net, 'R1', 'show ip route').split('\n').slice(10);
    expect(routes).toEqual([
      'O    10.10.10.0/24 [110/65] via 192.168.10.2, 00:00:00, Serial0/0/0',
      'C    172.16.1.16/28 is directly connected, FastEthernet0/0',
      'O    172.16.1.32/29 [110/65] via 192.168.10.6, 00:00:00, Serial0/0/1',
      'C    192.168.10.0/30 is directly connected, Serial0/0/0',
      'C    192.168.10.4/30 is directly connected, Serial0/0/1',
      'O    192.168.10.8/30 [110/128] via 192.168.10.6, 00:00:00, Serial0/0/1',
      '                     [110/128] via 192.168.10.2, 00:00:00, Serial0/0/0',
    ]);
  });

  it('carries traffic between the LANs', () => {
    const net = triangle();
    net.ping('PC1', '10.10.10.10');
    expect(net.ping('PC1', '10.10.10.10').symbols).toBe('!!!!!');
    net.ping('PC2', '172.16.1.35');
    expect(net.ping('PC2', '172.16.1.35').symbols).toBe('!!!!!');
  });

  it('reroutes when a link fails, and logs the lost adjacency on both ends', () => {
    const net = triangle();
    run(net, 'R1', ['enable', 'configure terminal', 'interface s0/0/0']);
    const text = cli(net, 'R1').execute('shutdown').output;
    expect(text).toContain('%OSPF-5-ADJCHG: Process 1, Nbr 192.168.10.9 on Serial0/0/0 from FULL to DOWN, Neighbor Down: Interface down or detached');
    expect(cli(net, 'R2').drainSyslog()).toContain('%OSPF-5-ADJCHG: Process 1, Nbr 192.168.10.5 on Serial0/0/0 from FULL to DOWN, Neighbor Down: Interface down or detached');
    // 10.10.10.0/24 is now reached through R3: 64 + 64 + 1
    expect(out(net, 'R1', 'do show ip route')).toContain('O    10.10.10.0/24 [110/129] via 192.168.10.6, 00:00:00, Serial0/0/1');
    net.ping('PC1', '10.10.10.10');
    expect(net.ping('PC1', '10.10.10.10').symbols).toBe('!!!!!');
  });

  it('uses the bandwidth command for the cost', () => {
    const net = triangle();
    conf(net, 'R1', 'interface s0/0/0', 'bandwidth 64');
    expect(out(net, 'R1', 'show ip ospf interface brief')).toContain('Se0/0/0      1     0               192.168.10.1/30    1562  P2P   1/1');
    expect(out(net, 'R1', 'show ip route')).toContain('O    10.10.10.0/24 [110/129] via 192.168.10.6');
    conf(net, 'R1', 'interface s0/0/0', 'ip ospf cost 10');
    expect(out(net, 'R1', 'show ip route')).toContain('O    10.10.10.0/24 [110/11] via 192.168.10.2');
  });
});

describe('router ID', () => {
  it('keeps the router ID until clear ip ospf process, then prefers loopbacks', () => {
    const net = triangle();
    conf(net, 'R1', 'interface loopback 0', 'ip address 10.1.1.1 255.255.255.255');
    expect(out(net, 'R2', 'show ip ospf neighbor')).toContain('192.168.10.5');
    run(net, 'R1', ['enable', 'clear ip ospf process']);
    expect(cli(net, 'R1').prompt).toBe('Reset ALL OSPF processes? [no]: ');
    cli(net, 'R1').execute('yes');
    expect(out(net, 'R2', 'show ip ospf neighbor')).toContain('10.1.1.1');
  });

  it('warns that a configured router-id needs a restart, as in the PDF', () => {
    const net = triangle();
    run(net, 'R1', ['enable', 'configure terminal', 'router ospf 1']);
    expect(cli(net, 'R1').execute('router-id 10.4.4.4').output).toBe('Reload or use "clear ip ospf process" command, for this to take effect');
    expect(out(net, 'R2', 'show ip ospf neighbor')).not.toContain('10.4.4.4');
    run(net, 'R1', ['end', 'clear ip ospf process', 'y']);
    expect(out(net, 'R2', 'show ip ospf neighbor')).toContain('10.4.4.4          0   FULL/  -');
  });

  it('advertises loopbacks as host routes', () => {
    const net = triangle();
    conf(net, 'R2', 'interface loopback 0', 'ip address 10.2.2.2 255.255.255.0', 'router ospf 1', 'network 10.2.2.0 0.0.0.255 area 0');
    expect(out(net, 'R1', 'show ip route')).toContain('O    10.2.2.2/32 [110/65] via 192.168.10.2');
    expect(out(net, 'R2', 'show ip route')).toContain('C    10.2.2.0/24 is directly connected, Loopback0');
  });
});

/** Three routers sharing one Ethernet segment through a switch (a DR election). */
function lan(): Network {
  const net = new Network({ strictMdix: true });
  net.addDevice('S1', 'catalyst-2960');
  for (const [i, id] of ['R1', 'R2', 'R3'].entries()) {
    net.addDevice(id, 'cisco-1841');
    net.connect('straight', e(id, 'FastEthernet0/0'), e('S1', `FastEthernet0/${i + 1}`));
    conf(net, id, `hostname ${id}`, 'interface fa0/0', `ip address 10.0.0.${i + 1} 255.255.255.0`, 'no shutdown', 'interface loopback 0', `ip address ${i + 1}.${i + 1}.${i + 1}.${i + 1} 255.255.255.255`, 'router ospf 1', 'network 0.0.0.0 255.255.255.255 area 0');
  }
  return net;
}

describe('broadcast segments', () => {
  it('elects the highest router ID as DR and the next as BDR; DROTHERs stay 2WAY between themselves', () => {
    const net = lan();
    expect(out(net, 'R1', 'show ip ospf neighbor')).toBe(
      [
        '',
        'Neighbor ID     Pri   State           Dead Time   Address         Interface',
        '2.2.2.2           1   FULL/BDR        00:00:35    10.0.0.2        FastEthernet0/0',
        '3.3.3.3           1   FULL/DR         00:00:35    10.0.0.3        FastEthernet0/0',
      ].join('\n'),
    );
    conf(net, 'R3', 'interface fa0/0', 'ip ospf priority 0');
    conf(net, 'R1', 'interface fa0/0', 'ip ospf priority 0');
    // R2 is now DR, nobody is BDR; R1 and R3 (priority 0) are DROTHERs facing each other
    expect(out(net, 'R1', 'show ip ospf neighbor')).toContain('2.2.2.2           1   FULL/DR');
    expect(out(net, 'R1', 'show ip ospf neighbor')).toContain('3.3.3.3           0   2WAY/DROTHER');
    expect(out(net, 'R2', 'show ip ospf interface fa0/0')).toContain('No backup designated router on this network');
  });

  it('learns the loopbacks of the other routers through the segment', () => {
    const net = lan();
    expect(out(net, 'R1', 'show ip route')).toContain('O    3.3.3.3/32 [110/2] via 10.0.0.3, 00:00:00, FastEthernet0/0');
  });

  it('forms no adjacency through a passive interface, but still advertises its network', () => {
    const net = lan();
    conf(net, 'R1', 'router ospf 1', 'passive-interface fa0/0');
    expect(out(net, 'R1', 'show ip ospf neighbor')).toBe('');
    expect(out(net, 'R2', 'show ip ospf neighbor')).not.toContain('1.1.1.1');
    expect(out(net, 'R1', 'show ip ospf interface fa0/0')).toContain('No Hellos (Passive interface)');
    conf(net, 'R1', 'router ospf 1', 'passive-interface default', 'no passive-interface fa0/0');
    expect(out(net, 'R1', 'show ip ospf neighbor')).toContain('3.3.3.3');
  });

  it('refuses neighbours in another area or another subnet', () => {
    const net = lan();
    conf(net, 'R3', 'router ospf 1', 'no network 0.0.0.0 255.255.255.255 area 0', 'network 0.0.0.0 255.255.255.255 area 1');
    expect(out(net, 'R1', 'show ip ospf neighbor')).not.toContain('3.3.3.3');
    conf(net, 'R2', 'interface fa0/0', 'ip address 10.0.1.2 255.255.255.0');
    expect(out(net, 'R1', 'show ip ospf neighbor')).toBe('');
  });

  it('crosses a trunk to reach a router subinterface (hellos go through the L2 engine)', () => {
    const net = new Network({ strictMdix: true });
    net.addDevice('S1', 'catalyst-2960');
    net.addDevice('R1', 'cisco-1841');
    net.addDevice('R2', 'cisco-1841');
    net.connect('straight', e('R1', 'FastEthernet0/0'), e('S1', 'FastEthernet0/1'));
    net.connect('straight', e('R2', 'FastEthernet0/0'), e('S1', 'FastEthernet0/2'));
    conf(net, 'S1', 'vlan 20', 'interface fa0/1', 'switchport mode trunk', 'interface fa0/2', 'switchport access vlan 20');
    conf(net, 'R1', 'interface fa0/0', 'no shutdown', 'interface fa0/0.20', 'encapsulation dot1q 20', 'ip address 10.20.0.1 255.255.255.0', 'router ospf 1', 'network 10.20.0.0 0.0.0.255 area 0');
    conf(net, 'R2', 'interface fa0/0', 'ip address 10.20.0.2 255.255.255.0', 'no shutdown', 'router ospf 1', 'network 10.20.0.0 0.0.0.255 area 0');
    expect(out(net, 'R2', 'show ip ospf neighbor')).toContain('10.20.0.1');
    conf(net, 'S1', 'interface fa0/2', 'switchport access vlan 1');
    expect(out(net, 'R2', 'show ip ospf neighbor')).toBe('');
  });
});

describe('areas and external routes', () => {
  /** R1 (area 0) - R2 (ABR: area 0 and area 1) - R3 (area 1), each with a LAN. */
  function areas(): Network {
    const net = triangle(false);
    // drop the R1-R3 link to make a chain
    net.disconnect(e('R1', 'Serial0/0/1'));
    conf(net, 'R1', 'router ospf 1', 'network 172.16.1.16 0.0.0.15 area 0', 'network 192.168.10.0 0.0.0.3 area 0');
    conf(net, 'R2', 'router ospf 1', 'network 192.168.10.0 0.0.0.3 area 0', 'network 10.10.10.0 0.0.0.255 area 1', 'network 192.168.10.8 0.0.0.3 area 1');
    conf(net, 'R3', 'router ospf 1', 'network 172.16.1.32 0.0.0.7 area 1', 'network 192.168.10.8 0.0.0.3 area 1');
    return net;
  }

  it('marks routes from other areas as O IA, in both directions', () => {
    const net = areas();
    expect(out(net, 'R1', 'show ip route')).toContain('O IA 172.16.1.32/29 [110/129] via 192.168.10.2, 00:00:00, Serial0/0/0');
    expect(out(net, 'R1', 'show ip route')).toContain('O IA 10.10.10.0/24 [110/65] via 192.168.10.2');
    expect(out(net, 'R3', 'show ip route')).toContain('O IA 172.16.1.16/28 [110/129] via 192.168.10.9, 00:00:00, Serial0/0/1');
    expect(out(net, 'R3', 'show ip route')).toContain('O    10.10.10.0/24 [110/65] via 192.168.10.9');
    expect(out(net, 'R2', 'show ip ospf')).toContain('It is an area border router');
    net.ping('PC1', '172.16.1.35');
    expect(net.ping('PC1', '172.16.1.35').symbols).toBe('!!!!!');
  });

  it('spreads a default route with default-information originate (E2), only when the ASBR has one', () => {
    const net = areas();
    conf(net, 'R1', 'router ospf 1', 'default-information originate');
    expect(out(net, 'R3', 'show ip route')).not.toContain('0.0.0.0/0');
    conf(net, 'R1', 'ip route 0.0.0.0 0.0.0.0 fa0/0');
    const text = out(net, 'R3', 'show ip route');
    expect(text).toContain('Gateway of last resort is 192.168.10.9 to network 0.0.0.0');
    expect(text).toContain('O*E2 0.0.0.0/0 [110/1] via 192.168.10.9, 00:00:00, Serial0/0/1');
    conf(net, 'R1', 'no ip route 0.0.0.0 0.0.0.0 fa0/0', 'router ospf 1', 'default-information originate always');
    expect(out(net, 'R2', 'show ip route')).toContain('O*E2 0.0.0.0/0 [110/1] via 192.168.10.1');
  });

  it('lets a static route win over OSPF, and a floating static route wait behind it', () => {
    const net = triangle();
    conf(net, 'R1', 'ip route 10.10.10.0 255.255.255.0 192.168.10.6 130');
    expect(out(net, 'R1', 'show ip route')).toContain('O    10.10.10.0/24 [110/65]');
    conf(net, 'R1', 'ip route 10.10.10.0 255.255.255.0 192.168.10.6');
    expect(out(net, 'R1', 'show ip route')).toContain('S    10.10.10.0/24 [1/0] via 192.168.10.6');
  });
});

describe('configuration and show commands', () => {
  it('prints router ospf in running-config the IOS way', () => {
    const net = triangle();
    conf(net, 'R1', 'router ospf 1', 'router-id 1.1.1.1', 'auto-cost reference-bandwidth 1000', 'passive-interface fa0/0', 'default-information originate', 'interface s0/0/0', 'bandwidth 64', 'ip ospf cost 50');
    const text = out(net, 'R1', 'show running-config');
    expect(text).toContain(
      'router ospf 1\n router-id 1.1.1.1\n log-adjacency-changes\n auto-cost reference-bandwidth 1000\n passive-interface FastEthernet0/0\n network 172.16.1.16 0.0.0.15 area 0\n network 192.168.10.0 0.0.0.3 area 0\n network 192.168.10.4 0.0.0.3 area 0\n default-information originate\n!',
    );
    expect(text).toContain('interface Serial0/0/0\n bandwidth 64\n ip address 192.168.10.1 255.255.255.252\n ip ospf cost 50\n clock rate 64000\n!');
  });

  it('warns when the reference bandwidth changes', () => {
    const net = triangle();
    run(net, 'R1', ['enable', 'configure terminal', 'router ospf 1']);
    expect(cli(net, 'R1').execute('auto-cost reference-bandwidth 1000').output).toContain('% OSPF: Reference bandwidth is changed.');
  });

  it('shows the interfaces, the process and the protocols', () => {
    const net = triangle();
    expect(out(net, 'R1', 'show ip ospf interface brief')).toBe(
      [
        'Interface    PID   Area            IP Address/Mask    Cost  State Nbrs F/C',
        'Fa0/0        1     0               172.16.1.17/28     1     DR    0/0',
        'Se0/0/0      1     0               192.168.10.1/30    64    P2P   1/1',
        'Se0/0/1      1     0               192.168.10.5/30    64    P2P   1/1',
      ].join('\n'),
    );
    expect(out(net, 'R1', 'show ip ospf')).toContain(' Routing Process "ospf 1" with ID 192.168.10.5');
    expect(out(net, 'R1', 'show ip protocols')).toContain('  Routing for Networks:\n    172.16.1.16 0.0.0.15 area 0');
    expect(out(net, 'R1', 'show ip ospf interface s0/0/0')).toContain('Process ID 1, Router ID 192.168.10.5, Network Type POINT_TO_POINT, Cost: 64');
  });

  it('runs one process per router and only on routers', () => {
    const net = triangle();
    run(net, 'R1', ['enable', 'configure terminal']);
    expect(out(net, 'R1', 'router ospf 2')).toContain('single OSPF process');
    run(net, 'R1', ['no router ospf 1']);
    expect(out(net, 'R2', 'show ip ospf neighbor')).not.toContain('192.168.10.5');
    expect(cli(net, 'R2').drainSyslog().join('\n')).toContain('from FULL to DOWN');
    const s = new Network();
    s.addDevice('S1', 'catalyst-2960');
    run(s, 'S1', ['enable', 'configure terminal']);
    expect(s.device('S1').cli!.execute('router ospf 1').output).toContain('Invalid input');
  });

  it('survives a snapshot round trip without logging the adjacencies again', () => {
    const net = triangle();
    const copy = Network.restore(JSON.parse(JSON.stringify(net.snapshot())));
    expect(copy.drainSyslog('R1')).toEqual([]);
    expect(copy.device('R1').cli!.execute('show ip ospf neighbor').output).toContain('FULL/  -');
    copy.ping('PC1', '10.10.10.10');
    expect(copy.ping('PC1', '10.10.10.10').symbols).toBe('!!!!!');
  });
});
