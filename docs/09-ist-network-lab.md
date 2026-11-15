# IST Network Lab : plan de travail

Le jeu s'appelait PatchBay. Depuis le 15 novembre 2026, c'est **IST Network Lab**, une production **DEDSEC TECHNOLOGIES** (entreprise du porteur du projet, Ouagadougou ; ambition : première start-up de réalité augmentée du Burkina). L'IST l'a remarqué et veut un produit professionnel, présenté gratuitement d'abord ; si l'IST approuve, des fonds suivront.

Ce fichier est la référence pour reprendre le travail à tout moment, quelle que soit la session : lire « Où on en est », reprendre la première case non cochée, cocher et dater en fin d'étape.

## Règles du porteur de projet

- Toujours faire le choix le plus recommandé, sans demander : le jeu doit être professionnel, jouable, **fluide** (priorité) et très beau.
- Physique la plus réaliste possible, câblage comme en entreprise (rangement, étiquetage, codes couleur).
- Tout reste gratuit tant que l'IST n'a pas validé : ressources CC0 ou faites par nous.
- Le nom de l'entreprise s'écrit **DEDSEC** (charte : artefact « DEDSEC », copie des logos dans `apps/web/src/assets/dedsec/`). Couleurs : nuit `#050A18`/`#0B1E3F`, royal `#1D4ED8`, cyan `#38BDF8`, ambre `#FBBF24` (un seul élément par composition). Polices : Orbitron (nom, slogan), Poppins (titres), Inter (texte), JetBrains Mono (technique).
- Commits au nom de l'utilisateur (`R_BONSA`), sans ligne de co-auteur. Ne jamais publier les cours Cisco ni `art/refs/` (photos d'autrui, référence privée).
- L'adresse du site reste https://patchbay.rachidbonsa-ai.workers.dev/ tant qu'aucun domaine n'est choisi (changer le nom du Worker changerait l'adresse).

## Où on en est

1. [x] **Identité** (fait le 15/11/2026) : nom IST Network Lab, marque DEDSEC TECHNOLOGIES (écran titre, chargement, manifeste, aperçu de lien, affiches dans la salle), README.
2. [x] **Circuit Blender** (15/11/2026 : switch 2960, routeurs 2911 et 1841, panneau 24 ports ; restent PC, portable, baie) : scripts Python lancés sans interface (`art/blender/*.py` → `.glb` → `apps/web/public/models/`), un point vide nommé par port lu par le jeu. Premier objet : switch 2960 (cotes Cisco : 44,5 × 32,8 × 4,4 cm) : **fait le 15/11/2026** (`art/blender/switch_2960.py`, chargé par `scene/gear.ts`, ports placés par les marqueurs). Console en façade par choix de jouabilité (le 24TT-L l'a à l'arrière). Puis 2911 (44 × 30,5 × 8,9 cm, 2U), 1841, panneau de brassage, baie 42U, PC, portable.
3. [ ] **Éclairage précalculé** des salles dans Blender (Cycles, GPU), textures de lumière dans le jeu, moins de lumières en temps réel.
4. [ ] **Câblage réaliste** (15/11/2026 : fait = cordons rangés dans le passe-câbles horizontal, coudes au rayon réel, câble en main simulé avec gravité, étiquettes aux deux bouts ; reste = codes couleur d'entreprise, longueurs standard, note de propreté) : cordons simulés (gravité, raideur, rayon de courbure, collisions), passe-câbles et anneaux de baie, étiquettes aux deux bouts, codes couleur d'entreprise, longueurs standard ; une note de propreté du câblage.
5. [ ] **Visite guidée** des équipements, puis **cursus progressif** du débutant à l'expert : câblage et adressage, VLAN, routage, services (DHCP, NAT), sites distants et liaisons longue distance, sécurité, dépannage. Le simulateur gagne les protocoles nécessaires (OSPF, NAT, ACL, liaisons série/WAN).
6. [x] **Voix** (15/11/2026 : Aïcha lit le récit du briefing, le tutoriel et ses réponses ; bouton pour la couper ; micro et touche V pour les commandes : câbles, vérifier, indice, consignes, ouvrir un appareil, question libre à Aïcha) : Aïcha parle (synthèse vocale du navigateur, hors ligne), commandes vocales (reconnaissance de Chrome/Edge, en ligne).
7. [ ] **Comptes** étudiants et professeurs : un professeur crée un niveau, l'attribue, récupère les résultats (Cloudflare Workers + base D1, gratuit).
8. [ ] **Campus** : grands bâtiments, salles bien remplies, sites distants reliés.
9. [ ] **Interfaces de jeu** refaites comme un vrai jeu : écran titre, **sélection des niveaux** (carte du cursus par domaines, progression, étoiles), HUD, pause, résultats, réglages.
10. [ ] **Musique adaptative** : une ambiance par situation (menu, visite, câblage, configuration, dépannage, chrono serré, réussite, échec), fondus entre elles, effets sonores liés à chaque action ; morceaux CC0 choisis pour chaque situation.
11. [ ] **Amélioration continue** : une fois tout coché, ne pas s'arrêter. Auditer le jeu (captures, mesures, parcours d'un débutant), noter ici les nouvelles idées les plus utiles, et les réaliser une à une.

## Reprise automatique

Une tâche planifiée relance le travail toutes les heures (voir `art/REPRISE.md`). Elle ne fait rien si le fichier `art/.travail-en-cours` a été touché il y a moins de 45 minutes : une session est déjà au travail. Toute session qui travaille sur ce plan touche ce fichier régulièrement.

## Contrôles

`tools/qa/` : `shots.cjs <dossier>` (captures des mêmes lieux), `cabling.cjs` (pose tous les câbles de la mission 4). Le jeu doit tourner (`npm run dev -w @patchbay/web`, port 5180).

## Ressources

- Photos de référence : `art/refs/photos/` (107 photos, auteurs et licences dans `sources.json`), non suivies par git.
- Cotes officielles : guides d'installation Cisco 2960, 2900, 1800 (voir le README de `art/refs/`).
- Blender installé par winget (dernière version stable) ; carte RTX 4050 pour les calculs.
