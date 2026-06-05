#!/bin/bash
# 在腾讯云 /var/teacher-api 执行：bash scripts/recover-server.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== 当前 server.js 摘要 ==="
head -4 server.js
if grep -q 'startServer\|/api/batch/\*\|:group' server.js 2>/dev/null; then
  echo "ERROR: server.js 仍含旧通配符或 sed 残留，请先用正确文件覆盖后再运行本脚本"
  exit 1
fi
pm2 delete teacher-api teacher 2>/dev/null || true
pm2 start server.js --name teacher-api --cwd "$(pwd)"
pm2 save
sleep 2
echo "=== 端口 ==="
ss -tlnp | grep 3001 || { echo "3001 未监听"; pm2 logs teacher-api --lines 20 --nostream; exit 1; }
echo "=== 健康检查 ==="
curl -sf http://127.0.0.1:3001/api | head -c 200
echo
curl -sf http://127.0.0.1:3001/api/batch/health | head -c 400
echo
echo "OK"
