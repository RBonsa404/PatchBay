import { describe, expect, it } from 'vitest';
import { Network } from '../src/index.js';
import { run, staticLab } from './fixtures.js';

const e = (device: string, port: string) => ({ device, port });
const NIC = 'FastEthernet0';
const cli = (net: Network, id: string) => net.device(id).cli!;
const out = (net: Network, id: string, line: string) => cli(net, id).execute(line).output;
const symbols = (net: Network, id: string, dst: string) => net.ping(id, dst).symbols;

const addStatics = (net: Network) => {
  run(net, 'R1', ['configure terminal', 'ip route 172.16.1.0 255.255.255.0 172.16.2.2', 'ip route 192.168.1.0 255.255.255.0 172.16.2.2', 'ip route 192.168.2.0 255.255.255.0 172.16.2.2', 'end']);
  run(net, 'R2', ['configure terminal', 'ip route 172.16.3.0 255.255.255.0 172.16.2.1', 'ip route 192.168.2.0 255.255.255.0 192.168.1.1', 'end']);
  run(net, 'R3', ['configure terminal', 'ip route 172.16.1.0 255.255.255.0 192.168.1.2', 'ip route 172.16.2.0 255.255.255.0 192.168.1.2', 'ip route 172.16.3.0 255.255.255.0 192.168.1.2', 'end']);
};

describe('routing table', () => {
  it('lists connected networks as the course PDF does', () => {
    const net = staticLab();
    expect(out(net, 'R1', 'show ip route')).toBe(
      [
        'Codes: C - connected, S - static, R - RIP, M - mobile, B - BGP',
        '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
        '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
        '       E1 - OSPF external type 1, E2 - OSPF external type 2',
        '       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2',
        '       ia - IS-IS inter area, * - candidate default, U - per-user static route',
        '       o - ODR, P - periodic downloaded static route',
        '',
        'Gateway of last resort is not set',
        '',
        'C    172.16.2.0/24 is directly connected, Serial0/0/0',
        'C    172.16.3.0/24 is directly connected, FastEthernet0/0',
      ].join('\n'),
    );
  });

  it('adds static routes, with [distance/metric] and via', () => {
    const net = staticLab();
    run(net, 'R3', ['enable', 'configure terminal', 'ip route 172.16.1.0 255.255.255.0 192.168.1.2']);
    expect(out(net, 'R3', 'do show ip route')).toContain('S    172.16.1.0/24 [1/0] via 192.168.1.2');
  });

  it('shows a default route with S* and the gateway of last resort', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal', 'ip route 0.0.0.0 0.0.0.0 172.16.2.2']);
    const text = out(net, 'R1', 'do show ip route');
    expect(text).toContain('Gateway of last resort is 172.16.2.2 to network 0.0.0.0');
    expect(text).toContain('S*   0.0.0.0/0 [1/0] via 172.16.2.2');
  });

  it('shows interface routes as directly connected', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal', 'ip route 172.16.1.0 255.255.255.0 serial 0/0/0']);
    expect(out(net, 'R1', 'do show ip route')).toContain('S    172.16.1.0/24 is directly connected, Serial0/0/0');
  });

  it('only installs routes whose next hop is reachable, and drops routes of a down interface', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal', 'ip route 10.0.0.0 255.0.0.0 9.9.9.9']);
    expect(out(net, 'R1', 'do show ip route')).not.toContain('10.0.0.0');
    run(net, 'R1', ['ip route 172.16.1.0 255.255.255.0 172.16.2.2', 'interface s0/0/0', 'shutdown']);
    const text = out(net, 'R1', 'do show ip route');
    expect(text).not.toContain('172.16.1.0');
    expect(text).not.toContain('172.16.2.0');
  });

  it('prefers the lowest administrative distance, so a floating static route waits in the wings', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal', 'ip route 172.16.1.0 255.255.255.0 172.16.2.2', 'ip route 172.16.1.0 255.255.255.0 172.16.2.2 5']);
    // same next hop: the second line updates the distance, there is still one route
    expect(cli(net, 'R1').config.staticRoutes).toHaveLength(1);
    expect(out(net, 'R1', 'do show ip route')).toContain('[5/0]');

    run(net, 'R1', ['no ip route 172.16.1.0 255.255.255.0']);
    expect(cli(net, 'R1').config.staticRoutes).toHaveLength(0);
  });

  it('rejects an inconsistent address and mask, and non-contiguous masks', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal']);
    expect(out(net, 'R1', 'ip route 172.16.1.5 255.255.255.0 172.16.2.2')).toBe('%Inconsistent address and mask');
    expect(out(net, 'R1', 'ip route 172.16.0.0 255.0.255.0 172.16.2.2')).toContain('Invalid input');
  });

  it('prints static routes in running-config', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal', 'ip route 172.16.1.0 255.255.255.0 172.16.2.2', 'ip route 0.0.0.0 0.0.0.0 serial 0/0/0 200', 'end']);
    const text = out(net, 'R1', 'show running-config');
    expect(text).toContain('ip route 172.16.1.0 255.255.255.0 172.16.2.2\nip route 0.0.0.0 0.0.0.0 Serial0/0/0 200\n!');
  });
});

