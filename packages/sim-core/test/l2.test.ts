import { describe, expect, it } from 'vitest';
import { Network } from '../src/index.js';
import { BROADCAST_MAC } from '../src/engine/l2.js';
import { run } from './fixtures.js';

const e = (device: string, port: string) => ({ device, port });
const NIC = 'FastEthernet0';

/** Two switches joined by a trunk on Fa0/1, and hosts on chosen ports. All ports are up by default on a switch. */
function lab() {
  const net = new Network({ strictMdix: true });
  net.addDevice('S1', 'catalyst-2960');
  net.addDevice('S2', 'catalyst-2960');
  net.connect('crossover', e('S1', 'FastEthernet0/1'), e('S2', 'FastEthernet0/1'));
  const host = (id: string, sw: string, port: string) => {
    net.addDevice(id, 'pc');
    net.connect('straight', e(id, NIC), e(sw, port));
  };
  const conf = (sw: string, ...lines: string[]) => run(net, sw, ['enable', 'configure terminal', ...lines, 'end']);
  const broadcast = (id: string) => net.sendFrame(e(id, NIC), { src: net.macOf(id, NIC), dst: BROADCAST_MAC });
  const unicast = (from: string, to: string) =>
    net.sendFrame(e(from, NIC), { src: net.macOf(from, NIC), dst: net.macOf(to, NIC) });
  const reached = (trace: ReturnType<typeof broadcast>) => trace.deliveries.map((d) => d.device).sort();
  return { net, host, conf, broadcast, unicast, reached };
}

describe('VLAN isolation on one switch', () => {
  it('delivers a broadcast only inside its VLAN', () => {
    const { host, conf, broadcast, reached } = lab();
    host('A', 'S1', 'FastEthernet0/2');
    host('B', 'S1', 'FastEthernet0/3');
    host('C', 'S1', 'FastEthernet0/4');
    conf('S1', 'interface range fa0/2-3', 'switchport access vlan 10', 'interface fa0/4', 'switchport access vlan 20');
    expect(reached(broadcast('A'))).toEqual(['B']);
    expect(reached(broadcast('C'))).toEqual([]);
  });

  it('puts every port in VLAN 1 by default', () => {
    const { host, broadcast, reached } = lab();
    host('A', 'S1', 'FastEthernet0/2');
    host('B', 'S1', 'FastEthernet0/3');
    expect(reached(broadcast('A'))).toEqual(['B']);
  });

  it('creates a missing VLAN when a port is assigned to it, like IOS', () => {
    const { net, conf } = lab();
    run(net, 'S1', ['enable', 'configure terminal', 'interface fa0/2']);
    expect(net.device('S1').cli!.execute('switchport access vlan 10').output).toBe('% Access VLAN does not exist. Creating vlan 10');
    expect(net.device('S1').cli!.config.vlans).toEqual([{ id: 10 }]);
    conf('S1');
  });
});

describe('MAC learning', () => {
  it('floods unknown unicast, then forwards known unicast only to its port', () => {
    const { net, host, unicast } = lab();
    for (const [id, port] of [['A', '2'], ['B', '3'], ['C', '4']] as const) host(id, 'S1', `FastEthernet0/${port}`);
    unicast('A', 'B'); // B unknown: flooded, A learned
    expect(net.macTables.list('S1').map((m) => m.port)).toEqual(['FastEthernet0/2']);
    unicast('B', 'A'); // A known: no flooding, B learned
    expect(net.macTables.list('S1').map((m) => m.port)).toEqual(['FastEthernet0/2', 'FastEthernet0/3']);
    const trace = unicast('B', 'A');
    expect(trace.deliveries.map((d) => d.device)).toEqual(['A']);
  });

  it('learns per VLAN and shows it in show mac address-table', () => {
    const { net, host, conf, broadcast } = lab();
    host('A', 'S1', 'FastEthernet0/2');
    conf('S1', 'interface fa0/2', 'switchport access vlan 10');
    broadcast('A');
    const out = net.device('S1').cli!.execute('show mac address-table').output;
    expect(out).toBe(
      [
        '          Mac Address Table',
        '-------------------------------------------',
        '',
        'Vlan    Mac Address       Type        Ports',
        '----    -----------       --------    -----',
        `  10    ${net.macOf('A', NIC)}    DYNAMIC     Fa0/2`,
        'Total Mac Addresses for this criterion: 1',
      ].join('\n'),
    );
  });

  it('forgets the addresses of a port whose link goes down, and clears on command', () => {
    const { net, host, broadcast } = lab();
    host('A', 'S1', 'FastEthernet0/2');
    broadcast('A');
    expect(net.macTables.list('S1')).toHaveLength(1);
    run(net, 'S1', ['enable', 'configure terminal', 'interface fa0/2', 'shutdown']);
    expect(net.macTables.list('S1')).toHaveLength(0);
    run(net, 'S1', ['no shutdown', 'end']);
    broadcast('A');
    net.device('S1').cli!.execute('clear mac address-table dynamic');
    expect(net.macTables.list('S1')).toHaveLength(0);
  });
});

