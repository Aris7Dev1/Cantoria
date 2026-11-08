---
name: cantoria-visual-loop
description: "Charger cette skill pour comprendre et utiliser la boucle visuelle Cantoria : baselines (régénération CI uniquement), juge A/B par personas (verdict en commentaire de PR), explorateur IA (à la demande), partage de moteurs desktop/mobile."
---
# La boucle visuelle : trois couches, trois questions

| Couche | Question | Où la lire |
|---|---|---|
| Contrôles mécaniques (`npm run visual`) | Les seuils sont-ils respectés (tailles, contraste, débordement) ? | `visual-out/report.md` |
| Juge A/B par personas (CI, PR UI) | Pour ces utilisateurs-là, la version courante est-elle meilleure que la référence ? | Commentaire de PR |
| Explorateur IA (CI, à la demande) | Un premier utilisateur bute-t-il quelque part ? | Commentaire de PR ou log du run |

Fonctionnement détaillé, seuils (`thresholds.json`) et doctrine : `docs/visual/README.md`. L'essentiel :

- **Baselines** : régénération UNIQUEMENT par le workflow GitHub `Visual baselines` — aucun poste local n'écrit dans `visual-baseline/` (leçons EPERM, garde anti-suppression en CI depuis). Captures mobiles via **Chromium** : Electron est écrêté à `minWidth: 860` (main.js) et la media query portrait ne s'active jamais (bug #73).
- **Juge A/B** : `scripts/visual/personas.json` — fichier du superviseur (`actif: false` = zéro appel API). Verdict par persona en commentaire de PR, **consultatif**. Clé `secrets.MISTRAL_API_KEY`, plafond `JUDGE_MAX_CALLS` (défaut 10), modèle `MISTRAL_JUDGE_MODEL` (défaut `mistral-large-4-0`, version épinglée). En dev local : passerelle uniquement (`mistral-gateway`) — l'URL Mistral n'existe que dans le workflow CI.
- **Explorateur IA** : `scripts/visual/explorer-goals.json` — fichier du superviseur (buts choisis au hasard par run). Menu d'actions **fermé** : il agit sur l'app lancée, ne change aucun code. Plafonds 40 actions / 30 appels ; modèle `MISTRAL_EXPLORER_MODEL` (défaut `mistral-large-4-0`, version épinglée). **Simulé ≠ ressenti** : le rapport complète le test humain, ne le remplace pas.
- **Fixtures** : `scripts/visual/fixtures.js` doit **répliquer les défauts de l'app** (leçon : `controlsCompactMobile` absent du seed = capture dans un état que l'app réelle n'a jamais, verrouillé par test).
