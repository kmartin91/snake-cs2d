#!/usr/bin/env bash
# Déploie CSnake sur le VPS : synchronise le code dans /opt/csnake/app puis reconstruit le conteneur.
set -euo pipefail
HOST="${CSNAKE_HOST:-deploy@57.129.171.147}"
DIR=/opt/csnake
cd "$(dirname "$0")/.."

rsync -az --delete \
  --include='/package.json' --include='/package-lock.json' --include='/server.js' \
  --include='/Dockerfile' --include='/.dockerignore' \
  --include='/server/***' --include='/public/***' \
  --exclude='*' ./ "$HOST:$DIR/app/"
rsync -az deploy/docker-compose.yml "$HOST:$DIR/docker-compose.yml"

ssh "$HOST" "cd $DIR && sudo docker compose up -d --build --remove-orphans && sudo docker image prune -f --filter label=app=csnake >/dev/null"

for i in $(seq 1 20); do
  if ssh "$HOST" "curl -fsS http://127.0.0.1:3210/health" >/dev/null 2>&1; then
    echo "CSnake est en ligne : https://csnake.kma.studio"
    exit 0
  fi
  sleep 2
done
echo "Le conteneur ne répond pas sur /health" >&2
exit 1
