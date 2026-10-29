# ADR 0002 — Le moteur reste sur le thread principal (pas de Web Worker pour le MVP)

Date : 2026-10-29 · Statut : accepté

## Contexte

La roadmap M7 prévoyait de déplacer `sim-core` dans un Web Worker pour ne jamais bloquer le rendu 3D. L'interface appelle le moteur de façon synchrone partout : `Network.connect`, `Cli.execute`, `runHostCommand`, `evaluate`, `linkState` pour les voyants, et l'observateur `Network.onWire` qui rejoue les trames en paquets animés dans l'ordre exact.

## Mesures (Node 22, i7 portable, niveaux du MVP solution appliquée)

| Opération | L1 | L2 |
|---|---|---|
| `buildLevel` + `applySolution` | 6,0 ms | 2,9 ms |
| `evaluate` (tous les objectifs, pings compris) | 3,1 ms | 2,3 ms |
| `ping` depuis l'invite d'un PC | < 0,1 ms | < 0,1 ms |
| `show running-config` | 0,1 ms | < 0,1 ms |

Toutes les opérations tiennent dans une image (16 ms à 60 i/s), même sur une machine 3 à 4 fois plus lente. Le rendu (≈ 10 ms par image) reste le poste dominant.

## Décision

Le moteur reste sur le thread principal. Un Worker imposerait de rendre asynchrones toute l'interface, le tutoriel et l'animation des trames (copie structurée de l'état à chaque commande), sans gain perceptible.

## Conséquences

- Code de l'interface simple et synchrone.
- À revoir si un niveau dépasse ~8 ms par commande (grosses topologies OSPF, nombreux équipements) : la frontière serait `Network` derrière un proxy de messages, avec `onWire` envoyé par lots. Re-mesurer de la même façon (boucles `performance.now()` autour de ces appels, bundle esbuild exécuté avec Node) quand des niveaux plus gros arrivent.