describe('ping', () => {
  it('shows .!!!! for the first ping to a neighbour: the first packet pays for ARP', () => {
    const net = staticLab();
    expect(out(net, 'R1', 'ping 172.16.3.10')).toBe(
      [
        '',
        'Type escape sequence to abort.',
        'Sending 5, 100-byte ICMP Echos to 172.16.3.10, timeout is 2 seconds:',
        '.!!!!',
        'Success rate is 80 percent (4/5), round-trip min/avg/max = 1/1/1 ms',
      ].join('\n'),
    );
    expect(symbols(net, 'R1', '172.16.3.10')).toBe('!!!!!');
  });

  it('crosses a serial link without ARP', () => {
    const net = staticLab();
    expect(symbols(net, 'R1', '172.16.2.2')).toBe('!!!!!');
    expect(symbols(net, 'R2', '172.16.2.1')).toBe('!!!!!');
  });

  it('does not reach networks it has no route to', () => {
    const net = staticLab();
    expect(symbols(net, 'R1', '172.16.1.1')).toBe('.....');
    expect(out(net, 'R1', 'ping 172.16.1.1')).toContain('Success rate is 0 percent (0/5)');
    // the PC's gateway answers "unreachable" once the ARP exchange is over
    expect(symbols(net, 'PC1', '172.16.1.10')).toBe('.UUUU');
  });

  it('reaches every network once all static routes are in place, losing a packet per ARP on the way', () => {
    const net = staticLab();
    addStatics(net);
    expect(symbols(net, 'PC1', '172.16.1.10')).toBe('..!!!'); // ARP at PC1's gateway, then ARP at R2
    expect(symbols(net, 'PC1', '172.16.1.10')).toBe('!!!!!');
    expect(symbols(net, 'PC1', '192.168.2.10')).toBe('.!!!!'); // only R3's LAN is new
    expect(net.ping('PC3', '172.16.3.10').received).toBe(5);
    expect(out(net, 'R1', 'ping 192.168.2.10')).toContain('Success rate is 100 percent (5/5)');
  });

  it('is asymmetric when only one direction has a route', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal', 'ip route 172.16.1.0 255.255.255.0 172.16.2.2', 'end']);
    expect(net.ping('R1', '172.16.1.1').received).toBe(5); // R2 answers: it is directly connected to R1
    expect(net.ping('PC1', '172.16.1.10').received).toBe(0); // PC2's reply has no way back to 172.16.3.0
  });

  it('reports unreachable (U) when a router answers with ICMP unreachable', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal', 'ip route 0.0.0.0 0.0.0.0 172.16.2.2', 'end']);
    // R2 has no route to 10.1.1.1, so it sends back unreachable
    expect(symbols(net, 'R1', '10.1.1.1')).toBe('UUUUU');
  });

  it('reports TTL exceeded (&) when a routing loop eats the packet', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal', 'ip route 10.1.1.0 255.255.255.0 172.16.2.2', 'end']);
    run(net, 'R2', ['enable', 'configure terminal', 'ip route 10.1.1.0 255.255.255.0 172.16.2.1', 'end']);
    expect(symbols(net, 'R1', '10.1.1.1')).toBe('&&&&&');
  });

  it('answers pings to its own addresses', () => {
    const net = staticLab();
    expect(symbols(net, 'R1', '172.16.3.1')).toBe('!!!!!');
    expect(symbols(net, 'PC1', '172.16.3.10')).toBe('!!!!!');
  });

  it('fails when the link is down', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal', 'interface s0/0/0', 'shutdown']);
    expect(symbols(net, 'R1', '172.16.2.2')).toBe('.....');
  });

  it('does not forward when a PC has the wrong gateway', () => {
    const net = staticLab();
    addStatics(net);
    net.configureHost('PC1', { ip: '172.16.3.10', mask: '255.255.255.0', gateway: '172.16.3.99' });
    expect(net.ping('PC1', '172.16.1.10').received).toBe(0);
    net.configureHost('PC1', { ip: '172.16.3.10', mask: '255.255.255.0' });
    expect(net.ping('PC1', '172.16.1.10').received).toBe(0);
  });
});

