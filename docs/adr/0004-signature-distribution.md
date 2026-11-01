# ADR 0004 — Signature des binaires et canal de distribution de confiance (issue #97)

- **Statut** : proposé (PR de l'issue #97), en attente de validation superviseur au merge
- **Date** : 2026-10-31
- **Décideurs** : superviseur (Dorian) — certificats, comptes et secrets hors portée agent

## Contexte

Les binaires distribués via GitHub Releases ne sont pas signés et l'APK n'est
en sideload. Conséquences : SmartScreen (Windows), Gatekeeper (macOS) et
Play Protect (Android) avertissent ou bloquent — principal frein d'adoption
pour le public visé (guitariste non technique).

## Décision proposée (volet A — signature)

Signature **conditionnée à la présence des secrets** dans `build.yml` (jamais
de secret en clair ; permissions du workflow inchangées) :

| Plateforme | Mécanisme | Secrets requis (fournis par le superviseur) |
|---|---|---|
| Windows | Certificat Authenticode (OV, Azure Trusted Signing recommandé) signé par electron-builder | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |
| macOS | `codesign` + notarisation `notarytool` par electron-builder | `MACOS_CSC_LINK`, `MACOS_CSC_PASSWORD`, `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID` |
| Android | Keystore release dédié (PR #91 en attente) | `ANDROID_KEYSTORE`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| Linux | Signature GPG optionnelle (basse priorité) | `GPG_PRIVATE_KEY`, `GPG_PASSPHRASE` |

Sans secrets, le build reste non signé mais **affiche un `::warning::`
explicite** dans les logs CI (pas d'échec silencieux).

## Décision proposée (volet B — canal de distribution)

- **F-Droid prioritaire** : cohérent avec le positionnement libre/hors-ligne
  (pas de compte, pas de télémétrie, build reproductible depuis les sources
  publiques). Nécessite un merge request `metadata/` chez F-Droid — action
  superviseur.
- **Google Play Store en option** (25 $, impose la signature Play et les
  politiques Google) : à arbitrer avec le positionnement « sobre » —
  recommandé de ne pas y aller tant que F-Droid + GitHub Releases couvrent
  l'audience.
- **GitHub Releases reste le canal direct** en parallèle.

## Ce que seul le superviseur peut faire (hors portée agent)

1. Acheter/configurer les certificats (Azure Trusted Signing ou OV/EV
   Authenticode ; compte Apple Developer + clés API notarisation).
2. Générer le keystore Android release sur une machine de confiance.
3. Créer les secrets GitHub listés ci-dessus (chiffrés, jamais dans le dépôt).
4. Ouvrir le merge request F-Droid (metadata + build reproductible).
5. Tester une installation sans avertissement OS sur Windows et macOS.

## Conséquences

- Après la première release signée, SmartScreen/Gatekeeper établissent la réputation ;
  l'avertissement disparaît progressivement.
- Changement de certificat = nouvelle identité de signature : à documenter
  ici si cela arrive (les utilisateurs devront parfois réinstaller).
- Coût : certificats (~100–400 €/an), Apple Developer 99 $/an, F-Droid
  gratuit, Play 25 $ one-shot (si retenu).

## Hors périmètre

Aucune modification du périmètre réseau/privacy : la vérification de mises à
jour GitHub Releases reste l'unique exception réseau (VISION.md).
