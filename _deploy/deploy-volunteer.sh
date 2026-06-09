#!/bin/bash
# 腾讯云部署志愿填报 API（v5：grep+head/tail 插入，无 sed 转义问题）
# 用法：cd /var/teacher-api && bash ~/deploy-volunteer.sh
set -e

WORK="${WORK:-/var/teacher-api}"
BASE="https://ghfast.top/https://raw.githubusercontent.com/cuifujiang-code/huqiyunshiai/main/teacher-api"

cd "$WORK"
echo ">>> 工作目录: $(pwd)"

echo ">>> [1/5] 备份"
cp -a server.js "server.js.bak.$(date +%Y%m%d%H%M%S)"

echo ">>> [2/5] 下载核心文件"
mkdir -p server/batch knowledge-base/volunteer-filling

curl --globoff -fsSL "${BASE}/server/volunteerEngine.js" -o server/volunteerEngine.js
echo "  ✅ server/volunteerEngine.js"

curl --globoff -fsSL "${BASE}/server/batch/volunteerApi.js" -o server/batch/volunteerApi.js
echo "  ✅ server/batch/volunteerApi.js"

curl --globoff -fsSL "${BASE}/knowledge-base/volunteer-filling/rules-spec.md" \
  -o knowledge-base/volunteer-filling/rules-spec.md 2>/dev/null && echo "  ✅ rules-spec.md" || echo "  ⚠️ rules-spec.md 跳过"

echo ">>> [3/5] 注入 server.js 路由"

inject_import() {
  if grep -q "volunteerApi" server.js; then
    echo "  ✅ import 已存在"
    return
  fi
  local line
  line=$(grep -n "const photoSearch = await safeImport" server.js | head -1 | cut -d: -f1)
  if [ -z "$line" ]; then
    echo "  ❌ 找不到 photoSearch import 行"; exit 1
  fi
  {
    head -n "$line" server.js
    echo "const volunteerApi = await safeImport('./server/batch/volunteerApi.js', 'volunteer')"
    tail -n +$((line + 1)) server.js
  } > server.js.tmp
  mv server.js.tmp server.js
  echo "  ✅ import 注入成功"
}

inject_routes() {
  if grep -q "/api/volunteer/generate" server.js; then
    echo "  ✅ 路由已存在"
    return
  fi
  local line
  line=$(grep -n "app.all('/api/student/photo-search', photoSearch)" server.js | head -1 | cut -d: -f1)
  if [ -z "$line" ]; then
    echo "  ❌ 找不到 photo-search 路由行"; exit 1
  fi
  {
    head -n "$line" server.js
    cat << 'ROUTES_EOF'

// 高考志愿填报
app.all('/api/volunteer/generate', volunteerApi)
app.all('/api/volunteer/schemes', volunteerApi)
app.all('/api/volunteer/scheme/:id', volunteerApi)
ROUTES_EOF
    tail -n +$((line + 1)) server.js
  } > server.js.tmp
  mv server.js.tmp server.js
  echo "  ✅ 路由注入成功"
}

inject_import
inject_routes

echo ">>> [4/5] 安装依赖并重启"
npm install --omit=dev
pm2 restart teacher-api 2>/dev/null || pm2 start server.js --name teacher-api --cwd "$WORK"
pm2 save
sleep 3

echo ">>> [5/5] 验证"
ss -tlnp | grep 3001 && echo "✅ 3001 监听中" || { echo "❌ 3001 未监听"; exit 1; }

curl -sf http://127.0.0.1:3001/api/batch/health | head -c 400; echo ""

RESP=$(curl -sf -X POST http://127.0.0.1:3001/api/volunteer/generate \
  -H "Content-Type: application/json" \
  -d '{"userId":"deploy-test","province":"浙江","subjectType":"物理类","subjects":["物理"],"rank":30000,"intendedMajors":["计算机"]}')

echo "$RESP" | head -c 600; echo ""

if echo "$RESP" | grep -q '"success":true'; then
  echo "🎉 部署成功"
else
  echo "⚠️ 未返回 success:true，检查 .env 中 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
  pm2 logs teacher-api --lines 15 --nostream
  exit 1
fi