describe('traceroute', () => {
  it('lists every router on the way', () => {
    const net = staticLab();
    addStatics(net);
    net.ping('R1', '192.168.2.10', 3); // warm the ARP caches so no probe is lost
    net.ping('R1', '192.168.2.10', 3);
    expect(out(net, 'R1', 'traceroute 192.168.2.10')).toBe(
      [
        '',
        'Type escape sequence to abort.',
        'Tracing the route to 192.168.2.10',
        '',
        '  1 172.16.2.2 0 msec 0 msec 0 msec',
        '  2 192.168.1.1 0 msec 0 msec 0 msec',
        '  3 192.168.2.10 0 msec 0 msec 0 msec',
      ].join('\n'),
    );
  });

  it('shows * for the probe lost to ARP', () => {
    const net = staticLab();
    expect(out(net, 'R1', 'traceroute 172.16.3.10')).toContain('  1 172.16.3.10 * 0 msec 0 msec');
  });

  it('stops at an unreachable network', () => {
    const net = staticLab();
    run(net, 'R1', ['enable', 'configure terminal', 'ip route 0.0.0.0 0.0.0.0 172.16.2.2', 'end']);
    const text = out(net, 'R1', 'traceroute 10.1.1.1');
    expect(text).toContain('  1 172.16.2.2 0 msec 0 msec 0 msec\n  2 172.16.2.2 !N !N !N');
  });
});

describe('ARP', () => {
  it('shows own and learned addresses', () => {
    const net = staticLab();
    net.ping('R1', '172.16.3.10', 1);
    const row = (ip: string, age: string, mac: string, iface: string) =>
      `Internet  ${ip.padEnd(17)}${age.padStart(8)}   ${mac}  ARPA   ${iface}`;
    expect(out(net, 'R1', 'show ip arp')).toBe(
      [
        'Protocol  Address          Age (min)  Hardware Addr   Type   Interface',
        row('172.16.3.1', '-', net.macOf('R1', 'FastEthernet0/0'), 'FastEthernet0/0'),
        row('172.16.2.1', '-', net.macOf('R1', 'Serial0/0/0'), 'Serial0/0/0'),
        row('172.16.3.10', '0', net.macOf('PC1', NIC), 'FastEthernet0/0'),
      ].join('\n'),
    );
    run(net, 'R1', ['enable', 'clear arp-cache']);
    expect(out(net, 'R1', 'show arp')).not.toContain('172.16.3.10');
  });
});

