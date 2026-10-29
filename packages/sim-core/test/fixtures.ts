import { Network } from '../src/index.js';

const end = (device: string, port: string) => ({ device, port });

/** Topology of docs/references/CONFIG base ROUTER.pdf (lab 1.5.2): PC1 - R1 =serial= R2 - PC2. R1 is the DCE end. */
export function lab152(): Network {
  const net = new Network({ strictMdix: true });
  for (const [id, model] of [
    ['R1', 'cisco-1841'],
    ['R2', 'cisco-1841'],
    ['PC1', 'pc'],
    ['PC2', 'pc'],
  ] as const) {
    net.addDevice(id, model);
  }
  net.connect('crossover', end('R1', 'FastEthernet0/0'), end('PC1', 'FastEthernet0'));
  net.connect('serial', end('R1', 'Serial0/0/0'), end('R2', 'Serial0/0/0'));
  net.connect('crossover', end('R2', 'FastEthernet0/0'), end('PC2', 'FastEthernet0'));
  return net;
}

export function run(net: Network, device: string, lines: string[]): void {
  const cli = net.device(device).cli;
  if (!cli) throw new Error(`${device} has no CLI`);
  for (const line of lines) cli.execute(line);
}

/** lab152 with R1 already configured as in the PDF (task 3), so R2 can bring the serial link up. */
export function lab152R1Done(): Network {
  const net = lab152();
  run(net, 'R1', [
    'enable',
    'configure terminal',
    'hostname R1',
    'interface fastethernet 0/0',
    'ip address 192.168.1.1 255.255.255.0',
    'no shutdown',
    'interface serial 0/0/0',
    'ip address 192.168.2.1 255.255.255.0',
    'clock rate 64000',
    'no shutdown',
    'end',
  ]);
  return net;
}

export const fixtures: Record<string, () => Network> = {
  'lab-1-5-2': lab152,
  'lab-1-5-2-r1-done': lab152R1Done,
};
