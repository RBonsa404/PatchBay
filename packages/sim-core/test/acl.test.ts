import { describe, expect, it } from 'vitest';
import { Network } from '../src/index.js';
import { run } from './fixtures.js';

const e = (device: string, port: string) => ({ device, port });
const NIC = 'FastEthernet0';
const cli = (net: Network, id: string) => net.device(id).cli!;
const out = (net: Network, id: string, line: string) => cli(net, id).execute(line).output;
const conf = (net: Network, ...lines: string[]) => run(net, 'R1', ['enable', 'configure terminal', ...lines, 'end']);

/**
 * PC1 and PC2 (192.168.1.0/24, behind a switch) - R1 - SRV (10.0.0.10: web on 80 and 443, DNS on udp 53).
 * Fa0/0 faces the users, Fa0/1 faces the server.
 */
function lab(): Network {
  const net = new Network({ strictMdix: true });
  for (const [id, model] of [['R1', 'cisco-1841'], ['S1', 'catalyst-2960'], ['PC1', 'pc'], ['PC2', 'pc'], ['SRV', 'server']] as const) net.addDevice(id, model);
  net.connect('straight', e('R1', 'FastEthernet0/0'), e('S1', 'FastEthernet0/1'));
  net.connect('straight', e('PC1', NIC), e('S1', 'FastEthernet0/2'));
  net.connect('straight', e('PC2', NIC), e('S1', 'FastEthernet0/3'));
  net.connect('crossover', e('R1', 'FastEthernet0/1'), e('SRV', NIC));
  run(net, 'R1', [
    'enable', 'configure terminal', 'interface fa0/0', 'ip address 192.168.1.1 255.255.255.0', 'no shutdown',
    'interface fa0/1', 'ip address 10.0.0.1 255.255.255.0', 'no shutdown', 'end',
  ]);
  net.configureHost('PC1', { ip: '192.168.1.10', mask: '255.255.255.0', gateway: '192.168.1.1' });
  net.configureHost('PC2', { ip: '192.168.1.11', mask: '255.255.255.0', gateway: '192.168.1.1' });
  net.configureHost('SRV', { ip: '10.0.0.10', mask: '255.255.255.0', gateway: '10.0.0.1', services: { tcp: [80, 443], udp: [53] } });
  return net;
}

describe('without ACLs', () => {
  it('lets TCP, UDP and ping through, and tells closed ports apart', () => {
    const net = lab();
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('open');
    expect(net.tcpConnect('PC1', '10.0.0.10', 8080)).toBe('refused');
    expect(net.udpSend('PC1', '10.0.0.10', 53)).toBe('open');
    expect(net.udpSend('PC1', '10.0.0.10', 69)).toBe('unreachable');
    expect(net.ping('PC2', '10.0.0.10').received).toBeGreaterThanOrEqual(4);
  });

  it('times out when there is no route', () => {
    const net = lab();
    expect(net.tcpConnect('PC1', '172.31.0.1', 80)).toBe('unreachable'); // R1 answers unreachable
    net.configureHost('PC1', { ip: '192.168.1.10', mask: '255.255.255.0' });
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('timeout');
  });
});

describe('standard ACL', () => {
  it('blocks one host and lets the rest through, and counts matches', () => {
    const net = lab();
    conf(net, 'access-list 10 deny host 192.168.1.11', 'access-list 10 permit any', 'interface fa0/0', 'ip access-group 10 in');
    expect(net.ping('PC1', '10.0.0.10').symbols).toBe('..!!!'); // ARP at PC1, then ARP at R1
    expect(net.ping('PC2', '10.0.0.10').symbols).toBe('.UUUU');
    expect(out(net, 'R1', 'show access-lists')).toBe(
      ['Standard IP access list 10', '    10 deny 192.168.1.11 (4 matches)', '    20 permit any (4 matches)'].join('\n'),
    );
    run(net, 'R1', ['enable', 'clear access-list counters']);
    expect(out(net, 'R1', 'show access-lists 10')).toBe(['Standard IP access list 10', '    10 deny 192.168.1.11', '    20 permit any'].join('\n'));
  });

  it('denies everything not permitted (implicit deny at the end)', () => {
    const net = lab();
    conf(net, 'access-list 20 permit host 192.168.1.10', 'interface fa0/0', 'ip access-group 20 in');
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('open');
    expect(net.tcpConnect('PC2', '10.0.0.10', 80)).toBe('unreachable');
  });

  it('matches networks with a wildcard mask', () => {
    const net = lab();
    conf(net, 'access-list 30 deny 192.168.1.8 0.0.0.7', 'access-list 30 permit any', 'interface fa0/0', 'ip access-group 30 in');
    // 192.168.1.8 0.0.0.7 covers .8 to .15: both PCs are inside it
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('unreachable');
    conf(net, 'no access-list 30', 'access-list 30 deny 192.168.1.0 0.0.0.7', 'access-list 30 permit any');
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('open'); // .10 is outside .0 to .7
  });

  it('does nothing when the ACL does not exist', () => {
    const net = lab();
    conf(net, 'interface fa0/0', 'ip access-group 99 in');
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('open');
  });
});

