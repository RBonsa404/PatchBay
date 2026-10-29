# Architecture (approche hybride)

```
 [Contenu]   packages/content      niveaux JSON + schémas Zod
     │
     ▼
 [Moteur]    packages/sim-core     modèle physique + mini-IOS + protocoles + validation
     │
     ▼
 [Interface] apps/web              scène 2D (PixiJS), terminal (xterm.js), HUD (React)
```

Le **moteur est le cœur du projet**. Il est indépendant de l'interface : on pourra changer le rendu (3D, Godot, VR) sans réécrire la logique.

## Stack

| Élément | Choix | Raison |
|---|---|---|
| Langage | TypeScript strict, ESM | Un seul langage pour moteur, contenu et UI ; typage fort |
| Monorepo | npm workspaces | Pas d'outil supplémentaire à installer |
| Tests | Vitest | Rapide, TS natif |
| Validation | Zod | Niveaux et sauvegardes validés aux frontières |
| UI | Vite + React | Léger, build statique offline |
| Rendu | PixiJS (2D) puis éventuellement Three.js | 2D d'abord : plus rapide, plus léger |
| Terminal | xterm.js | Console IOS crédible |
| Hors ligne | PWA (service worker) | Usage sans connexion |

## Moteur `sim-core`

### Modules

```
src/
  model/        Device, Interface, Cable, Network (état sérialisable)
  physical/     compatibilité câbles/ports, liens up/down, auto-MDIX
  ios/          CLI : modes, parseur à abréviations, registre de commandes, `?`
    commands/   une commande ou famille par fichier (vlan, ip, ospf, acl, nat, show…)
    show/       formatage des sorties `show`
  protocols/
    l2/         MAC learning, VLAN, trunk 802.1Q
    l3/         ARP, ICMP, table de routage, longest-prefix match
    ospf/       OSPFv2
    acl/        ACL standard/étendue/nommée
    nat/        NAT statique, dynamique, PAT (overload)
  engine/       horloge logique, file d'événements, injection de trames, ping/traceroute
  validation/   objectifs de niveau → verdict + feedback
  scenario/     chargement d'un niveau → Network initial
test/
  golden/       sessions CLI complètes (entrée → sortie attendue)
```

### Modèle de données

- `Network` = ensemble de `Device` + `Cable`. Entièrement sérialisable en JSON (`toJSON` / `fromJSON`), validé par Zod.
- `Device` : `kind` (`router | switch | pc | server`), `model` (ex. `Cisco 2911`, `Catalyst 2960`) qui fixe les interfaces disponibles, `running` (config courante structurée), `startup`.
- **La configuration est stockée sous forme structurée** (interfaces, vlans, routes, acls, nat, ospf…), pas comme du texte. `show running-config` est un rendu de cet état. C'est ce qui permet la validation par état.
- `Interface` : nom canonique (`GigabitEthernet0/0`), alias (`g0/0`, `gig0/0`), `adminUp`, `ip`, `mask`, `vlan`/`switchport`, `aclIn/aclOut`, `natRole`.
- `Cable` : type (`straight | crossover | console | serial-dce-dte | fiber`), deux extrémités (device + port).

### Couche physique

Règles (avec drapeau de difficulté par niveau : `strictMdix: true|false`) :
- Console : câble console de PC (port série/USB) vers port console uniquement.
- Droit : PC↔switch, routeur↔switch. Croisé : PC↔PC, PC↔routeur, switch↔switch, routeur↔routeur (sans auto-MDIX).
- Série : DCE/DTE, `clock rate` obligatoire côté DCE.
- Un lien est `up/up` seulement si câble compatible **et** deux extrémités `no shutdown`.

### Réseau, liens et syslog (implémenté en M2)

