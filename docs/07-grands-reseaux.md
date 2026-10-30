# Grands réseaux : plusieurs salles, plusieurs étages

Demande du porteur de projet (2026-10-30). Les niveaux 1 et 2 sont validés, mais deux équipements ne reflètent pas le terrain. La suite doit donner un réseau beaucoup plus grand, réparti dans un bâtiment. Ce n'est pas forcément le niveau 3 : c'est la direction.

## Ce qui change pour le joueur

- On se déplace dans un **bâtiment** : plusieurs salles et étages (couloirs, escalier), à pied, en vue à la première personne.
- Le travail est réparti : baie de distribution à chaque étage, salle serveur, salles de cours avec leurs PC.
- On retrouve tout ce qui existe déjà : câbles rangés, chrono et note, mode examen, Aïcha, tableau du schéma (par salle, ou un plan global sur tablette), musique, lumière, décor rempli.
- Sur le terrain, on ne se téléporte pas : oublier un câble à l'étage 2 coûte du temps. C'est le chrono qui donne son enjeu au déplacement.

## Exemple : le réseau de l'IST

| Lieu | Matériel | Ce qu'on y fait |
|---|---|---|
| Rez-de-chaussée, salle serveur | routeur de bordure, switch de cœur, serveurs | routage, NAT vers Internet, DHCP et DNS |
| Étage 1, administration | switch d'étage, PC, imprimante | VLAN administration, port d'accès |
| Étage 2, salles de TP | deux switches, 20 PC | VLAN étudiants, trunks, ACL |
| Entre étages | câbles et fibre dans les chemins de câbles | liaisons montantes, EtherChannel |

Une progression possible : VLAN et trunk sur un étage, puis routage inter-VLAN, OSPF entre bâtiments, ACL et NAT, et enfin une **panne à diagnostiquer** dans le réseau complet (le vrai quotidien d'un technicien). Le moteur sait déjà faire VLAN, trunk, router-on-a-stick, OSPF, ACL et NAT. DHCP, STP et EtherChannel sont à ajouter.

## Ce qu'il faut construire

1. **Description d'un bâtiment dans le niveau** : salles, portes, étages, et la salle de chaque appareil. La position des appareils devient relative à leur salle. Les niveaux 1 et 2 restent valables : une seule salle, comme aujourd'hui.
2. **Pièces assemblables** : `scene/room.ts` et `scene/decor.ts` deviennent des modules (salle technique, salle de cours, bureau, couloir, escalier), et les obstacles de `game/player.ts` viennent de ces modules au lieu d'une liste fixe.
3. **Performance** : ne dessiner que la salle occupée et ses voisines, une seule lumière à ombres par salle, ce qui reste tenable sur un PC de 4 Go.
4. **Câbles entre salles** : un câble passe par les chemins de câbles et réapparaît dans la baie d'arrivée. Au lieu de le tirer, on brasse sur des panneaux de brassage déjà câblés, comme dans un vrai bâtiment.
5. **Saisie de masse** : avec 20 PC, on ne configure pas à la main. Il faut DHCP ou des PC déjà préparés, et `interface range` côté switch (déjà disponible).
6. **Plan et navigation** : plan du bâtiment, repérage des appareils, étiquettes de ports, et un carnet pour noter le plan d'adressage.
7. **Sauvegarde en cours de mission** pour les longues missions, et un chrono plus long découpé en étapes.

## Ordre conseillé

1. Modules de salles et obstacles issus des données, sans changer les niveaux existants.
2. Deuxième salle reliée par un couloir, pour éprouver la navigation et la performance.
3. Panneaux de brassage et liaisons entre salles.
4. Premier niveau multi-salles : VLAN et trunk sur deux étages.
5. DHCP dans le moteur, puis les niveaux suivants.
