import type { Text } from '../../sim-core/src/index.js';

/**
 * The guided tour: before the first mission, Aïcha shows the building's equipment one piece at a time and says what
 * each is for. It takes place in the building of the fourth mission, where every kind of equipment is present.
 */

export interface TourStop {
  /** What the camera looks at: a device or panel by its id, the whiteboard, or the whole room. */
  focus: { device: string } | { board: true } | { room: true };
  title: Text;
  text: Text;
}

export const TOUR_LEVEL = 'l04-reseau-du-batiment';

export const tour: TourStop[] = [
  {
    focus: { room: true },
    title: { fr: 'Bienvenue dans la salle technique' },
    text: {
      fr: "Bienvenue ! Je suis Aïcha, formatrice réseau du club. Ici, c'est la salle technique : le cœur du réseau du bâtiment. Avant ta première mission, je te présente le matériel que tu vas câbler et configurer. Avance avec le bouton Suivant.",
    },
  },
  {
    focus: { device: 'PP-TECH' },
    title: { fr: 'La baie et le panneau de brassage' },
    text: {
      fr: "Tout l'équipement est rangé dans une baie de 19 pouces, mesurée en unités : une unité, c'est 4,45 centimètres. En haut, le panneau de brassage : les câbles posés dans les murs du bâtiment arrivent derrière lui. Devant, on les relie aux équipements avec de courts cordons. L'étiquette au-dessus des prises dit où va chaque câble.",
    },
  },
  {
    focus: { device: 'S1' },
    title: { fr: 'Le switch Catalyst 2960' },
    text: {
      fr: "Voici le switch. Il relie les appareils d'un même réseau local et apprend sur quel port se trouve chaque adresse MAC. Ses 24 ports FastEthernet servent aux postes ; les deux ports Gigabit, entourés de jaune, relient les autres switchs et le routeur. Au-dessus de chaque port, un voyant s'allume en vert quand le lien est actif.",
    },
  },
  {
    focus: { device: 'R1' },
    title: { fr: 'Le routeur Cisco 2911' },
    text: {
      fr: "Le routeur relie des réseaux différents entre eux et choisit le chemin des paquets grâce à sa table de routage. Il a trois ports Gigabit Ethernet, une carte série pour les liaisons longue distance, et un port console bleu pour le configurer quand il n'a encore aucune adresse.",
    },
  },
  {
    focus: { device: 'ADMIN' },
    title: { fr: 'Le portable d’administration' },
    text: {
      fr: "Un routeur ou un switch neuf n'a pas d'adresse : on le configure par son port console. Le câble console, bleu clair, relie le port série du portable au port console de l'équipement. Ensuite, tu tapes les commandes IOS dans la console, exactement comme sur du vrai matériel Cisco.",
    },
  },
  {
    focus: { device: 'PC2' },
    title: { fr: 'Les postes de travail' },
    text: {
      fr: "Les PC sont les clients du réseau. Chacun a une adresse IP, un masque et une passerelle par défaut : l'adresse du routeur qui le relie aux autres réseaux. Clique sur un PC pour ouvrir son invite de commandes : ipconfig, ping et tracert te diront si le réseau fonctionne.",
    },
  },
  {
    focus: { room: true },
    title: { fr: 'Le bon câble pour chaque liaison' },
    text: {
      fr: "En bas de l'écran, ta réserve de câbles. Le câble droit, bleu, relie deux appareils différents : un PC à un switch, un switch à un routeur. Le câble croisé, orange, relie deux appareils semblables : deux switchs, ou un PC directement à un routeur. Le câble console sert à configurer, et le câble série relie deux routeurs éloignés. Quand tu prends un câble, les ports où il peut aller s'allument en vert.",
    },
  },
  {
    focus: { board: true },
    title: { fr: 'Le plan du réseau' },
    text: {
      fr: "Le tableau blanc montre le plan de la mission : les appareils, les liaisons à faire et les ports à utiliser. Clique dessus pour l'agrandir à tout moment. Un bon technicien regarde toujours le plan avant de tirer un câble.",
    },
  },
  {
    focus: { device: 'S2' },
    title: { fr: 'Les autres salles du bâtiment' },
    text: {
      fr: "Le réseau ne s'arrête pas à cette pièce. La salle de TP, au bout du couloir, et l'administration, à l'étage, ont chacune leur baie et leur switch. Ils remontent jusqu'ici par les câbles du bâtiment. Les VLAN séparent ensuite les étudiants, les enseignants et l'administration sur le même matériel.",
    },
  },
  {
    focus: { room: true },
    title: { fr: 'À toi de jouer' },
    text: {
      fr: "Tu connais maintenant le matériel. Dans chaque mission, un ordre de travail te dit quoi faire, et le chrono tourne. Je reste disponible : demande-moi de l'aide avec le bouton Aïcha, ou parle-moi avec la touche V. Prêt pour ta première mission ?",
    },
  },
];
