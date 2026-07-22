#!/usr/bin/env bash
# Deploy para produção (EC2 + Docker) — youdo-v2
#
# Uso:
#   ./scripts/deploy.sh web      # rebuild + recria container web
#   ./scripts/deploy.sh api      # sync fontes da API + restart (tsx recarrega)
#   ./scripts/deploy.sh schema   # schema.prisma -> prisma generate no container + restart API
#   ./scripts/deploy.sh all      # schema + api + web
#
# Pré-requisito: chave SSH legível em /tmp/ev2key.pem
#   cp ~/Documents/eventos-v2-key.pem /tmp/ev2key.pem && chmod 600 /tmp/ev2key.pem

set -euo pipefail

KEY=/tmp/ev2key.pem
EC2=ec2-user@eventos.youdobrasil.com.br
SSH="ssh -i $KEY -o StrictHostKeyChecking=no"
REMOTE=/home/ec2-user/youdo-v2
API_URL=https://eventos.youdobrasil.com.br
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -r "$KEY" ]; then
  echo "ERRO: $KEY não encontrado. Rode:"
  echo "  cp ~/Documents/eventos-v2-key.pem /tmp/ev2key.pem && chmod 600 /tmp/ev2key.pem"
  exit 1
fi

MODE="${1:-}"
[ -z "$MODE" ] && { echo "Uso: $0 web|api|schema|all"; exit 1; }

sync_sources() {
  echo "==> rsync de TODOS os fontes para o host EC2 (evita build com arquivo velho)"
  rsync -az --delete -e "$SSH" "$ROOT/apps/web/src/"  "$EC2:$REMOTE/apps/web/src/"
  rsync -az --delete -e "$SSH" "$ROOT/apps/api/src/"  "$EC2:$REMOTE/apps/api/src/"
  rsync -az -e "$SSH" "$ROOT/apps/web/Dockerfile" "$ROOT/apps/web/next.config.js" "$EC2:$REMOTE/apps/web/" 2>/dev/null || true
  rsync -az -e "$SSH" "$ROOT/packages/db/prisma/schema.prisma" "$EC2:$REMOTE/packages/db/prisma/"
}

deploy_schema() {
  echo "==> Deploy do schema Prisma (docker cp + prisma generate v5.22 + restart API)"
  $SSH $EC2 "
    docker cp $REMOTE/packages/db/prisma/schema.prisma EVENTOS_V2-api:/app/packages/db/prisma/schema.prisma &&
    docker exec EVENTOS_V2-api node /app/node_modules/.pnpm/prisma@5.22.0/node_modules/prisma/build/index.js \
      generate --schema=/app/packages/db/prisma/schema.prisma &&
    docker restart EVENTOS_V2-api
  "
  echo "OK: schema aplicado. Lembre-se de rodar o ALTER TABLE no postgres se houver coluna nova."
}

deploy_api() {
  echo "==> Deploy da API (docker cp de todos os fontes + restart)"
  $SSH $EC2 "
    docker cp $REMOTE/apps/api/src/. EVENTOS_V2-api:/app/apps/api/src/ &&
    docker restart EVENTOS_V2-api &&
    sleep 5 && docker logs EVENTOS_V2-api --tail=3
  "
}

deploy_web() {
  echo "==> Build da imagem web NO EC2 (com NEXT_PUBLIC_API_URL correto) + recriação do container"
  $SSH $EC2 "
    docker image prune -f >/dev/null; docker builder prune -f >/dev/null
    cd $REMOTE &&
    docker build --build-arg NEXT_PUBLIC_API_URL=$API_URL \
      -t youdo-web:latest -f apps/web/Dockerfile . &&
    cd $REMOTE/docker &&
    docker compose -f docker-compose.prod.yml stop web &&
    docker compose -f docker-compose.prod.yml rm -f web &&
    docker compose -f docker-compose.prod.yml up -d web &&
    sleep 6 && docker logs EVENTOS_V2-web 2>&1 | grep -m1 'Ready'
  "
  echo "==> Verificando que o bundle aponta para $API_URL"
  $SSH $EC2 "docker exec EVENTOS_V2-web sh -c 'grep -rlo \"eventos.youdobrasil.com.br\" /app/apps/web/.next/static/chunks/ | head -1'" \
    || { echo 'ERRO: bundle sem a URL de produção — build arg não foi aplicado!'; exit 1; }
}

git_check() {
  cd "$ROOT"
  if [ -n "$(git status --porcelain)" ]; then
    echo ""
    echo "AVISO: há mudanças não commitadas. Depois do deploy, commit + push para manter o GitHub em dia:"
    echo "  git add -A && git commit -m 'sua mensagem' && git push"
  fi
}

sync_sources
case "$MODE" in
  web)    deploy_web ;;
  api)    deploy_api ;;
  schema) deploy_schema ;;
  all)    deploy_schema; deploy_api; deploy_web ;;
  *) echo "Modo inválido: $MODE (use web|api|schema|all)"; exit 1 ;;
esac
git_check
echo ""
echo "✓ Deploy '$MODE' concluído."
