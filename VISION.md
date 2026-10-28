# VISION — Cantoria

> Document de référence du superviseur. Les agents le lisent avant chaque tâche et **ne le modifient jamais**.
> Toute évolution passe par une décision explicite du superviseur.

## Mission

Cantoria est un carnet de paroles et d'accords à défilement automatique, pour **chanter en jouant de la guitare, les mains occupées**. On ouvre une chanson, on lance le défilement, on joue.

## Principes (par ordre de priorité)

1. **Ne jamais perdre les chansons de l'utilisateur.** La bibliothèque est son bien. En cas de doute, on conserve, on sauvegarde, on n'écrase pas. Aucune modification du modèle de données sans compatibilité avec les carnets existants.
2. **Hors ligne et local d'abord.** Les données restent sur la machine. Pas de compte, pas de cloud, pas de télémétrie, pas d'analytique, aucun appel réseau depuis l'interface.
3. **Lisible à distance, utilisable sans toucher l'écran.** Texte grand, contraste fort, défilement fluide et prévisible, commandes accessibles d'un geste.
4. **Simple et durable.** Peu de dépendances, code lisible, pas de framework tant qu'il n'est pas justifié. Respect de la vie privée et du RGPD par construction, logiciel libre (MIT).
5. **Sobre.** Une fonctionnalité qui complique l'usage en concert ou en répétition n'a pas sa place.

## Périmètre

**Plateforme (décision du superviseur) :** application de bureau **Electron**, Windows, macOS et Linux ; adaptation **Android (APK, WebView native)** et ChromeOS (via APK) entrée au périmètre (décision PR #33). La piste **PWA / ChromeOS** reste **abandonnée** ; ne pas la réintroduire (pas de manifest, pas de service worker).

**Dans le périmètre :** bibliothèque de chansons, éditeur, lecteur à défilement (vitesse, taille du texte, compte à rebours, mise en évidence de la ligne), accords et transposition, import (JSON, TXT, ChordPro) et export JSON, mise à jour automatique.

**Hors périmètre :** comptes et synchronisation cloud, partage en ligne, publicités, suivi d'usage, lecture audio ou reconnaissance musicale, IA embarquée.

## Exception réseau unique

Le **processus principal** (`main.js`) interroge GitHub Releases pour la mise à jour automatique, et uniquement cela. Le processus d'interface (HTML) n'a droit à **aucun** accès réseau. Toute autre exception exige une décision écrite du superviseur.

## Sécurité (non négociable)

- Garder `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, navigation et ouverture de fenêtres refusées, permissions refusées.
- Chaque canal IPC vérifie l'émetteur (`isAuthorizedSender`) et valide ses entrées.
- Le `preload.js` n'expose que le strict nécessaire, en objet gelé.

## Décisions du superviseur

| Décision | Statut |
|---|---|
| Electron plutôt que PWA | Décidée |
| Fichier HTML d'interface sans dépendance externe | Décidée |
| Données dans le `localStorage` du profil Electron | En vigueur |
| Signature de code, secrets de publication, configuration de release | Réservées au superviseur |
| Android/ChromeOS dans le périmètre : WebView native, sideload APK via GitHub Releases, stockage fichier privé via pont JS, aucun geste tactile au début | Décidée (PR #33) |

## Questions ouvertes (ne pas trancher seul)

- Aucune

## Ce que les agents peuvent faire seuls, et ce qui exige le superviseur

| Autonome (via pull request) | Superviseur uniquement |
|---|---|
| Corriger des bugs, ajouter des tests | Modifier `VISION.md` ou `docs/adr/` |
| Petites améliorations dans le périmètre | Fusionner une pull request |
| Refactorings couverts par des tests | Changer `build.yml`, signature, secrets, `build.publish` |
| Mettre à jour la documentation | Ajouter une dépendance ou une permission |
| | Changer le format des données ou le nom du produit |
