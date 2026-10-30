/**
 * Aïcha answers the student's questions. No online service: it works offline, costs nothing and cannot invent IOS
 * commands. Questions are matched against a course sheet written by hand; what it does not know, it says so.
 */

export interface AssistantContext {
  /** The first objective still to do, with its hint, or null when all are done. */
  next: { label: string; hint?: string } | null;
  /** Time left, already formatted. */
  timeLeft: string;
}

interface Entry {
  /** Words to look for (without accents, in lower case); longer matches count for more. */
  keys: string[];
  answer: string;
}

const SHEET: Entry[] = [
  { keys: ['cable droit', 'droit'], answer: 'Le câble droit relie deux équipements de types différents : PC et switch, ou switch et routeur.' },
  { keys: ['cable croise', 'croise'], answer: 'Le câble croisé relie deux équipements de même nature du point de vue du brochage : PC et routeur, PC et PC, switch et switch, routeur et routeur.' },
  { keys: ['quel cable', 'quel type de cable', 'choisir cable', 'cables'], answer: 'Différents (PC-switch, switch-routeur) : câble droit. Semblables (PC-routeur, switch-switch) : câble croisé. Pour configurer : câble console. Entre deux routeurs à distance : câble série.' },
  { keys: ['cable console', 'console', 'rs232'], answer: 'Le câble console relie le port RS232 du portable au port CONSOLE du routeur ou du switch. Il sert à configurer l’équipement, il ne transporte pas le trafic du réseau. Clique ensuite sur le portable pour ouvrir le terminal.' },
  { keys: ['cable serie', 'serie', 'serial'], answer: 'La liaison série relie deux routeurs, port Serial contre port Serial. Une extrémité est DCE, l’autre DTE. Le côté DCE doit fournir l’horloge avec clock rate.' },
  { keys: ['dce', 'dte', 'horloge', 'clock rate', 'clock'], answer: 'Le côté DCE fournit l’horloge de la liaison série. Sur son interface : clock rate 64000. Sans horloge, l’interface reste en up/down. Le premier bout de câble série que tu branches est le DCE ; show controllers sur un vrai routeur permet de le vérifier.' },
  { keys: ['enable secret', 'secret', 'mode privilegie', 'enable'], answer: 'enable passe en mode privilégié (invite #). Pour le protéger : en configuration, enable secret suivi du mot de passe. Il est stocké haché, contrairement à enable password.' },
  { keys: ['configure terminal', 'conf t', 'mode configuration', 'mode config'], answer: 'Depuis le mode privilégié : configure terminal (ou conf t). L’invite devient (config)#. exit remonte d’un niveau, end revient au mode privilégié.' },
  { keys: ['hostname', 'nom du routeur', 'nom du switch', 'nommer'], answer: 'En mode configuration : hostname suivi du nom, par exemple hostname R1. L’invite change aussitôt.' },
  { keys: ['line console', 'mot de passe console', 'proteger la console', 'login'], answer: 'line console 0, puis password suivi du mot de passe, puis login. Sans login, le mot de passe n’est pas demandé.' },
  { keys: ['ip address', 'adresser', 'adresse ip', 'adresse du routeur', 'interface'], answer: 'interface suivi du nom (par exemple interface g0/0), puis ip address 192.168.10.1 255.255.255.0, puis no shutdown.' },
  { keys: ['no shutdown', 'shutdown', 'administratively down', 'eteinte', 'down'], answer: 'Les interfaces d’un routeur sont éteintes au départ (administratively down). no shutdown les allume. Si elle reste down : regarde le câble, le port, et l’état de l’équipement d’en face.' },
  { keys: ['voyant', 'led', 'lumiere', 'orange'], answer: 'Vert : le lien fonctionne. Ambre sur une liaison série : le lien physique est là mais le protocole ne monte pas, souvent une horloge manquante. Éteint : câble, port ou interface à vérifier.' },
  { keys: ['sauvegarder', 'sauvegarde', 'copy run', 'write memory', 'startup', 'enregistrer'], answer: 'copy running-config startup-config (ou copy run start) en mode privilégié. Sinon la configuration est perdue au redémarrage.' },
  { keys: ['route statique', 'ip route', 'routage', 'route', 'autre reseau', 'saut suivant'], answer: 'ip route réseau-destination masque saut-suivant, par exemple ip route 192.168.2.0 255.255.255.0 10.0.0.2. Le saut suivant est l’adresse du routeur voisin. Il faut une route dans chaque sens.' },
  { keys: ['passerelle', 'gateway'], answer: 'La passerelle d’un PC est l’adresse du routeur sur son propre réseau. Sans elle, le PC ne peut pas joindre un autre réseau. Clique sur le PC pour la régler.' },
  { keys: ['masque', 'sous-reseau', 'sous reseau', '255', '/24'], answer: 'Le masque sépare la partie réseau de la partie hôte. 255.255.255.0 (/24) : les trois premiers nombres identifient le réseau, soit 254 adresses d’hôtes utilisables.' },
  { keys: ['ping', 'tester', 'test'], answer: 'ping suivi de l’adresse. ! : réponse reçue. . : pas de réponse. U : destination inaccessible. Le premier ping donne souvent .!!!! : le premier paquet est perdu le temps de la résolution ARP, c’est normal.' },
  { keys: ['arp', 'mac'], answer: 'ARP trouve l’adresse MAC correspondant à une adresse IP du même réseau. Sur un routeur : show ip arp. Sur un PC : arp -a.' },
  { keys: ['ipconfig', 'configurer le pc', 'adresse du pc', 'pc'], answer: 'Clique sur le PC : tu règles son adresse, son masque et sa passerelle, et tu as une invite de commandes. ipconfig affiche sa configuration.' },
  { keys: ['show ip interface brief', 'verifier les interfaces', 'show ip int'], answer: 'show ip interface brief résume chaque interface : adresse, état physique, état du protocole. C’est la première commande à taper quand quelque chose ne marche pas.' },
  { keys: ['show ip route', 'table de routage'], answer: 'show ip route affiche la table de routage. C : réseau directement connecté. S : route statique.' },
  { keys: ['show run', 'show running', 'running-config', 'voir la configuration'], answer: 'show running-config affiche la configuration en cours. Depuis le mode configuration, ajoute do devant : do show running-config.' },
  { keys: ['aide', 'commande', 'commandes', '?'], answer: 'Dans la console, ? liste les commandes possibles à cet endroit, et Tab complète un mot. Les flèches haut et bas rappellent les commandes précédentes.' },
  { keys: ['note', 'score', 'etoile', 'etoiles', 'bareme', 'point'], answer: 'Les objectifs valent 80 points. Les 20 autres récompensent la rapidité et ne comptent que si tout est fait : ils sont tous acquis si tu finis dans la moitié du temps. Il faut 90 pour trois étoiles.' },
  { keys: ['clavier', 'deplacer', 'marcher', 'zoom', 'controle', 'touches'], answer: 'ZQSD : marcher. Maj : courir. Glisser : regarder. Molette : zoomer. Double-clic : s’approcher d’un appareil. T : tableau. P : liste des ports, pour tout faire au clavier. M : musique. N : morceau suivant.' },
  { keys: ['schema', 'tableau', 'plan'], answer: 'Clique sur le tableau blanc, ou appuie sur T, pour voir le plan de la mission : appareils, liaisons et ports.' },
];

