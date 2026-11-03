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

La boucle elle-même ne crée rien sur GitHub, aucun code n'est modifié, aucune issue n'est labellisée : **tu lis, tu décides**. (Le Watchdog, plus bas, est l'étape qui file ensuite les brouillons en issues.)

## Utilisation

Dans le conteneur de développement :

```bash
npm install                                  # installe playwright-core (devDependency)
npm run visual                                # captures + contrôles + rapport (aucun appel au modèle)
npm run visual -- --update-baseline            # adopte les captures courantes comme référence (après relecture !)
npm run visual -- --judge --intent="agrandir les accords du lecteur"  # + juge A/B via la passerelle
```

Options : `--engine=electron|chromium` · `--themes=campfire,spotlight` · `--scenarios=library,player`  · `--out=visual-out` · `--baseline=visual-baseline` · `--repetitions=2` (par ordre) · `--max-judge-calls=24` · `--judge-model=mistral-large-4-0` · `--strict` (code 1 s'il y a des erreurs).

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
`VISION.md` dit « texte grand, contraste fort · sans chiffres. Les valeurs de `scripts/visual/thresholds.json` sont **proposées** pour une lecture à environ 1 m sur une fenêtre de 1280×820 : paroles ≥ 20 px, accords ≥ 18 px, contraste ≥ 7:1 dans le lecteur ; reste de l'interface ≥ 12 px, 4,5:1, commandes ≥ 32 px. Avec ces seuils, l'interface actuelle **échoue** (accords de 14,7 px, paroles de 18,9 px, contraste des accords à 4–6:1) : c'est un constat, pas une décision. Tu ajustes le fichier ; l'agent n'a pas le droit d'y toucher (sinon il poursait © réussir · en baissant les seuils).

## Le juge A/B

- A = référence, B = version courante, présentées **dans les deux ordres**, `repetitions` fois chacun, température 0.
- Le modèle répond en JSON strict (validé ; toute réponse hors format est écartée et compté).
- Verdict **retenu seuement si les deux ordres désignent la même image**. Sinon : « non concluant », avec détection du biais de position (un juge qui répond toujours « image 1 »).
- Le prompt ne dit jamais laquelle est l'ancienne. Persona : un guitariste à un mètre de l'Éwran, mains occupés.
- Il n'est appelé que sur les captures dont plus de 2 % des pixels ont changé, dans la limite de `--max-judge-calls`. Il passe par la passerelle (`GATEWAY_URL`, clé factice) : la vraie clé Mistral ne quitte pas la passerelle.
- Son avis est **consultatif** : il ne bloque rien. Un verdict « la référence est meilleure » génère un brouillon de régression, à vérifier sur la capture.

## Watchdog hebdomadaire (visual-watch.yml)

Le workflow `Visual watchdog` tourne chaque lundi 07:00 UTC sur `main` (et à la
demande, avec dry-run possible) :

```
boucle visuelle déterministe (captures Chromium, aucun appel IA)
   → visual-out/issues-drafts/ + report.md
explorateur IA (un but au hasard de explorer-goals.json, plafonds habituels)
   → rapport-exploration.md
        ▼
fileur — scripts/visual/file-issues.js
   - brouillons + rapport → issues GitHub label `explorer-proposition`
   - déduplication contre les issues ouvertes, plafond par run (--max, 5)
   - un seul rapport d'exploration ouvert par but (contre-pression)
   - le label `agent-ok` est REFUSÉ : l'approbation reste humaine
        ▼
rapport de run (GITHUB_STEP_SUMMARY, page « Summary » du run)
   - brouillons, but tiré, étapes/appels, frictions ou « néant », résultat du fileur
   - répond toujours, même sans rien à filer
        ▼
ton triage : relire, éditer, poser `agent-ok` → l'agent codeur prend le relais
```

Le juge A/B reste hors de cette passe (coût) : il garde sa place sur les PR.
Sans `MISTRAL_API_KEY`, l'explorateur est ignoré et la boucle déterministe
tourne quand même. Chaque run publie en outre un **rapport de run** dans le
résumé GitHub du run (`GITHUB_STEP_SUMMARY`) : sans lui, une exploration sans
friction et un échec silencieux de l'explorateur seraient indiscernables —
le rapport distingue les trois cas (explorateur désactivé, rapport absent,
rapport complet) et reprend le log du fileur.

## Limites à connaître

- **Électron, Playwright et le juge n'ont pas été éprouvés dans ton conteneur Docker.** Ici : Electron 44.4.3 réel sous Xvfb piloté par `playwright-core` 1.56.0, 12 captures identiques d'une exécution à l'autre. Pas de démon Docker pour tester l'image `dev`.
- **Le juge n'a jamais parlé au vaiHZ\ݜ؛
ʈȝ\ݰꈘ]٘ȝ[ș؝^[ٰꛙH[ڜ]Y[Y[݋ȰȝЪ\ڙڙ\Șڙ^ȝڈȜ]YHZ\ݜ؛[\ٙKMLXؙ\H\Ț[XYٜȊ[XYٗݜۘ[ș]HTӊKٜܛۜٗٛܛX]ȚܛۗۘڙXݘ]H]X[]0ꈙHٜȝٜٚXݜˈۛY[ؙH\ȘK\ٜ]][ۜόXݜȝ[وٝ[HZ\وȜݜݙZ[HH۰[܈HۛܛۙKH
ʓ\ȜЪYЪ\ؙٛ\ș0ꜙ[ٙ[݈\ȜۚXٜʊșHHXXښ[وș𪛰ꜙK[\ș[܈Hۛݙ[ٝ\ˈۛ\\ً[\ș[܈Hۛݙ[ٝ\ˈ[وЪYЪ\ؙٛHܰꐪYH۝\ȕڛٛݜțوٜݚ\؈0舜ڙ[ȚXڋH
ʔذꛙ\Ȝݘ]\]Y\ʊȎȜ\șH0Ꙛ[[Y[݈[Ș۝\܋\șH0ꘛۜK\șH؛ٙX]HHZ\و0舚۝\ˈZ۝]\ȝ[Ȝذꛘ\ڛȏHZ۝]\ȝ[țؚٝ[܈ؙ[؜ڛ܋ڜ؋H
ʓH۝XۙH\݈ٜ۰Ꙉ\țH؝ڙيʈ
ٚ]X˝ۜڙۛݜ˝ڜݘ[]؝ڋޛ[ۚ\ȘڋY\ܝ\ʈț\Șܛݚ[ۜș]؜ܝș]ڙ[ۙ[݈\Ț\ܝY\Ș^ܙ\˜ۜܚ][ۘ0舜ٛ\ً0Ꙛ]\ș]\۝]ٜȊXٛYٛ݋[ژ
H\ȝڋȓ\ș؜ٙKY۝\ȜЪ]ݜȊȘޘۙ\țX^[][K\ܰꝈݜȜЪYܙ\ܚ[ۋ\șHޘۙHڈ\ȝ\ݜȰꘚݙ[݊Hڙ[ٜ݈ۛ]X[وH]\؜ȝ݈]Y[]Y\Ȝ؜ܝȜЪY[˂ˈ
ʓH0ꙝ\X؝[ۈHڛ]\Ȝوؚ]\ȝ]وۜۘ[\𪊊Ȏȝ[و\ܝYHݝٜݙH]YHHٛۛ[Y\Ȝ]]0ꝜوًYڛ0Ꙉ]HݛȜݚ]؛݈8%ٙ؜ٙH\ȝ]ٜțܜșHژYًH\ȘۛݜЭ\țY\ݜ݈ٛو]IڛȜ؝݈ٛY\ݜٜˈ[Ȱꘜ؛Ȝ]]ٜܙXݙ\ȝݜț\ȜٝZ[ș]ٜݙ\țZY݈ۛٝ\Ȏȝ[ȜٝZ[ܘ[ؚHوٛ\Xو\ȝۈ1dڛH
ʖۛو۝0꙰ꙊʈȘ؜ڜ˝ڜݘ[؈]ڜݘ[X؜ٛ[ً؈و]]݈ٛ\ȰꝜو[ٚYڰ꜈\ț	ؙ݈ٛ
Hݛۙ\ȜٙݜيK