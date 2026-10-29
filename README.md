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
```

Le projet est développé avec Claude Code : ouvrir ce dossier dans Claude Code, il lit `CLAUDE.md` et la roadmap, puis continue à la « Prochaine étape ».
