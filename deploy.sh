#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/leonardou92/GOBSoft.git"
APP_DIR="/opt/gobsoft"
BRANCH="${1:-main}"

echo "==> Verificando Docker y Compose..."
command -v docker >/dev/null 2>&1 || { echo "Docker no esta instalado."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 no esta disponible."; exit 1; }

if [ ! -d "$APP_DIR/.git" ]; then
  echo "==> Clonando repositorio en $APP_DIR..."
  sudo mkdir -p "$APP_DIR"
  sudo chown -R "$USER":"$USER" "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"

echo "==> Configurando remoto oficial..."
git remote set-url origin "$REPO_URL"

echo "==> Actualizando rama $BRANCH..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

if [ ! -f ".env" ]; then
  echo "==> Creando .env desde .env.example..."
  cp .env.example .env
  echo "IMPORTANTE: edita .env con secretos reales antes de produccion."
fi

echo "==> Levantando stack..."
docker compose pull
docker compose up -d --build

echo "==> Estado de contenedores:"
docker compose ps

echo "==> Deploy completado."