- `Network` (`model/network.ts`) possède les appareils (`Device`) et les câbles. Les routeurs/switches ont un `Cli` ; les PC/serveurs n'en ont pas.
- Un `Cli` ne connaît jamais le `Network` : il reçoit un `LinkEnvironment` (`ios/environment.ts`) qui répond à `linkState`, `serialEnd`, `macAddress` et publie les changements via `commit()` / `drain()`. Seul, un `Cli` utilise un environnement isolé (aucun câble).
- **L'état de lien est dérivé, jamais stocké** : il se recalcule à partir des câbles et des configs (`Network.linkState`). `Network.reconcile()` compare à l'état précédent et fabrique les messages syslog : ceux de l'appareil qui vient d'exécuter une commande sont imprimés juste après la commande (précédés d'une ligne vide), ceux des voisins sont mis en file et lus par l'interface avec `drainSyslog(id)`.
- Câble série : `connect('serial', dce, dte)` — le premier bout est le DCE.
- Console : `consoleTarget(pcId)` donne l'équipement derrière le câble console d'un PC ; c'est ce que le terminal de l'interface ouvrira.
- `snapshot()` / `Network.restore()` (JSON) : base des sauvegardes et des tests de replay.

### Trames et couche 2 (implémenté en M3)

- `engine/l2.ts` : `injectFrame(net, from, frame)` envoie une trame par un port d'hôte et la suit jusqu'aux hôtes (`FrameTrace` : `deliveries` + `drops` avec raison). Pour chaque switch : classification du VLAN (port d'accès → `accessVlan` ; trunk → étiquette ou VLAN natif, filtrée par la liste autorisée), apprentissage de l'adresse source par VLAN, puis envoi vers le port connu ou inondation vers les membres du VLAN dont le lien est `up`. Sortie trunk : étiquetée sauf VLAN natif ; sortie accès : sans étiquette. Un port d'accès abandonne une trame étiquetée.
- `Network.macTables` (`MacTables`) : état dynamique par switch, hors `snapshot()`, purgé quand un port quitte `up`.
- Le routeur ne traite pas encore les trames reçues (M4) : `injectFrame` les livre comme à un hôte.
- Les SVI (`interface vlan N`) sont créés à la demande ; `groupOf` les reconnaît par leur type, et leur état dépend de l'existence du VLAN et d'au moins un port actif dans ce VLAN (`memberOf`).

### CLI IOS

- Machine à états par équipement : `user → privileged → config → config-if / config-line / config-router / config-std-nacl / config-ext-nacl / config-subif…`.
- Parseur : tokens, **abréviations uniques** (`conf t`, `sh ip int br`), `?` (aide contextuelle), `Tab` (complétion, côté UI), `no <commande>`, erreurs `% Incomplete command.`, `% Ambiguous command:`, `% Invalid input detected at '^' marker.`.
- Registre déclaratif : chaque commande déclare modes autorisés, syntaxe, aide, handler. Ajouter une commande = ajouter une entrée + un test golden.
- Sortie = texte pur ; l'UI l'affiche dans xterm.js.

### Simulation réseau

- Horloge logique ; `engine.step()` traite la file d'événements (trames en transit, timers OSPF).
- Trames de bout en bout : PC → switch (MAC learning, VLAN, trunk) → routeur (ARP, routage, ACL, NAT) → … Les `ping`/`traceroute` injectent de vraies trames ICMP qui traversent la topologie, donc une ACL ou un VLAN erroné produit le bon symptôme (`.....` / `U.U.U`).
- OSPFv2 : Hello/DBD/LSU simplifiés, élection DR/BDR, SPF de Dijkstra, coût par bande passante de référence. Voir `docs/02-mvp-spec.md` pour le périmètre exact.
- Sans aléa : les identifiants (router-id, MAC) sont dérivés de façon déterministe.

### Validation

Un niveau déclare des **objectifs** (voir `docs/04-level-format.md`) : tests de connectivité (`ping A→B doit réussir / échouer`), assertions d'état (`router R1 a la route 10.0.2.0/24 via OSPF`), assertions de câblage, contraintes (nombre de commandes max, pas de `permit any any`). Le moteur exécute les tests sur l'état final et rend un verdict + feedback détaillé et traduisible (clés i18n).

## Interface `apps/web` (milestone M6+)

- Scène 2D : baie/salle, équipements, câbles à glisser-déposer entre ports ; vue « face arrière » avec ports lisibles.
- Panneau terminal par équipement (xterm.js) branché sur `sim-core`.
- HUD : objectifs, indices, chronomètre, score.
- État du jeu dans un store (Zustand) ; le moteur est instancié dans un Web Worker pour ne pas bloquer le rendu.
- Sauvegarde locale (IndexedDB) de la progression.

## Évolutivité

- Nouveaux protocoles : nouveau dossier dans `protocols/` + commandes dans `ios/commands/`.
- Nouveau matériel : fiche modèle (ports, capacités) dans `model/catalog`.
- Nouveaux niveaux : JSON seulement, sans toucher au code.
- Nouveau rendu : consommer l'API publique de `sim-core` (voir `src/index.ts`).