describe('trunks', () => {
  const vlans = ['vlan 10', 'vlan 20', 'vlan 99'];

  it('carries several VLANs between switches and keeps them apart', () => {
    const { host, conf, broadcast, reached } = lab();
    host('A', 'S1', 'FastEthernet0/2');
    host('B', 'S2', 'FastEthernet0/2');
    host('C', 'S2', 'FastEthernet0/3');
    for (const sw of ['S1', 'S2']) conf(sw, ...vlans, 'interface fa0/1', 'switchport mode trunk');
    conf('S1', 'interface fa0/2', 'switchport access vlan 10');
    conf('S2', 'interface fa0/2', 'switchport access vlan 10', 'interface fa0/3', 'switchport access vlan 20');
    expect(reached(broadcast('A'))).toEqual(['B']);
    expect(reached(broadcast('C'))).toEqual([]);
  });

  it('tags frames on the trunk and hands hosts untagged frames', () => {
    const { net, host, conf, broadcast } = lab();
    host('A', 'S1', 'FastEthernet0/2');
    host('B', 'S2', 'FastEthernet0/2');
    for (const sw of ['S1', 'S2']) conf(sw, ...vlans, 'interface fa0/1', 'switchport mode trunk');
    for (const sw of ['S1', 'S2']) conf(sw, 'interface fa0/2', 'switchport access vlan 10');
    const trace = broadcast('A');
    expect(trace.deliveries).toHaveLength(1);
    expect(trace.deliveries[0]!.frame.vlanTag).toBeUndefined();
    expect(net.macTables.list('S2')[0]).toMatchObject({ vlan: 10, port: 'FastEthernet0/1' });
  });

  it('blocks VLANs removed from the allowed list', () => {
    const { host, conf, broadcast, reached } = lab();
    host('A', 'S1', 'FastEthernet0/2');
    host('B', 'S2', 'FastEthernet0/2');
    for (const sw of ['S1', 'S2']) conf(sw, ...vlans, 'interface fa0/1', 'switchport mode trunk', 'interface fa0/2', 'switchport access vlan 10');
    conf('S1', 'interface fa0/1', 'switchport trunk allowed vlan 20,99');
    expect(reached(broadcast('A'))).toEqual([]);
    conf('S1', 'interface fa0/1', 'switchport trunk allowed vlan add 10');
    expect(reached(broadcast('A'))).toEqual(['B']);
    conf('S1', 'interface fa0/1', 'switchport trunk allowed vlan remove 10');
    expect(reached(broadcast('A'))).toEqual([]);
    conf('S1', 'interface fa0/1', 'switchport trunk allowed vlan all');
    expect(reached(broadcast('A'))).toEqual(['B']);
  });

  it('carries the native VLAN untagged, and leaks it into VLAN 1 when the native VLANs differ', () => {
    const { host, conf, broadcast, reached } = lab();
    host('A', 'S1', 'FastEthernet0/2');
    host('B', 'S2', 'FastEthernet0/2');
    host('D', 'S2', 'FastEthernet0/3');
    for (const sw of ['S1', 'S2']) conf(sw, ...vlans, 'interface fa0/1', 'switchport mode trunk', 'switchport trunk native vlan 99');
    conf('S1', 'interface fa0/2', 'switchport access vlan 99');
    conf('S2', 'interface fa0/2', 'switchport access vlan 99'); // B shares VLAN 99 with A
    expect(reached(broadcast('A'))).toEqual(['B']);

    conf('S2', 'interface fa0/1', 'no switchport trunk native vlan'); // native mismatch: S2 reads untagged as VLAN 1
    expect(reached(broadcast('A'))).toEqual(['D']); // D sits in VLAN 1 on S2
  });

  it('does not deliver a tagged frame to an access port (trunk/access mismatch)', () => {
    const { host, conf, broadcast, reached } = lab();
    host('A', 'S1', 'FastEthernet0/2');
    host('B', 'S2', 'FastEthernet0/2');
    for (const sw of ['S1', 'S2']) conf(sw, ...vlans, 'interface fa0/2', 'switchport access vlan 10');
    conf('S1', 'interface fa0/1', 'switchport mode trunk'); // S2 side stays access (VLAN 1)
    const trace = broadcast('A');
    expect(reached(trace)).toEqual([]);
    expect(trace.drops.some((d) => d.reason === 'tagged-frame-on-access-port')).toBe(true);
  });

  it('shows trunks as in the course PDF (lab 3.5.1)', () => {
    const { net, conf } = lab();
    net.connect('crossover', e('S1', 'FastEthernet0/2'), e('S2', 'FastEthernet0/2'));
    conf('S1', 'vlan 10', 'name faculte', 'vlan 20', 'name participants', 'vlan 30', 'name invite', 'vlan 99', 'name direction');
    conf('S1', 'interface range fa0/1-2', 'switchport mode trunk', 'switchport trunk native vlan 99');
    conf('S2', 'interface range fa0/1-2', 'switchport mode trunk', 'switchport trunk native vlan 99');
    expect(net.device('S1').cli!.execute('show interface trunk').output).toBe(
      [
        'Port        Mode         Encapsulation  Status        Native vlan',
        'Fa0/1       on           802.1q         trunking      99',
        'Fa0/2       on           802.1q         trunking      99',
        '',
        'Port        Vlans allowed on trunk',
        'Fa0/1       1-4094',
        'Fa0/2       1-4094',
        '',
        'Port        Vlans allowed and active in management domain',
        'Fa0/1       1,10,20,30,99',
        'Fa0/2       1,10,20,30,99',
        '',
        'Port        Vlans in spanning tree forwarding state and not pruned',
        'Fa0/1       1,10,20,30,99',
        'Fa0/2       1,10,20,30,99',
      ].join('\n'),
    );
  });
});

