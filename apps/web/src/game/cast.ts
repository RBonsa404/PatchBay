import { FLOOR_Y, SITE_Z } from '../scene/building.js';
import type { Motion } from '../scene/people.js';

/**
 * The colleagues met in the buildings: who they are, where they are, what they are doing, and what they say when the
 * player stops to talk (E). Their lines mix a word about their day with a useful piece of network know-how, the kind
 * one picks up in the corridor of a real school.
 */
export interface Colleague {
  /** Their model in `public/models/people/`. */
  model: string;
  name: string;
  role: string;
  at: { x: number; y: number; z: number; yaw: number };
  motion: Motion;
  /** A colleague who walks up and down between these points. */
  walk?: [number, number][];
  lines: string[];
}

const S = SITE_Z;

export const COLLEAGUES: Colleague[] = [
  {
    model: 'awa',
    name: 'Awa',
    role: 'Étudiante, membre du club',
    at: { x: -9.15, y: 0, z: -8.5, yaw: 0 },
    motion: 'Sitting_Talking_Loop',
    lines: [
      'Salut ! Tu prépares le TP réseau ? Moi je révise le VLAN, c’est pas si compliqué une fois qu’on a compris le trunk.',
      'Astuce : avant de tout reconfigurer, tape show ip interface brief. La moitié des pannes, c’est une interface en shutdown.',
      'Le club organise un atelier câblage samedi. Viens, on sertit des RJ45 et on teste au testeur de câbles !',
    ],
  },
  {
    model: 'ibrahim',
    name: 'Ibrahim',
    role: 'Étudiant en réseaux',
    at: { x: -9.6, y: 0, z: -6.4, yaw: 2.6 },
    motion: 'Idle_Talking_Loop',
    lines: [
      'Le distributeur a encore avalé ma pièce… Bref. Tu savais qu’un câble croisé relie deux équipements du même type ?',
      'Mon conseil : sauvegarde toujours avec copy running-config startup-config. Une coupure de courant, et tout est perdu.',
      'J’ai eu 18 à l’examen OSPF. Le secret : vérifier les voisins avec show ip ospf neighbor avant tout le reste.',
    ],
  },
  {
    model: 'seydou',
    name: 'Seydou',
    role: 'Étudiant, première année',
    at: { x: -12, y: 0, z: -2.6, yaw: Math.PI / 2 },
    motion: 'Walk_Loop',
    walk: [[-12.5, -2.6], [4.8, -2.6]],
    lines: [
      'Je cours, j’ai cours en 001 ! On se voit à la pause ?',
      'Tu sais où est la salle de TP ? Ah oui, en face de la salle technique, merci !',
      'Le prof a dit que l’adresse de broadcast d’un /24, c’est toujours le .255. Je le note partout.',
    ],
  },
  {
    model: 'm-kabore',
    name: 'M. Kaboré',
    role: 'Enseignant, réseaux et télécoms',
    at: { x: -4.8, y: FLOOR_Y, z: -10.9, yaw: 0.3 },
    motion: 'Idle_Talking_Loop',
    lines: [
      'Bonjour ! Le cours de cet après-midi porte sur le routage inter-VLAN. Vous avez vu le router-on-a-stick en TP ?',
      'Retenez ceci : une route statique, c’est l’adresse du réseau, son masque, et le prochain saut. Rien de plus.',
      'Un bon technicien commence par la couche physique. Un voyant éteint vous évite une heure de recherche.',
    ],
  },
  {
    model: 'mme-ouedraogo',
    name: 'Mme Ouédraogo',
    role: 'Secrétariat de la direction',
    at: { x: -3.1, y: FLOOR_Y, z: 2.4, yaw: 0 },
    motion: 'Sitting_Idle_Loop',
    lines: [
      'Bonjour, vous cherchez le directeur des études ? Il est en réunion jusqu’à midi.',
      'Le réseau de l’administration est dans un VLAN à part : les étudiants n’y ont pas accès, c’est plus sûr.',
      'Si l’imprimante ne répond plus, c’est souvent son adresse IP qui a changé. Le DHCP, ça a ses humeurs !',
    ],
  },
  {
    model: 'fatim',
    name: 'Fatim',
    role: 'Accueil, agence de Bobo-Dioulasso',
    at: { x: -3.2, y: 0, z: S.agence - 7.2, yaw: -Math.PI / 2 },
    motion: 'Sitting_Idle_Loop',
    lines: [
      'Bienvenue à l’agence de Bobo ! Vous venez pour la liaison avec le campus ? La salle informatique est au bout du couloir.',
      'Depuis que la ligne louée marche, on reçoit les fichiers du campus en quelques secondes. Avant, c’était par clé USB !',
      'Il fait chaud aujourd’hui… La climatisation de la salle informatique, elle, ne s’arrête jamais.',
    ],
  },
  {
    model: 'm-traore',
    name: 'M. Traoré',
    role: 'Directeur de l’agence',
    at: { x: -2.0, y: 0, z: S.agence - 7.85, yaw: Math.PI },
    motion: 'Sitting_Idle_Loop',
    lines: [
      'Ah, le technicien du campus ! Merci de venir jusqu’à Bobo. Il faut que l’agence rejoigne le réseau de l’IST.',
      'Nous voulons Internet par le campus, pas une deuxième connexion : c’est plus simple à surveiller.',
      'Si la liaison tombe, l’opérateur nous dit toujours de vérifier d’abord nos propres équipements.',
    ],
  },
  {
    model: 'adama',
    name: 'Adama',
    role: 'Technicien d’exploitation, opérateur',
    at: { x: 0, y: 0, z: S.datacenter - 7.85, yaw: Math.PI },
    motion: 'Sitting_Idle_Loop',
    lines: [
      'Bonjour ! Ici on surveille toutes les lignes louées des clients. La vôtre, campus–Bobo, est au vert.',
      'Sur une ligne louée, c’est nous qui donnons l’horloge. Vos routeurs, eux, sont en DTE : pas de clock rate à taper.',
      'Quand un client appelle pour une panne, on regarde d’abord les voyants du boîtier : LINE éteint, c’est chez nous.',
    ],
  },
  {
    model: 'mariam',
    name: 'Mariam',
    role: 'Ingénieure réseau, opérateur',
    at: { x: -2.1, y: 0, z: S.datacenter - 6.0, yaw: -Math.PI / 2 },
    motion: 'Idle_Loop',
    lines: [
      'Le mur d’écrans, c’est notre carte du pays : chaque ville, chaque ligne. Rouge, c’est une alarme.',
      'Le NAT, c’est ce qui permet à tout votre campus de sortir sur Internet avec une seule adresse publique.',
      'Conseil d’ingénieure : documentez chaque câble. Une étiquette aux deux bouts, et on gagne des heures.',
    ],
  },
];
