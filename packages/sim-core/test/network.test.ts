import { describe, expect, it } from 'vitest';
import { Network } from '../src/index.js';
import { lab152, lab152R1Done, run } from './fixtures.js';

const e = (device: string, port: string) => ({ device, port });

function twoDevices(strictMdix: boolean, a: string, b: string, cable: 'straight' | 'crossover') {
  const net = new Network({ strictMdix });
  net.addDevice('A', a);
  net.addDevice('B', b);
  const pa = net.device('A').model.ports[0]!.name;
  const pb = net.device('B').model.ports[0]!.name;
  net.connect(cable, e('A', pa), e('B', pb));
  for (const id of ['A', 'B']) {
    const cli = net.device(id).cli;
    if (cli) run(net, id, ['enable', 'configure terminal', `interface ${cli.config.interfaces[0]!.name}`, 'no shutdown']);
  }
  return { net, pa, pb };
}

describe('cabling rules (strict MDIX)', () => {
  it.each([
    ['pc', 'catalyst-2960', 'straight', 'up'],
    ['pc', 'catalyst-2960', 'crossover', 'down'],
    ['catalyst-2960', 'catalyst-2960', 'crossover', 'up'],
    ['catalyst-2960', 'catalyst-2960', 'straight', 'down'],
    ['cisco-1841', 'catalyst-2960', 'straight', 'up'],
    ['cisco-1841', 'cisco-1841', 'crossover', 'up'],
    ['cisco-1841', 'cisco-1841', 'straight', 'down'],
  ] as const)('%s <-> %s with a %s cable is %s', (a, b, cable, expected) => {
    const { net, pa } = twoDevices(true, a, b, cable);
    const holder = net.device('A').cli ? 'A' : 'B';
    const port = holder === 'A' ? pa : net.device('B').model.ports[0]!.name;
    expect(net.linkState(holder, port).status).toBe(expected);
  });

  it('auto-MDIX forgives the wrong copper cable when strict mode is off', () => {
    const { net, pb } = twoDevices(false, 'pc', 'catalyst-2960', 'crossover');
    expect(net.linkState('B', pb).status).toBe('up');
  });

  it('does not forgive it when neither end has auto-MDIX (PC to PC-like router FastEthernet)', () => {
    const { net, pb } = twoDevices(false, 'pc', 'cisco-1841', 'straight');
    expect(net.linkState('B', pb).status).toBe('down');
  });
});

describe('plugging cables', () => {
  it('rejects unknown devices and ports, busy ports and cables that do not fit', () => {
    const net = new Network();
    net.addDevice('R1', 'cisco-1841');
    net.addDevice('PC1', 'pc');
    expect(net.connect('straight', e('R1', 'FastEthernet0/0'), e('X', 'FastEthernet0'))).toEqual({ ok: false, error: 'unknown-device' });
    expect(net.connect('straight', e('R1', 'FastEthernet9/9'), e('PC1', 'FastEthernet0'))).toEqual({ ok: false, error: 'unknown-port' });
    expect(net.connect('straight', e('R1', 'Serial0/0/0'), e('PC1', 'FastEthernet0'))).toEqual({ ok: false, error: 'incompatible-ports' });
    expect(net.connect('console', e('R1', 'Console'), e('PC1', 'RS232')).ok).toBe(true);
    expect(net.connect('straight', e('R1', 'Console'), e('PC1', 'FastEthernet0'))).toMatchObject({ ok: false });
    expect(net.connect('console', e('R1', 'Console'), e('PC1', 'RS232'))).toEqual({ ok: false, error: 'port-busy' });
  });

  it('maps a PC to the device behind its console cable', () => {
    const net = new Network();
    net.addDevice('R1', 'cisco-1841');
    net.addDevice('PC1', 'pc');
    expect(net.consoleTarget('PC1')).toBeNull();
    net.connect('console', e('PC1', 'RS232'), e('R1', 'Console'));
    expect(net.consoleTarget('PC1')?.id).toBe('R1');
  });

  it('can unplug a cable', () => {
    const net = lab152();
    expect(net.disconnect(e('R1', 'FastEthernet0/0'))).toBe(true);
    expect(net.cableAt(e('PC1', 'FastEthernet0'))).toBeUndefined();
    expect(net.disconnect(e('R1', 'FastEthernet0/0'))).toBe(false);
  });
});

describe('serial links', () => {
  it('stays line-protocol down until the DCE end has a clock rate', () => {
    const net = lab152();
    run(net, 'R1', ['enable', 'configure terminal', 'interface serial 0/0/0', 'no shutdown']);
    run(net, 'R2', ['enable', 'configure terminal', 'interface serial 0/0/0', 'no shutdown']);
    expect(net.linkState('R1', 'Serial0/0/0')).toEqual({ status: 'up', protocol: 'down' });
    run(net, 'R1', ['clock rate 64000']);
    expect(net.linkState('R1', 'Serial0/0/0')).toEqual({ status: 'up', protocol: 'up' });
  });

  it('refuses clock rate on the DTE end but accepts it when no cable is attached', () => {
    const net = lab152();
    run(net, 'R2', ['enable', 'configure terminal', 'interface serial 0/0/0']);
    expect(net.device('R2').cli!.execute('clock rate 64000').output).toBe('%Error: This command applies only to DCE interfaces');
    run(net, 'R2', ['interface serial 0/0/1']);
    expect(net.device('R2').cli!.execute('clock rate 64000').output).toBe('');
  });
});

