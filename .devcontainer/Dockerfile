# syntax=docker/dockerfile:1
# Environnement de développement de Cantoria : Node, Electron (tests), Mistral Vibe CLI.
FROM node:22-bookworm

# Versions épinglées pour des builds reproductibles. Pour changer l'une d'elles :
# modifier la valeur puis « Dev Containers: Rebuild Container ».
ARG VIBE_VERSION=2.26.1
ARG UV_VERSION=0.11.32
ARG PYTHON_VERSION=3.13

# Outils de base + bibliothèques requises par Electron (tests headless sous Xvfb).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ripgrep jq less procps xvfb xauth python3-pip \
      libgtk-3-0 libnss3 libasound2 libgbm1 libxss1 libxtst6 \
      libatk-bridge2.0-0 libdrm2 libxkbcommon0 libcups2 \
 && rm -rf /var/lib/apt/lists/*

# Vibe demande Python >= 3.12 (Debian 12 fournit 3.11) : uv télécharge un Python récent
# et installe Vibe dans un environnement isolé. Les dépendances de Vibe sont épinglées par ses
# propres métadonnées.
RUN pip install --no-cache-dir --break-system-packages "uv==${UV_VERSION}"

USER node
ENV UV_TOOL_BIN_DIR=/home/node/.local/bin \
    UV_PYTHON_INSTALL_DIR=/home/node/.local/share/uv/python \
    PATH=/home/node/.local/bin:${PATH}
RUN uv tool install --python ${PYTHON_VERSION} "mistral-vibe==${VIBE_VERSION}" \
 && vibe --version

# Dossiers de travail avec le bon propriétaire (les volumes nommés montés dessus en héritent).
RUN mkdir -p /home/node/.vibe /home/node/agent-worktrees /home/node/agent-logs
USER root
RUN mkdir -p /workspaces/cantoria && chown -R node:node /workspaces/cantoria
USER node

# Clé factice : la vraie clé reste dans le service « mistral-gateway ».
ENV MISTRAL_API_KEY=via-passerelle \
    VIBE_HOME=/home/node/.vibe

WORKDIR /workspaces/cantoria
