#!/bin/bash
# v6：先还原备份，再安全注入（校验行号非空 + import 必须在 route 之前）
set -e
WORK="${WORK:-/var/teacher-api}"
BASE="https://ghfast.top/https://raw.githubusercontent.com/cuifujiang-code/huqiyunshiai/main/teacher-api"
cd "$WORK"

echo ">>> [1/6] 还原 server.js"
# 优先用最新备份（注入前自动备份的那份）
BAK=$(ls -t server.js.bak.* 2>/dev/null | head -1)
if [ -n "$BAK" ]; then
  cp "$BAK" server.js
  echo "  ✅ 已还原: $BAK"
else
  curl --globoff -fsSL "${BASE}/server.js" -o server.js
  echo "  ✅ 已从 GitHub 下载 server.js"
fi

echo ">>> [2/6] 下载志愿模块"
mkdir -p server/batch
curl --globoff -fsSL "${BASE}/server/volunteerEngine.js" -o server/volunteerEngine.js
curl --globoff -fsSL "${BASE}/server/batch/volunteerApi.js" -o server/batch/volunteerApi.js
echo "  ✅ 模块文件就绪"

echo ">>> [3/6] 清理旧注入（若存在）"
# 删除之前错误注入的行
grep -v "volunteerApi\|/api/volunteer/" server.js > server.js.clean || true
mv server.js.clean server.js

echo ">>> [4/6] 注入 import（photoSearch 之后）"
LINE=$(grep -n "const photoSearch = await safeImport" server.js | head -1 | cut -d: -f1)
if [ -z "$LINE" ]; then echo "❌ 找不到 photoSearch 行，server.js 结构异常"; exit 1; fi
{
  head -n "$LINE" server.js
  echo "const volunteerApi = await safeImport('./server/batch/volunteerApi.js', 'volunteer')"
  tail -n +$((LINE + 1)) server.js
} > server.js.tmp && mv server.js.tmp server.js
echo "  ✅ import 在第 $((LINE + 1)) 行"

echo ">>> [5/6] 注入路由（photo-search 路由之后）"
LINE=$(grep -n "photo-search" server.js | grep "app.all" | head -1 | cut -d: -f1)
if [ -z "$LINE" ]; then echo "❌ 找不到 photo-search 路由行"; exit 1; fi
{
  head -n "$LINE" server.js
  cat << 'EOF'

// 高考志愿填报
app.all('/api/volunteer/generate', volunteerApi)
app.all('/api/volunteer/schemes', volunteerApi)
app.all('/api/volunteer/scheme/:id', volunteerApi)
EOF
  tail -n +$((LINE + 1)) server.js
} > server.js.tmp && mv server.js.tmp server.js
echo "  ✅ 路由在第 $((LINE + 1)) 行后"

echo ">>> 结构校验"
IMPORT_LINE=$(grep -n "const volunteerApi" server.js | head -1 | cut -d: -f1)
ROUTE_LINE=$(grep -n "/api/volunteer/generate" server.js | head -1 | cut -d: -f1)
TOTAL=$(wc -l < server.js)
echo "  import 行: $IMPORT_LINE, 路由行: $ROUTE_LINE, 总行数: $TOTAL"
if [ "$IMPORT_LINE" -ge "$ROUTE_LINE" ]; then
  echo "❌ import 必须在路由之前，结构仍错误"; exit 1
fi
if [ "$TOTAL" -lt 100 ]; then
  echo "❌ server.js 行数过少($TOTAL)，可能仍损坏"; exit 1
fi
echo "  ✅ 结构正确"

echo ">>> [6/6] 重启并验证"
npm install --omit=dev 2>/dev/null || true
pm2 restart teacher-api
sleep 4

curl -sf http://127.0.0.1:3001/api/batch/health | head -c 200; echo ""
RESP=$(curl -sf -X POST http://127.0.0.1:3001/api/volunteer/generate \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","province":"浙江","subjectType":"物理类","subjects":["物理"],"rank":30000,"intendedMajors":["计算机"]}')
echo "$RESP" | head -c 500; echo ""
echo "$RESP" | grep -q '"success":true' && echo "🎉 修复成功" || { pm2 logs teacher-api --lines 20 --nostream; exit 1; }
