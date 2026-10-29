import { describe, expect, it } from 'vitest';
import { Network } from '../src/index.js';
import { run } from './fixtures.js';

const e = (device: string, port: string) => ({ device, port });
const NIC = 'FastEthernet0';
const out = (net: Network, id: string, line: string) => net.device(id).cli!.execute(line).output;
const conf = (net: Network, ...lines: string[]) => run(net, 'R1', ['enable', 'configure terminal', ...lines, 'end']);

/**
 * Private LAN 192.168.1.0/24 (PC1, PC2, an inside web server) - R1 (NAT) - ISP - EXT (8.8.8.8, "the Internet").
 * The ISP router knows nothing about 192.168.1.0/24: without NAT the answers have nowhere to go.
 */
function lab(): Network {
  const net = new Network({ strictMdix: true });
  for (const [id, model] of [['R1', 'cisco-1841'], ['ISP', 'cisco-1841'], ['S1', 'catalyst-2960'], ['PC1', 'pc'], ['PC2', 'pc'], ['WEB', 'server'], ['EXT', 'server']] as const) {
    net.addDevice(id, model);
  }
  net.connect('straight', e('R1', 'FastEthernet0/0'), e('S1', 'FastEthernet0/1'));
  for (const [id, port] of [['PC1', 2], ['PC2', 3], ['WEB', 4]] as const) net.connect('straight', e(id, NIC), e('S1', `FastEthernet0/${port}`));
  net.connect('crossover', e('R1', 'FastEthernet0/1'), e('ISP', 'FastEthernet0/0'));
  net.connect('crossover', e('ISP', 'FastEthernet0/1'), e('EXT', NIC));
  run(net, 'R1', [
    'enable', 'configure terminal',
    'interface fa0/0', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown',
    'interface fa0/1', 'ip address 200.0.0.1 255.255.255.0', 'no shutdown',
    'exit', 'ip route 0.0.0.0 0.0.0.0 200.0.0.2', 'end',
  ]);
  run(net, 'ISP', [
    'enable', 'configure terminal',
    'interface fa0/0', 'ip address 200.0.0.2 255.255.255.0', 'no shutdown',
    'interface fa0/1', 'ip address 8.8.8.1 255.255.255.0', 'no shutdown', 'end',
  ]);
  const lan = { mask: '255.255.255.0', gateway: '192.168.1.1' };
  net.configureHost('PC1', { ip: '192.168.1.10', ...lan });
  net.configureHost('PC2', { ip: '192.168.1.11', ...lan });
  net.configureHost('WEB', { ip: '192.168.1.50', ...lan, services: { tcp: [80] } });
  net.configureHost('EXT', { ip: '8.8.8.8', mask: '255.255.255.0', gateway: '8.8.8.1', services: { tcp: [80], udp: [53] } });
  return net;
}

const roles = ['interface fa0/0', 'ip nat inside', 'interface fa0/1', 'ip nat outside', 'exit'];

describe('without NAT', () => {
  it('cannot reach the Internet: the ISP has no route back to private addresses', () => {
    const net = lab();
    expect(net.ping('PC1', '8.8.8.8').received).toBe(0);
    expect(net.tcpConnect('PC1', '8.8.8.8', 80)).toBe('timeout');
  });
});