describe('extended ACL', () => {
  const webOnly = ['ip access-list extended WEB', 'permit tcp any host 10.0.0.10 eq www', 'permit tcp any host 10.0.0.10 eq 443', 'deny ip any any', 'exit', 'interface fa0/0', 'ip access-group WEB in'];

  it('allows the web and blocks everything else to the server', () => {
    const net = lab();
    conf(net, ...webOnly);
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('open');
    expect(net.tcpConnect('PC1', '10.0.0.10', 443)).toBe('open');
    expect(net.tcpConnect('PC1', '10.0.0.10', 8080)).toBe('unreachable');
    expect(net.udpSend('PC1', '10.0.0.10', 53)).toBe('unreachable');
    expect(net.ping('PC1', '10.0.0.10').symbols).toBe('UUUUU'); // ARP was resolved by the earlier connections
    expect(out(net, 'R1', 'show ip access-lists WEB')).toContain('Extended IP access list WEB\n    10 permit tcp any host 10.0.0.10 eq www (');
  });

  it('filters return traffic with established, which only matches segments with ACK or RST', () => {
    const net = lab();
    // outbound on the user side: only answers to connections the users started may leave
    conf(net, 'access-list 101 permit tcp any any established', 'access-list 101 deny ip any any', 'interface fa0/0', 'ip access-group 101 out');
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('open'); // SYN-ACK carries ACK
    expect(net.ping('PC1', '10.0.0.10').received).toBe(0); // echo replies are denied on the way back
  });

  it('matches ports with eq, gt, lt, neq and range, and names or numbers', () => {
    const net = lab();
    conf(net, 'access-list 110 deny tcp any host 10.0.0.10 range 440 450', 'access-list 110 deny tcp any host 10.0.0.10 gt 8000', 'access-list 110 permit ip any any', 'interface fa0/0', 'ip access-group 110 in');
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('open');
    expect(net.tcpConnect('PC1', '10.0.0.10', 443)).toBe('unreachable');
    expect(net.tcpConnect('PC1', '10.0.0.10', 8080)).toBe('unreachable'); // gt 8000
    expect(net.tcpConnect('PC1', '10.0.0.10', 22)).toBe('refused'); // permitted, but nothing listens
    conf(net, 'access-list 111 deny tcp any host 10.0.0.10 neq www', 'access-list 111 permit ip any any', 'interface fa0/0', 'ip access-group 111 in');
    expect(net.tcpConnect('PC1', '10.0.0.10', 443)).toBe('unreachable');
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('open');
  });

  it('filters ICMP by type', () => {
    const net = lab();
    conf(net, 'access-list 120 deny icmp any any echo', 'access-list 120 permit ip any any', 'interface fa0/0', 'ip access-group 120 in');
    expect(net.ping('PC1', '10.0.0.10').received).toBe(0);
    expect(net.tcpConnect('PC1', '10.0.0.10', 80)).toBe('open');
  });

  it('protects the router itself: ping to its address goes through the inbound ACL too', () => {
    const net = lab();
    conf(net, 'access-list 130 deny icmp any host 192.168.1.1 echo', 'access-list 130 permit ip any any', 'interface fa0/0', 'ip access-group 130 in');
    expect(net.ping('PC1', '192.168.1.1').received).toBe(0);
    expect(net.ping('PC1', '10.0.0.10').received).toBeGreaterThanOrEqual(4);
  });
});

