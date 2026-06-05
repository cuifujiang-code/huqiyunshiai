#!/bin/bash
# 在腾讯云执行：cd /var/teacher-api && bash scripts/install-server.sh
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="$(pwd)/server.js"
BACKUP="server.js.bak.$(date +%Y%m%d%H%M%S)"
if grep -q 'Handler missing\|batch-health\|Route registered' server.js 2>/dev/null; then
  echo "检测到旧版 server.js，正在备份并下载仓库版本..."
  cp -a server.js "$BACKUP"
fi
curl -fsSL "https://raw.githubusercontent.com/cuifujiang-code/huqiyunshiai/main/teacher-api/server.js" -o "$TARGET"
grep -q 'batch/health' "$TARGET" || { echo "下载的 server.js 不正确"; exit 1; }
grep -q 'Handler missing' "$TARGET" && { echo "仍是旧文件"; exit 1; } || true
npm install --omit=dev
pm2 delete teacher-api 2>/dev/null || true
pm2 start server.js --name teacher-api --cwd "$(pwd)"
pm2 save
sleep 2
curl -sf "http://127.0.0.1:3001/api/batch/health" | head -c 500
echo
echo "若上方为 JSON（含 checks），则安装成功。备份: $BACKUP"