describe('router on a stick', () => {
  function stick() {
    const net = new Network({ strictMdix: true });
    net.addDevice('R1', 'cisco-1841');
    net.addDevice('S1', 'catalyst-2960');
    for (const id of ['PC1', 'PC2', 'PC3']) net.addDevice(id, 'pc');
    net.connect('straight', e('R1', 'FastEthernet0/0'), e('S1', 'FastEthernet0/1'));
    net.connect('straight', e('PC1', NIC), e('S1', 'FastEthernet0/2'));
    net.connect('straight', e('PC2', NIC), e('S1', 'FastEthernet0/3'));
    net.connect('straight', e('PC3', NIC), e('S1', 'FastEthernet0/4'));
    run(net, 'S1', [
      'enable', 'configure terminal', 'vlan 10', 'vlan 20', 'vlan 99', 'exit',
      'interface fa0/1', 'switchport mode trunk', 'switchport trunk native vlan 99',
      'interface fa0/2', 'switchport access vlan 10', 'interface fa0/3', 'switchport access vlan 20', 'interface fa0/4', 'switchport access vlan 10', 'end',
    ]);
    run(net, 'R1', [
      'enable', 'configure terminal', 'interface fa0/0', 'no shutdown',
      'interface fa0/0.10', 'encapsulation dot1q 10', 'ip address 172.17.10.1 255.255.255.0',
      'interface fa0/0.20', 'encapsulation dot1q 20', 'ip address 172.17.20.1 255.255.255.0',
      'interface fa0/0.99', 'encapsulation dot1q 99 native', 'ip address 172.17.99.1 255.255.255.0', 'end',
    ]);
    net.configureHost('PC1', { ip: '172.17.10.21', mask: '255.255.255.0', gateway: '172.17.10.1' });
    net.configureHost('PC2', { ip: '172.17.20.22', mask: '255.255.255.0', gateway: '172.17.20.1' });
    net.configureHost('PC3', { ip: '172.17.10.24', mask: '255.255.255.0', gateway: '172.17.10.1' });
    return net;
  }

  it('routes between VLANs through the trunk subinterfaces', () => {
    const net = stick();
    expect(net.ping('PC1', '172.17.10.1').received).toBeGreaterThanOrEqual(4);
    expect(net.ping('PC1', '172.17.20.22').received).toBeGreaterThanOrEqual(3);
    expect(net.ping('PC1', '172.17.20.22').symbols).toBe('!!!!!');
    expect(net.ping('PC2', '172.17.10.21').symbols).toBe('!!!!!');
  });

  it('keeps hosts of the same VLAN on the switch (no router in the path)', () => {
    const net = stick();
    net.ping('PC1', '172.17.10.24');
    expect(net.ping('PC1', '172.17.10.24').symbols).toBe('!!!!!');
    // the router never saw those frames: only PC1 and PC3 were learned by the switch
    expect(net.macTables.list('S1').map((m) => m.vlan)).toContain(10);
  });

  it('shows the subinterfaces in running-config and in show ip interface brief', () => {
    const net = stick();
    const text = out(net, 'R1', 'show running-config');
    expect(text).toContain('interface FastEthernet0/0.10\n encapsulation dot1Q 10\n ip address 172.17.10.1 255.255.255.0\n!');
    expect(text).toContain('interface FastEthernet0/0.99\n encapsulation dot1Q 99 native\n ip address 172.17.99.1 255.255.255.0\n!');
    expect(out(net, 'R1', 'show ip interface brief')).toContain('FastEthernet0/0.10     172.17.10.1     YES manual up                    up');
  });

  it('puts subinterfaces right after their parent and follows the parent state', () => {
    const net = stick();
    expect(cli(net, 'R1').config.interfaces.map((i) => i.name).slice(0, 5)).toEqual([
      'FastEthernet0/0', 'FastEthernet0/0.10', 'FastEthernet0/0.20', 'FastEthernet0/0.99', 'FastEthernet0/1',
    ]);
    run(net, 'R1', ['enable', 'configure terminal', 'interface fa0/0', 'shutdown']);
    expect(net.linkState('R1', 'FastEthernet0/0.10').status).toBe('administratively down');
    expect(net.ping('PC1', '172.17.20.22').received).toBe(0);
  });

  it('breaks when the encapsulation VLAN is wrong', () => {
    const net = stick();
    run(net, 'R1', ['enable', 'configure terminal', 'interface fa0/0.10', 'encapsulation dot1q 11']);
    expect(net.ping('PC1', '172.17.20.22').received).toBe(0);
    run(net, 'R1', ['no encapsulation dot1q', 'encapsulation dot1q 10']);
    net.ping('PC1', '172.17.20.22'); // pays for the ARP exchanges lost while the encapsulation was wrong
    expect(net.ping('PC1', '172.17.20.22').symbols).toBe('!!!!!');
  });

  it('refuses subinterfaces on switches and the subif-only commands elsewhere', () => {
    const net = stick();
    run(net, 'S1', ['enable', 'configure terminal']);
    expect(out(net, 'S1', 'interface fa0/1.10')).toContain('Invalid input');
    run(net, 'R1', ['enable', 'configure terminal', 'interface fa0/0']);
    expect(out(net, 'R1', 'encapsulation dot1q 10')).toContain('Invalid input');
    run(net, 'R1', ['exit', 'no interface fa0/0.99']);
    expect(cli(net, 'R1').config.interfaces.some((i) => i.name === 'FastEthernet0/0.99')).toBe(false);
    expect(out(net, 'R1', 'no interface fa0/0')).toContain('Invalid input');
  });
});

