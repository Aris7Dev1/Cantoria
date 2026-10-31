# ADR 0001 — Synchronisation de groupe : la voie hors-ligne

- **Statut :** Acceptée (superviseur)
- **Date :** 2026-10-31
- **Zone :** docs/adr/ (superviseur) — liée à VISION.md « Hors périmètre : comptes et synchronisation cloud »
- **Issues liées :** #92 (setlists), #93 (stockage .cho), #94 (défilement calibré)

## Contexte

Plusieurs musiciens ou chanteurs sur une même scène veulent des écrans qui montrent la même chanson, avec le même défilement et la même tonalité. L'idée d'une synchronisation en direct entre appareils — typiquement via Bluetooth — a été examinée au moment de l'ouverture du backlog de passage public.

Contraintes existantes :

- VISION.md : hors-ligne et local d'abord ; aucun appel réseau depuis l'interface ; « une fonctionnalité qui complique l'usage en concert n'a pas sa place ».
- La synchronisation cloud et le partage en ligne sont hors périmètre.
- Contrainte technique : Web Bluetooth n'est pas disponible dans la WebView Android — toute piste Bluetooth imposerait du code natif Android en plus du processus principal Electron.

## Options envisagées

### Option A — Bluetooth entre appareils

Rejetée. Trois piles radio à maintenir (Electron + Kotlin Android), appariement capricieux pendant le soundcheck, incompatibilités inter-appareils, débit BLE inadapté à la synchronisation de bibliothèque. C'est exactement le type de complication que le principe 5 de VISION.md exclut. Aucun acteur du domaine n'utilise le Bluetooth pour ça : la référence du créneau (OnSong) adresse ce besoin par le MIDI de scène, pas par du BLE artisanal.

### Option B — Réseau local (Wi-Fi)

Rejetée à ce stade. Elle fonctionnerait techniquement, mais exigerait une exception au principe « aucun réseau côté interface » et un serveur local (rôle hôte/clients) à inventer, tester et documenter. Coût disproportionné pour le bénéfice, tant que la voie hors-ligne (option D) n'a pas été éprouvée.

### Option C — MIDI Show Control (MSC)

Écartée aujourd'hui, réservée comme exception future. C'est le standard de scène éprouvé (contrôle à distance, changement de chanson improvisé). Son introduction resterait une décision écrite du superviseur (VISION.md : toute exception réseau/protocole exige une décision explicite). Note : Web MIDI n'est pas disponible dans la WebView Android ; une implémentation complète serait multi-pile, comme l'option A.

### Option D — Synchronisation hors-ligne (choisie)

Pas de lien entre les appareils. La cohérence de groupe vient de deux mécanismes prévus au backlog :

1. **Setlists partagées avant le concert** (#92) : export/import de la setlist (fichier, QR, clé USB) — même liste, même ordre, mêmes réglages (tonalité, capo) par entrée.
2. **Défilement calibré sur la durée** (#94) : chaque appareil dérive selon la durée cible de la chanson. Tous les écrans commencent au même top (décompte déjà prévu) et finissent ensemble **par construction**, sans aucune connexion. La synchronisation est émergente, pas orchestrée.

Le stockage en fichiers .cho (#93) garantit en plus que chacun importe exactement le même contenu de chanson.

## Décision

Cantoria n'implémentera pas de synchronisation en direct entre appareils (ni Bluetooth, ni Wi-Fi). La synchronisation de groupe est obtenue par le partage de setlists et le défilement calibré sur la durée — deux fonctionnalités déjà au backlog, sans stack radio, sans exception réseau, sans nouvelle dépendance.

Le MIDI Show Control reste la seule piste d'exception future (changement de chanson improvisé en pleine soirée) et exigera une ADR dédiée si le besoin se matérialise.

## Conséquences

**Positives**

- Aucune nouvelle pile technique, aucune permission système, aucune exception à VISION.md.
- Le coût est couvert par trois issues déjà planifiées (#92, #93, #94) — la « fonctionnalité groupe » est gratuite.
- La robustesse scène ne dépend pas d'un appariement radio : chacun reste autonome si un appareil tombe.

**Négatives / acceptées**

- Un démarrage en retard d'un musicien décale son écran (atténué par le décompte, mais sans rattrapage automatique).
- Un changement de chanson improvisé au milieu d'une soirée ne se propage pas aux autres écrans (cas d'usage rare ; piste MSC future).

**Réversibilité**

La décision n'interdit rien structurellement : les options A/B/C restent documentées ici avec leurs coûts respectifs. Toute révision passe par une nouvelle ADR (zone superviseur).

## Renvois

- VISION.md — principes 2 (hors-ligne) et 5 (sobriété), périmètre hors-synchronisation.
- Issues #92, #93, #94 — implémentation de la voie retenue.
