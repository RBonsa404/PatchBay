import type { Network } from '../model/network.js';

/**
 * The command prompt of a PC or server, as a French Windows prints it: what students use to test a network from the
 * client side (`ipconfig`, `ping`, `tracert`, `arp -a`). Output strings follow Windows 10/11 in French.
 */
export interface ShellResult {
  output: string;
  /** `cls`: the terminal must be emptied. */
  clear?: boolean;
}

export const SHELL_PROMPT = 'C:\\Users\\Etudiant>';

const NOT_RECOGNISED = (cmd: string): string =>
  `'${cmd}' n’est pas reconnu en tant que commande interne\nou externe, un programme exécutable ou un fichier de commandes.`;

const HELP = [
  'Commandes disponibles :',
  '  ipconfig [/all]      Affiche la configuration IP de la carte réseau',
  '  ipconfig /renew      Demande une adresse au serveur DHCP',
  '  ipconfig /release    Rend l’adresse au serveur DHCP',
  '  ping [-n N] <IP>     Teste la connectivité vers une adresse',
  '  tracert <IP>         Affiche les routeurs traversés jusqu’à une adresse',
  '  arp -a               Affiche la table ARP (adresses IP et MAC connues)',
  '  curl http://<IP>     Ouvre une page web (port 80, ou :port)',
  '  telnet <IP> [port]   Ouvre une session Telnet (port 23 par défaut)',
  '  ssh [nom@]<IP>       Ouvre une session SSH (port 22)',
  '  hostname             Affiche le nom de l’ordinateur',
  '  cls                  Efface l’écran',
].join('\n');

const dashed = (mac: string): string => mac.replace(/\./g, '').replace(/(..)(?!$)/g, '$1-').toUpperCase();
const isIp = (s: string | undefined): s is string => !!s && /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every((o) => Number(o) <= 255);

function ipconfig(net: Network, deviceId: string, all: boolean): string {
  const device = net.device(deviceId);
  const nic = device.model.ports.find((p) => p.kind === 'ethernet');
  const host = device.host ?? {};
  const lines = ['', 'Configuration IP de Windows', ''];
  if (all) lines.push(`   Nom de l’hôte . . . . . . . . . . : ${deviceId}`, '');
  lines.push('Carte Ethernet Ethernet :', '');
  const connected = nic ? net.hostLinkUp({ device: deviceId, port: nic.name }) : false;
  if (!connected) {
    lines.push('   Statut du média. . . . . . . . . . . . : Média déconnecté', '   Suffixe DNS propre à la connexion. . . :');
    if (all && nic) lines.push(`   Adresse physique . . . . . . . . . . . : ${dashed(net.macOf(deviceId, nic.name))}`);
    return lines.join('\n');
  }
  lines.push('   Suffixe DNS propre à la connexion. . . :');
  if (all && nic) lines.push(`   Adresse physique . . . . . . . . . . . : ${dashed(net.macOf(deviceId, nic.name))}`, `   DHCP activé. . . . . . . . . . . . . . : ${host.dhcp ? 'Oui' : 'Non'}`);
  if (host.ip) lines.push(`   Adresse IPv4. . . . . . . . . . . . . .: ${host.ip}`);
  if (host.mask) lines.push(`   Masque de sous-réseau. . . . . . . . . : ${host.mask}`);
  lines.push(`   Passerelle par défaut. . . . . . . . . : ${host.gateway ?? ''}`);
  if (all && host.dns) lines.push(`   Serveurs DNS. . . . . . . . . . . . . .: ${host.dns}`);
  return lines.join('\n');
}