describe('switch management stack', () => {
  it('pings across a trunk between two SVIs, and uses ip default-gateway to leave the subnet', () => {
    const net = new Network({ strictMdix: true });
    net.addDevice('S1', 'catalyst-2960');
    net.addDevice('S2', 'catalyst-2960');
    net.addDevice('R1', 'cisco-1841');
    net.connect('crossover', e('S1', 'FastEthernet0/1'), e('S2', 'FastEthernet0/1'));
    net.connect('straight', e('R1', 'FastEthernet0/0'), e('S1', 'FastEthernet0/2'));
    for (const [sw, ip] of [['S1', '172.17.99.11'], ['S2', '172.17.99.12']] as const) {
      run(net, sw, [
        'enable', 'configure terminal', 'vlan 99', 'exit', 'interface fa0/1', 'switchport mode trunk', 'switchport trunk native vlan 99',
        'interface vlan 99', `ip address ${ip} 255.255.255.0`, 'no shutdown', 'exit', 'ip default-gateway 172.17.99.1', 'end',
      ]);
    }
    run(net, 'S1', ['configure terminal', 'interface fa0/2', 'switchport access vlan 99', 'end']);
    run(net, 'R1', ['enable', 'configure terminal', 'interface fa0/0', 'ip address 172.17.99.1 255.255.255.0', 'no shutdown', 'end']);

    expect(out(net, 'S1', 'ping 172.17.99.12')).toContain('Success rate is 80 percent (4/5)');
    expect(out(net, 'S1', 'ping 172.17.99.12')).toContain('Success rate is 100 percent (5/5)');
    expect(out(net, 'S2', 'ping 172.17.99.1')).toContain('Success rate is 80 percent (4/5)');
    expect(out(net, 'S1', 'ping 172.17.99.12')).toContain('!!!!!');
    // the router can ping the switch back through the same L2 domain
    expect(net.ping('R1', '172.17.99.12').received).toBeGreaterThanOrEqual(4);
  });

  it('keeps show ip route for routers', () => {
    const net = new Network();
    net.addDevice('S1', 'catalyst-2960');
    run(net, 'S1', ['enable']);
    expect(out(net, 'S1', 'show ip route')).toContain('Invalid input');
  });
});

describe('snapshot with L3 state', () => {
  it('keeps host settings and static routes', () => {
    const net = staticLab();
    addStatics(net);
    const copy = Network.restore(JSON.parse(JSON.stringify(net.snapshot())));
    expect(copy.device('PC1').host).toEqual({ ip: '172.16.3.10', mask: '255.255.255.0', gateway: '172.16.3.1' });
    expect(copy.device('R1').cli!.config.staticRoutes).toHaveLength(3);
    expect(copy.ping('PC1', '172.16.1.10').symbols).toBe('..!!!');
  });
});
