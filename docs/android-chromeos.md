# Réflexion — Adapter Cantoria à Android et ChromeOS

> Document de réflexion, à valider par le superviseur. Il ne modifie ni le code
> ni `VISION.md`. Rappel : `VISION.md` marque aujourd'hui la piste PWA /
> ChromeOS comme **abandonnée** et la version mobile comme **hors périmètre**.
> Mettre en œuvre ce document exige donc une décision écrite du superviseur
> qui mette à jour ces deux points (tableau « Périmètre » et « Décisions »).

## 1. Le besoin

Objectif : distribuer Cantoria sur **Android** (mobile et tablette) et sur
**ordinateurs portables ChromeOS**, sous forme d'**APK** côté Android.

Cas d'usage typiques :

- **Mobile** : le chanteur-guitariste pose le téléphone sur un support face à
  lui, comme la fenêtre Electron sur un ordinateur. Écran petit, éloigné, mains
  occupées.
- **ChromeOS** : ordinateur portable, usage au clavier quasi identique au
  desktop actuel ; la fenêtre est souvent petite (mode tablette ou écran
  11–13").

## 2. Ce que la base de code a déjà en sa faveur

Cantoria est aujourd'hui **très bien préparée** à ce portage :

- **Toute l'interface tient dans un seul `cantoria.html` autonome** (HTML +
  CSS + un seul script, zéro dépendance externe, zéro appel réseau). C'est le
  cœur réutilisable pour une cible Android.
- Le stockage est `localStorage` : simple à remplacer par un adaptateur
  (IndexedDB / base native) derrière de petites fonctions `saveSongs()` /
  `saveSettings()` déjà isolées.
- Les seuils d'accessibilité sont déjà testés (contraste ≥ 4,5:1, cibles
  tactiles ≥ 32 px) : la base est saine pour le tactile.
- Les raccourcis clavier sont **des accélérateurs, pas la seule entrée** :
  chaque commande du lecteur existe déjà en bouton tactile. Le clavier est un
  plus sur ChromeOS, pas un prérequis sur mobile.

## 3. Options techniques pour Android / ChromeOS

| Option | APK | ChromeOS | Effort | Notes |
|---|---|---|---|---|
| **A. PWA** (web app installable) | Non (mais installable via « Ajouter à l'écran d'accueil » et via Trusted Web Activity) | Oui, native | Faible | Pas de build d'APK pur ; exige un hébergement HTTPS **ou** une TWA packagée. Réintroduit la piste marquée abandonnée. |
| **B. WebView native** (APK « coquille » Android autour de `cantoria.html`) | Oui | Non (ChromeOS exécute les APK Android, donc oui indirectement) | Moyen | Réutilise le HTML tel quel ; stockage et import/export via un pont JS natif ; auto-update à remplacer par Play Store ou par une vérification maison. |
| **C. Capacitor** (coquille native avec plugins) | Oui | Oui (APK installable) | Moyen | Équivalent de B avec une couche d'outillage en plus ; ajoute une dépendance et des permissions à auditer — contraire au principe « sobre » si mal maîtrisée. |
| **D. Réécrire en natif** (Kotlin/Compose) | Oui | Oui | Élevé | Duplication complète de l'interface ; inadapté à la taille du projet. |

**Recommandation : l'option B (WebView native)**, avec l'option A en
complément *seulement* si un jour l'app doit être aussi utilisable depuis un
simple navigateur. B garde la promesse « hors ligne, local, sobre » :

- l'APK embarque `cantoria.html` dans les assets, aucun hébergement nécessaire ;
- pas de service worker, pas de manifest PWA, pas de compte ;
- la surface de sécurité reste minuscule (une WebView, pont JS minimal,
  permissions réduites au strict nécessaire — rien, idéalement).

## 4. Chantiers de l'adaptation (option B)

### 4.1 Interface et ergonomie mobile

