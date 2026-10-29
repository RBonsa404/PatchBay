# ADR 0001 — Interface du jeu sans framework (TypeScript + DOM)

**Statut** : accepté (M7, octobre 2026).

## Contexte

L'architecture prévoyait Vite + React pour l'interface autour de la scène 3D. Le jeu doit tourner sur des PC modestes (4 Go), hors ligne, avec un bundle initial sous 2 Mo, et l'essentiel de l'affichage est la scène Three.js.

## Décision

L'interface (écrans, HUD, console, panneaux) est écrite en TypeScript avec un petit constructeur d'éléments (`apps/web/src/ui/dom.ts`), sans React. Les textes passent par `apps/web/src/i18n.ts`. Le style suit la charte du club via des variables CSS (`apps/web/src/style.css`).

## Conséquences

- Bundle réduit (≈ 200 ko gzip pour le jeu complet, polices comprises en plus), pas de couche de réconciliation entre la scène et l'interface.
- Si l'interface grossit beaucoup (éditeur de niveaux, comptes), réévaluer un framework léger (Preact, Solid) dans une nouvelle ADR.
