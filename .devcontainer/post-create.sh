#!/usr/bin/env bash
# Exécuté une fois à la création du conteneur de dev.
set -euo pipefail

cd "$(dirname "$0")/.."

git config --global --add safe.directory "$PWD"

echo "==> Contrôle : la clé Mistral ne doit pas être lisible dans ce conteneur"
if [ -s .devcontainer/.env ]; then
  echo "ALERTE : .devcontainer/.env est lisible ici (non vide). Le masque /dev/null du docker-compose.yml"
  echo "  n'est pas appliqué : un test lancé par l'agent pourrait lire ta clé Mistral."
  echo "  Recrée le conteneur (Dev Containers: Rebuild Container) et vérifie : wc -c .devcontainer/.env  -> 0"
else
  echo "OK : .devcontainer/.env est vide dans le conteneur."
fi

echo "==> Configuration de Vibe"
install -D -m 644 .devcontainer/vibe/config.toml "${VIBE_HOME:-$HOME/.vibe}/config.toml"
echo "Vibe $(vibe --version 2>/dev/null || echo 'introuvable')"

echo "==> Installation des dépendances"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> Vérifications du projet"
npm run check
npm test

echo "==> Passerelle Mistral"
ready=0
for _ in $(seq 1 30); do
  if curl -fsS -m 3 "${GATEWAY_URL}/healthz" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done

if [ "$ready" -eq 1 ]; then
  echo "Passerelle joignable. Modèles Mistral visibles avec ta clé :"
  if models=$(curl -fsS -m 15 "${GATEWAY_URL}/v1/models" 2>/dev/null); then
    echo "$models" | jq -r '.data[].id' | sort -u | sed 's/^/  - /'
    if ! echo "$models" | jq -e '.data[] | select(.id == "mistral-large-4")' >/dev/null 2>&1; then
      echo "ATTENTION : « mistral-large-4 » n'est pas dans cette liste."
      echo "  Corrige le champ name de [[models]] dans .devcontainer/vibe/config.toml, puis relance le conteneur."
    fi
  else
    echo "  (liste indisponible : clé refusée ou fournisseur injoignable. Voir : docker logs <conteneur mistral-gateway>)"
  fi
else
  echo "ATTENTION : la passerelle ne répond pas. Depuis un terminal WSL hors du conteneur :"
  echo "  docker logs \$(docker ps -aq --filter label=com.docker.compose.service=mistral-gateway)"
fi

echo "==> Prêt. Lance « vibe » dans un terminal (accepte la confiance du dossier à la première ouverture)."