- **Bandeau de commandes** : prévoir un agencement repliable/compact en
  portrait (aujourd'hui horizontal, prévu pour une fenêtre large). Le bandeau
  épinglable reste pertinent ; le masquage auto 3 s doit rester facilement
  réversible au toucher (un tap dans la zone de lecture, pas seulement le
  mouvement de souris — sur mobile il n'y a pas de hover).
- **Cibles tactiles** : seuil actuel de 32 px ; viser 44 px (recommandation
  Android/Material) pour les commandes principales du lecteur, vérifié par les
  mêmes tests automatisés.
- **Écran et distance** : sur un téléphone posé à un mètre, le texte doit
  pouvoir monter plus haut que sur desktop : vérifier que la plage de taille
  des paroles (×0,7 à ×4,4) et le zoom suffisent en portrait.
- **Gestes** : swipe horizontal pour transposer/vitesse, tap pour
  lecture/pause — à discuter, car VISION privilégie la sobriété. Un tap
  « zone de lecture = pause/reprise » est probablement le geste le plus utile.
- **Compte à rebours** : idem desktop, aucun changement de conception.

### 4.2 Stockage des chansons

- `localStorage` ne doit pas être la cible finale sur Android : aujourd'hui
  cohérent avec Electron, mais limité (~5 Mo sur WebView) et fragile si les
  données système vident le stockage. Prévoir un adaptateur de persistance
  (fichier JSON dans le stockage privé de l'app, via le pont JS), en gardant
  **compatibilité totale** avec le format existant (`cantoria-songs-v1`) —
  principe n°1 de VISION : ne jamais perdre les chansons.
- Import/export : sur Android, remplacer les dialogues natifs Electron par les
  sélecteurs de fichiers du système (Storage Access Framework) via le pont.

### 4.3 Mise à jour automatique

- `electron-updater` et GitHub Releases ne s'appliquent pas. Deux pistes :
  - **Play Store** : impose un compte éditeur (25 USD une fois) et une
    politique de mise à jour gérée par le store ;
  - **APK distribué en direct (sideload)** : vérification maison de version via
    GitHub Releases (un seul appel réseau, comme aujourd'hui côté Electron) et
    téléchargement + réinstallation manuelle de l'APK.
- Décision à prendre : distribution Play Store vs sideload, car elle change
  le canal de mise à jour et l'expérience utilisateur.

### 4.4 Zoom et cycle de vie

- Le zoom IPC Electron n'existera pas sur Android : les raccourcis
  `Ctrl`+`+/-/0` ne concernent que le desktop ; sur mobile, la taille des
  paroles (réglage + stepper) suffit. Prévoir une garde sans `window.carnetDesktop` —
  déjà le cas dans le code (les fonctions zoom vérifient sa présence).
- Cycle de vie Android : l'app peut être tuée en arrière-plan ; l'état du
  lecteur (position de défilement, vitesse) doit être restauré à la réouverture,
  et le décompte annulé proprement à la mise en pause système.

### 4.5 Sécurité

- WebView : désactiver l'accès aux fichiers non nécessaires, refuser
  `allowUniversalAccessFromFileURLs`, pont JS minimal et validé (même
  discipline que `preload.js` aujourd'hui : objet gelé, canaux explicites).
- Aucune permission Android au départ (pas de localisation, pas de
  caméra/micro, pas de contacts). Seul le stockage privé de l'app est utilisé.
- CSP stricte conservée telle quelle dans le HTML.

### 4.6 CI et livraison

- Ajouter un job Android au workflow existant (Gradle + build APK en release).
- Décision de signature de l'APK (keystore) : réservée au superviseur, comme
  la signature Electron aujourd'hui.
- Sur ChromeOS : les APK Android s'installent directement ; aucune cible
  supplémentaire n'est nécessaire si l'APK est compatible tablette (fragments /
  orientations gérés).

## 5. Ce qui ne change pas

- Le format des chansons et la compatibilité des carnets existants.
- L'éditeur, la bibliothèque, le lecteur : mêmes vues, mêmes réglages.
- Le hors-ligne : aucune donnée ne quitte la machine, aucun compte, aucune
  télémétrie.
- Les tests `node:test` + jsdom restent la base de vérification pour la partie
  interface (ils testent le HTML, pas Electron).

## 6. Décisions prises (superviseur, PR #33)

Décisions tranchées le jour de la fusion de la PR #33 par le superviseur :

| # | Décision | Résultat |
|---|---|---|
| 1 | Confirmer l'entrée d'Android/ChromeOS dans le périmètre et mettre à jour `VISION.md` en conséquence | **Oui** — `VISION.md` mis à jour en conséquence |
| 2 | Choix technique | **WebView native** (option B, recommandée) |
| 3 | Distribution et mises à jour Android | **Sideload APK avec GitHub Releases** (pas de Play Store) |
| 4 | Stockage des chansons sur Android | **Fichier privé via pont JS** (recommandé) |
| 5 | Gestes tactiles dans le lecteur | **Aucun au début** (recommandé : sobre) |
| 6 | Signatures Android (keystore) et secrets CI | **Pas pour l'instant** — reste réservé au superviseur |

## 7. Étapes proposées (une fois le périmètre acté)

1. Décisions 1 à 6 tranchées par le superviseur et `VISION.md` mis à jour.
2. Projet Android minimal (coquille WebView) chargé sur `cantoria.html`, avec
   pont JS équivalent `window.carnetDesktop` (sauvegarde fichier, import/export).
3. Adaptation responsive du bandeau et des vues en portrait, seuils tactiles
   à 44 px vérifiés par tests.
4. Adaptateur de stockage et migration douce depuis `localStorage` (sans perte,
   avec copie de secours, comme sur desktop).
5. Vérification de version via GitHub Releases dans la coquille Android.
6. Job CI de build APK, tests étendus, documentation utilisateur.
