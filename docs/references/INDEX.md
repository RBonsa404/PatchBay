# Références de cours (source de vérité pour la syntaxe IOS)

> **Les PDF ne sont pas dans le dépôt** (contenu Cisco protégé). Ils restent en local : placez-les dans ce dossier, et leurs textes extraits dans `docs/references/text/` (par exemple avec PyMuPDF). Les dossiers `docs/references/*` (sauf ce fichier) et `course/` sont ignorés par git. Les tests du projet n'en dépendent pas.

PDF du TP Guide CCNA 3 fournis par l'utilisateur. À lire (Claude Code sait lire les PDF) pour copier la syntaxe, les enchaînements de commandes et les sorties exactes avant d'écrire un test golden.

| Fichier | Sujet | Milestone |
|---|---|---|
| `CONFIG base ROUTER.pdf`, `manuel_de_configuration_routeurs_cisco.pdf` | Config de base routeur | M1 |
| `Config de base d'un Switch.pdf`, `Config de base d'un Switch_PT.pdf` | Config de base switch | M1 |
| `cmd-cisco.pdf`, `Commandes Cisco.PDF` | Aide-mémoire de commandes | M1+ |
| `definition-tous-le-terme-de-cisco-3.pdf` | Glossaire | contenu/i18n |
| `config de base de VLAN.pdf` | VLAN, trunk | M3 |
| `Routage de base entre VLAN.pdf` | Router-on-a-stick | M4 |
| `Configuration Routage Statique.pdf` | Routes statiques | M4 |
| `Configuration de base OSPF.pdf` | OSPF | M5a |
| `Configuration de base RIP V2.pdf`, `Configuration de base EIGRP.pdf` | Hors MVP (après) | post-MVP |
| `Config base stp.pdf`, `config base vtp.pdf` | Hors MVP (après) | post-MVP |

Aucun PDF sur ACL/NAT : pour M5b/M5c, s'appuyer sur la documentation Cisco officielle et noter les sources dans un ADR.

Les dossiers `1 - Corrigé intégral`, `2 - Tutoriel commandes`, `3 - TD_Termine` du cours d'origine sont copiés dans `course/` (corrigés et TD : utiles comme niveaux candidats).