describe('access-class on VTY lines', () => {
  it('limits who can open a session on the router', () => {
    const net = lab();
    conf(net, 'access-list 5 permit host 192.168.1.10', 'line vty 0 4', 'password cisco', 'login', 'access-class 5 in');
    expect(net.tcpConnect('PC1', '192.168.1.1', 23)).toBe('open');
    expect(net.tcpConnect('PC2', '192.168.1.1', 23)).toBe('refused');
  });

  it('refuses sessions when no VTY line can log in', () => {
    const net = lab();
    expect(net.tcpConnect('PC1', '192.168.1.1', 23)).toBe('refused'); // vty login without a password
  });
});

describe('named ACLs and sequence numbers', () => {
  it('numbers lines by 10, accepts explicit sequence numbers and removes lines', () => {
    const net = lab();
    conf(net, 'ip access-list standard TEST', 'permit 10.0.0.0 0.0.0.255', '25 deny host 10.0.0.5', 'remark keep the servers', 'permit any');
    expect(out(net, 'R1', 'show access-lists')).toBe(
      ['Standard IP access list TEST', '    10 permit 10.0.0.0, wildcard bits 0.0.0.255', '    25 deny 10.0.0.5', '    35 remark keep the servers', '    45 permit any'].join('\n'),
    );
    conf(net, 'ip access-list standard TEST', 'no 25', 'no permit any');
    expect(cli(net, 'R1').config.acls[0]!.entries.map((x) => x.seq)).toEqual([10, 35]);
    conf(net, 'no ip access-list standard TEST');
    expect(cli(net, 'R1').config.acls).toHaveLength(0);
  });

  it('numbered ACLs vanish when their last line is removed, and no access-list N removes all', () => {
    const net = lab();
    conf(net, 'access-list 7 permit any', 'access-list 8 permit any', 'access-list 8 deny host 1.1.1.1');
    conf(net, 'no access-list 7 permit any', 'no access-list 8');
    expect(cli(net, 'R1').config.acls).toHaveLength(0);
  });
});

describe('running-config', () => {
  it('prints numbered ACLs as access-list lines and named ACLs as blocks', () => {
    const net = lab();
    conf(net, 'access-list 10 permit 192.168.1.0 0.0.0.255', 'access-list 10 remark users', 'access-list 101 permit tcp any host 10.0.0.10 eq www', 'ip access-list extended WEB', 'remark web only', 'permit tcp any any eq 443', 'exit', 'interface fa0/0', 'ip access-group 10 in', 'ip access-group WEB out', 'line vty 0 4', 'access-class 10 in');
    const text = out(net, 'R1', 'show running-config');
    expect(text).toContain('access-list 10 permit 192.168.1.0 0.0.0.255\naccess-list 10 remark users\naccess-list 101 permit tcp any host 10.0.0.10 eq www\n!\nip access-list extended WEB\n remark web only\n permit tcp any any eq 443\n!');
    expect(text).toContain(' ip access-group 10 in\n ip access-group WEB out\n');
    expect(text).toContain(' access-class 10 in\n login');
  });
});

describe('syntax errors', () => {
  it('points at the bad token', () => {
    const net = lab();
    run(net, 'R1', ['enable', 'configure terminal']);
    const column = 'Router(config)#access-list 10 '.length;
    expect(out(net, 'R1', 'access-list 10 allow any')).toBe(`${' '.repeat(column)}^
% Invalid input detected at '^' marker.`);
    expect(out(net, 'R1', 'access-list 200 permit any')).toContain('Invalid input');
    expect(out(net, 'R1', 'access-list 10 permit tcp any any')).toContain('Invalid input'); // protocols are for extended ACLs
    expect(out(net, 'R1', 'access-list 101 permit tcp any any eq')).toContain('Invalid input');
    expect(out(net, 'R1', 'access-list 101 permit icmp any any established')).toContain('Invalid input');
    expect(out(net, 'R1', 'access-list 101 permit gre any any')).toContain('Invalid input');
  });
});
