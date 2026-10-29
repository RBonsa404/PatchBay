# Format des niveaux

> **Implémenté en M6** : le format réel est le type `Level` de `packages/sim-core/src/scenario/level.ts`, validé par `packages/content/src/schema.ts`. Exemples complets : `packages/content/levels/*.json`. Les objectifs disponibles sont dans `packages/sim-core/src/validation/objectives.ts` (`cable`, `console`, `link-up`, `config`, `ping`, `tcp`, `route`, `saved`). La description ci-dessous est l'intention d'origine.

Un niveau est un fichier JSON validé par un schéma Zod (`packages/content/src/schema.ts`). Aucun niveau ne contient de code.

## Structure

```jsonc
{
  "id": "l08-ospf-single-area",
  "version": 1,
  "title": { "fr": "OSPF mono-zone", "en": "Single-area OSPF" },
  "brief": { "fr": "Texte du scénario…", "en": "…" },
  "difficulty": 3,
  "settings": { "strictMdix": true, "hints": true, "timeLimitSec": null },

  // Matériel disponible dans l'inventaire (le joueur choisit et câble)
  "inventory": {
    "devices": [
      { "id": "R1", "model": "cisco-2911" },
      { "id": "PC1", "model": "pc" }
    ],
    "cables": { "straight": 4, "crossover": 2, "console": 1, "serial": 2 }
  },

  // État de départ du réseau : pré-câblage et pré-configuration éventuelle
  "initial": {
    "cables": [],
    "configs": { "PC1": { "ip": "192.168.1.10", "mask": "255.255.255.0", "gateway": "192.168.1.1" } }
  },

  // Plan cible (pour l'affichage du brief, le mode guidé, ou la solution de référence)
  "target": {
    "cables": [ { "type": "crossover", "a": "R1:Gi0/0", "b": "R2:Gi0/0" } ],
    "startupConfigs": { "R1": "hostname R1\ninterface Gi0/0\n ip address 10.0.0.1 255.255.255.252\n…" }
  },

  // Objectifs vérifiés sur l'état final
  "objectives": [
    { "id": "cabling", "type": "cabling", "expect": "target" },
    { "id": "ping-pc1-pc2", "type": "ping", "from": "PC1", "to": "PC2", "expect": "success", "points": 20 },
    { "id": "isolation", "type": "ping", "from": "PC1", "to": "SRV1", "expect": "fail", "points": 10 },
    { "id": "ospf-neighbors", "type": "state", "device": "R1", "assert": "ospf.neighbors.count>=1", "points": 15 },
    { "id": "route-learned", "type": "route", "device": "R1", "prefix": "172.16.0.0/24", "protocol": "ospf", "points": 15 },
    { "id": "saved", "type": "startup-saved", "devices": ["R1","R2"], "points": 10 },
    { "id": "no-permit-any", "type": "forbid", "device": "R1", "pattern": "permit ip any any" }
  ],

  "hints": [ { "afterSec": 120, "text": { "fr": "Vérifie les wildcards…", "en": "…" } } ],
  "scoring": { "base": 100, "perHintPenalty": 5, "perWrongCablePenalty": 3 }
}
```

## Types d'objectifs (MVP)

- `cabling` : câbles posés = plan cible (type + extrémités, sens indifférent).
- `ping` : résultat d'un ping injecté dans la simulation (`success` | `fail`).
- `state` : assertions sur l'état structuré d'un équipement (`interfaces`, `vlans`, `ospf`, `acls`, `nat`).
- `route` : présence d'une route (préfixe, protocole, next-hop optionnel).
- `startup-saved` : la startup-config contient l'état courant.
- `forbid` : motif interdit dans la running-config (ex. contrainte pédagogique).
- `telnet/ssh` : post-MVP.

## Règles

- Les identifiants sont stables ; `version` s'incrémente quand les objectifs changent (compatibilité des sauvegardes).
- Les textes visibles par le joueur sont des objets `{ fr, en }`.
- Le moteur n'exécute jamais de code issu du niveau : seulement des données.
- Outil d'import prévu (M7) : `running-config` texte → `startupConfigs` d'un niveau.
