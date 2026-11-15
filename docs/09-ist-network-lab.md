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
3. [x] **Éclairage précalculé** (fait le 15/11/2026) des salles dans Blender (Cycles, GPU), textures de lumière dans le jeu, moins de lumières en temps réel. Chaîne `npm run bake` (jeu lancé) : `tools/bake/export.cjs` exporte les parties fixes du bâtiment telles que le jeu les fusionne, `art/blender/bake_lightmaps.py` calcule la lumière des dalles LED (émetteurs réels, une face), des fenêtres et des lueurs des machines, rebonds compris, débruitée par OIDN, puis `tools/bake/finish.cjs` écrit une image WebP et les coordonnées par partie dans `apps/web/src/assets/lightmaps/` (≈ 1,3 Mo pour tout le bâtiment, 7 min sur la RTX 4050). Les deux dalles au-dessus de l'établi restent en temps réel (ombres du matériel) : leur lumière directe est retirée du calcul. Les surfaces précalculées ignorent le ciel, les lampes qui suivent le joueur et l'éclairage diffus des reflets ; en qualité haute, 7 lumières de moins. Chaque maillage porte une empreinte de ses sommets : une salle modifiée sans nouveau calcul garde sa lumière en temps réel et le signale en développement. **Relancer `npm run bake` après toute modification d'une salle.**
4. [x] **Câblage réaliste** (fait le 15/11/2026) : cordons rangés dans le passe-câbles horizontal, coudes au rayon réel, câble en main simulé avec gravité, étiquettes aux deux bouts ; **code couleur d'entreprise** selon le rôle du lien (`apps/web/src/game/cabling.ts` : bleu poste, jaune entre équipements réseau, y compris à travers les panneaux de brassage, orange croisé, cyan console, rouge série) ; **longueurs standard** (0,5 / 1 / 1,5 / 2 / 3 / 5 m, la plus courte qui atteint avec 15 cm de mou, écrite sur l'étiquette) ; **note de propreté** sur l'écran de résultats (câbles en trop par rapport à la solution, reprises au-delà de deux, liste des cordons pris au stock). Reste possible plus tard : choix de la longueur par le joueur, collisions câble contre câble.
5. [ ] **Visite guidée** (15/11/2026 : texte écrit dans `packages/content/src/tour.ts`, 10 arrêts dans le bâtiment de la mission 4 ; reste à l'exporter, ajouter le mode visite à `Mission` (pas de chrono, HUD réduit, caméra vers chaque arrêt en déplaçant le joueur dans la bonne pièce), la bulle d'Aïcha avec Précédent/Suivant et sa voix, et l'entrée « Visite guidée » sur l'écran titre) des équipements, puis **cursus progressif** du débutant à l'expert : câblage et adressage, VLAN, routage, services (DHCP, NAT), sites distants et liaisons longue distance, sécurité, dépannage. Le simulateur gagne les protocoles nécessaires (OSPF, NAT, ACL, liaisons série/WAN).
6. [x] **Voix** (15/11/2026 : Aïcha lit le récit du briefing, le tutoriel et ses réponses ; bouton pour la couper ; micro et touche V pour les commandes : câbles, vérifier, indice, consignes, ouvrir un appareil, question libre à Aïcha) : Aïcha parle (synthèse vocale du navigateur, hors ligne), commandes vocales (reconnaissance de Chrome/Edge, en ligne).
7. [ ] **Comptes** étudiants et professeurs : un professeur crée un niveau, l'attribue, récupère les résultats (Cloudflare Workers + base D1, gratuit).
8. [ ] **Campus** : grands bâtiments, salles bien remplies, sites distants reliés.
9. [ ] **Interfaces de jeu** refaites comme un vrai jeu : écran titre, **sélection des niveaux** (carte du cursus par domaines, progression, étoiles), HUD, pause, résultats, réglages.
10. [ ] **Musique adaptative** : une ambiance par situation (menu, visite, câblage, configuration, dépannage, chrono serré, réussite, échec), fondus entre elles, effets sonores liés à chaque action ; morceaux CC0 choisis pour chaque situation.
11. [ ] **Amélioration continue** : une fois tout coché, ne pas s'arrêter. Auditer le jeu (captures, mesures, parcours d'un débutant), noter ici les nouvelles idées les plus utiles, et les réaliser une à une.

## Reprise automatique

Une tâche planifiée relance le travail toutes les heures (voir `art/REPRISE.md`). Elle ne fait rien si le fichier `art/.travail-en-cours` a été touché il y a moins de 45 minutes : une session est déjà au travail. Toute session qui travaille sur ce plan touche ce fichier régulièrement.

## Contrôles

`tools/qa/` : `shots.cjs <dossier>` (captures des mêmes lieux), `cabling.cjs` (pose tous les câbles de la mission 4). Le jeu doit tourner (`npm run dev -w @patchbay/web`, port 5180). `npm run bake` : recalcule la lumière précalculée (Blender requis, variable `BLENDER` si installé ailleurs).

## Ressources

- Photos de référence : `art/refs/photos/` (107 photos, auteurs et licences dans `sources.json`), non suivies par git.
- Cotes officielles : guides d'installation Cisco 2960, 2900, 1800 (voir le README de `art/refs/`).
- Blender installé par winget (dernière version stable) ; carte RTX 4050 pour les calculs.
