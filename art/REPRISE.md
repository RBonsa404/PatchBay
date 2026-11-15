# Reprise automatique du travail

Une tâche planifiée de l'application Claude (« Continuer IST Network Lab ») se lance toutes les heures, tant que l'application est ouverte. Elle reprend le plan `docs/09-ist-network-lab.md` à la première case non cochée.

- Elle ne fait rien si `art/.travail-en-cours` a été modifié il y a moins de 45 minutes : une autre session travaille déjà. Toute session qui travaille sur le plan touche ce fichier au début de chaque étape.
- Pour arrêter la reprise automatique : la désactiver dans la liste des tâches planifiées de l'application.
