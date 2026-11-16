/** Short tips shown while a mission loads: one about the game, one about networks, by turns. */
export const TIPS: readonly string[] = [
  'Échap met le jeu en pause et arrête le chrono.',
  'Clique sur la liste des objectifs pour la replier : seule la tâche en cours reste affichée.',
  'Un câble droit relie un PC à un switch ; deux équipements de même type demandent un câble croisé.',
  'Le câble console (bleu clair) se branche sur le port CONSOLE, jamais sur un port réseau.',
  'Sur une liaison série, c’est le côté DCE qui donne l’horloge : clock rate.',
  'show ip interface brief : l’état de toutes les interfaces en une ligne chacune.',
  'Une interface de routeur est éteinte par défaut : no shutdown.',
  'copy running-config startup-config, sinon la configuration est perdue au redémarrage.',
  'Un PC sans passerelle par défaut ne parle qu’à son propre réseau.',
  'Un trunk 802.1Q transporte plusieurs VLAN sur un seul câble.',
  'OSPF : deux routeurs ne deviennent voisins que s’ils sont dans la même zone et le même sous-réseau.',
  'show ip route : C pour connecté, S pour statique, O pour OSPF.',
  'Une ACL étendue se place au plus près de la source du trafic à filtrer.',
  'Toute ACL se termine par un refus implicite : ce qui n’est pas permis est refusé.',
  'Pour dépanner, pars de la couche physique : câble, voyant, puis adresse, puis routage.',
  'Les cordons se rangent dans le passe-câbles : la note de propreté en tient compte.',
  'Aïcha répond à tes questions : bouton « Demander à Aïcha » ou touche V pour parler.',
];

/** Tips about what the mission about to load is about, by level id: shown two times out of three. */
export const LEVEL_TIPS: Readonly<Record<string, readonly string[]>> = {
  'l01-cablage-console': [
    'Le voyant d’un port passe au vert quand le lien monte : s’il reste éteint, regarde d’abord le câble.',
    'enable secret chiffre le mot de passe du mode privilégié ; enable password le laisse lisible dans la configuration.',
  ],
  'l02-relier-deux-reseaux': [
    'Chaque interface d’un routeur appartient à un réseau différent : deux interfaces dans le même sous-réseau, c’est refusé.',
    'Un ping qui échoue depuis un PC ? Vérifie sa passerelle : c’est l’adresse du routeur dans son propre réseau.',
  ],
  'l03-deux-salles-vlan': [
    'Un port d’accès appartient à un seul VLAN ; le trunk entre deux switchs les transporte tous, étiquetés.',
    'show vlan brief montre chaque VLAN et ses ports : un port oublié reste dans le VLAN 1.',
  ],
  'l04-reseau-du-batiment': [
    'Le panneau de brassage prolonge les câbles des murs : un cordon court relie la prise du panneau au switch.',
    'Code couleur d’entreprise : bleu vers un poste, jaune entre équipements réseau, orange pour un câble croisé.',
  ],
  'l05-routage-ospf': [
    'OSPF : interface passive vers les postes, pour annoncer leur réseau sans y chercher de voisin.',
    'show ip ospf neighbor : un voisin FULL, c’est une adjacence complète, les routes vont suivre.',
  ],
  'l06-acces-internet': [
    'Le PAT fait sortir tout un réseau privé derrière une seule adresse publique, en jouant sur les ports.',
    'ip nat inside côté réseau privé, ip nat outside côté fournisseur : sans les deux, rien n’est traduit.',
  ],
  'l07-securite': [
    'Teste une ACL comme un vrai client : curl pour le web, ssh ou ping pour ce qui doit être refusé.',
    'access-class s’applique aux lignes vty : il choisit qui peut ouvrir une session à distance sur le routeur.',
  ],
  'l08-site-distant': [
    'Une ligne louée relie deux villes par l’opérateur : chaque routeur se branche sur le boîtier de son site.',
    'default-information originate fait annoncer la route par défaut par OSPF à tous les autres routeurs.',
  ],
  'l09-depannage': [
    'Un ticket à la fois : reproduis le symptôme, trouve la couche en cause, corrige, puis vérifie.',
    'Une panne peut en cacher une autre : après chaque correction, refais le test du ticket.',
  ],
};

export function randomTip(level?: string): string {
  const own = level ? LEVEL_TIPS[level] : undefined;
  const pool = own && Math.random() < 2 / 3 ? own : TIPS;
  return pool[Math.floor(Math.random() * pool.length)] as string;
}