function ping(net: Network, deviceId: string, target: string, count: number): string {
  const r = net.ping(deviceId, target, count);
  const lines = ['', `Envoi d’une requête 'Ping'  ${target} avec 32 octets de données :`];
  for (const reply of r.replies ?? []) {
    if (reply.symbol === '!') lines.push(`Réponse de ${reply.from} : octets=32 temps<1ms TTL=${reply.ttl ?? 128}`);
    else if (reply.symbol === 'U') lines.push(`Réponse de ${reply.from} : Impossible de joindre l’hôte de destination.`);
    else if (reply.symbol === '&') lines.push(`Réponse de ${reply.from} : Durée de vie TTL expirée lors du transit.`);
    else lines.push('Délai d’attente de la demande dépassé.');
  }
  // Windows counts "unreachable" answers as received: they are replies, just not from the destination.
  const answered = (r.replies ?? []).filter((x) => x.symbol !== '.').length;
  const lost = r.sent - answered;
  lines.push(
    '',
    `Statistiques Ping pour ${target}:`,
    `    Paquets : envoyés = ${r.sent}, reçus = ${answered}, perdus = ${lost} (perte ${Math.round((lost * 100) / r.sent)}%),`,
  );
  if (r.received > 0) lines.push('Durée approximative des boucles en millisecondes :', '    Minimum = 0ms, Maximum = 1ms, Moyenne = 0ms');
  return lines.join('\n');
}

function tracert(net: Network, deviceId: string, target: string): string {
  const hops = net.l3.traceroute(deviceId, target, 30);
  const lines = ['', `Détermination de l’itinéraire vers ${target} avec un maximum de 30 sauts.`, ''];
  for (const h of hops) {
    const cells = h.answers.map((ok) => (ok ? '<1 ms' : '*')).map((c) => c.padStart(5)).join('    ');
    const where = h.outcome === 'timeout' ? 'Délai d’attente de la demande dépassé.' : h.outcome === 'unreachable' ? `${h.address} rapports : Impossible de joindre l’hôte de destination.` : (h.address ?? '');
    lines.push(`${String(h.ttl).padStart(3)}  ${cells}  ${where}`);
  }
  lines.push('', 'Itinéraire déterminé.');
  return lines.join('\n');
}

function arp(net: Network, deviceId: string): string {
  const host = net.device(deviceId).host ?? {};
  const learned = net.l3.arpTable(deviceId).filter((e) => !e.own);
  if (!host.ip || learned.length === 0) return 'Aucune entrée ARP trouvée.';
  return [
    '',
    `Interface : ${host.ip} --- 0x2`,
    '  Adresse Internet      Adresse physique      Type',
    ...learned.map((e) => `  ${e.ip.padEnd(22)}${dashed(e.mac).padEnd(22)}dynamique`),
  ].join('\n');
}

