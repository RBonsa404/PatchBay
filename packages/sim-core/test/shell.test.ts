import { describe, expect, it } from 'vitest';
import { runHostCommand } from '../src/index.js';
import { staticLab } from './fixtures.js';

const run = (net: ReturnType<typeof staticLab>, line: string) => runHostCommand(net, 'PC1', line).output;

describe('PC command prompt (French Windows)', () => {
  it('shows the IP configuration with ipconfig and the MAC with /all', () => {
    const net = staticLab();
    const text = run(net, 'ipconfig');
    expect(text).toContain('Configuration IP de Windows');
    expect(text).toContain('Adresse IPv4. . . . . . . . . . . . . .: 172.16.3.10');
    expect(text).toContain('Masque de sous-réseau. . . . . . . . . : 255.255.255.0');
    expect(text).toContain('Passerelle par défaut. . . . . . . . . : 172.16.3.1');
    expect(run(net, 'IPCONFIG /ALL')).toMatch(/Adresse physique . . . . . . . . . . . : ([0-9A-F]{2}-){5}[0-9A-F]{2}/);
  });

  it('reports a disconnected cable', () => {
    const net = staticLab();
    net.disconnect({ device: 'PC1', port: 'FastEthernet0' });
    expect(run(net, 'ipconfig')).toContain('Statut du média. . . . . . . . . . . . : Média déconnecté');
  });

  it('pings like Windows: replies with TTL, timeouts and statistics', () => {
    const net = staticLab();
    const text = run(net, 'ping 172.16.3.1');
    expect(text).toContain("Envoi d’une requête 'Ping'  172.16.3.1 avec 32 octets de données :");
    expect(text).toContain('Délai d’attente de la demande dépassé.'); // the first echo pays for ARP
    expect(text).toContain('Réponse de 172.16.3.1 : octets=32 temps<1ms TTL=255');
    expect(text).toContain('Paquets : envoyés = 4, reçus = 3, perdus = 1 (perte 25%),');
    expect(run(net, 'ping -n 2 172.16.3.1')).toContain('envoyés = 2, reçus = 2, perdus = 0 (perte 0%)');
  });

  it('shows a router answering "unreachable" when it has no route', () => {
    const net = staticLab();
    run(net, 'ping 172.16.3.1');
    expect(run(net, 'ping 10.9.9.9')).toContain('Réponse de 172.16.3.1 : Impossible de joindre l’hôte de destination.');
  });

  it('shows the TTL of a PC (128) decreased by each router on the way', () => {
    const net = staticLab();
    for (const [r, cmds] of [
      ['R1', ['configure terminal', 'ip route 172.16.1.0 255.255.255.0 172.16.2.2', 'end']],
      ['R2', ['configure terminal', 'ip route 172.16.3.0 255.255.255.0 172.16.2.1', 'end']],
    ] as const) for (const c of cmds) net.device(r).cli!.execute(c);
    run(net, 'ping 172.16.1.10');
    expect(run(net, 'ping 172.16.1.10')).toContain('Réponse de 172.16.1.10 : octets=32 temps<1ms TTL=126');
  });

  it('traces the route and lists the ARP table', () => {
    const net = staticLab();
    run(net, 'ping 172.16.3.1');
    const trace = run(net, 'tracert 172.16.3.1');
    expect(trace).toContain('Détermination de l’itinéraire vers 172.16.3.1 avec un maximum de 30 sauts.');
    expect(trace).toMatch(/1\s+<1 ms\s+<1 ms\s+<1 ms\s+172\.16\.3\.1/);
    expect(trace).toContain('Itinéraire déterminé.');
    expect(run(net, 'arp -a')).toMatch(/172\.16\.3\.1\s+([0-9A-F]{2}-){5}[0-9A-F]{2}\s+dynamique/);
  });

  it('handles cls, help, hostname and unknown commands', () => {
    const net = staticLab();
    expect(runHostCommand(net, 'PC1', 'cls').clear).toBe(true);
    expect(run(net, 'help')).toContain('ipconfig [/all]');
    expect(run(net, 'hostname')).toBe('PC1');
    expect(run(net, 'show ip route')).toContain("'show' n’est pas reconnu en tant que commande interne");
    expect(run(net, 'ping serveur')).toContain('n’a pas pu trouver l’hôte serveur');
  });
});