describe('management SVI', () => {
  it('comes up with the first live port of its VLAN and announces it', () => {
    const { net, host } = lab();
    host('PC1', 'S1', 'FastEthernet0/6');
    run(net, 'S1', ['enable', 'configure terminal', 'vlan 99', 'name direction', 'exit', 'interface vlan 99', 'ip address 172.17.99.11 255.255.255.0', 'no shutdown']);
    expect(net.linkState('S1', 'Vlan99')).toEqual({ status: 'down', protocol: 'down' });
    run(net, 'S1', ['exit', 'interface fa0/6']);
    const out = net.device('S1').cli!.execute('switchport access vlan 99').output;
    expect(out).toBe(
      '\n%LINK-5-CHANGED: Interface Vlan99, changed state to up\n%LINEPROTO-5-UPDOWN: Line protocol on Interface Vlan99, changed state to up',
    );
    expect(net.linkState('S1', 'Vlan99')).toEqual({ status: 'up', protocol: 'up' });
  });

  it('creates and deletes SVIs on demand, but only for switches', () => {
    const net = new Network();
    net.addDevice('S1', 'catalyst-2960');
    run(net, 'S1', ['enable', 'configure terminal', 'interface vlan 99']);
    const cli = net.device('S1').cli!;
    expect(cli.config.interfaces.some((i) => i.name === 'Vlan99')).toBe(true);
    cli.execute('exit');
    cli.execute('no interface vlan 99');
    expect(cli.config.interfaces.some((i) => i.name === 'Vlan99')).toBe(false);
    expect(cli.execute('no interface vlan 1').output).toContain('Invalid input');
  });
});

