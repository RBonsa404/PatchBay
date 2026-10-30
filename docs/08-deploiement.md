# Mettre PatchBay en ligne gratuitement

PatchBay est un site statique : il n'a ni serveur à faire tourner, ni base de données. Ce guide utilise **Cloudflare Pages**, gratuit, sans carte bancaire pour cet usage, et différent du Railway du site du club. Après la mise en place, chaque envoi sur GitHub republie le jeu tout seul.

Durée : une dizaine de minutes.

## Ce qu'il te faut

- Le dépôt https://github.com/RBonsa404/PatchBay à jour.
- Un compte Cloudflare gratuit : https://dash.cloudflare.com/sign-up.

## Étape 1 : créer le projet

1. Connecte-toi sur https://dash.cloudflare.com.
2. Dans le menu de gauche, ouvre **Workers & Pages**, puis **Create application**.
3. Choisis l'onglet **Pages**, puis **Connect to Git**. Si Cloudflare te propose d'abord un Worker, cherche le lien vers Pages en bas de la page : le jeu n'a pas besoin de Worker.
4. Autorise Cloudflare sur GitHub avec le compte **RBonsa404**. Tu peux limiter l'accès au seul dépôt `PatchBay`.
5. Sélectionne `PatchBay`, puis **Begin setup**.

## Étape 2 : régler la construction

| Champ | Valeur |
|---|---|
| Project name | `patchbay` (il donne l'adresse du site) |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run build -w @patchbay/web` |
| Build output directory | `apps/web/dist` |
| Root directory | laisser vide |

Puis, sous **Environment variables**, ajoute :

| Variable | Valeur |
|---|---|
| `NODE_VERSION` | `22` |

Clique sur **Save and Deploy**.

## Étape 3 : vérifier

La construction prend une à deux minutes. Tu obtiens une adresse du type `https://patchbay.pages.dev` (avec un suffixe si le nom est déjà pris).

Sur cette adresse, vérifie :

1. L'écran titre s'affiche et la musique démarre après un premier clic.
2. **Missions** montre les 4 missions, et la mission 1 se lance.
3. Tu marches avec ZQSD, et tu peux brancher un câble.
4. Hors ligne : recharge la page une fois, coupe le réseau, recharge encore. Le jeu doit s'ouvrir, avec la musique générée par le jeu à la place des MP3.

## Mettre à jour

Rien à faire : à chaque `git push` sur `main`, Cloudflare reconstruit et republie. L'onglet **Deployments** du projet montre l'historique, et permet de revenir à une version précédente.

Pour faire tester une version sans toucher au site principal, envoie-la sur une autre branche : Cloudflare crée une adresse d'aperçu séparée.

## Si quelque chose ne marche pas

| Symptôme | Cause probable | Que faire |
|---|---|---|
| La construction échoue sur une version de Node | `NODE_VERSION` absent | ajouter la variable de l'étape 2, puis **Retry deployment** |
| Page blanche ou 404 | mauvais dossier publié | vérifier `apps/web/dist`, et que **Root directory** est vide |
| « Asset too large » | un fichier dépasse la limite de 25 Mio | ne devrait pas arriver : le plus gros MP3 fait environ 7 Mio |
| Ancienne version affichée | le navigateur garde le jeu en cache | recharger deux fois, ou vider les données du site |
| Écran noir | WebGL désactivé ou vieux pilote graphique | essayer un autre navigateur, ou mettre à jour le pilote |

## Solution de rechange : GitHub Pages

Si Cloudflare ne convient pas, le jeu fonctionne aussi sur GitHub Pages sans aucune modification, car ses chemins sont relatifs :

1. Sur GitHub : **Settings**, **Pages**, **Source : GitHub Actions**.
2. Ajoute un workflow qui lance `npm ci`, puis `npm run build -w @patchbay/web`, et publie `apps/web/dist` avec `actions/upload-pages-artifact` et `actions/deploy-pages`.

Le jeu sera alors sur `https://rbonsa404.github.io/PatchBay/`. Ce site doit être public, comme le dépôt.

## Limites à connaître

- L'offre gratuite de Cloudflare Pages limite le nombre de constructions (500 par mois d'après sa documentation) et la taille d'un fichier (25 Mio). PatchBay en est loin. Les chiffres peuvent changer : voir https://developers.cloudflare.com/pages/platform/limits/.
- Le nom des boutons de Cloudflare change parfois : si un libellé diffère, cherche l'équivalent.
- Les notes et le meilleur score restent dans le navigateur de chaque joueur : il n'y a pas de comptes ni de classement commun pour l'instant.
- Un téléchargement d'environ 25 Mio au premier lancement : les musiques ne se chargent qu'au moment de les jouer.
