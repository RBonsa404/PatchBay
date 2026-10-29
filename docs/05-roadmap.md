# Roadmap

Règle : un milestone est terminé quand ses critères sont verts (tests, typecheck, lint). Mettre à jour « Prochaine étape » en fin de session.

## Prochaine étape

**M0 à M6 sont faits : moteur réseau complet et les 2 niveaux du MVP** (`packages/content`, 193 tests). Commencer **M7, le jeu 3D** (objectif réel du projet) : `apps/web` avec Three.js, en suivant `docs/06-charte-club-ist.md`. Le jeu charge `campaign` depuis `@patchbay/content`, construit le réseau avec `buildLevel`, laisse le joueur câbler (`Network.connect`) et taper dans la console, puis appelle `evaluate` pour la checklist d'objectifs et le score. Les positions 3D des appareils sont déjà dans les niveaux (`devices[].position`).

À faire en parallèle (outillage) : passer Vitest en version 5 (alertes `npm audit` sur Vitest 2 / esbuild, outils de développement uniquement).

Dettes connues de M4 :
- Pas de commandes sur les PC (`ipconfig`, `ping` depuis un terminal de PC) : seulement l'API `Network.configureHost` / `Network.ping`. À prévoir avec l'interface (M7).
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

## M7 — Le jeu en 3D (interface finale)

**C'est l'objectif réel du projet** : le moteur (M0–M6) n'en est que la base. Le joueur doit *voir* le matériel, prendre un câble à la souris, chercher le bon port (Ethernet, série, console) sur la face avant ou arrière, brancher, et voir les voyants réagir. Un simulateur 2D de type Packet Tracer ne suffit pas. L'aperçu `apps/preview` n'est qu'un outil de vérification du moteur.

- **M7a — Scène 3D** (Three.js) : salle/atelier avec établi et baie ; modèles basse définition des équipements (routeur 1841/2911, switch 2960, PC portable/tour, serveur) avec **ports réels modélisés** (position, type, orientation) dérivés de `model/catalog.ts` ; caméra orbitale, vue face avant/arrière, zoom sur un port. Au départ modèles procéduraux (boîtiers + ports), remplaçables par des modèles GLB sans toucher à la logique.
- **M7b — Câblage physique** : inventaire de câbles (droit, croisé, console, série DCE/DTE) ; saisir un câble, le déplacer (le câble suit la souris avec une courbe), l'approcher d'un port (surbrillance, refus visuel si le connecteur ne rentre pas : `canPlug`), le brancher (`Network.connect`), le débrancher (`disconnect`). Mauvais câble = il se branche mais le voyant reste éteint (`linkState`). Support tactile et, plus tard, manette.
- **M7c — Voyants et retours** : LED de lien vert/orange/éteint par port d'après `linkState`, activité lors du passage de trames, sons de branchement, indicateurs d'alimentation ; messages syslog affichés en console.
- **M7d — Console et poste de travail** : s'asseoir devant un PC portable, brancher le câble console, ouvrir le terminal (xterm.js) branché sur `Network.consoleTarget` ; terminal PC (ipconfig, ping) ; HUD d'objectifs, indices, chronomètre.
- **M7e — Animations** : câbles qui se déroulent, paquets qui circulent (visualisation des trames à partir de `FrameTrace`/ICMP), transitions de caméra, mode « visualiser le trafic ».
- **Plomberie** : Vite + React pour l'interface autour de la scène ; moteur dans un Web Worker ; sauvegarde IndexedDB ; i18n fr/en ; PWA hors ligne.
- **Contraintes de performance** : PC de 4 Go, WebGL2, modèles légers (budget de triangles par scène), éclairage simple (pas de ray-tracing ni de post-traitement lourd), qualité réglable, repli en rendu simplifié.
- **Direction artistique (exigence du porteur de projet : « un vrai jeu, waouh »)** : rendu PBR (matériaux métal/plastique crédibles), éclairage soigné (lumière d'ambiance + spots, ombres douces, environnement HDRI), post-traitement léger (bloom sur les voyants, anti-crénelage, occlusion ambiante si le matériel suit), animations fluides (câbles, caméra, UI). Charte du **Club Informatique de l'IST** (`docs/06-charte-club-ist.md`). Préréglages de qualité (bas/moyen/haut) détectés automatiquement pour rester jouable sur un PC de 4 Go.
- **Modèles 3D** : créés procéduralement ou récupérés en ligne **uniquement sous licence compatible** (CC0 en priorité : Poly Haven, Kenney, Quaternius, ambientCG ; CC-BY accepté avec attribution). Chaque ressource externe est consignée dans `apps/web/ASSETS.md` (source, auteur, licence, URL). Jamais de modèle extrait d'un logiciel propriétaire ni de logo Cisco.
- **Design de l'interface** : maquettes et système visuel (menus, HUD, écrans de mission) faits avec les outils de design disponibles (Claude Design / artefacts de type Design) avant intégration.
- **Ce que le moteur fournit déjà** : `catalog` (ports par modèle, polarité), `canPlug`/`connect`/`disconnect`, `linkState` (voyants), `drainSyslog`, `consoleTarget`, `snapshot`/`restore`, `sendFrame`/`ping` (trafic). Aucune logique réseau ne doit être réimplémentée côté 3D.

## M8 — Finition MVP
- Accessibilité (clavier, contrastes), didacticiel intégré, mode examen.
- Import `running-config` → niveau (outil formateur).
- Performance, packaging, documentation utilisateur.

## Après le MVP
DHCP, STP/EtherChannel, EIGRP/RIP, switch L3/SVI, port-security, IPv6, éditeur de niveaux pour formateurs, manette, mode multijoueur/classe. VR seulement si demandé plus tard (la 3D de M7 est déjà au cœur du jeu).

## Risques
- **Fidélité IOS** : dériver des PDF + tests golden ; ne pas inventer.
- **OSPF/NAT** : commencer par le sous-ensemble utile CCNA ; ADR pour chaque simplification.
- **Perf sur PC modestes** : 2D d'abord, worker, pas de dépendances lourdes.
