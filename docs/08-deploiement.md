# Mettre PatchBay en ligne gratuitement

PatchBay est un site statique : il n'a ni serveur à faire tourner, ni base de données. Ce guide utilise **Cloudflare Pages**, gratuit, sans carte bancaire pour cet usage, et différent du Railway du site du club. Après la mise en place, chaque envoi sur GitHub republie le jeu tout seul.

Durée : une dizaine de minutes.

## Ce qu'il te faut

- Le dépôt https://github.com/RBonsa404/PatchBay à jour.
- Un compte Cloudflare gratuit : https://dash.cloudflare.com/sign-up.

> **Si Cloudflare a créé un Worker** (ton journal de construction montre `npx wrangler deploy`), tout est prévu : le dépôt contient `wrangler.jsonc`. Garde la commande de construction `npm run build -w @patchbay/web` et la commande de déploiement `npx wrangler deploy`. Le nom du Worker doit être `patchbay`, comme dans `wrangler.jsonc` ; sinon, change ce nom dans le fichier pour qu'il corresponde. L'adresse sera du type `https://patchbay.<ton-compte>.workers.dev`. Pour Aïcha, la clé se met dans **Settings**, **Variables and Secrets** du Worker, en type **Secret**, et non dans les variables de construction. Les étapes ci-dessous concernent un projet Pages.

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
- Le site pèse environ 25 Mio, presque tout en musique. Le jeu lui-même fait moins de 2 Mio, et chaque morceau ne se charge qu'au moment de le jouer.

## Brancher Aïcha sur DeepSeek (facultatif)

Sans cette étape, le jeu marche : Aïcha répond avec sa fiche de cours. Avec elle, ce que la fiche ne couvre pas part vers DeepSeek. Ta clé reste dans Cloudflare, jamais dans le jeu ni sur GitHub.

### 1. Créer la clé

1. Crée un compte sur https://platform.deepseek.com.
2. Dans **Top up**, ajoute un petit crédit : 2 à 5 dollars suffisent pour commencer. Il n'y a pas d'offre gratuite générale, et **ce crédit est ton plafond de dépense**.
3. Dans **API keys**, crée une clé et copie-la. Ne la mets jamais dans le code, dans un message ni sur GitHub.

Au tarif d'octobre 2026 du modèle `deepseek-flash`, une question coûte environ 0,0005 dollar au prix fort : 1 dollar représente de l'ordre de 2 000 questions. Tarifs à jour : https://api-docs.deepseek.com/quick_start/pricing.

### 2. La donner à Cloudflare

1. Dans ton projet Pages : **Settings**, **Variables and Secrets**, **Add**.
2. Type : **Secret**. Nom : `DEEPSEEK_API_KEY`. Valeur : ta clé. Fais-le pour la **Production** (et **Preview** si tu veux tester sur une branche).
3. Enregistre, puis dans **Deployments**, relance le dernier déploiement avec **Retry deployment** : le secret ne compte qu'à partir du déploiement suivant.

### 3. Vérifier

Dans une mission, touche H, puis :

| Question | Résultat attendu |
|---|---|
| `Quelle est la différence entre OSPF et EIGRP pour un petit réseau d'entreprise ?` | une vraie réponse |
| `Quelle est la capitale du Mali ?` | le refus d'Aïcha |
| `Comment sauvegarder ?` | la fiche, sans appel payant |

Si Aïcha dit qu'elle n'a pas la réponse dans sa fiche pour la première question : vérifie le nom du secret, le crédit, et que tu as bien redéployé. Le tableau de bord de DeepSeek montre la consommation.

### Limites à connaître

- **Le blocage n'est pas absolu.** Le filtre repose sur les consignes données au modèle : un élève obstiné peut parfois obtenir une réponse hors sujet. Le coût reste borné, car chaque réponse est courte et le crédit est prépayé.
- **Quota approximatif.** 15 questions par 5 minutes et par visiteur, compté séparément par serveur Cloudflare. Pour un vrai verrou, ajoute une règle de limitation de débit dans Cloudflare.
- **Confidentialité.** Les questions partent chez DeepSeek, une société basée en Chine. Le jeu n'envoie que la question, les derniers échanges, le titre de la mission et le prochain objectif, et demande aux élèves de ne rien écrire de personnel. Parles-en à ton professeur si le jeu est utilisé en cours.
- **Erreurs possibles.** Une IA peut se tromper sur une commande : Aïcha le dit dans ses consignes, mais la réponse n'est pas vérifiée. La console et le moteur du jeu restent la référence.
- **Examen.** Aïcha reste désactivée en mode examen, et n'est pas disponible hors ligne (la fiche prend le relais).
