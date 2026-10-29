# Spécification du mini-IOS

Source de vérité pour la syntaxe et la sortie : les PDF de `docs/references/` (voir `docs/references/INDEX.md`), puis la documentation Cisco.

## Modes et prompts

| Mode | Prompt | Entrée | Sortie |
|---|---|---|---|
| User EXEC | `Router>` | connexion | — |
| Privileged EXEC | `Router#` | `enable` | `disable` |
| Global config | `Router(config)#` | `configure terminal` | `end`, Ctrl+Z, `exit` |
| Interface | `Router(config-if)#` | `interface <nom>` | `exit` |
| Interface range | `Switch(config-if-range)#` | `interface range …` | `exit` |
| Sous-interface | `Router(config-subif)#` | `interface g0/0.10` | `exit` |
| Line | `Router(config-line)#` | `line console 0` / `line vty 0 4` | `exit` |
| VLAN | `Switch(config-vlan)#` | `vlan <id>` | `exit` |
| Router OSPF | `Router(config-router)#` | `router ospf <pid>` | `exit` |
| ACL standard | `Router(config-std-nacl)#` | `ip access-list standard <nom>` | `exit` |
| ACL étendue | `Router(config-ext-nacl)#` | `ip access-list extended <nom>` | `exit` |

`end` ramène toujours en Privileged EXEC. `exit` remonte d'un niveau. Le prompt reflète le `hostname` courant.

## Parseur

1. Découpage en mots (espaces multiples tolérés).
2. Pour chaque position, un mot littéral est reconnu par **préfixe unique** parmi les candidats valides dans le mode courant. Plusieurs candidats → `% Ambiguous command:  "<saisie>"`.
3. `?` seul liste les commandes du mode ; `mot ?` liste les complétions de la position suivante ; `mo?` liste les mots commençant par `mo`.
4. `no <commande>` annule ; `default <commande>` (post-MVP).
5. Commande trop courte → `% Incomplete command.`
6. Mot inconnu ou paramètre invalide → `% Invalid input detected at '^' marker.` précédé de la ligne avec le marqueur `^` sous le mot fautif (position exacte).
7. Mauvais mode → même erreur `Invalid input` (ex. `ip route` en user EXEC).
8. Paramètres typés : IPv4, masque, wildcard, entier borné (message `% Invalid input detected` ou message spécifique), nom d'interface avec abréviations (`g0/0`, `gi0/0`, `fa0/1`, `s0/0/0`).

## Registre de commandes (contrat, implémenté en M1)

```ts
interface CommandDef {
  modes: CliMode[];
  syntax: string;          // ex. "line vty <first:int:0-15> <last:int:0-15>"
  help: string;            // texte pour `?`
  paramHelp?: Record<string, string>;
  negatable?: boolean;     // supporte `no` ; avec `no`, les paramètres de fin deviennent optionnels
  run(ctx: CommandContext, args: Args): string | void;
}
```

Types de paramètres : `word`, `int` (avec `:min-max`), `ip`, `mask`, `iface` (1 ou 2 tokens : `fa0/0` ou `fastethernet 0/0`), `text` (reste de la ligne).

Mécanismes (voir `packages/sim-core/src/ios/`) :
- **Caret** : la colonne du `^` inclut la largeur du prompt (comme dans un vrai terminal).
- **Questions** : `ctx.ask({prompt, hidden?, handler})` — la ligne suivante va au handler (mot de passe, `[confirm]`, saisie de bannière…). Le `prompt` du résultat devient la question.
- **Commandes globales depuis un sous-mode** : exécutées comme en mode `config` (le mode revient à `config`).
- **`do <commande>`** depuis tout mode de configuration.
- **`negateSyntax`** : syntaxe alternative après `no` (ex. `no switchport mode` n'a pas le mot `access`/`trunk`).
- **Type `text`** : consomme le reste de la ligne (utilisé par `interface range`, `description`, `banner`).
- **`ctx.invalid(i)`** : un handler peut rejeter la commande avec le caret sous le mot `i`.

Ajouter une commande = une entrée dans `src/ios/commands/<famille>.ts` + un test golden. Aucune logique de protocole dans le handler : il modifie la config structurée du device ; les protocoles lisent cette config.

## Sorties de référence à respecter (exemples)

```
Router#show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     192.168.1.1     YES manual up                    up
GigabitEthernet0/1     unassigned      YES unset  administratively down down
```

```
Router#ping 192.168.1.2

Type escape sequence to abort.
Sending 5, 100-byte ICMP Echos to 192.168.1.2, timeout is 2 seconds:
!!!!!
Success rate is 100 percent (5/5), round-trip min/avg/max = 1/1/2 ms
```

Les formats exacts (largeurs de colonnes, espaces) doivent être copiés des PDF/sessions réelles et verrouillés par des tests golden. Le premier ping d'une session peut afficher `.!!!!` (ARP) : à simuler.

## États et persistance

- `running-config` (RAM) vs `startup-config` (NVRAM) ; `reload` recharge `startup` ; sans `copy run start`, la config est perdue.
- Les changements sont effectifs immédiatement dans `running`.
- Un message de changement d'état de lien est affiché dans la console (`%LINK-5-CHANGED: Interface …, changed state to up`, `%LINEPROTO-5-UPDOWN`), comme sur le vrai équipement.

## Tests golden

Format `packages/sim-core/test/golden/<nom>.session.txt` :

```
# device: router 2911
# cabling: ...
Router>enable
Router#configure terminal
Enter configuration commands, one per line.  End with CNTL/Z.
Router(config)#hostname R1
R1(config)#
```

Le runner rejoue chaque ligne commençant par un prompt et compare la sortie.