describe('CLI details', () => {
  const sw = () => {
    const net = new Network();
    net.addDevice('S1', 'catalyst-2960');
    net.addDevice('R1', 'cisco-1841');
    return net;
  };

  it('supports interface range with commas, spaces and mixed types', () => {
    const net = sw();
    const cli = net.device('S1').cli!;
    run(net, 'S1', ['enable', 'configure terminal']);
    expect(cli.execute('interface range fa0/6, fa0/11, fa0/18').prompt).toBe('Switch(config-if-range)#');
    cli.execute('switchport access vlan 30');
    cli.execute('interface range fastethernet 0/1 - 3 , gi0/1');
    cli.execute('shutdown');
    const byName = (n: string) => cli.config.interfaces.find((i) => i.name === n)!;
    expect(byName('FastEthernet0/11').switchport?.accessVlan).toBe(30);
    expect(byName('FastEthernet0/2').shutdown).toBe(true);
    expect(byName('GigabitEthernet0/1').shutdown).toBe(true);
    expect(byName('FastEthernet0/4').shutdown).toBe(false);
    expect(cli.execute('interface range fa0/24-30').output).toContain('Invalid input');
    expect(cli.execute('interface range fa0/5-2').output).toContain('Invalid input');
  });

  it('keeps running-config minimal and renders vlan and switchport lines like IOS', () => {
    const net = sw();
    const cli = net.device('S1').cli!;
    run(net, 'S1', [
      'enable', 'configure terminal', 'vlan 10', 'name Ventes', 'vlan 20', 'exit',
      'interface fa0/1', 'switchport trunk native vlan 99', 'switchport trunk allowed vlan 10,20,30-32', 'switchport mode trunk',
      'interface fa0/2', 'switchport access vlan 10', 'switchport mode access',
      'interface fa0/3', 'switchport mode access', 'no switchport mode',
      'exit', 'ip default-gateway 172.17.99.1', 'end',
    ]);
    const text = cli.execute('show running-config').output;
    expect(text).toContain('vlan 10\n name Ventes\n!\nvlan 20\n!');
    expect(text).toContain('interface FastEthernet0/1\n switchport trunk native vlan 99\n switchport trunk allowed vlan 10,20,30-32\n switchport mode trunk\n!');
    expect(text).toContain('interface FastEthernet0/2\n switchport access vlan 10\n switchport mode access\n!');
    expect(text).toContain('interface FastEthernet0/3\n!');
    expect(text).toContain('ip default-gateway 172.17.99.1');
  });

  it('applies "no" forms for trunk settings and vlans', () => {
    const net = sw();
    const cli = net.device('S1').cli!;
    run(net, 'S1', ['enable', 'configure terminal', 'vlan 10', 'name X', 'exit', 'interface fa0/1', 'switchport trunk allowed vlan 10', 'switchport trunk native vlan 5']);
    run(net, 'S1', ['no switchport trunk allowed vlan', 'no switchport trunk native vlan', 'exit', 'no vlan 10']);
    expect(cli.config.interfaces.find((i) => i.name === 'FastEthernet0/1')?.switchport).toBeUndefined();
    expect(cli.config.vlans).toEqual([]);
  });

  it('rejects switchport and vlan commands where a router cannot have them', () => {
    const net = sw();
    const r = net.device('R1').cli!;
    run(net, 'R1', ['enable', 'configure terminal']);
    expect(r.execute('vlan 10').output).toContain('Invalid input');
    run(net, 'R1', ['interface fa0/0']);
    expect(r.execute('switchport mode access').output).toContain('Invalid input');
    expect(r.execute('exit').prompt).toBe('Router(config)#');
    expect(r.execute('exit').prompt).toBe('Router#');
    expect(r.execute('show vlan brief').output).toContain('Invalid input');
  });

  it('refuses malformed vlan lists and reserved VLAN ids', () => {
    const net = sw();
    const cli = net.device('S1').cli!;
    run(net, 'S1', ['enable', 'configure terminal', 'interface fa0/1']);
    expect(cli.execute('switchport trunk allowed vlan 10,,20').output).toContain('Invalid input');
    expect(cli.execute('switchport trunk allowed vlan 5000').output).toContain('Invalid input');
    cli.execute('exit');
    expect(cli.execute('vlan 1003').output).toContain('Invalid input');
  });

  it('keeps the show vlan brief layout of the course PDF, 4 ports per line', () => {
    const net = sw();
    run(net, 'S1', ['enable', 'configure terminal', 'vlan 10', 'name faculté/personnel', 'vlan 99', 'name direction', 'interface range fa0/1-6', 'switchport access vlan 10', 'end']);
    const lines = net.device('S1').cli!.execute('show vlan brief').output.split('\n');
    expect(lines[0]).toBe('VLAN Name                            Status    Ports');
    expect(lines[1]).toBe('---- ------------------------------- --------- -----------------------------');
    expect(lines[2]).toBe('1    default                         active    Fa0/7, Fa0/8, Fa0/9, Fa0/10');
    expect(lines[3]).toBe(`${' '.repeat(47)}Fa0/11, Fa0/12, Fa0/13, Fa0/14`);
    expect(lines.at(-7)).toBe(`10   ${'faculté/personnel'.padEnd(31)} active    Fa0/1, Fa0/2, Fa0/3, Fa0/4`);
    expect(lines.at(-6)).toBe(`${' '.repeat(47)}Fa0/5, Fa0/6`);
    expect(lines.at(-5)).toBe(`99   ${'direction'.padEnd(31)} active`);
    expect(lines.at(-1)).toBe(`1005 ${'trnet-default'.padEnd(31)} act/unsup`);
  });
});
