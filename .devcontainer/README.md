# Environnement de développement (VS Code + Docker + Mistral Vibe)

Deux conteneurs, lancés ensemble par VS Code :

```
Windows 10 ── Docker Desktop (WSL2)
   ├─ dev              Node 22, Mistral Vibe, ton code (/workspaces/cantoria)
   │                    └─ parle uniquement à ──▶ mistral-gateway:8080
   └─ mistral-gateway  Passerelle sans dépendance (Node) : seul service qui connaît la vraie clé
                        └─ relaie vers https://api.mistral.ai
```

**Choix de sécurité**
- La vraie clé Mistral vit sur ton hôte (`.devcontainer/.env`) et dans le conteneur `mistral-gateway`. Le conteneur `dev` reçoit une clé factice (`via-passerelle`).
- **Le fichier `.devcontainer/.env` est masqué dans le conteneur `dev`** par un montage `/dev/null` : il y apparaît vide. Sans ce masque, il serait lisible depuis le dossier du projet monté, et n'importe quel test lancé par l'agent pourrait l'afficher (démontré avec le vrai Vibe). `post-create.sh` vérifie ce masque et affiche une alerte s'il n'est pas appliqué.
- La passerelle n'accepte que `POST /v1/chat/completions` et `GET /v1/models`, peut limiter les modèles autorisés et plafonne les requêtes par heure (anti-boucle). Elle ne journalise ni prompts, ni en-têtes, ni clé.
- Aucun port n'est publié sur l'hôte ; capacités Linux supprimées ; `no-new-privileges`.

## Mise en place

