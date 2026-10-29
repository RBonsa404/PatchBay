# Charte graphique — Club Informatique de l'IST

PatchBay est réalisé **pour le Club Informatique de l'IST (Burkina Faso)** : le jeu reprend sa charte. Source : maquette officielle du site du club (`Desktop/CLUB_INFORMATIQUE/Ciub_Informatique_IST/maquette-html/README.md` et `assets/css/tokens.css`, hors de ce dépôt).

## Couleurs officielles

| Rôle | Nom | Valeur |
|---|---|---|
| Couleur principale | Bleu Royal IST | `#1D4ED8` (survol `#1E40AF`) |
| Accent | Jaune Amber Tech | `#FBBF24` (survol `#F59E0B` ; sur fond clair `#D97706` / `#B45309` pour le contraste) |
| Néon / lueurs | Bleu Cyan Circuit | `#38BDF8` (halo `rgba(56, 189, 248, 0.4)`) |
| Fond sombre | Bleu Nuit Circuit | `#0B1E3F` ; fond d'application `#070D1E` |
| Surfaces sombres | Encre Nuit | `#0F172A`, surélevée `#162447`, survol `#1E293B` |
| Neutre | Gris Ardoise | `#64748B` |
| Blanc | Blanc Pur | `#FFFFFF` |
| Textes (sombre) | — | `#F8FAFC`, secondaire `#CBD5E1`, atténué `#94A3B8` |

États sémantiques : succès `#10B981`, alerte `#F59E0B`, danger `#EF4444`, info `#0EA5E9`.

**Thème sombre par défaut** (ambiance « high-tech » de la maquette) ; un thème clair existe (fonds `#F8FAFC` / `#FFFFFF`, textes `#0F172A`).

## Typographie

- **Poppins** : titres, menus, écrans de mission.
- **Inter** : textes courants, HUD.
- **JetBrains Mono** : console IOS, terminaux, adresses IP.

Les polices doivent être **embarquées dans le jeu** (fichiers locaux, licences OFL), jamais chargées depuis un CDN : le jeu fonctionne hors ligne.

## Style

- **Verre dépoli** (glassmorphism) : panneaux semi-transparents `rgba(15, 23, 42, 0.78)`, flou ~14 px, bordure cyan `rgba(56, 189, 248, 0.18)`, halo `0 0 20px rgba(56, 189, 248, 0.2)`.
- **Motif de circuit imprimé** en filigrane (trait cyan, opacité ~0,12 en sombre).
- Rayons : 6, 10, 16, 24 px. Transitions : 150 / 250 / 400 ms (`cubic-bezier(0.16, 1, 0.3, 1)` pour les entrées).

## Application au jeu 3D

- **Interface** (menus, HUD, briefing, écrans de mission, console) : palette et polices ci-dessus, panneaux en verre dépoli, accents cyan et ambre.
- **Scène** : éclairage nocturne bleu nuit, lueurs cyan pour les éléments interactifs (port survolé, câble saisi), ambre pour les objectifs et alertes, bleu royal pour les sélections. Les voyants des équipements gardent leurs couleurs réelles (vert = lien, orange = activité/erreur) pour rester fidèles au matériel.
- **Logo** : celui du club (à fournir par le club) sur l'écran titre ; aucun logo Cisco.
