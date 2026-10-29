# Vision

## Problème

Au Burkina Faso (et ailleurs), les cours CCNA se limitent à Cisco Packet Tracer. L'étudiant apprend la logique des commandes mais jamais le geste : quel câble, quel port, quel équipement, dans quel ordre, avec quelles erreurs possibles sur le terrain.

## Idée

**PatchBay** met l'étudiant dans la peau d'un technicien réseau. Chaque niveau :

1. **Brief** : un scénario (topologie cible + configuration attendue, comme faite sur Packet Tracer ou fournie par le formateur) et des objectifs vérifiables (ex. « PC1 doit pinguer PC4 », « le VLAN 20 ne doit pas joindre le serveur »).
2. **Terrain** : l'étudiant prend le matériel, choisit les câbles (droit, croisé, console, série), les branche aux bons ports, puis se connecte en console et configure.
3. **Test & évaluation** : la simulation vérifie l'état réel du réseau simulé, produit un score et des retours pédagogiques (« le câble droit entre deux switches ne fonctionne pas sans auto-MDIX »).

## Pour qui

- Étudiants CCNA (module 1 puis 3 : VLAN, routage, OSPF, ACL, NAT).
- Formateurs : ils fournissent ou écrivent des niveaux (JSON, puis éditeur).
- Contexte : PC modestes, connexion limitée → application web légère, installable, **100 % hors ligne**.

## L'expérience visée : un jeu 3D, pas un Packet Tracer

Le joueur est dans une salle technique. Il **voit** le routeur, tourne autour, **saisit un câble à la souris**, cherche le bon port sur la face arrière (Ethernet, série, console), l'enfiche, et regarde les voyants s'allumer ou non. Il s'assoit devant un PC, branche le câble console, ouvre le terminal et configure. Les animations (câbles, paquets, caméra) et le retour visuel font partie du cœur du jeu. Le moteur de simulation (déjà en place) garantit que ce qu'il voit est *vrai* : un mauvais câble ne s'allume pas, un VLAN erroné isole vraiment les PC.

## Principes produit

- **Réalisme pédagogique** avant réalisme graphique : la fidélité du CLI et des règles de câblage prime sur la 3D.
- **Erreurs réalistes** : mauvais câble, interface `shutdown`, mauvais VLAN, masque erroné, ACL qui bloque trop.
- **Progression** : niveaux gradués, indices, mode « examen » sans aide.
- **Évolutif** : moteur indépendant de l'interface ; nouveaux protocoles, matériels et niveaux ajoutables sans toucher au reste.

## Ce que le jeu n'est pas

Pas un clone de Packet Tracer (on ne dessine pas librement des topologies infinies au départ), pas un émulateur d'IOS réel, pas de VR (pour l'instant).

## Succès

Un étudiant qui a terminé la campagne MVP sait : câbler une petite entreprise, créer des VLAN et le routage inter-VLAN, configurer routes statiques, OSPF, ACL, NAT/PAT, et diagnostiquer avec `show` et `ping`.