1. **Cloner le dépôt dans WSL** (`~/cantoria`), pas sous `C:\`. Dans Docker Desktop : *Settings → Resources → WSL integration* activée pour ta distribution.
2. **Créer ta clé Mistral dédiée** (console Mistral, clé révocable, avec une limite de dépense si ton compte en propose), puis :
   ```bash
   cp .devcontainer/.env.example .devcontainer/.env
   # renseigne MISTRAL_API_KEY dans .devcontainer/.env
   ```
   Le fichier est ignoré par Git.
3. **Ouvrir dans VS Code** : `code .` depuis WSL puis **Dev Containers: Reopen in Container**. La première construction est longue (image, Electron, dépendances).
4. À la fin, `post-create.sh` vérifie le masque du `.env`, installe la configuration de Vibe, lance `npm run check` et `npm test`, puis liste les modèles que ta clé peut utiliser. **Vérifie que `mistral-large-4` y figure.** Sinon, corrige le champ `name` de `[[models]]` dans `.devcontainer/vibe/config.toml`.
5. Dans un terminal du conteneur : `vibe`. À la première ouverture, accepte la confiance du dossier. Si Vibe propose son assistant de configuration, garde la clé de l'environnement : la configuration est déjà fournie.
6. **Pour faire travailler l'agent sur des issues GitHub** (authentification, label d'approbation, protection de `main`) : voir `docs/agent/README.md`.

## Modèles

| Alias (dans `/model`) | Modèle | Raisonnement | Usage |
|---|---|---|---|
| `large-4` | `mistral-large-4` | `reasoning_effort: none` (rapide) | par défaut |
| `large-4-think` | `mistral-large-4` | `reasoning_effort: high` (plus lent, plus de tokens) | tâches difficiles |

Vérifié avec Vibe 2.26.1 : Vibe envoie bien `model`, `reasoning_effort` et la clé factice, et calcule le coût avec les prix du fichier. **À confirmer de ton côté** : que l'API accepte `reasoning_effort` pour Large 4 (sinon une erreur 400 le mentionne ; voir le commentaire dans `config.toml`), les prix (ils viennent d'un article tiers) et la fenêtre de contexte (sources discordantes).

### Changer de modèle sans reconstruire
- **Entre les alias existants** : `/model` dans Vibe.
- **Modifier ou ajouter un modèle** : édite `.devcontainer/vibe/config.toml`, puis applique-le sans rebuild :
  ```bash
  install -D -m 644 .devcontainer/vibe/config.toml "$VIBE_HOME/config.toml"
  ```
  puis relance `vibe` (la copie se refait aussi à chaque démarrage du conteneur). Si tu as renseigné `GATEWAY_ALLOWED_MODELS`, ajoute-y le nouveau modèle puis recrée la passerelle (variable lue au démarrage), depuis un terminal WSL hors du conteneur :
  ```bash
  docker restart $(docker ps -aq --filter label=com.docker.compose.service=mistral-gateway)
  ```
  Une modification de `.devcontainer/.env` demande de **recréer** le conteneur (**Dev Containers: Rebuild Container**) : un simple redémarrage ne relit pas les variables.

## Limites à connaître

- **Pas d'interface graphique dans le conteneur** : `npm start` n'y ouvre pas la fenêtre Electron. Les tests (jsdom) et `npm run check` fonctionnent ; Xvfb et les bibliothèques Electron servent à la boucle visuelle (`npm run visual`, voir `docs/visual/README.md` ; Electron y est lancé avec `--no-sandbox`). Pour voir l'application, lance-la hors conteneur.
- **Pas de build Windows ou macOS ici** : GitHub Actions produit les installateurs.
- **La liste blanche de commandes de Vibe n'est pas un bac à sable.** L'agent peut lancer `npm test` et `node --test`, donc exécuter du JavaScript qu'il écrit : tout fichier lisible par l'utilisateur du conteneur est lisible par lui. D'où le masque du `.env`.
- **Sorties réseau non filtrées** : le conteneur `dev` peut joindre Internet. Avant de laisser des agents tourner sans surveillance, ajoute un pare-feu de sortie (non configuré par défaut : je n'ai pas pu le tester ici). Il demande les capacités `NET_ADMIN` et `NET_RAW`, à retirer du `cap_drop` du service `dev`.
- **Jeton GitHub** : s'il est stocké dans le conteneur (`gh auth login`), du code exécuté par l'agent peut le lire. Utilise un jeton limité à ce seul dépôt et protège `main` (voir `docs/agent/README.md`).
- **Masque du `.env` non testé sous Docker Desktop** : je n'ai pas de démon Docker ici. Le contrôle de `post-create.sh` te le dira ; tu peux le revérifier avec `wc -c .devcontainer/.env` dans le conteneur (résultat attendu : `0`).

## Dépannage

| Symptôme | Piste |
|---|---|
| `Copie .devcontainer/.env.example vers …` à l'ouverture | Le fichier `.devcontainer/.env` manque ou `MISTRAL_API_KEY` est vide. |
| ALERTE « .devcontainer/.env est lisible » dans `post-create.sh` | Le masque n'est pas appliqué : **Dev Containers: Rebuild Container**, puis `wc -c .devcontainer/.env` (attendu : 0). Ne lance pas d'agent avant. |
| La passerelle ne répond pas | Depuis un terminal WSL hors du conteneur : `docker logs $(docker ps -aq --filter label=com.docker.compose.service=mistral-gateway)`. |
| `mistral-large-4` absent de la liste des modèles | Mauvais identifiant ou modèle non ouvert à ton compte : corrige `name` dans `config.toml`. |
| Erreur 400 mentionnant `reasoning_effort` | Voir le commentaire de `config.toml` (`thinking = "off"`). |
| Erreur 401 / 403 | 401 : clé Mistral refusée (vérifie `.env`, puis recrée le conteneur). 403 : modèle ou route refusée par la passerelle (`GATEWAY_ALLOWED_MODELS`). |
| Erreur 429 | Plafond de requêtes par heure de la passerelle (`GATEWAY_MAX_REQUESTS_PER_HOUR`) ou limite de ton compte Mistral. |
| `error mounting … : no such file or directory` | Montage périmé de Docker Desktop : **Dev Containers: Rebuild Container**. La passerelle monte un dossier (pas un fichier) pour l'éviter. |
| `bad interpreter` / `\r` | Fins de ligne CRLF : vérifie `.gitattributes` et re-clone dans WSL. |
| `permission denied` inattendu | Retire temporairement `cap_drop` et `no-new-privileges` du service `dev` pour identifier la cause. |

## Chaîne d'approvisionnement
- **Vibe** est épinglé (`VIBE_VERSION=2.26.1`), installé avec `uv` (épinglé aussi) ; ses mises à jour automatiques sont coupées dans `config.toml`. Pour mettre à jour : change la valeur dans le `Dockerfile` et reconstruis.
- **Passerelle** : aucune dépendance (Node seul). L'image `node:22-alpine` n'est pas épinglée par digest : épingle-la (`GATEWAY_IMAGE`) après vérification pour un usage durable.
- **Télémétrie** de Vibe désactivée (`enable_telemetry`, `enable_otel`, `enable_update_checks`, `enable_connectors`).
