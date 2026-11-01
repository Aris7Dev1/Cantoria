# Synchroniser Cantoria entre plusieurs appareils

Cantoria n'a **aucune connexion réseau** : ni compte, ni cloud, ni télémétrie.
La synchronisation multi-appareils ne se fait donc pas *dans* l'app, mais
*autour* d'elle : vos fichiers d'export se placent dans un dossier que vous
synchronisez vous-même, avec l'outil de votre choix. Cantoria se contente
d'exporter et d'importer — vous gardez la main sur vos données et sur le canal.

## Ce que l'on synchronise

- **`cantoria.json`** — le carnet complet en un seul fichier (export natif,
  disponible aujourd'hui). Simple, mais si deux appareils exportent en même
  temps, le dernier écrit gagne : n'éditez que sur un appareil à la fois, et
  exportez systématiquement après vos éditions.
- **Dossier ChordPro `.cho`** (en cours d'intégration) — une chanson, un
  fichier. Un conflit n'engage plus qu'une chanson, pas tout le carnet :
  c'est le format recommandé pour la synchronisation multi-appareils.

Dans tous les cas, la discipline est la même : **exportez après vos éditions,
importez avant de jouer.**

## Recette 1 — Syncthing (recommandé)

[Syncthing](https://syncthing.net) synchronise des dossiers en pair-à-pair :
les appareils se parlent directement (réseau local ou relais), sans cloud,
sans compte, sans intermédiaire. C'est la recette la plus alignée avec la
ligne de Cantoria.

1. **Ordinateur** : installez Syncthing depuis [syncthing.net](https://syncthing.net)
   (ou une intégration comme SyncTrayzor, syncthing-macos).
2. **Android** : l'application officielle est retirée ; le fork communautaire
   **Syncthing-Fork** la maintient (disponible sur F-Droid et GitHub).
3. Appairez les appareils (échange d'identifiants ou de code QR).
4. Créez un dossier partagé « Cantoria », identique sur chaque appareil.
5. Dans Cantoria, exportez le carnet (ou le dossier `.cho`) dans ce dossier ;
   sur l'autre appareil, importez depuis ce dossier.

## Recette 2 — Google Drive

- **Ordinateur** : « Drive pour ordinateur » miroite un dossier local.
  Exportez dedans, le fichier remonte dans le cloud, puis redescend sur les
  autres ordinateurs.
- **Android** : l'application Drive ne miroite **pas** de dossier local —
  passez par un outil de miroir de dossier (par exemple « Autosync for
  Google Drive ») qui maintient un dossier local identique à un dossier
  Drive. Configurez un dossier « Cantoria » en miroir, puis exportez et
  importez depuis l'app dans ce dossier.

## Recette 3 — Dropbox, Nextcloud, autres

La règle générale : **tout service qui miroite un dossier local convient**.
Dropbox (client bureau) et Nextcloud (clients bureau et mobile) synchronisent
nativement un dossier sur les deux plateformes. Reprenez la recette Syncthing
en remplaçant l'outil par celui de votre choix.

## Points d'attention

- **Un seul appareil éditeur à la fois.** Les outils de synchronisation
  détectent les conflits en conservant des copies (« conflicted copy… ») :
  ne les supprimez pas avant d'en avoir vérifié le contenu.
- **Une synchro n'est pas une sauvegarde.** Les copies de secours de Cantoria
  (carnet illisible, restauration) restent sur l'appareil qui les a créées ;
  gardez aussi vos exports dans le dossier synchronisé.
- **Aucune donnée ne quitte vos outils.** Cantoria ne connaît ni le service,
  ni le dossier, ni le canal : il ne fait que lire et écrire les fichiers que
  vous désignez.
