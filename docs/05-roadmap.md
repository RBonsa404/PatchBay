# Roadmap

Règle : un milestone est terminé quand ses critères sont verts (tests, typecheck, lint). Mettre à jour « Prochaine étape » en fin de session.

## Prochaine étape

**M0, M1 et M2 sont faits.** Commencer **M3** (couche 2) : VLAN (`vlan <id>`, `name`), ports d'accès et trunk 802.1Q, `interface range`, apprentissage MAC, `show vlan brief`, `show interfaces trunk`, `show mac address-table`. Cela remplit aussi `interface Vlan1` (état up/down selon les ports actifs du VLAN, aujourd'hui toujours `down`) et il faut ajouter les lignes `switchport …` au rendu de `running-config`. Il faudra un moteur de trames (`engine/`) minimal pour l'apprentissage MAC : le concevoir avec M4 (ARP/ICMP) en tête.

Dettes connues de M1/M2 (à traiter quand le sujet revient) :
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

## M3 — Couche 2
- VLAN, ports d'accès, trunk 802.1Q, MAC learning, `show vlan brief`, `show interfaces trunk`, `show mac address-table`.
- Tests : isolation VLAN, trunk allowed/native.

## M4 — Couche 3 : routage statique et inter-VLAN
- ARP, ICMP, table de routage, longest-prefix match, `ip route`, route par défaut, distance administrative.
- Router-on-a-stick, `ping`, `traceroute`, `show ip route`.

## M5 — OSPF, ACL, NAT
- M5a OSPFv2 (voisins, DR/BDR, SPF, multi-zone, `default-information originate`).
- M5b ACL standard/étendue/nommées, compteurs, `access-class`.
- M5c NAT statique, dynamique, PAT.
- Chaque sous-milestone : tests golden + tests de scénario (réseaux multi-équipements).

## M6 — Validation et niveaux (moteur + contenu)
- Moteur d'objectifs, scoring, feedback i18n.
- Schéma Zod des niveaux, chargeur, 15 niveaux de la campagne MVP (`docs/02-mvp-spec.md`).
- Solutions de référence rejouables (scripts de commandes) → chaque niveau est testé automatiquement : la solution passe, l'état initial échoue.

## M7 — Interface web
- Vite + React, scène 2D PixiJS, glisser-déposer des câbles, terminal xterm.js, HUD objectifs.
- Moteur dans un Web Worker, sauvegarde IndexedDB, i18n fr/en.
- PWA hors ligne, test sur PC 4 Go.

## M8 — Finition MVP
- Accessibilité (clavier, contrastes), didacticiel intégré, mode examen.
- Import `running-config` → niveau (outil formateur).
- Performance, packaging, documentation utilisateur.

## Après le MVP
DHCP, STP/EtherChannel, EIGRP/RIP, switch L3/SVI, port-security, IPv6, éditeur de niveaux pour formateurs, 3D, manette. VR seulement si demandé plus tard.

## Risques
- **Fidélité IOS** : dériver des PDF + tests golden ; ne pas inventer.
- **OSPF/NAT** : commencer par le sous-ensemble utile CCNA ; ADR pour chaque simplification.
- **Perf sur PC modestes** : 2D d'abord, worker, pas de dépendances lourdes.
