#!/usr/bin/env bash
# 빌드 결과(standalone)를 로컬에서 실행: npm run build 후 사용
set -e
cd "$(dirname "$0")/.."
cp -r .next/static .next/standalone/.next/
[ -d public ] && cp -r public .next/standalone/ || true
set -a; . ./.env.local; set +a
# 이전에 띄운 서버 종료 (Next 서버의 프로세스 이름은 next-server)
pkill -f next-server 2>/dev/null && sleep 1 || true
cd .next/standalone && PORT=${PORT:-3100} HOSTNAME=${HOSTNAME:-127.0.0.1} exec node server.js