const NEXT_WORDS = ['que faire', 'quoi faire', 'prochaine', 'bloque', 'suite', 'maintenant', 'ensuite', 'je fais quoi', 'par ou', 'commencer', 'indice'];
const TIME_WORDS = ['temps', 'chrono', 'minute', 'reste-t-il'];

const normalise = (text: string): string => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();

export function answer(question: string, context: AssistantContext): string {
  const q = normalise(question);
  if (NEXT_WORDS.some((w) => q.includes(w))) {
    if (!context.next) return 'Tout est fait. Clique sur « Vérifier la mission » pour rendre ton travail !';
    return `Prochain objectif : ${context.next.label}.${context.next.hint ? ` ${context.next.hint}` : ''}`;
  }
  if (TIME_WORDS.some((w) => q.includes(w))) return `Il te reste ${context.timeLeft}. Quand le temps est écoulé, le réseau est noté tel quel.`;
  let best: Entry | null = null;
  let bestScore = 0;
  for (const entry of SHEET) {
    for (const key of entry.keys) {
      // Whole words only, so that "pc" does not match inside another word.
      const at = ` ${q} `.includes(` ${key} `) || (key.length > 4 && q.includes(key));
      if (at && key.length > bestScore) {
        best = entry;
        bestScore = key.length;
      }
    }
  }
  return best?.answer ?? 'Je n’ai pas cette réponse dans ma fiche. Essaie avec le nom d’une commande ou d’un câble (par exemple « route statique » ou « câble croisé »), ou tape ? dans la console.';
}

/** Questions proposed to get the conversation started. */
export const SUGGESTIONS = ['Que dois-je faire maintenant ?', 'Quel câble choisir ?', 'Comment sauvegarder ?', 'Comment est calculée ma note ?'];
