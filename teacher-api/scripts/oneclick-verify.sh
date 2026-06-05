#!/bin/bash
# 腾讯云 OrcaTerm：整段复制粘贴执行即可
set -e
cd /var/teacher-api

echo ">>> [1/6] 备份"
cp -a server.js "server.js.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
test -f .env && cp -a .env ".env.bak.$(date +%Y%m%d%H%M%S)" || true

echo ">>> [2/6] 下载最新 server.js 与 health 检查（注意 -fsSL）"
curl -fsSL "https://raw.githubusercontent.com/cuifujiang-code/huqiyunshiai/main/teacher-api/server.js" -o server.js
curl -fsSL "https://raw.githubusercontent.com/cuifujiang-code/huqiyunshiai/main/teacher-api/server/batch/batchHealthCheck.js" -o server/batch/batchHealthCheck.js

grep -q "零通配符" server.js || { echo "❌ server.js 下载失败"; exit 1; }
grep -q "本机自检跳过 fetch" server/batch/batchHealthCheck.js || { echo "❌ batchHealthCheck.js 下载失败"; exit 1; }
echo "✅ 文件校验通过"

echo ">>> [3/6] 写入 HEALTH_API_ROOT_URL（不会清空整个 .env）"
touch .env
if grep -q '^HEALTH_API_ROOT_URL=' .env; then
  sed -i 's|^HEALTH_API_ROOT_URL=.*|HEALTH_API_ROOT_URL=http://127.0.0.1:3001/api|' .env
else
  echo 'HEALTH_API_ROOT_URL=http://127.0.0.1:3001/api' >> .env
fi

echo ">>> [4/6] 安装依赖并启动 PM2"
npm install pg --omit=dev 2>/dev/null || npm install pg
pm2 delete teacher-api 2>/dev/null || true
pm2 start server.js --name teacher-api --cwd /var/teacher-api
pm2 save

echo ">>> [5/6] 等待 3 秒..."
sleep 3

echo ">>> [6/6] 验证结果"
echo "---------- 端口 3001 ----------"
ss -tlnp | grep 3001 && echo "✅ 3001 正在监听" || echo "❌ 3001 未监听"

echo "---------- GET /api ----------"
curl -s http://127.0.0.1:3001/api
echo ""

echo "---------- 健康检查（本机）----------"
HEALTH=$(curl -s http://127.0.0.1:3001/api/batch/health)
echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"

if echo "$HEALTH" | grep -q '"status": "healthy"'; then
  echo ""
  echo "🎉 成功：本机 API 已 healthy，腾讯云 teacher-api 可用！"
elif echo "$HEALTH" | grep -q '"status": "degraded"'; then
  echo ""
  echo "⚠️  degraded：核心服务已起来，仅部分自检未通过（多数情况可先用）"
else
  echo ""
  echo "❌ 仍有问题，请把上面输出截图发技术支持"
fi

echo "---------- 公网（可选）----------"
curl -s --max-time 8 https://api.huqiyunshiai.online/api/batch/health | head -c 300 || echo "公网暂不通（需配 Nginx+域名，本机通即可开发）"
echo ""