describe('syslog', () => {
  it('queues link messages for the neighbour when a remote interface changes state', () => {
    const net = lab152R1Done();
    run(net, 'R2', ['enable', 'configure terminal', 'interface serial 0/0/0', 'no shutdown']);
    expect(net.device('R1').cli!.drainSyslog()).toEqual([
      'Interface Serial0/0/0, changed state to up',
      'Line protocol on Interface Serial0/0/0, changed state to up',
    ].map((m, i) => (i === 0 ? `%LINK-5-CHANGED: ${m}` : `%LINEPROTO-5-UPDOWN: ${m}`)));
    expect(net.device('R1').cli!.drainSyslog()).toEqual([]);
  });

  it('reports shutdown as administratively down and takes the neighbour down', () => {
    const net = lab152R1Done();
    run(net, 'R2', ['enable', 'configure terminal', 'interface serial 0/0/0', 'no shutdown']);
    net.device('R1').cli!.drainSyslog();
    const out = net.device('R2').cli!.execute('shutdown').output;
    expect(out).toBe(
      '\n%LINK-5-CHANGED: Interface Serial0/0/0, changed state to administratively down\n' +
        '%LINEPROTO-5-UPDOWN: Line protocol on Interface Serial0/0/0, changed state to down',
    );
    expect(net.device('R1').cli!.drainSyslog()).toEqual([
      '%LINK-5-CHANGED: Interface Serial0/0/0, changed state to down',
      '%LINEPROTO-5-UPDOWN: Line protocol on Interface Serial0/0/0, changed state to down',
    ]);
  });

  it('queues messages when a cable is plugged in later', () => {
    const net = new Network();
    net.addDevice('R1', 'cisco-1841');
    net.addDevice('PC1', 'pc');
    run(net, 'R1', ['enable', 'configure terminal', 'interface fastethernet 0/0', 'no shutdown']);
    net.connect('crossover', e('R1', 'FastEthernet0/0'), e('PC1', 'FastEthernet0'));
    expect(net.drainSyslog('R1')).toHaveLength(2);
  });
});

describe('show interfaces', () => {
  it('describes status, address and the DCE-side bandwidth', () => {
    const net = lab152R1Done();
    const out = net.device('R1').cli!.execute('show interfaces fa0/0').output;
    expect(out).toContain('FastEthernet0/0 is up, line protocol is up');
    expect(out).toContain('Internet address is 192.168.1.1/24');
    expect(out).toMatch(/address is 0001\.4300\.[0-9a-f]{4} \(bia/);
    expect(net.device('R1').cli!.execute('show interfaces s0/0/0').output).toContain('Serial0/0/0 is down, line protocol is down');
  });

  it('adds the connection state on switch ports', () => {
    const net = new Network();
    net.addDevice('S1', 'catalyst-2960');
    const out = net.device('S1').cli!.execute('show interfaces fa0/1').output;
    expect(out).toContain('FastEthernet0/1 is down, line protocol is down (notconnect)');
  });
});

describe('snapshot', () => {
  it('round-trips devices, configs, startup-configs and cables', () => {
    const net = lab152R1Done();
    run(net, 'R1', ['configure terminal', 'enable secret cisco', 'end', 'write memory']);
    const copy = Network.restore(JSON.parse(JSON.stringify(net.snapshot())));
    expect(copy.snapshot()).toEqual(net.snapshot());
    expect(copy.linkState('R1', 'FastEthernet0/0')).toEqual({ status: 'up', protocol: 'up' });
    expect(copy.device('R1').cli!.startup?.enableSecret).toBe('cisco');
    expect(copy.drainSyslog('R1')).toEqual([]);
  });
});

describe('wire observers', () => {
  it('reports every frame crossing a cable, in order, until unsubscribed', () => {
    const net = lab152R1Done();
    net.configureHost('PC1', { ip: '192.168.1.10', mask: '255.255.255.0', gateway: '192.168.1.1' });
    const seen: string[] = [];
    const stop = net.onWire((from, to, frame) => seen.push(`${from.device}>${to.device}:${(frame.payload as { type: string }).type}`));
    net.ping('PC1', '192.168.1.1', 2);
    expect(seen.slice(0, 2)).toEqual(['PC1>R1:arp', 'R1>PC1:arp']);
    expect(seen).toContain('PC1>R1:ip');
    expect(seen).toContain('R1>PC1:ip');
    stop();
    const before = seen.length;
    net.ping('PC1', '192.168.1.1', 1);
    expect(seen.length).toBe(before);
  });
});
