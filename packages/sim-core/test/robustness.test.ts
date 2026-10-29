import { describe, expect, it } from 'vitest';
import { Cli, Network, profiles } from '../src/index.js';
import { lab152R1Done, run, staticLab } from './fixtures.js';

const e = (device: string, port: string) => ({ device, port });

describe('ip address checks (as IOS refuses them)', () => {
  const router = () => {
    const cli = new Cli({ profile: profiles['cisco-1841']! });
    ['enable', 'configure terminal', 'interface fa0/0'].forEach((l) => cli.execute(l));
    return cli;
  };

  it('refuses the network and broadcast addresses of the subnet', () => {
    const cli = router();
    expect(cli.execute('ip address 192.168.1.0 255.255.255.0').output).toBe('Bad mask /24 for address 192.168.1.0');
    expect(cli.execute('ip address 192.168.1.255 255.255.255.0').output).toBe('Bad mask /24 for address 192.168.1.255');
    expect(cli.config.interfaces[0]!.ip).toBeUndefined();
    expect(cli.execute('ip address 10.0.0.0 255.255.255.254').output).toBe(''); // /31 point-to-point is fine
  });

  it('refuses a non-contiguous mask', () => {
    expect(router().execute('ip address 10.1.1.1 255.0.255.0').output).toBe('Bad mask 0xFF00FF00 for address 10.1.1.1');
  });

  it('refuses a subnet that overlaps another interface', () => {
    const cli = router();
    cli.execute('ip address 192.168.1.1 255.255.255.0');
    cli.execute('interface fa0/1');
    expect(cli.execute('ip address 192.168.1.2 255.255.255.0').output).toBe('% 192.168.1.0 overlaps with FastEthernet0/0');
    expect(cli.execute('ip address 192.168.0.1 255.255.0.0').output).toBe('% 192.168.0.0 overlaps with FastEthernet0/0');
    expect(cli.execute('ip address 192.168.2.1 255.255.255.0').output).toBe('');
    // re-addressing the same interface is not an overlap
    cli.execute('interface fa0/0');
    expect(cli.execute('ip address 192.168.1.5 255.255.255.0').output).toBe('');
  });
});

describe('hostname', () => {
  it('refuses characters a host name cannot have', () => {
    const cli = new Cli({ profile: profiles['cisco-1841']! });
    ['enable', 'configure terminal'].forEach((l) => cli.execute(l));
    expect(cli.execute('hostname R_1').output).toBe('% Hostname contains one or more illegal characters.');
    expect(cli.execute('hostname R-1').prompt).toBe('R-1(config)#');
  });
});

describe('help and completion for interface types', () => {
  const cfg = () => {
    const cli = new Cli({ profile: profiles['cisco-1841']! });
    ['enable', 'configure terminal'].forEach((l) => cli.execute(l));
    return cli;
  };

  it('lists the interface types of the device after interface ?', () => {
    const out = cfg().execute('interface ?').output;
    expect(out).toContain('FastEthernet');
    expect(out).toContain('Serial');
    expect(out).toContain('range');
    expect(out).not.toContain('WORD');
  });

  it('completes and lists partial interface types', () => {
    const cli = cfg();
    expect(cli.complete('int fa')).toBe('int FastEthernet ');
    expect(cli.complete('int se')).toBe('int Serial ');
    expect(cli.execute('interface f?').output).toBe('FastEthernet');
  });
});

describe('reload forgets dynamic state', () => {
  it('clears the ARP table of the device that reloads', () => {
    const net = staticLab();
    net.ping('R1', '172.16.3.10', 2);
    const r1 = net.device('R1').cli!;
    expect(r1.execute('show ip arp').output).toContain('172.16.3.10');
    r1.execute('write memory');
    r1.execute('reload');
    r1.execute('');
    r1.execute('');
    expect(r1.execute('show ip arp').output).not.toContain('172.16.3.10');
  });
});

describe('removing devices', () => {
  it('unplugs the cables, takes the neighbour link down and keeps MAC addresses unique', () => {
    const net = lab152R1Done();
    const pc1Mac = net.macOf('PC1', 'FastEthernet0');
    expect(net.removeDevice('PC1')).toBe(true);
    expect(net.removeDevice('PC1')).toBe(false);
    expect(net.cableAt(e('R1', 'FastEthernet0/0'))).toBeUndefined();
    expect(net.linkState('R1', 'FastEthernet0/0').status).toBe('down');
    expect(net.drainSyslog('R1')).toContain('%LINK-5-CHANGED: Interface FastEthernet0/0, changed state to down');
    const pc9 = net.addDevice('PC9', 'pc');
    expect(net.macOf(pc9.id, 'FastEthernet0')).not.toBe(pc1Mac);
  });

  it('restores devices with the same MAC addresses after a removal', () => {
    const net = lab152R1Done();
    net.removeDevice('PC1');
    net.addDevice('PC9', 'pc');
    const copy = Network.restore(JSON.parse(JSON.stringify(net.snapshot())));
    expect(copy.macOf('PC9', 'FastEthernet0')).toBe(net.macOf('PC9', 'FastEthernet0'));
    expect(copy.macOf('R2', 'Serial0/0/0')).toBe(net.macOf('R2', 'Serial0/0/0'));
  });
});

describe('host settings', () => {
  it('rejects malformed addresses and masks', () => {
    const net = new Network();
    net.addDevice('PC1', 'pc');
    expect(() => net.configureHost('PC1', { ip: '192.168.1.300', mask: '255.255.255.0' })).toThrow(/invalid ip/);
    expect(() => net.configureHost('PC1', { ip: '192.168.1.3', mask: '255.0.255.0' })).toThrow(/non-contiguous/);
    expect(() => net.configureHost('PC1', { ip: '192.168.1.3', mask: '255.255.255.0', gateway: 'router' })).toThrow(/invalid gateway/);
    net.addDevice('R1', 'cisco-1841');
    expect(() => net.configureHost('R1', {})).toThrow(/not a host/);
    run(net, 'R1', ['enable']);
  });
});
