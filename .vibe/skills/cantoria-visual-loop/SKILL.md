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

## Baselines : doctrine absolue

- **Régénération UNIQUEMENT par le workflow GitHub `Visual baselines`** (Actions → Run workflow) : la CI génère et committe ; **aucun poste local n'écrit dans `visual-baseline/`** (leçons EPERM : 3 suppressions de références committées par accident ; garde anti-suppression en CI depuis).
- Ne jamais merger une PR qui supprime des baselines sans justification explicite.
- **Chaque scénario peut déclarer son viewport** (`scenarios.js`) : mobile = 412×915. **Les captures mobiles passent par Chromium** — Electron est écrêté à `minWidth: 860` (main.js) et la media query portrait (≤480px) ne s'active jamais (bug #73 : baselines mobiles irréalistes depuis #61).

## Juge A/B (personas)

- `scripts/visual/personas.json` — **fichier du superviseur** : chaque persona est une lens (description + critères) ; `actif: false` = zéro appel API.
- Sur les PR touchant `cantoria.html` : le workflow `visual-judge.yml` compare aux baselines et poste le verdict par persona en commentaire. **Consultatif** : informer, jamais bloquer.
- Clé : `secrets.MISTRAL_API_KEY` ; plafond `JUDGE_MAX_CALLS` (défaut 10) ; modèle `MISTRAL_JUDGE_MODEL` (défaut small).
- En dev local : passerelle uniquement (`mistral-gateway`) — l'URL Mistral n'existe que dans le workflow CI (test `devcontainer-security` : exception `judge-ci.js` documentée).

## Explorateur IA

- `scripts/visual/explorer-goals.json` — **fichier du superviseur** : des buts utilisateur (parcours découverte/répétition/concert), choisis au hasard par run.
- Menu d'actions **fermé** (click, fill, press, scroll, back, note, done) : l'explorateur n'agit que sur l'app lancée, ne change aucun code.
- Plafonds : 40 actions, 30 appels ; modèle `MISTRAL_EXPLORER_MODEL` (défaut small). Dispatch manuel : le superviseur déclenche et juge le rapport.
- **Simulé ≠ ressenti** : le rapport complète le test humain, ne le remplace pas ; deux explorations diffèrent (couverture imprévisible assumée).

## Les fixtures comptent

`scripts/visual/fixtures.js` seed les réglages — ils doivent **répliquer les défauts de l'app** (leçon : `controlsCompactMobile` absent du seed = capture avec un état que l'app réelle n'a jamais, verrouillé par test).
