# Boucle visuelle (première brique)

L'agent codeur n'a pas d'écran. Cette brique donne au projet une **mesure** de l'interface, en trois niveaux de confiance décroissante :

```
Electron réel sous Xvfb ──▶ captures fixes (4 scénarios × 3 thèmes)
   │
   ├─ 1. Contrôles déterministes   taille de texte, contraste WCAG, commandes trop petites, débordements
   ├─ 2. Comparaison à la référence  pixels modifiés (même machine, même image Docker : 0,00 % si rien n'a changé)
   └─ 3. Juge A/B (optionnel)       modèle de vision Mistral, consultatif, uniquement sur ce qui a changé
   ▼
visual-out/report.md  ·  visual-out/issues-drafts/*.md  (brouillons non approuvés)
```

Rien n'est créé sur GitHub, aucun code n'est modifié, aucune issue n'est labellisée : **tu lis, tu décides**.

## Utilisation

Dans le conteneur de développement :

```bash
npm install                                  # installe playwright-core (devDependency)
npm run visual                               # captures + contrôles + rapport (aucun appel au modèle)
npm run visual -- --update-baseline          # adopte les captures courantes comme référence (après relecture !)
npm run visual -- --judge --intent="agrandir les accords du lecteur"   # + juge A/B via la passerelle
```

Options : `--engine=electron|chromium` · `--themes=campfire,spotlight` · `--scenarios=library,player` · `--out=visual-out` · `--baseline=visual-baseline` · `--repetitions=2` (par ordre) · `--max-judge-calls=24` · `--judge-model=mistral-large-4` · `--strict` (code 1 s'il y a des erreurs).

Sorties : `visual-out/current/<thème>/<scénario>.png`, `visual-out/diff/…` (pixels modifiés en rose), `report.md`, `report.json`, `issues-drafts/`.

Le moteur `chromium` charge simplement le HTML (pas de processus principal ni de preload) : pratique pour itérer, mais seul `electron` est représentatif.

## Ce que mesurent les contrôles

| Règle | Où | Gravité |
|---|---|---|
| Taille des paroles et des accords | lecteur | **erreur** |
| Contraste (pire cas d'un dégradé, opacité cumulée) | lecteur | **erreur** |
| Ligne coupée par le lecteur, défilement horizontal de la page | partout | **erreur** |
| Taille du texte, contraste, taille des commandes, texte hors fenêtre | reste de l'interface | avertissement |

Les scénarios (`scenarios.js`) agissent par de vrais clics : bibliothèque, éditeur, lecteur (chanson « Le chemin du retour »), paramètres. Les données (`fixtures.js`) sont fixes : mêmes chansons, mêmes dates, profil vierge.

### Seuils : à valider
`VISION.md` dit « texte grand, contraste fort » sans chiffres. Les valeurs de `scripts/visual/thresholds.json` sont **proposées** pour une lecture à environ 1 m sur une fenêtre de 1280×820 : paroles ≥ 20 px, accords ≥ 18 px, contraste ≥ 7:1 dans le lecteur ; reste de l'interface ≥ 12 px, 4,5:1, commandes ≥ 32 px. Avec ces seuils, l'interface actuelle **échoue** (accords de 14,7 px, paroles de 18,9 px, contraste des accords à 4–6:1) : c'est un constat, pas une décision. Tu ajustes le fichier ; l'agent n'a pas le droit d'y toucher (sinon il pourrait « réussir » en baissant les seuils).

## Le juge A/B

- A = référence, B = version courante, présentées **dans les deux ordres**, `repetitions` fois chacun, température 0.
- Le modèle répond en JSON strict (validé ; toute réponse hors format est écartée et comptée).
- Verdict **retenu seulement si les deux ordres désignent la même image**. Sinon : « non concluant », avec détection du biais de position (un juge qui répond toujours « image 1 »).
- Le prompt ne dit jamais laquelle est l'ancienne. Persona : un guitariste à un mètre de l'écran, mains occupées.
- Il n'est appelé que sur les captures dont plus de 2 % des pixels ont changé, dans la limite de `--max-judge-calls`. Il passe par la passerelle (`GATEWAY_URL`, clé factice) : la vraie clé Mistral ne quitte pas la passerelle.
- Son avis est **consultatif** : il ne bloque rien. Un verdict « la référence est meilleure » génère un brouillon de régression, à vérifier sur la capture.

## Limites à connaître

- **Électron, Playwright et le juge n'ont pas été éprouvés dans ton conteneur Docker.** Ici : Electron 44.4.3 réel sous Xvfb piloté par `playwright-core` 1.56.0, 12 captures identiques d'une exécution à l'autre. Pas de démon Docker pour tester l'image `dev`.
- **Le juge n'a jamais parlé au vrai Mistral** : testé avec un faux modèle uniquement. À vérifier chez toi : que `mistral-large-4` accepte les images (`image_url` en data URL), `response_format: json_object`, et la qualité de ses verdicts. Commence par `--repetitions=1` sur une seule paire ; surveille le coût dans ta console.
- **Les références dépendent des polices** de la machine : génère-les dans le conteneur, compare-les dans le conteneur. Une référence créée sous Windows ne servira à rien ici.
- **Scènes statiques** : pas de défilement en cours, pas de décompte, pas de bandeau de mise à jour. Ajouter un scénario = ajouter un objet dans `scenarios.js`.
- **Ce n'est pas encore une boucle fermée** : les brouillons d'issues sont à relire, éditer et approuver (label `agent-ok`) par toi. Les garde-fous prévus (3 cycles maximum, arrêt sur régression, pas de cycle si les tests échouent) viendront quand tu auras vu quelques rapports réels.
- Les contrôles mesurent ce qu'ils savent mesurer. Un écran peut respecter tous les seuils et rester laid ou confus ; un seuil franchi ne remplace pas ton œil.
- **Zone protégée** : `scripts/visual/` et `visual-baseline/` ne peuvent pas être modifiés par l'agent (le runner refuse).