describe('PAT on the outside interface (overload)', () => {
  it('lets every inside host out behind the router address, one port per flow', () => {
    const net = lab();
    conf(net, ...roles, 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat inside source list 1 interface fa0/1 overload');
    expect(net.ping('PC1', '8.8.8.8').symbols).toBe('...!!'); // three ARP exchanges on the way
    expect(net.ping('PC1', '8.8.8.8').symbols).toBe('!!!!!');
    expect(net.ping('PC2', '8.8.8.8').received).toBeGreaterThanOrEqual(4);
    expect(net.tcpConnect('PC1', '8.8.8.8', 80)).toBe('open');
    expect(net.udpSend('PC2', '8.8.8.8', 53)).toBe('open');

    const table = out(net, 'R1', 'show ip nat translations').split('\n');
    expect(table[0]).toBe('Pro Inside global      Inside local       Outside local      Outside global');
    expect(table.some((l) => /^icmp 200\.0\.0\.1:\d+ +192\.168\.1\.10:\d+ +8\.8\.8\.8:\d+ +8\.8\.8\.8:\d+$/.test(l))).toBe(true);
    expect(table.some((l) => /^tcp 200\.0\.0\.1:\d+ +192\.168\.1\.10:\d+ +8\.8\.8\.8:80 +8\.8\.8\.8:80$/.test(l))).toBe(true);
    expect(table.some((l) => /^udp 200\.0\.0\.1:\d+ +192\.168\.1\.11:\d+ +8\.8\.8\.8:53 +8\.8\.8\.8:53$/.test(l))).toBe(true);
  });

  it('only translates the addresses its ACL permits', () => {
    const net = lab();
    conf(net, ...roles, 'access-list 1 permit host 192.168.1.10', 'ip nat inside source list 1 interface fa0/1 overload');
    expect(net.tcpConnect('PC1', '8.8.8.8', 80)).toBe('open');
    expect(net.tcpConnect('PC2', '8.8.8.8', 80)).toBe('timeout');
  });

  it('does nothing without ip nat inside / outside on the interfaces', () => {
    const net = lab();
    conf(net, 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat inside source list 1 interface fa0/1 overload');
    expect(net.tcpConnect('PC1', '8.8.8.8', 80)).toBe('timeout');
  });

  it('keeps the original port when it is free and picks another one when it is taken', async () => {
    const { allocatePort } = await import('../src/protocols/nat/nat.js');
    expect(allocatePort(49152, () => false)).toBe(49152);
    expect(allocatePort(49152, (p) => p === 49152 || p === 1024)).toBe(1025);
    expect(allocatePort(7, (p) => p === 7)).toBe(1);
    expect(allocatePort(600, (p) => p === 600)).toBe(512);
  });
});

describe('dynamic NAT with a pool', () => {
  it('hands out one public address per inside host and refuses when the pool is empty', () => {
    const net = lab();
    conf(net, ...roles, 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat pool PUBLIC 200.0.0.10 200.0.0.11 netmask 255.255.255.0', 'ip nat inside source list 1 pool PUBLIC');
    expect(net.tcpConnect('PC1', '8.8.8.8', 80)).toBe('open');
    expect(net.tcpConnect('PC2', '8.8.8.8', 80)).toBe('open');
    expect(net.tcpConnect('WEB', '8.8.8.8', 80)).toBe('unreachable'); // no address left
    const text = out(net, 'R1', 'show ip nat translations');
    expect(text).toContain('--- 200.0.0.10         192.168.1.10       ---                ---');
    expect(text).toContain('--- 200.0.0.11         192.168.1.11       ---                ---');
  });

  it('overloads the first pool address when asked', () => {
    const net = lab();
    conf(net, ...roles, 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat pool PUBLIC 200.0.0.10 200.0.0.10 prefix-length 24', 'ip nat inside source list 1 pool PUBLIC overload');
    for (const id of ['PC1', 'PC2', 'WEB']) expect(net.tcpConnect(id, '8.8.8.8', 80)).toBe('open');
  });

  it('frees addresses with clear ip nat translation *', () => {
    const net = lab();
    conf(net, ...roles, 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat pool PUBLIC 200.0.0.10 200.0.0.10 netmask 255.255.255.0', 'ip nat inside source list 1 pool PUBLIC');
    expect(net.tcpConnect('PC1', '8.8.8.8', 80)).toBe('open');
    expect(net.tcpConnect('PC2', '8.8.8.8', 80)).toBe('unreachable');
    run(net, 'R1', ['enable', 'clear ip nat translation *']);
    expect(net.tcpConnect('PC2', '8.8.8.8', 80)).toBe('open');
  });
});

describe('static NAT', () => {
  it('publishes an inside server on a public address, in both directions', () => {
    const net = lab();
    conf(net, ...roles, 'ip nat inside source static 192.168.1.50 200.0.0.50');
    expect(net.tcpConnect('EXT', '200.0.0.50', 80)).toBe('open'); // R1 answers ARP for 200.0.0.50
    expect(net.tcpConnect('EXT', '200.0.0.50', 22)).toBe('refused');
    expect(net.ping('WEB', '8.8.8.8').received).toBeGreaterThanOrEqual(3); // goes out as 200.0.0.50
    expect(out(net, 'R1', 'show ip nat translations')).toContain('--- 200.0.0.50         192.168.1.50       ---                ---');
  });

  it('keeps unrelated inside hosts private', () => {
    const net = lab();
    conf(net, ...roles, 'ip nat inside source static 192.168.1.50 200.0.0.50');
    expect(net.tcpConnect('PC1', '8.8.8.8', 80)).toBe('timeout');
    expect(net.tcpConnect('EXT', '200.0.0.51', 80)).toBe('timeout');
  });
});

describe('show and running-config', () => {
  it('summarises the NAT state in show ip nat statistics', () => {
    const net = lab();
    conf(net, ...roles, 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat pool PUBLIC 200.0.0.10 200.0.0.13 netmask 255.255.255.0', 'ip nat inside source list 1 pool PUBLIC', 'ip nat inside source static 192.168.1.50 200.0.0.50');
    net.tcpConnect('PC1', '8.8.8.8', 80);
    const text = out(net, 'R1', 'show ip nat statistics');
    expect(text).toContain('Total active translations: 2 (1 static, 1 dynamic; 0 extended)');
    expect(text).toContain('Outside interfaces:\n  FastEthernet0/1\nInside interfaces:\n  FastEthernet0/0');
    expect(text).toContain('[Id: 1] access-list 1 pool PUBLIC refcount 1');
    expect(text).toContain('type generic, total addresses 4, allocated 1 (25%), misses 0');
  });

  it('prints the NAT configuration like IOS', () => {
    const net = lab();
    conf(net, ...roles, 'access-list 1 permit 192.168.1.0 0.0.0.255', 'ip nat pool PUBLIC 200.0.0.10 200.0.0.13 netmask 255.255.255.0', 'ip nat inside source list 1 pool PUBLIC overload', 'ip nat inside source static 192.168.1.50 200.0.0.50');
    const text = out(net, 'R1', 'show running-config');
    expect(text).toContain('interface FastEthernet0/0\n ip address 192.168.1.1 255.255.255.0\n ip nat inside\n');
    expect(text).toContain(' ip nat outside\n');
    expect(text).toContain('ip nat pool PUBLIC 200.0.0.10 200.0.0.13 netmask 255.255.255.0\nip nat inside source list 1 pool PUBLIC overload\nip nat inside source static 192.168.1.50 200.0.0.50\n!');
  });

  it('removes pools, rules and mappings with no', () => {
    const net = lab();
    conf(net, 'ip nat pool PUBLIC 200.0.0.10 200.0.0.13 netmask 255.255.255.0', 'ip nat inside source list 1 pool PUBLIC', 'ip nat inside source static 192.168.1.50 200.0.0.50');
    conf(net, 'no ip nat inside source list 1 pool PUBLIC', 'no ip nat pool PUBLIC', 'no ip nat inside source static 192.168.1.50 200.0.0.50');
    expect(net.device('R1').cli!.config.nat).toEqual({ statics: [], pools: [], rules: [] });
  });

  it('refuses a non-contiguous pool mask', () => {
    const net = lab();
    run(net, 'R1', ['enable', 'configure terminal']);
    expect(out(net, 'R1', 'ip nat pool X 200.0.0.10 200.0.0.13 netmask 255.0.255.0')).toContain('Invalid input');
  });
});
