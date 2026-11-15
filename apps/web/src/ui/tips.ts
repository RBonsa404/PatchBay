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

export function randomTip(): string {
  return TIPS[Math.floor(Math.random() * TIPS.length)] as string;
}
