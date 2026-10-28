# Raccourcis clavier — Cantoria

Cantoria est pensée pour être pilotée **sans quitter la guitare des mains** :
les commandes du lecteur se font au clavier, à distance. Tous les raccourcis
ci-dessous sont ignorés quand le focus est dans un champ de saisie (éditeur,
recherche), et les raccourcis du lecteur ne sont actifs que lorsque le lecteur
est ouvert.

## Lecteur

| Raccourci | Action |
|---|---|
| `Espace` | Lecture / pause du défilement |
| `Ctrl` + `↑` | Taille des paroles **+** |
| `Ctrl` + `↓` | Taille des paroles **−** |
| `Ctrl` + `Shift` + `↑` | Transposition **+** (demi-ton) |
| `Ctrl` + `Shift` + `↓` | Transposition **−** (demi-ton) |
| `Ctrl` + `←` | Vitesse de défilement **−** |
| `Ctrl` + `→` | Vitesse de défilement **+** |

Les paliers sont identiques à ceux des boutons du bandeau : la transposition
avance par demi-tons et la vitesse par paliers de 0,25 (de ×0,25 à ×2).

Pendant le décompte, `Espace` l'annule.

## Zoom de l'interface

Le zoom s'applique à l'interface **hors paroles** : la taille des paroles du
lecteur se règle indépendamment (réglage « Taille du texte par défaut » et
raccourcis du lecteur ci-dessus). La valeur est mémorisée entre les sessions.

| Raccourci | Action |
|---|---|
| `Ctrl` + `+` (ou `=`) | Zoomer |
| `Ctrl` + `−` | Dézoomer |
| `Ctrl` + `0` | Réinitialiser le zoom (×1) |

Plage du zoom : de ×0,5 à ×2.

## Bibliothèque

| Touche | Action |
|---|---|
| `Entrée` ou `Espace` | Ouvrir la chanson de la carte focalisée |

La navigation au clavier dans la bibliothèque suit l'ordre naturel du focus
(`Tab` / `Shift`+`Tab`), chaque carte de chanson étant un élément focalisable.

## Éditeur

Dans la zone de saisie des paroles, chaque ligne est reconnue automatiquement :

- une ligne entre crochets, ex. `[Am]`, est un **accord** ;
- une ligne commençant par `#` ou `#C`, ex. `#couplet`, est un **libellé de
  section** (couplet, refrain, pont…) affiché en petites majuscules ;
- toute autre ligne est une **ligne de paroles**.