/** `curl http://10.0.0.1:8080/page` → address and port; undefined when the URL is not an IPv4 web address. */
function parseUrl(raw: string | undefined): { ip: string; port: number } | undefined {
  const m = raw?.match(/^(?:http:\/\/)?(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?(?:\/.*)?$/);
  if (!m || !isIp(m[1])) return undefined;
  const port = m[2] === undefined ? 80 : Number(m[2]);
  return port >= 1 && port <= 65535 ? { ip: m[1], port } : undefined;
}

function curl(net: Network, deviceId: string, target: string | undefined): string {
  const url = parseUrl(target);
  if (!url) return target ? `curl: (6) Could not resolve host: ${target}` : 'Usage : curl http://adresse[:port]';
  const r = net.tcpConnect(deviceId, url.ip, url.port);
  if (r === 'open') return `<html><head><title>${url.ip}</title></head><body>Site web de ${url.ip} : page reçue (HTTP 200 OK).</body></html>`;
  if (r === 'refused') return `curl: (7) Failed to connect to ${url.ip} port ${url.port} after 0 ms: Connection refused`;
  if (r === 'unreachable') return `curl: (7) Failed to connect to ${url.ip} port ${url.port} after 0 ms: Could not connect to server`;
  return `curl: (28) Failed to connect to ${url.ip} port ${url.port} after 21000 ms: Timed out`;
}

function telnet(net: Network, deviceId: string, target: string | undefined, rawPort: string | undefined): string {
  const port = rawPort === undefined ? 23 : Number(rawPort);
  if (!isIp(target) || !Number.isInteger(port) || port < 1 || port > 65535) return 'Usage : telnet adresse [port]';
  const r = net.tcpConnect(deviceId, target, port);
  if (r !== 'open') return `Connexion à ${target}...Impossible d’ouvrir une connexion à l’hôte, sur le port ${port}: Échec lors de la connexion`;
  const router = [...net.devices.values()].find((d) => !d.host && d.cli && net.l3.interfaces(d.id).some((i) => i.ip === target));
  if (router && port === 23) return `Connexion à ${target}...

User Access Verification

Password:

Connexion perdue avec l’hôte (session de démonstration fermée).`;
  return `Connexion à ${target}... connecté au port ${port}.

Connexion perdue avec l’hôte.`;
}

function ssh(net: Network, deviceId: string, target: string | undefined): string {
  const host = target?.includes('@') ? target.slice(target.indexOf('@') + 1) : target;
  if (!isIp(host)) return 'usage: ssh [utilisateur@]adresse';
  const r = net.tcpConnect(deviceId, host, 22);
  if (r === 'open') return `${target}'s password:

Connexion fermée par ${host} port 22 (session de démonstration).`;
  if (r === 'refused') return `ssh: connect to host ${host} port 22: Connection refused`;
  if (r === 'unreachable') return `ssh: connect to host ${host} port 22: No route to host`;
  return `ssh: connect to host ${host} port 22: Connection timed out`;
}

/** Run one command line typed in the prompt of host `deviceId`. */
export function runHostCommand(net: Network, deviceId: string, line: string): ShellResult {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const cmd = (words[0] ?? '').toLowerCase();
  const args = words.slice(1).map((w) => w.toLowerCase());
  switch (cmd) {
    case '':
      return { output: '' };
    case 'cls':
      return { output: '', clear: true };
    case 'help':
    case 'aide':
    case '/?':
      return { output: HELP };
    case 'hostname':
      return { output: deviceId };
    case 'ipconfig':
      if (args.length === 0 || args[0] === '/all') return { output: ipconfig(net, deviceId, args[0] === '/all') };
      if (args[0] === '/renew') {
        if (net.dhcpRenew(deviceId)) return { output: ipconfig(net, deviceId, false) };
        return { output: 'Une erreur s’est produite lors du renouvellement de l’interface Ethernet :\nimpossible de contacter votre serveur DHCP. La demande a expiré.' };
      }
      if (args[0] === '/release') {
        net.dhcpRelease(deviceId);
        return { output: ipconfig(net, deviceId, false) };
      }
      return { output: 'Erreur : option non reconnue. Utilisez ipconfig ou ipconfig /all.' };
    case 'ping': {
      let count = 4;
      let target: string | undefined;
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '-n') count = Math.max(1, Math.min(20, Number(args[++i]) || 4));
        else target = args[i];
      }
      if (!target) return { output: 'Usage : ping [-n nombre] adresse' };
      if (!isIp(target)) return { output: `La requête Ping n’a pas pu trouver l’hôte ${target}. Vérifiez le nom et essayez à nouveau.` };
      return { output: ping(net, deviceId, target, count) };
    }
    case 'tracert':
      if (!isIp(args[0])) return { output: 'Usage : tracert adresse' };
      return { output: tracert(net, deviceId, args[0]) };
    case 'arp':
      return args[0] === '-a' ? { output: arp(net, deviceId) } : { output: 'Usage : arp -a' };
    case 'curl':
      return { output: curl(net, deviceId, args.find((a) => !a.startsWith('-'))) };
    case 'telnet':
      return { output: telnet(net, deviceId, args[0], args[1]) };
    case 'ssh':
      return { output: ssh(net, deviceId, args.find((a) => !a.startsWith('-'))) };
    default:
      return { output: NOT_RECOGNISED(words[0] as string) };
  }
}
