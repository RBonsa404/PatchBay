# Roadmap

Règle : un milestone est terminé quand ses critères sont verts (tests, typecheck, lint). Mettre à jour « Prochaine étape » en fin de session.

## Prochaine étape

**M0 à M6 sont faits, M7 a une première version jouable** : `apps/web` (Three.js) fait jouer les 2 missions du MVP de bout en bout dans une salle technique en 3D (testé par de vrais clics simulés : 100/100 sur les deux missions). Ajouté ensuite : paquets animés sur les câbles (ARP ambre, requête cyan, réponse verte, erreur rouge) rejoués dans l'ordre réel après chaque commande ou ping (`Network.onWire`), sons synthétisés (Web Audio, coupure mémorisée), tutoriel guidé de la mission 1 (bulle coach, anneau sur le port à viser, étapes validées par l'état réel). Puis : invite de commandes des PC (`ipconfig [/all]`, `ping [-n N]`, `tracert`, `arp -a`, sorties d'un Windows français, TTL réels 128/255 : `host/shell.ts`), châssis arrondis avec grilles d'aération, oreilles de baie vissées, pieds en caoutchouc, bouton d'alimentation, pavé tactile, et un **tableau blanc** qui dessine le plan de la mission (appareils, liaisons, ports ; pas les types de câble). Enfin : **tactile** (toucher = viser et agir, appui long = débrancher, double toucher = zoom, cadrage élargi en portrait), **manette** (`game/gamepad.ts` : curseur au stick gauche, caméra au stick droit, gâchettes pour zoomer, A/B/X/Y, LB/RB pour changer de câble, clique aussi dans les menus), **PWA** (manifeste, icône provisoire, `public/sw.js` : page en réseau d'abord, fichiers hachés en cache d'abord ; enregistré seulement en production). Le moteur reste sur le thread principal, mesures à l'appui (ADR 0002). **M7 est terminé.** À vérifier sur un vrai Chrome : installation et lancement hors ligne (le navigateur intégré de l'outil refuse les service workers), et une vraie manette. **M8 en cours, première passe de refonte faite** (2026-10-29) : salle technique réaliste (`scene/room.ts`, `scene/materials.ts` : murs peints aux bandes du club, faux plancher, dalles LED, chemin de câbles, baie au sol avec rails et onduleur, armoire serveur vitrée, logo du club au mur, établi avec tapis antistatique), équipements ancrés (ombres de contact, matériel de baie plaqué contre les rails), câbles posés sur l'établi par couloirs, nouvelle interface (`style.css` : panneaux pleins, plus de verre ni de halos ; écrans titre/missions en colonne, dossier de mission, résultats animés ; HUD à icônes Lucide ; touches 1-4 pour les câbles), logo PatchBay (`ui/brand.ts`), **Aïcha**, formatrice du club, qui fait le briefing et le tutoriel. Suite de M8 : voir la liste ci-dessous.

À faire en parallèle (outillage) : passer Vitest en version 5 (alertes `npm audit` sur Vitest 2 / esbuild, outils de développement uniquement).

Dettes connues de M4 :
- RTT fixé à 1 ms, âge ARP toujours 0 : le moteur n'a pas encore d'horloge logique (`tick`). Pas de timeout ARP, pas de proxy ARP, pas de file d'attente ARP (le paquet qui déclenche l'ARP est abandonné, comme IOS : d'où le `.!!!!`).
- Une route statique n'est installée que si son saut suivant est dans un réseau directement connecté (pas de récursivité). Pas d'ECMP, pas de `ip classless`, pas de résumé automatique.
- ICMP seulement (echo, time-exceeded, unreachable). `ping` simple (pas de ping étendu), `traceroute` par ICMP (le vrai utilise UDP).
- Le switch n'a ni `ip routing` ni `show ip route` (post-MVP) ; sa pile de gestion répond au ping et sort par `ip default-gateway`.
- `ip address` ne vérifie ni chevauchement de sous-réseaux ni masque contigu.
- Le format de `show ip route` suit les PDF (liste à plat, `/préfixe`) ; IOS 15 ajoute les routes `L` et regroupe les sous-réseaux par réseau classful.

Dettes connues de M1/M2/M3 (à traiter quand le sujet revient) :
- DTP non simulé : un port sans `switchport mode` agit comme un port d'accès. VTP, STP, EtherChannel, port-security : absents (post-MVP). Sans STP, une boucle est coupée par un compteur de visites par injection.
- `show vlan` = `show vlan brief` (pas de tableaux type/SAID/MTU) ; `show vlan id N` = ligne brief ; `show interfaces <if> switchport` absent.
- Largeurs de `show vlan brief` copiées du PDF (Packet Tracer : 31 caractères de nom, 4 ports par ligne) ; un vrai 2960 utilise 32.
- Noms de VLAN en doublon non refusés ; VLAN 1002-1005 refusés avec `Invalid input` (le vrai message IOS diffère).
- Les VLAN créés apparaissent dans `running-config` (stanzas `vlan N`) alors que sur du vrai matériel ils sont dans `vlan.dat` selon la version d'IOS. `spanning-tree` non rendu.
- Un nouveau SVI (`interface vlan N`) démarre `shutdown` ; supprimer un VLAN laisse ses ports configurés mais inactifs (trames abandonnées).
- Les tables MAC ne font pas partie du `snapshot()` (état dynamique) et n'ont pas de vieillissement.
- `ping` : pas encore (M4). `show interfaces` : compteurs à zéro, rendu simplifié (matériel « Lance » / « HD64570 » comme Packet Tracer).
- Messages de lien : on imprime `%LINK-5-CHANGED` (style Packet Tracer, comme les PDF) ; un vrai matériel affiche `%LINK-3-UPDOWN` pour une montée/descente physique. Prévoir une option de style si on veut les deux.
- Les transitions `administratively down` → `down` n'impriment rien (comme IOS) ; la montée de lien est immédiate (pas de délai).
- Le catalogue (`model/catalog.ts`) enrichit `ios/profiles.ts` mais ne le remplace pas : les profils restent la facette IOS (groupes d'interfaces, version).
- Le câble `aux`, la fibre, les interfaces `Loopback` et le débit/duplex négociés ne sont pas modélisés.
- `ip address` ne vérifie ni masque contigu ni adresse réseau/broadcast.
- `service password-encryption` : le mot de passe est stocké en clair et chiffré (type 7) à l'affichage ; désactiver le service « déchiffre » donc immédiatement (IOS garde le type 7).
- Bannière : toujours rendue sur plusieurs lignes (`banner motd ^C` / lignes / `^C`).
- Plages vty : seules `0 4`, `5 15` et `0 15` sont acceptées.
- `enable secret 5 <hash>` / `enable secret 0 <mdp>` (avec type) non supportés ; `configure` seul (sans `terminal`) non supporté.
- Espacement exact de `?` (colonnes) à aligner sur le vrai IOS quand on aura des captures de référence.

## M0 — Fondations ✔
Monorepo npm workspaces, TypeScript strict, Vitest, `sim-core` avec parseur minimal + modes + premiers tests.

## M1 — Mini-IOS de base ✔
Réalisé : parseur (`syntax.ts`, `parser.ts`), registre de commandes, profils minimaux, config structurée, rendu `running-config`/`startup-config`, `show version`, mots de passe (enable secret md5-crypt réel, type 7), connexion console avec bannière et login, `copy run start`, `write memory`, `erase`, `reload` avec dialogue initial, `do`, `no`, `?`, Tab, 4 sessions golden.
- Parseur complet : abréviations, `?`, messages d'erreur exacts, `no`.
- Modes : user, privileged, config, interface, line.
- Commandes : `hostname`, `enable secret`, `line`, `banner`, `show running-config`, `copy run start`, `reload`, `show version`.
- Config structurée + rendu `running-config`.
- Golden tests tirés de `CONFIG base ROUTER.pdf` et `Config de base d'un Switch.pdf`.

## M2 — Modèle physique et liens ✔
Réalisé : `model/catalog.ts` (modèles et ports, polarité MDI/MDI-X, auto-MDIX), `physical/rules.ts` (câbles : droit, croisé, console, série ; `strictMdix`), `model/network.ts` (`Network` : appareils, câblage, `linkState`, `consoleTarget`, `snapshot`/`restore`, syslog), `ios/environment.ts` (`LinkEnvironment` injecté dans `Cli`), `show ip interface brief`, `show interfaces [nom]`, messages `%LINK-5-CHANGED` / `%LINEPROTO-5-UPDOWN`, `clock rate` réservé au côté DCE, ligne série « up/down » sans horloge, goldens du TP 1.5.2 (R1 puis R2).
- Catalogue matériel (2911, 2960, PC, serveur), ports, câbles, règles `strictMdix`.
- États `up/down`, `show ip interface brief`, `show interfaces`, messages `%LINK-5-CHANGED`.
- Série DCE/DTE, `clock rate`.

## M3 — Couche 2 ✔
Réalisé : VLAN (`vlan`, `name`, `no vlan`, création automatique à l'affectation d'un port, comme IOS), `interface range` (virgules, tirets, types mixtes), `switchport mode access|trunk`, `access vlan`, `trunk native vlan`, `trunk allowed vlan` (liste, `add`, `remove`, `all`, `none`), formes `no`, SVI créés à la demande (`interface vlan 99`) avec état dérivé des ports du VLAN, `ip default-gateway`, rendu de `running-config` (VLAN, `switchport`), `show vlan [brief|id]`, `show interface trunk`, `show mac address-table`, `clear mac address-table dynamic`, moteur de trames L2 (`engine/l2.ts` : classification access/trunk/natif, liste autorisée, apprentissage MAC par VLAN, inondation, étiquetage 802.1Q, purge à la chute du lien), goldens du TP VLAN.
- VLAN, ports d'accès, trunk 802.1Q, MAC learning, `show vlan brief`, `show interfaces trunk`, `show mac address-table`.
- Tests : isolation VLAN, trunk allowed/native.

## M4 — Couche 3 : routage statique et inter-VLAN ✔
Réalisé : `protocols/l3/ip.ts` et `routing.ts` (table de routage pure : connectées + statiques, accessibilité du saut suivant, distance administrative, longest-prefix match), `engine/l3.ts` (ARP, IPv4, ICMP echo/time-exceeded/unreachable, retransmission avec TTL, résolution du premier saut ; le paquet qui déclenche l'ARP est abandonné comme IOS), PC/serveurs configurables (`Network.configureHost`), sous-interfaces `encapsulation dot1q N [native]` (router-on-a-stick), pile de gestion des switches (SVI qui reçoit, répond et émet ; `ip default-gateway`), `ip route` (4 formes, `no`, distance, `%Inconsistent address and mask`), `ping`, `traceroute`, `show ip route`, `show ip arp` / `show arp`, `clear arp-cache`, rendu des routes et sous-interfaces dans `running-config`, golden du TP de routage statique.
- ARP, ICMP, table de routage, longest-prefix match, `ip route`, route par défaut, distance administrative.
- Router-on-a-stick, `ping`, `traceroute`, `show ip route`.

## M5 — OSPF, ACL, NAT ✔
- **M5b ACL** : `protocols/acl/acl.ts` (analyse, évaluation, rendu), paquets TCP/UDP et services sur les hôtes (`HostConfig.services`, `Network.tcpConnect` / `udpSend`), ACL standard/étendues/nommées, numéros de séquence, `established`, opérateurs de port, types ICMP, `ip access-group in|out`, `access-class` sur VTY (Telnet ouvert quand une ligne VTY peut se connecter), `show access-lists` avec compteurs, `clear access-list counters`.
- **M5c NAT** : statique, dynamique par pool, PAT (sur interface ou pool), ordre des opérations IOS (ACL entrante → NAT extérieur→intérieur → routage → NAT intérieur→extérieur → ACL sortante), réponse ARP pour les adresses globales, `show ip nat translations/statistics`, `clear ip nat translation *`. Les sondes TCP/UDP retransmettent (6 tentatives) comme une vraie pile.
- **M5a OSPF** (`engine/ospf.ts`) : Hello envoyés dans le moteur de trames (VLAN, trunks, câbles comptent), élection DR/BDR, SPF par zone avec chemins à coût égal, routes inter-zones via les ABR, E2 par `default-information originate [always]`, router-id figé jusqu'à `clear ip ospf process` ou reload (message IOS), loopbacks (annoncées en /32), `bandwidth`, `ip ospf cost/priority`, `passive-interface [default]`, `auto-cost reference-bandwidth`, messages `%OSPF-5-ADJCHG`, `show ip ospf [neighbor|interface [brief]]`, `show ip protocols`, codes `O`, `O IA`, `O*E2`. Test calqué sur le TP 11.6.1 (table de routage du PDF).
- **Relecture complète** (après passage à Opus) : reload qui vide l'état dynamique, `Network.removeDevice`, MAC stables dans les sauvegardes, validation des réglages d'hôte, contrôles IOS d'`ip address` (adresse réseau/diffusion, masque, chevauchement), `hostname`, aide et Tab sur les types d'interface.

Dettes connues de M5 : une seule instance OSPF par routeur ; pas de timers (adjacences immédiates, « Dead Time » fixe, âge des routes 00:00:00) ; pas de zones stub/NSSA ni d'authentification ; élection DR non préemptive ignorée (le plus prioritaire gagne toujours) ; NAT sans `ip nat outside source` ni redirection de port statique ; `show ip nat translations` n'affiche pas les entrées étendues d'un pool sans surcharge ; pas de `telnet` interactif (seulement l'ouverture de connexion).

## M6 — Validation et niveaux (moteur + contenu) ✔
Réalisé : `scenario/level.ts` (modèle `Level` : appareils avec position 3D, inventaire de câbles, état initial, objectifs, indices, histoire, solution de référence ; `buildLevel`, `applySolution`), `validation/objectives.ts` (`evaluate` : objectifs câble — type, extrémités, sens DCE —, console, lien actif, configuration structurée, ping, TCP, route, sauvegarde ; raisons d'échec codées pour l'interface ; score), `packages/content` (schéma Zod strict avec références croisées, `parseLevel`, `campaign`), niveaux `l01-cablage-console` et `l02-relier-deux-reseaux` en français et anglais avec fil narratif autour du Club Informatique de l'IST. Chaque niveau est testé : non résolu au départ, résolu à 100 % par sa solution, erreurs typiques détectées.
- Moteur d'objectifs, scoring, feedback i18n.
- Schéma Zod des niveaux, chargeur. **MVP : 2 niveaux** (décision du porteur de projet) : niveau 1 « Câblage et console » (choisir les bons câbles et ports, se connecter en console, configuration de base, sauvegarde), niveau 2 « Relier deux réseaux » (deux routeurs, liaison série, horloge DCE, routes statiques, test de bout en bout). Les autres niveaux de `docs/02-mvp-spec.md` viennent après.
- Solutions de référence rejouables (scripts de commandes) → chaque niveau est testé automatiquement : la solution passe, l'état initial échoue.

## M7 — Le jeu en 3D (interface finale) ✔

Réalisé (première version) : `apps/web` avec Vite + Three.js (ADR 0001 : interface sans framework) ; scène à rendu physique (ACES, ombres douces, environnement de réflexion généré, bloom sur les voyants, préréglages de qualité) ; salle procédurale aux couleurs du club (mur à circuit imprimé, établi, baie 19", enseigne) ; modèles procéduraux des routeurs 1841/2911, du switch 2960, du PC et du portable avec leurs vrais ports, voyants de lien (vert = up/up, ambre = série sans horloge) ; câblage à la souris (choix du câble, deux clics, refus visuel des connecteurs incompatibles, clic droit pour débrancher, câbles qui se déroulent) ; console IOS ouverte depuis le portable relié en console, panneau réseau des PC avec ping ; écran titre, choix des missions, briefing avec histoire, HUD d'objectifs cochés en direct, indices, résultats avec étoiles et meilleur score mémorisé. Lancer : `npm run dev -w @patchbay/web` puis http://127.0.0.1:5180.


**C'est l'objectif réel du projet** : le moteur (M0–M6) n'en est que la base. Le joueur doit *voir* le matériel, prendre un câble à la souris, chercher le bon port (Ethernet, série, console) sur la face avant ou arrière, brancher, et voir les voyants réagir. Un simulateur 2D de type Packet Tracer ne suffit pas. L'aperçu `apps/preview` n'est qu'un outil de vérification du moteur.

- **M7a — Scène 3D** (Three.js) : salle/atelier avec établi et baie ; modèles basse définition des équipements (routeur 1841/2911, switch 2960, PC portable/tour, serveur) avec **ports réels modélisés** (position, type, orientation) dérivés de `model/catalog.ts` ; caméra orbitale, vue face avant/arrière, zoom sur un port. Au départ modèles procéduraux (boîtiers + ports), remplaçables par des modèles GLB sans toucher à la logique.
- **M7b — Câblage physique** : inventaire de câbles (droit, croisé, console, série DCE/DTE) ; saisir un câble, le déplacer (le câble suit la souris avec une courbe), l'approcher d'un port (surbrillance, refus visuel si le connecteur ne rentre pas : `canPlug`), le brancher (`Network.connect`), le débrancher (`disconnect`). Mauvais câble = il se branche mais le voyant reste éteint (`linkState`). Support tactile et, plus tard, manette.
- **M7c — Voyants et retours** : LED de lien vert/orange/éteint par port d'après `linkState`, activité lors du passage de trames, sons de branchement, indicateurs d'alimentation ; messages syslog affichés en console.
- **M7d — Console et poste de travail** : s'asseoir devant un PC portable, brancher le câble console, ouvrir le terminal (xterm.js) branché sur `Network.consoleTarget` ; terminal PC (ipconfig, ping) ; HUD d'objectifs, indices, chronomètre.
- **M7e — Animations** : câbles qui se déroulent, paquets qui circulent (visualisation des trames à partir de `FrameTrace`/ICMP), transitions de caméra, mode « visualiser le trafic ».
- **Plomberie** : Vite, interface sans framework (ADR 0001), moteur sur le thread principal (ADR 0002), progression dans `localStorage`, i18n (français ; table anglaise à ajouter), PWA hors ligne.
- **Contraintes de performance** (révisé le 2026-10-30 : le standard est un PC de 8 Go) : à l'origine PC de 4 Go, WebGL2, modèles légers (budget de triangles par scène), éclairage simple (pas de ray-tracing ni de post-traitement lourd), qualité réglable, repli en rendu simplifié.
- **Direction artistique (exigence du porteur de projet : « un vrai jeu, waouh »)** : rendu PBR (matériaux métal/plastique crédibles), éclairage soigné (lumière d'ambiance + spots, ombres douces, environnement HDRI), post-traitement léger (bloom sur les voyants, anti-crénelage, occlusion ambiante si le matériel suit), animations fluides (câbles, caméra, UI). Charte du **Club Informatique de l'IST** (`docs/06-charte-club-ist.md`). Préréglages de qualité (bas/moyen/haut) détectés automatiquement pour rester jouable sur un PC de 4 Go.
- **Modèles 3D** : créés procéduralement ou récupérés en ligne **uniquement sous licence compatible** (CC0 en priorité : Poly Haven, Kenney, Quaternius, ambientCG ; CC-BY accepté avec attribution). Chaque ressource externe est consignée dans `apps/web/ASSETS.md` (source, auteur, licence, URL). Jamais de modèle extrait d'un logiciel propriétaire ni de logo Cisco.
- **Design de l'interface** : maquettes et système visuel (menus, HUD, écrans de mission) faits avec les outils de design disponibles (Claude Design / artefacts de type Design) avant intégration.
- **Ce que le moteur fournit déjà** : `catalog` (ports par modèle, polarité), `canPlug`/`connect`/`disconnect`, `linkState` (voyants), `drainSyslog`, `consoleTarget`, `snapshot`/`restore`, `sendFrame`/`ping` (trafic). Aucune logique réseau ne doit être réimplémentée côté 3D.

## M8 — Finition MVP et refonte visuelle

Retours du porteur de projet après la première version jouable (à traiter quand M7 est fini ; les 2 niveaux doivent être « incroyables » avant d'en ajouter d'autres) :
- **Interface** : jugée « pas jolie, fait trop IA ». Refaire un système visuel professionnel (menus, HUD, panneaux, consoles) avec une vraie identité de jeu plutôt que des cartes en verre génériques : typographie et hiérarchie soignées, moins d'effets lumineux décoratifs, iconographie cohérente. Passer par des maquettes (Claude Design) avant d'intégrer.
- **Logos** : créer un logo PatchBay ; intégrer le logo du Club Informatique de l'IST et la charte (`docs/06-charte-club-ist.md`) dans l'écran titre, les crédits et la salle.
- **Salle** : plus réaliste et immersive (les plantes en pot font « jouet ») : vrais matériaux (béton, faux plancher technique, chemins de câbles au plafond, éclairage néon, baie avec panneau de brassage, poussière/variations), éventuellement modèles CC0 (`apps/web/ASSETS.md`).
- **Équipements posés** : le routeur semble flotter. Contact au sol : ombres de contact (AO), pieds visibles, aucune lame d'air, objets ancrés sur l'établi ou dans la baie.
- **Câbles** : quand plusieurs sont branchés, ils s'emmêlent. Trajets plus propres : courbes avec gravité, passage par des guides/peignes, écartement entre câbles voisins, couleurs par type.
- **Tutoriel incarné** : un personnage (mentor du club) qui présente la mission et guide le tutoriel, avec bulles ou voix ; éventuellement un assistant intégré qui répond aux questions de l'élève.
- **Icônes** : celles d'aujourd'hui (emoji, pastilles de couleur, icône d'application provisoire) sont jugées moches. Passer à un jeu d'icônes professionnel et cohérent sous licence libre (par exemple Lucide ou Phosphor, MIT, consigné dans `apps/web/ASSETS.md`), et refaire l'icône d'application avec le futur logo.
- Garder et développer le **tableau blanc** (apprécié).
- Notes de Claude : animation d'entrée dans la salle, son d'ambiance (ventilateurs), retour visuel au survol des ports, écran de résultats plus spectaculaire, captures pour la présentation.

État après la première passe (2026-10-29) — fait : interface, icônes Lucide, logo PatchBay et logo du club, salle réaliste, équipements ancrés, câbles rangés, personnage d'Aïcha (portrait + texte qui s'écrit). Reste à faire :
- Interface validée par le porteur de projet (2026-10-29) : « beaucoup plus pro ». Garder cette direction, l'affiner sans tout casser.
- ✔ **Vue à la première personne** (2026-10-30, `game/player.ts`) : le mannequin à la 3e personne (jugé moche et gênant) est retiré. Yeux à 1,62 m, ZQSD, Maj pour courir, flèches gauche/droite ou glisser pour regarder, molette ou pincement pour zoomer, double-clic pour s'approcher d'un appareil. Clic sur le tableau ou touche T pour lire le schéma. Piste : un modèle 3D libre de droits pour Aïcha. Ancienne version à la 3e personne : technicien du club en polo (logo au dos, casque), vue à la troisième personne par-dessus l'épaule ; ZQSD ou flèches (touches physiques : WASD sur un clavier anglais), Maj pour courir, stick gauche de la manette (la croix déplace alors le curseur) ; cycle de marche procédural ; collisions avec l'établi, la baie, l'armoire et les murs ; caméra qui suit et reste dans la salle ; il faut être à moins de 2 m d'un équipement pour le brancher ou l'ouvrir. Il attend aussi derrière l'établi sur l'écran titre. Pistes : choix du personnage (fille/garçon, tenue), s'asseoir devant le portable pour la console.
- ✔ **Physique des câbles** (2026-10-30) : les câbles posés contournent les équipements de l'établi (objets voisins regroupés). Câbles de la baie descendus par les guide-câbles verticaux, câble tenu en main qui passe au-dessus des objets et reste au-dessus de l'établi. Mesuré sur les 2 missions : aucun point de câble dans un équipement ni sous l'établi (hors géométrie fine des prises).
- ✔ **Baie** (2026-10-30) : `rackFillers` ferme les unités libres selon le niveau (obturateurs, panneaux ventilés, passe-câbles, tiroir fibre), guide-câbles verticaux.
- ✔ **Finitions** (2026-10-30) : le personnage tend le bras vers le port ou l'appareil et se tourne vers lui ; surbrillance des ports au survol sans câble en main ; (souffle de ventilateurs retiré : jugé horrible par le porteur de projet, pas de bruit blanc en fond).
- Équipements plus fins (sérigraphie, faces arrière) ou modèles GLB CC0.
- Aïcha en 3D ou animée (expressions, voix synthétisée en option), et un assistant qui répond aux questions de l'élève.
- ✔ **Son** (2026-10-30, `audio.ts`) : musique générative originale, ronronnement discret et bruits de machines, pas sur le plancher ; M coupe la musique.
- ✔ **Lumière** (2026-10-30, `scene/stage.ts`) : ambiance réduite, projecteurs par dalle, deux lumières à ombres, occlusion ambiante (qualité haute), vignette, lueurs des machines.
- ✔ **Décor** (2026-10-30, `scene/decor.ts`) : rayonnages, rangée de baies, bureau, fenêtre, tableau électrique, panneau d'outils, affichages, cartons, desserte, goulottes, gaine de ventilation.
- ✔ **Entrée dans la salle** (2026-10-30) : le joueur entre par la porte et contourne l'établi ; marcher coupe l'animation.
- ✔ **Musique** (2026-10-30) : 7 morceaux CC0 (`public/music`, `ASSETS.md`) et le morceau généré, en liste aléatoire avec fondus ; N : morceau suivant, M : couper. Hors ligne, seul le morceau généré joue.
- ✔ **Finitions** (2026-10-30) : on s'assied devant le portable tant que la console est ouverte ; câbles de brassage par le guide-câbles ; sérigraphie, vis, emplacements EHWIC et voyants d'état sur les équipements ; résultats avec confettis aux couleurs du club, note par étoile et lignes qui apparaissent l'une après l'autre.
- ✔ **Chrono et note** (2026-10-30, `game/scoring.ts`) : temps limité par niveau (`timeLimit` : 12 et 15 min), réseau noté tel quel à la fin du temps. Objectifs sur 80, rapidité sur 20 (seulement si tout est fait, entière en finissant dans la moitié du temps). 3 étoiles dès 90, rang S à D. Le chrono attend la fin de l'entrée et du tutoriel guidé.
- ✔ **Mode examen** (2026-10-30) : 30 % de temps en moins, sans indice, tutoriel ni assistant, objectifs non cochés, copie rendue à tout moment, meilleure note à part.
- ✔ **Aïcha répond** (2026-10-30, `game/assistant.ts`, touche H) : fiche de cours écrite à la main, hors ligne, sans service en ligne. Elle dit ce qu'elle ne sait pas.
- ✔ **Accessibilité, 1re passe** (2026-10-30) : liste des ports et appareils (touche P) pour jouer au clavier, contours de focus, mouvement réduit, contraste renforcé. Reste : tests avec un vrai lecteur d'écran, taille du texte.
- ✔ **Interface plus jeu** (2026-10-30) : chrono central, bannière de départ, repères ambre sur les panneaux, rang tamponné, gain de points animé, alerte rouge en fin de temps.
- Musique : les morceaux agités (Claimed by the Void, emotional 5) et la batterie du morceau généré sont retirés, jugés trop « jeu d'action ». Choisir des morceaux d'ambiance posés.
- ✔ **Aïcha en ligne** (2026-10-30, `functions/api/aicha.ts`) : ce que la fiche ne couvre pas part vers DeepSeek via une fonction Cloudflare qui garde la clé ; hors sujet refusé ; repli sur la fiche. Voir `docs/08-deploiement.md`.
- ✔ **Audit** (2026-10-30) : chrono en secondes réelles, clic perdu après un glissé, câbles interdits entre salles sans brassage, boutons toujours visibles, ordre de travail (B) et commandes (F1) en mission, confirmation avant de quitter, écran de chargement et message sans WebGL, qualité mémorisée, nom du morceau. Rendu : reflets réels de la salle, ombres douces mises à jour seulement quand la scène change, étalonnage, voyants vivants, regard lissé, allègement automatique si le jeu rame.
- ✔ **Passe visuelle** (2026-10-30) : tone mapping neutre, lumière chaude, murs en deux tons, plafond à dalles, cartes de relief, fenêtres avec vue, poussière, mobilier arrondi, écrans et claviers détaillés, ports RJ45 avec contacts, cartes de mission illustrées, interface affinée. Fluidité : seules les pièces visibles sont dessinées (`Mission.cull`).
- ✔ **Textures photo et modèles CC0** (2026-10-30, `scene/props.ts`, `ASSETS.md`) : relief de plâtre réel, contreplaqué, sol à l'usure discrète ; chaises, extincteur, horloge, caméra, boîte à outils, multimètre, lampe, plante. Essais rejetés : textures de mur sombres et sales, bois rouge, servante et poubelle rouillées, écran de projection sale. Connexion stable annoncée sur l'écran titre.
- **Grands réseaux** : plusieurs salles et étages, voir `docs/07-grands-reseaux.md`. Fait (2026-10-30) : couloir et salle de TP (`scene/annex.ts`), porte qui s'ouvre, déplacement entre les salles, lumières qui suivent le joueur, câble entre baies par les chemins de câbles, mission 3 (VLAN, trunks, router-on-a-stick sur deux salles, objectifs `access-vlan` et `trunk`). Fait ensuite : escalier et étage, panneaux de brassage (les câbles entre salles sont dans les murs), DHCP (`ios/commands/dhcp.ts`, `ipconfig /renew`), mission 4, décor rangé, salle de TP équipée. **Campagne arrêtée à 4 niveaux** : on recueille les retours avant d'aller plus loin. Standard retenu : PC de 8 Go, qualité haute par défaut.
- Aïcha en 3D : reportée par le porteur de projet. Essai fait avec le mannequin féminin CC0 de Quaternius, rejeté (combinaison sans visage, peu flatteur). Il faut un personnage habillé avec un visage (piste : Universal Base Characters de Quaternius, à télécharger sur itch.io).
- Vérifier sur un vrai Chrome : installation PWA et hors ligne, manette réelle.

Autres points :
- Accessibilité (clavier, contrastes), didacticiel intégré, mode examen.
- Import `running-config` → niveau (outil formateur).
- Performance, packaging, documentation utilisateur.

## Après le MVP
DHCP, STP/EtherChannel, EIGRP/RIP, switch L3/SVI, port-security, IPv6, éditeur de niveaux pour formateurs, manette, mode multijoueur/classe. VR seulement si demandé plus tard (la 3D de M7 est déjà au cœur du jeu).

## Risques
- **Fidélité IOS** : dériver des PDF + tests golden ; ne pas inventer.
- **OSPF/NAT** : commencer par le sous-ensemble utile CCNA ; ADR pour chaque simplification.
- **Perf sur PC modestes** : 2D d'abord, worker, pas de dépendances lourdes.
