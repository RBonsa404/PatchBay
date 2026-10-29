# Spécification du MVP

Le MVP couvre : **câblage, VLAN + trunk + routage inter-VLAN, routage statique, OSPF, ACL, NAT/PAT**, avec console IOS simulée et validation par état. Pas de VR.

## Matériel du catalogue MVP

| Modèle | Type | Interfaces |
|---|---|---|
| Cisco 2911 | routeur | Gi0/0, Gi0/1, Gi0/2, console, aux ; slot HWIC série Se0/0/0, Se0/0/1 |
| Catalyst 2960-24TT | switch L2 | Fa0/1–24, Gi0/1–2, console |
| PC | hôte | Fa0 (carte réseau), RS232 (console) |
| Serveur | hôte | Fa0 |

Câbles : droit, croisé, console, série DCE/DTE.

## Niveaux de difficulté physique

`strictMdix` : si vrai, droit/croisé doivent être choisis correctement (mode Packet Tracer classique) ; si faux, auto-MDIX (mode « équipement moderne »). Par niveau.

## Fonctionnalités par domaine

### 1. Câblage et liens
- Compatibilité câble/port ; état `up/down` ; `show interfaces`, `show ip interface brief`.
- Série : `clock rate`, `bandwidth`.

### 2. Base IOS
`enable`, `disable`, `configure terminal`, `hostname`, `enable secret`, `line console 0` / `line vty 0 4` (`password`, `login`), `banner motd`, `service password-encryption`, `no ip domain-lookup`, `copy running-config startup-config`, `write memory`, `show running-config`, `show startup-config`, `show version` (simplifié), `reload` (perte de la config non sauvegardée), `erase startup-config`.

### 3. VLAN et trunk (switch)
`vlan <id>`, `name`, `switchport mode access|trunk`, `switchport access vlan`, `switchport trunk allowed vlan`, `switchport trunk native vlan`, `show vlan brief`, `show interfaces trunk`, `interface range`, `shutdown`/`no shutdown`, `show mac address-table`. Interface de gestion `interface vlan 1` + `ip default-gateway`.

### 4. Routage inter-VLAN
Router-on-a-stick : sous-interfaces `interface g0/0.10`, `encapsulation dot1Q 10`, `ip address`. (SVI sur switch L3 : post-MVP.)

### 5. Routage statique
`ip route <réseau> <masque> <next-hop|interface>`, route par défaut `0.0.0.0 0.0.0.0`, route flottante (distance administrative), `show ip route` (codes C, L, S, S*, O), `ping`, `traceroute`.

### 6. OSPFv2
`router ospf <pid>`, `router-id`, `network <ip> <wildcard> area <n>`, `passive-interface`, `default-information originate`, `auto-cost reference-bandwidth`, `ip ospf cost`, `ip ospf priority`, `show ip ospf neighbor`, `show ip ospf interface brief`, `show ip protocols`, entrées `O` / `O*E2` dans `show ip route`.
Périmètre : mono-zone (area 0) + multi-zone basique (ABR, routes inter-area) ; réseaux point-à-point et broadcast avec élection DR/BDR. Pas de virtual-link, ni stub/NSSA, ni authentification au MVP.

### 7. ACL
Standard (1–99) et étendue (100–199), nommées (`ip access-list standard|extended`), `permit`/`deny` avec `host`, `any`, wildcard, protocoles `ip|icmp|tcp|udp`, ports `eq`, `established`, `remark`, `log` (affiché mais sans journal), `ip access-group <acl> in|out`, `access-class` sur VTY, `show access-lists` avec compteurs de matches, `show ip interface` (ligne ACL). Deny implicite final.

### 8. NAT
`ip nat inside|outside`, NAT statique (`ip nat inside source static`), NAT dynamique (`ip nat pool`, `access-list`, `ip nat inside source list … pool …`), PAT (`overload`, y compris sur interface), `show ip nat translations`, `show ip nat statistics`, `clear ip nat translation *`.

### 9. Diagnostic
`ping` (sortie `!!!!!`, `.....`, `U`), ping étendu simple, `traceroute`, `show arp`/`show ip arp`, `show cdp neighbors` (post-MVP si coûteux), `show interfaces`.

## Hors MVP (voir roadmap)
STP, VTP, EtherChannel, EIGRP, RIP, DHCP/DHCP relay, DNS, IPv6, SVI/switch L3, port-security, CDP/LLDP, SSH réel, SNMP, HSRP.

> DHCP est le premier candidat pour la v1.1 : très utile dans les scénarios de bureau.

## Campagne MVP (niveaux)

1. Premier câblage : PC↔switch, droit vs croisé, voyants.
2. Console : se connecter, `hostname`, mots de passe, `copy run start`.
3. Deux PC, un switch, IP statiques, `ping`.
4. VLAN 10/20 sur un switch, ports d'accès, test d'isolation.
5. Deux switches, trunk 802.1Q, VLAN répartis.
6. Router-on-a-stick.
7. Deux routeurs, routes statiques et route par défaut.
8. Trois routeurs, OSPF mono-zone.
9. OSPF multi-zone + `default-information originate`.
10. ACL standard : bloquer un hôte.
11. ACL étendue : autoriser le web, bloquer le reste, accès VTY restreint.
12. NAT statique + serveur publié.
13. PAT overload (réseau interne → « Internet »).
14. Intégration : PME complète (VLAN + inter-VLAN + OSPF + ACL + NAT).
15. Dépannage : réseau cassé (câble, shutdown, ACL, masque…), trouver et réparer.

## Critères de fin du MVP

- Les 15 niveaux sont jouables de bout en bout dans le navigateur, hors ligne.
- Chaque commande listée ci-dessus a au moins un test golden tiré des PDF de cours.
- `npm test`, `typecheck`, `lint` verts ; bundle initial < 2 Mo.
- Une personne extérieure peut finir le niveau 1 sans explication orale.
