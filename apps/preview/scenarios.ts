import { Network, type CableType } from '../../packages/sim-core/src/index.js';

export interface NodeLayout {
  id: string;
  model: string;
  x: number;
  y: number;
}

export interface CableSpec {
  type: CableType;
  a: [device: string, port: string];
  b: [device: string, port: string];
}

export interface Scenario {
  id: string;
  title: string;
  brief: string;
  nodes: NodeLayout[];
  cables: CableSpec[];
  hosts: Record<string, { ip: string; mask: string; gateway?: string }>;
}

export const scenarios: Scenario[] = [
  {
    id: 'static',
    title: 'Routage statique (3 routeurs)',
    brief:
      'Le réseau est câblé. Configure les interfaces des 3 routeurs (adresses du schéma), mets une horloge sur le côté DCE ' +
      '(R1 s0/0/0 et R2 s0/0/1), puis des routes statiques pour que PC1 joigne PC3.',
    nodes: [
      { id: 'PC1', model: 'pc', x: 60, y: 110 },
      { id: 'R1', model: 'cisco-1841', x: 200, y: 110 },
      { id: 'R2', model: 'cisco-1841', x: 370, y: 110 },
      { id: 'R3', model: 'cisco-1841', x: 540, y: 110 },
      { id: 'PC2', model: 'pc', x: 370, y: 260 },
      { id: 'PC3', model: 'pc', x: 540, y: 260 },
    ],
    cables: [
      { type: 'crossover', a: ['R1', 'FastEthernet0/0'], b: ['PC1', 'FastEthernet0'] },
      { type: 'serial', a: ['R1', 'Serial0/0/0'], b: ['R2', 'Serial0/0/0'] },
      { type: 'crossover', a: ['R2', 'FastEthernet0/0'], b: ['PC2', 'FastEthernet0'] },
      { type: 'serial', a: ['R2', 'Serial0/0/1'], b: ['R3', 'Serial0/0/1'] },
      { type: 'crossover', a: ['R3', 'FastEthernet0/0'], b: ['PC3', 'FastEthernet0'] },
    ],
    hosts: {
      PC1: { ip: '172.16.3.10', mask: '255.255.255.0', gateway: '172.16.3.1' },
      PC2: { ip: '172.16.1.10', mask: '255.255.255.0', gateway: '172.16.1.1' },
      PC3: { ip: '192.168.2.10', mask: '255.255.255.0', gateway: '192.168.2.1' },
    },
  },
  {
    id: 'stick',
    title: 'VLAN + routage inter-VLAN',
    brief:
      'Un switch, un routeur, trois PC. Crée les VLAN 10, 20 et 99, mets Fa0/1 du switch en trunk (natif 99), affecte les ports ' +
      'des PC, puis crée les sous-interfaces du routeur (fa0/0.10, .20, .99 avec encapsulation dot1q) pour que PC1 joigne PC2.',
    nodes: [
      { id: 'R1', model: 'cisco-1841', x: 90, y: 150 },
      { id: 'S1', model: 'catalyst-2960', x: 300, y: 150 },
      { id: 'PC1', model: 'pc', x: 520, y: 50 },
      { id: 'PC2', model: 'pc', x: 520, y: 150 },
      { id: 'PC3', model: 'pc', x: 520, y: 250 },
    ],
    cables: [
      { type: 'straight', a: ['R1', 'FastEthernet0/0'], b: ['S1', 'FastEthernet0/1'] },
      { type: 'straight', a: ['PC1', 'FastEthernet0'], b: ['S1', 'FastEthernet0/2'] },
      { type: 'straight', a: ['PC2', 'FastEthernet0'], b: ['S1', 'FastEthernet0/3'] },
      { type: 'straight', a: ['PC3', 'FastEthernet0'], b: ['S1', 'FastEthernet0/4'] },
    ],
    hosts: {
      PC1: { ip: '172.17.10.21', mask: '255.255.255.0', gateway: '172.17.10.1' },
      PC2: { ip: '172.17.20.22', mask: '255.255.255.0', gateway: '172.17.20.1' },
      PC3: { ip: '172.17.10.24', mask: '255.255.255.0', gateway: '172.17.10.1' },
    },
  },
  {
    id: 'ospf',
    title: 'OSPF à trois routeurs (TP 11.6.1)',
    brief:
      'Triangle de liaisons série. Adresse les interfaces (voir le TP 11.6.1), mets l’horloge côté DCE (R1 s0/0/0 et s0/0/1, ' +
      'R2 s0/0/1), puis active OSPF (`router ospf 1`, `network … area 0`). Regarde les adjacences apparaître et les deux chemins égaux.',
    nodes: [
      { id: 'R1', model: 'cisco-1841', x: 320, y: 70 },
      { id: 'R2', model: 'cisco-1841', x: 140, y: 230 },
      { id: 'R3', model: 'cisco-1841', x: 500, y: 230 },
      { id: 'PC1', model: 'pc', x: 320, y: 20 },
      { id: 'PC2', model: 'pc', x: 50, y: 300 },
      { id: 'PC3', model: 'pc', x: 590, y: 300 },
    ],
    cables: [
      { type: 'serial', a: ['R1', 'Serial0/0/0'], b: ['R2', 'Serial0/0/0'] },
      { type: 'serial', a: ['R1', 'Serial0/0/1'], b: ['R3', 'Serial0/0/0'] },
      { type: 'serial', a: ['R2', 'Serial0/0/1'], b: ['R3', 'Serial0/0/1'] },
      { type: 'crossover', a: ['R1', 'FastEthernet0/0'], b: ['PC1', 'FastEthernet0'] },
      { type: 'crossover', a: ['R2', 'FastEthernet0/0'], b: ['PC2', 'FastEthernet0'] },
      { type: 'crossover', a: ['R3', 'FastEthernet0/0'], b: ['PC3', 'FastEthernet0'] },
    ],
    hosts: {
      PC1: { ip: '172.16.1.20', mask: '255.255.255.240', gateway: '172.16.1.17' },
      PC2: { ip: '10.10.10.10', mask: '255.255.255.0', gateway: '10.10.10.1' },
      PC3: { ip: '172.16.1.35', mask: '255.255.255.248', gateway: '172.16.1.33' },
    },
  },
  {
    id: 'lab152',
    title: 'Premier routeur (TP 1.5.2)',
    brief:
      'Deux routeurs, deux PC. Suis le TP : nom, mots de passe, interfaces (192.168.1.1, 192.168.2.x, 192.168.3.1), ' +
      "horloge côté DCE (R1 s0/0/0), puis `copy running-config startup-config`. Les messages de lien s'affichent comme sur le vrai matériel.",
    nodes: [
      { id: 'PC1', model: 'pc', x: 70, y: 150 },
      { id: 'R1', model: 'cisco-1841', x: 230, y: 150 },
      { id: 'R2', model: 'cisco-1841', x: 420, y: 150 },
      { id: 'PC2', model: 'pc', x: 590, y: 150 },
    ],
    cables: [
      { type: 'crossover', a: ['R1', 'FastEthernet0/0'], b: ['PC1', 'FastEthernet0'] },
      { type: 'serial', a: ['R1', 'Serial0/0/0'], b: ['R2', 'Serial0/0/0'] },
      { type: 'crossover', a: ['R2', 'FastEthernet0/0'], b: ['PC2', 'FastEthernet0'] },
    ],
    hosts: {
      PC1: { ip: '192.168.1.10', mask: '255.255.255.0', gateway: '192.168.1.1' },
      PC2: { ip: '192.168.3.10', mask: '255.255.255.0', gateway: '192.168.3.1' },
    },
  },
];

export function build(s: Scenario): Network {
  const net = new Network({ strictMdix: true });
  for (const n of s.nodes) net.addDevice(n.id, n.model);
  for (const c of s.cables) {
    const r = net.connect(c.type, { device: c.a[0], port: c.a[1] }, { device: c.b[0], port: c.b[1] });
    if (!r.ok) throw new Error(`cable ${c.a.join(':')} - ${c.b.join(':')}: ${r.error}`);
  }
  for (const [id, cfg] of Object.entries(s.hosts)) net.configureHost(id, cfg);
  return net;
}
