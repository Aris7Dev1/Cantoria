# ADR 0002 — Stockage optionnel en « dossier de chansons » (fichiers ChordPro)

- **Statut** : proposé (PR de l'issue #93), en attente de validation superviseur au merge
- **Date** : 2026-10-31
- **Décideurs** : superviseur (Dorian), implémentation agent

## Contexte

Le carnet vit dans le `localStorage` du profil Electron (desktop) ou dans un
fichier privé via le pont JS (Android, issue #56). C'est le point le plus
fragile au regard du principe n°1 de VISION.md : les chansons ne sont ni
copiables par simple copie de dossier, ni synchronisables sans export manuel.
Le format ChordPro (`.cho`/`.crd`/`.pro`, texte) est le standard du domaine et
se prête naturellement au stockage en fichiers (issue #93).

## Décision

Ajout d'une option **« Dossier de chansons »** (desktop uniquement dans cette
version) : un répertoire choisi par l'utilisateur, contenant **un fichier
ChordPro par chanson** (`.cho` par défaut ; `.crd`/`.pro`/`.txt` acceptés en
lecture).

Règles retenues :

1. **Coexistence, jamais remplacement** : le stockage du profil (localStorage /
   fichier privé Android) reste la référence et reste écrit à chaque
   sauvegarde. Le dossier est un **miroir en écriture** (best effort) : si le
   dossier devient indisponible (clé USB débranchée), aucune donnée n'est
   perdue.
2. **Migration douce et réversible dans les deux sens** : la copie du carnet
   vers le dossier se fait sur confirmation explicite et ne supprime rien ;
   les fichiers ajoutés dans le dossier depuis l'extérieur sont détectés au
   lancement et importés s'ils ne sont pas des doublons. **Aucune suppression
   automatique** côté dossier : supprimer un fichier à la main ne supprime pas
   la chanson du carnet ; supprimer une chanson dans l'app supprime son
   fichier `.cho` si le dossier est actif.
3. **Sécurité du pont IPC** (nouveaux canaux `songsdir:*` dans `main.js` via
   `preload.js`) : chaque handler vérifie `isAuthorizedSender`, le dossier est
   choisi via le dialogue natif (`showOpenDialog`), les noms de fichiers sont
   validés (extension whitelist, pas de `/` ni `\`, pas de `.`/`..`, longueur
   bornée) **et** le chemin résolu doit rester strictement dans le dossier
   choisi ; contenu plafonné à 5 Mo ; écriture atomique (fichier `.tmp-*`
   puis renommage), mode `0o600`. Aucune écriture hors du dossier, aucun
   accès réseau.
4. **Android** : hors périmètre de cette PR (le pont Android n'expose pas
   encore ces canaux ; le stockage privé + SAF restent en place). Une issue
   dédiée pourra étendre le pont Kotlin avec la même discipline.
5. **Copie de secours** : inchangée et toujours active (backups quotidiens +
   copies « corrupted »), indépendamment du mode de stockage.

## Format du fichier `.cho`

En-tête ChordPro standard puis corps brut conservé tel quel :

```
{title: Amsterdam}
{artist: Jacques Brel}
{key: E}
{capo: 2}

[G]Voici...
```

La relecture applique les mêmes règles que l'import de fichier texte
existant (BOM ignoré, métadonnées reconnues en tête, corps conservé), donc
**compatibilité ChordPro conservée** à l'import comme au stockage.

## Conséquences

- **Positives** : sauvegarde par copie de dossier, synchro sans cloud (clé
  USB, Syncthing, disque externe), interopérabilité avec les outils ChordPro,
  indépendance partielle au profil Electron.
- **Négatives / risques** : doublons possibles entre dossier et profil (gérés
  par la détection de doublons à l'import) ; le dossier peut diverger si
  modifié à la main (délibéré : l'app importe les ajouts, ne supprime pas).
- **Hors périmètre** : sync cloud intégrée, comptes (VISION.md).

## Alternatives envisagées

- **Remplacer** le stockage profil par le dossier : rejeté (perte du principe
  n°1 si le dossier est perdu ; migration non réversible).
- **Un seul fichier JSON par dossier** : rejeté (pas interopérable ChordPro,
  pas de copie de dossier partielle).
- **Dossier système imposé** (`~/Cantoria`) : rejeté (chemin imposé, moins
  flexible ; l'utilisateur choisit).
