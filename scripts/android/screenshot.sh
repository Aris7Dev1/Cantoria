#!/usr/bin/env bash
# Capture d'écran de l'app Cantoria sur l'émulateur/device Android (issue #54).
# Usage : scripts/android/screenshot.sh [nom-sortie]
# Prérequis : emulator/device connecté (adb devices) et app installée.
set -euo pipefail

NAME="${1:-capture-$(date +%Y%m%d-%H%M%S)}"
OUT_DIR="$(dirname "$0")/../../visual-out/android"
mkdir -p "$OUT_DIR"

if ! command -v adb >/dev/null 2>&1; then
  echo "Erreur : adb introuvable. Installe les platform-tools Android." >&2
  exit 1
fi

if [ -z "$(adb devices | grep -v '^List' | grep 'device$')" ]; then
  echo "Erreur : aucun appareil connecté. Lance l'émulateur (adb devices pour vérifier)." >&2
  exit 1
fi

adb exec-out screencap -p > "$OUT_DIR/$NAME.png"
echo "Capture : $OUT_DIR/$NAME.png"
