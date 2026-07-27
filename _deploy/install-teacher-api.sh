#!/bin/bash
# 腾讯云 teacher-api 生产安装（跳过 Puppeteer 下载 Chrome，避免 npm install 失败）
set -euo pipefail

APP_DIR="${1:-/var/teacher-api}"
cd "$APP_DIR"

export PUPPETEER_SKIP_DOWNLOAD=1
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

echo "==> npm install (ignore postinstall scripts)..."
npm install --omit=dev --ignore-scripts

echo "==> 确保 DOCX 导入依赖..."
npm install omml2mathml@1.3.0 mathml-to-latex@1.5.0 --omit=dev --ignore-scripts --no-audit --no-fund 2>/dev/null || true

echo "==> 校验 docx-import 模块..."
node --input-type=module -e "
import('./api/teacher/book/docx-import.js')
  .then(() => console.log('docx-import module OK'))
  .catch((e) => { console.error('docx-import FAIL:', e.message); process.exit(1) })
"

echo "==> 重启 PM2..."
pm2 restart teacher-api || pm2 start server.js --name teacher-api
sleep 2
pm2 logs teacher-api --lines 12 --nostream | grep -E 'docx-import|Failed|Teacher API' || true

echo "==> 接口探测..."
curl -s -o /tmp/docx-test.json -w 'HTTP:%{http_code}\n' \
  -X POST http://127.0.0.1:3001/api/teacher/book/docx-import \
  -H 'Content-Type: application/json' \
  -d '{"docxBase64":"","fileName":"test.docx"}'
cat /tmp/docx-test.json
echo
