# PatchBay

Jeu web de formation réseau : reproduire sur le « terrain » une configuration Cisco (matériel, câbles, ports, console IOS simulée) et être évalué sur l'état réel du réseau simulé. Conçu pour fonctionner hors ligne.

- Vision : [docs/00-vision.md](docs/00-vision.md)
- Architecture : [docs/01-architecture.md](docs/01-architecture.md)
- MVP (câblage, VLAN, routage, OSPF, ACL, NAT) : [docs/02-mvp-spec.md](docs/02-mvp-spec.md)
- Roadmap : [docs/05-roadmap.md](docs/05-roadmap.md)
- Guide pour Claude Code : [CLAUDE.md](CLAUDE.md)

## Démarrer

```bash
npm install
npm test
npm run dev -w @patchbay/web          # le jeu 3D sur http://127.0.0.1:5180
npm run preview -w @patchbay/preview   # outil de vérification du moteur sur http://127.0.0.1:5173
```

L'aperçu (`apps/preview`) fait tourner le vrai moteur dans le navigateur : topologie avec l'état des liens, console IOS par équipement, panneau pour configurer et pinguer les PC. Ce n'est pas l'interface finale (prévue en M7).

Le projet est développé avec Claude Code : ouvrir ce dossier dans Claude Code, il lit `CLAUDE.md` et la roadmap, puis continue à la « Prochaine étape ».
