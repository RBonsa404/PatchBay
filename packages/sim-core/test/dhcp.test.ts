import { describe, expect, it } from 'vitest';
import { Network } from '../src/index.js';

function lan(): Network {
  const net = new Network({ strictMdix: true });
  net.addDevice('R1', 'cisco-2911');
  net.addDevice('S1', 'catalyst-2960');
  net.addDevice('PC1', 'pc');
  net.addDevice('PC2', 'pc');
  net.connect('straight', { device: 'S1', port: 'GigabitEthernet0/1' }, { device: 'R1', port: 'GigabitEthernet0/0' });
  net.connect('straight', { device: 'PC1', port: 'FastEthernet0' }, { device: 'S1', port: 'FastEthernet0/1' });
  net.connect('straight', { device: 'PC2', port: 'FastEthernet0' }, { device: 'S1', port: 'FastEthernet0/2' });
  return net;
}

const type = (net: Network, id: string, ...lines: string[]): string[] => lines.map((l) => net.device(id).cli!.execute(l).output ?? '');

const SERVER = ['enable', 'configure terminal', 'interface g0/0', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'exit', 'ip dhcp excluded-address 192.168.1.1 192.168.1.9', 'ip dhcp pool LAN', 'network 192.168.1.0 255.255.255.0', 'default-router 192.168.1.1', 'dns-server 8.8.8.8', 'end'];

describe('DHCP', () => {
  it('gives the first free address after the excluded range, with the gateway', () => {
    const net = lan();
    type(net, 'R1', ...SERVER);
    expect(net.dhcpRenew('PC1')).toBe(true);
    expect(net.device('PC1').host).toMatchObject({ dhcp: true, ip: '192.168.1.10', mask: '255.255.255.0', gateway: '192.168.1.1', dns: '8.8.8.8' });
    expect(net.dhcpRenew('PC2')).toBe(true);
    expect(net.device('PC2').host?.ip).toBe('192.168.1.11');
    expect(net.ping('PC1', '192.168.1.1', 5).received).toBeGreaterThan(0);
  });

  it('keeps the same address when renewing, and shows it in the bindings', () => {
    const net = lan();
    type(net, 'R1', ...SERVER);
    net.dhcpRenew('PC1');
    net.dhcpRenew('PC1');
    expect(net.device('PC1').host?.ip).toBe('192.168.1.10');
    const [table] = type(net, 'R1', 'show ip dhcp binding');
    expect(table).toContain('192.168.1.10');
    expect(table!.split('\n')).toHaveLength(3);
  });

  it('gives the address back on release', () => {
    const net = lan();
    type(net, 'R1', ...SERVER);
    net.dhcpRenew('PC1');
    net.dhcpRelease('PC1');
    expect(net.device('PC1').host?.ip).toBeUndefined();
    net.dhcpRenew('PC2');
    expect(net.device('PC2').host?.ip).toBe('192.168.1.10');
  });

  it('fails without a pool, without a cable, or across VLANs', () => {
    const net = lan();
    type(net, 'R1', 'enable', 'configure terminal', 'interface g0/0', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown', 'end');
    expect(net.dhcpRenew('PC1')).toBe(false);
    type(net, 'R1', ...SERVER.slice(1));
    net.disconnect({ device: 'PC2', port: 'FastEthernet0' });
    expect(net.dhcpRenew('PC2')).toBe(false);
    type(net, 'S1', 'enable', 'configure terminal', 'vlan 10', 'exit', 'interface fa0/1', 'switchport access vlan 10', 'end');
    expect(net.dhcpRenew('PC1')).toBe(false);
  });

  it('serves each VLAN from its own pool through a subinterface', () => {
    const net = lan();
    type(net, 'S1', 'enable', 'configure terminal', 'vlan 10', 'vlan 20', 'exit', 'interface fa0/1', 'switchport access vlan 10', 'interface fa0/2', 'switchport access vlan 20', 'interface g0/1', 'switchport mode trunk', 'end');
    type(net, 'R1', 'enable', 'configure terminal', 'interface g0/0', 'no shutdown', 'interface g0/0.10', 'encapsulation dot1q 10', 'ip address 10.0.10.1 255.255.255.0', 'interface g0/0.20', 'encapsulation dot1q 20', 'ip address 10.0.20.1 255.255.255.0', 'exit', 'ip dhcp pool A', 'network 10.0.10.0 255.255.255.0', 'default-router 10.0.10.1', 'exit', 'ip dhcp pool B', 'network 10.0.20.0 255.255.255.0', 'default-router 10.0.20.1', 'end');
    net.dhcpRenew('PC1');
    net.dhcpRenew('PC2');
    expect(net.device('PC1').host?.ip).toBe('10.0.10.2');
    expect(net.device('PC2').host?.ip).toBe('10.0.20.2');
    expect(net.ping('PC1', '10.0.20.2', 5).received).toBeGreaterThan(0);
  });

  it('shows the pool in the running configuration, and the prompt in the pool', () => {
    const net = lan();
    const cli = net.device('R1').cli!;
    type(net, 'R1', 'enable', 'configure terminal', 'ip dhcp pool LAN');
    expect(cli.prompt).toContain('(dhcp-config)#');
    type(net, 'R1', 'network 192.168.1.0 255.255.255.0', 'end');
    expect(type(net, 'R1', 'show running-config')[0]).toContain('ip dhcp pool LAN\n network 192.168.1.0 255.255.255.0');
  });
});
