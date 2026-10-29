# PatchBay — guide pour Claude Code

Jeu web de formation réseau : l'étudiant reçoit une configuration Cisco (topologie + objectifs) et doit la reproduire « sur le terrain » : choisir le matériel, les câbles, les ports, puis configurer les équipements en console IOS simulée. Public initial : étudiants CCNA au Burkina Faso (PC modestes, connexion limitée → **tout doit fonctionner hors ligne**).

Lis d'abord, dans cet ordre : `docs/00-vision.md`, `docs/01-architecture.md`, `docs/02-mvp-spec.md`, `docs/05-roadmap.md`. Le détail du mini-IOS est dans `docs/03-ios-cli-spec.md`, le format des niveaux dans `docs/04-level-format.md`. Les cours CCNA de l'utilisateur (PDF) sont dans `docs/references/` : ce sont la **source de vérité pour la syntaxe et la sortie des commandes**.

## Principes non négociables

1. **`sim-core` est pur** : TypeScript sans DOM, sans Node-only API, sans aléatoire non seedé, sans `Date.now()`. Il tourne à l'identique dans le navigateur, en Node et dans les tests. Il ne connaît ni l'interface ni le rendu.
2. **Séparation en 3 couches** : contenu (`packages/content`) → moteur (`packages/sim-core`) → interface (`apps/web`). Une couche ne dépend que de celle qui la précède. Jamais d'import de `apps/web` depuis `sim-core`.
3. **Validation par état, pas par texte** : un niveau est réussi si l'état final du réseau (interfaces, VLAN, routes, ACL, NAT, connectivité testée) satisfait les objectifs. Deux configs différentes peuvent être correctes. Ne jamais comparer les lignes tapées.
4. **Déterminisme** : mêmes entrées → même état. La simulation est pilotée par une horloge logique (`tick`), pas par le temps réel. Toute l'état de simulation est sérialisable en JSON (sauvegarde, replay, tests).
5. **Fidélité IOS** : prompts, abréviations (`conf t`, `int g0/0`), `?`, messages d'erreur `% Invalid input detected…`, formats de `show`. En cas de doute, suivre les PDF de `docs/references/` puis la doc Cisco ; ne rien inventer. Si une commande n'est pas supportée, répondre par l'erreur IOS standard, jamais par un crash.
6. **Hors ligne d'abord** : aucune dépendance réseau à l'exécution, pas de CDN, pas de télémétrie. PWA prévue.

## Méthode de travail

- **TDD pour `sim-core`** : écrire le test (Vitest) à partir d'une session IOS réelle tirée des PDF, puis l'implémentation. Les tests « golden » de sessions CLI vivent dans `packages/sim-core/test/golden/`.
- Avancer **milestone par milestone** (`docs/05-roadmap.md`). Ne pas commencer le milestone N+1 tant que le N n'est pas vert (tests, typecheck, lint).
- Petites étapes, un commit par étape cohérente (messages en anglais, style conventionnel : `feat(ios): add vlan database commands`).
- Une décision d'architecture non triviale → un fichier `docs/adr/NNNN-titre.md` (contexte, décision, conséquences). Mettre à jour la doc quand le code diverge d'elle.
- Pour savoir quoi faire ensuite : la section « Prochaine étape » de `docs/05-roadmap.md` est tenue à jour ; la modifier à la fin de chaque session.

## Commandes

```bash
npm install                 # installe tous les workspaces
npm run build               # compile tous les packages
npm test                    # Vitest, tous les packages
npm run typecheck           # tsc --noEmit partout
npm run lint                # ESLint
npm run test -w @patchbay/sim-core   # un seul package
```

## Conventions de code

- TypeScript `strict`, ESM, pas de `any` (utiliser `unknown` + validation Zod aux frontières : chargement des niveaux, sauvegardes).
- Identifiants et commentaires de code en **anglais**. Textes affichés au joueur, docs : **français** d'abord, via un système i18n (`fr` par défaut, `en` prévu) — jamais de chaîne en dur dans les composants UI.
- Les sorties de la CLI IOS sont en **anglais** (comme sur le vrai matériel).
- Données immuables côté état de simulation (mises à jour par fonctions pures ou `produce`-like explicite) pour permettre replay et tests.
- Fichiers courts et ciblés ; un protocole = un module (`protocols/vlan`, `protocols/ospf`, …) avec ses tests.
- Pas de dépendance lourde sans ADR. Cibles de perf : ordinateur 4 Go de RAM, navigateur récent, bundle initial < 2 Mo.

## Structure

```
apps/web/            interface (Vite + React + PixiJS 2D ; 3D ultérieur)  [milestone M6+]
packages/sim-core/   moteur : modèle physique, mini-IOS, protocoles, validation
packages/content/    niveaux (JSON) + schémas Zod + outils d'import de running-config [M7]
docs/                vision, architecture, specs, roadmap, ADR, references/ (PDF de cours)
```

## Hors périmètre (pour l'instant)

VR/motion capture, multijoueur, import de fichiers `.pkt` (format chiffré), EIGRP/RIP/STP/VTP (prévus après le MVP, voir roadmap), IPv6, emulation d'images IOS réelles.
