import { describe, expect, it } from 'vitest';
import { Network } from '../src/index.js';
import { run } from './fixtures.js';

const e = (device: string, port: string) => ({ device, port });
const conf = (net: Network, id: string, ...lines: string[]) => run(net, id, ['enable', 'configure terminal', ...lines, 'end']);

/** A leased line between two sites: each router on its operator box, the operator's network gives the clock. */
describe('leased line', () => {
  const build = (leased: boolean): Network => {
    const net = new Network({ strictMdix: true });
    net.addDevice('R1', 'cisco-1841');
    net.addDevice('R2', 'cisco-1841');
    net.connect('serial', e('R1', 'Serial0/0/0'), e('R2', 'Serial0/0/0'), { leased });
    conf(net, 'R1', 'interface s0/0/0', 'ip address 10.0.0.1 255.255.255.252', 'no shutdown');
    conf(net, 'R2', 'interface s0/0/0', 'ip address 10.0.0.2 255.255.255.252', 'no shutdown');
    return net;
  };

  it('comes up without a clock rate on either router', () => {
    const net = build(true);
    expect(net.linkState('R1', 'Serial0/0/0')).toEqual({ status: 'up', protocol: 'up' });
    expect(net.linkState('R2', 'Serial0/0/0')).toEqual({ status: 'up', protocol: 'up' });
  });

  it('stays down on a lab back-to-back cable without a clock', () => {
    expect(build(false).linkState('R1', 'Serial0/0/0').protocol).toBe('down');
  });

  it('survives a snapshot', () => {
    const net = Network.restore(build(true).snapshot());
    expect(net.linkState('R2', 'Serial0/0/0').protocol).toBe('up');
  });
});
