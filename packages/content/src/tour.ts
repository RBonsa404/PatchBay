import type { Text } from '../../sim-core/src/index.js';

/**
 * The guided tour: before the first mission, Aïcha shows the building's equipment one piece at a time and says what
 * each is for. It takes place in the building of the fourth mission, where every kind of equipment is present.
 */

export interface TourStop {
  /**
   * What the camera looks at: a device or panel by its id, the whiteboard, the whole room, the cable reserve, or a spot
   * of a building (a far site's spot in that site's own coordinates, as if its technical room stood where the campus's does).
   */
  focus: { device: string } | { board: true } | { room: true } | { cables: true } | { place: { x: number; z: number; upstairs?: boolean; yaw: number; pitch?: number; site?: 'agence' | 'datacenter' } };
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
    focus: { cables: true },
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
      fr: "Le réseau ne s'arrête pas à cette pièce. La salle de TP, au bout du couloir, et l'administration, à l'étage, ont chacune leur baie et leur switch. Ils remontent jusqu'à la salle technique par les câbles posés dans les murs, puis par les panneaux de brassage. Les VLAN séparent ensuite les étudiants, les enseignants et l'administration sur le même matériel.",
    },
  },
  {
    focus: { place: { x: 4, z: -2.84, yaw: -Math.PI / 2, pitch: 0.02 } },
    title: { fr: 'Se repérer dans le bâtiment' },
    text: {
      fr: "Le couloir dessert toutes les salles. Les panneaux verts au plafond indiquent où mène chaque direction, et chaque porte porte le nom de sa salle. En bas à droite, la mini-carte montre l'étage où tu te trouves et ta position. Tu te déplaces avec Z, Q, S, D, tu cours avec Maj, et tu regardes en glissant la souris.",
    },
  },
  {
    focus: { place: { x: -8.6, z: -4.5, yaw: Math.PI, pitch: -0.05 } },
    title: { fr: 'Tes collègues' },
    text: {
      fr: "Le bâtiment vit : étudiants, enseignants et personnel vaquent à leurs occupations. Approche-toi de quelqu'un, regarde-le, et appuie sur E pour lui parler. Chacun te raconte sa journée et te glisse une astuce réseau utile, comme on en apprend dans les couloirs d'une vraie école.",
    },
  },
  {
    focus: { place: { x: -2, z: -5.2, upstairs: true, yaw: -2.7, pitch: -0.05 } },
    title: { fr: "L'étage : les salles de cours" },
    text: {
      fr: "L'escalier mène à l'étage, avec deux salles de cours et l'administration. Voici la salle 101, où M. Kaboré prépare son cours de réseaux. Les câbles posés dans les murs relient chaque étage à la salle technique par les panneaux de brassage : c'est ce qu'on appelle le câblage structuré.",
    },
  },
  {
    focus: { place: { x: 0.5, z: 4.5, upstairs: true, yaw: -2.1, pitch: -0.08 } },
    title: { fr: "L'administration" },
    text: {
      fr: "L'administration a son propre switch et ses postes, dans un réseau séparé de celui des étudiants. Mme Ouédraogo y gère le secrétariat. Séparer les réseaux par service, avec des VLAN ou des sous-réseaux, c'est la base de la sécurité d'une entreprise.",
    },
  },
  {
    focus: { place: { x: -11.6, z: -2.84, yaw: -Math.PI / 2, pitch: 0.02 } },
    title: { fr: 'Les autres sites' },
    text: {
      fr: "Au bout du couloir, la porte de la rue. Dans les missions à plusieurs sites, l'IST a une agence à Bobo-Dioulasso et un opérateur loue la ligne entre les deux villes. Pour t'y rendre, sors par cette porte ou appuie sur G : tu suis le trajet sur la carte du Burkina Faso, puis tu entres dans l'autre bâtiment. Allons-y ensemble.",
    },
  },
  {
    focus: { place: { site: 'agence', x: -6.6, z: -4.6, yaw: 2.16, pitch: -0.05 } },
    title: { fr: "L'agence de Bobo-Dioulasso" },
    text: {
      fr: "Nous voici à Bobo-Dioulasso, à plus de trois cents kilomètres du campus. Fatim t'accueille à l'entrée. Chaque site est un vrai bâtiment, avec son accueil, la direction, une salle de réunion, des toilettes et sa salle informatique. Les employés d'ici travaillent sur le même réseau que le campus, grâce à la ligne louée.",
    },
  },
  {
    focus: { place: { site: 'agence', x: 0, z: 5.0, yaw: Math.PI, pitch: -0.1 } },
    title: { fr: "La salle informatique de l'agence" },
    text: {
      fr: "La baie de l'agence attend encore son routeur : tu l'installeras toi-même dans la mission sur le site distant. Regarde le chemin de câbles jaune au-dessus : c'est par là qu'arrivera la ligne de l'opérateur, jusqu'au boîtier qu'il fixe au mur. Le routeur s'y branche par un câble série, et l'opérateur relie les deux villes.",
    },
  },
  {
    focus: { place: { site: 'datacenter', x: 0.4, z: -4.9, yaw: -2.01, pitch: 0.02 } },
    title: { fr: "L'opérateur : la salle d'exploitation" },
    text: {
      fr: "Ici, c'est le fournisseur d'accès qui loue la ligne entre les deux villes et donne accès à Internet. Sur le mur d'écrans, ses techniciens surveillent chaque ligne louée : en service ou coupée, avec l'alarme et sa cause. Pendant tes missions, ces écrans montrent l'état réel de tes propres liaisons.",
    },
  },
  {
    focus: { place: { site: 'datacenter', x: -5.2, z: 0.2, yaw: 1.2, pitch: -0.05 } },
    title: { fr: 'La salle des serveurs' },
    text: {
      fr: "Le centre de données de l'opérateur : des rangées de baies sur un faux plancher, sous lequel l'air froid de la climatisation circule. C'est ici que se trouvent le routeur du fournisseur d'accès et le serveur qui joue le rôle d'Internet dans les missions sur l'accès à Internet et le dépannage.",
    },
  },
  {
    focus: { room: true },
    title: { fr: 'Travailler sans gêne' },
    text: {
      fr: "De retour au campus. Tu vois ton personnage de dos quand tu marches. Dès que tu prends un câble, que tu branches ou que tu ouvres une console, la vue passe à la première personne : c'est le mode focus, pour voir chaque port sans que ton corps le cache. La touche F change la vue à tout moment.",
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
