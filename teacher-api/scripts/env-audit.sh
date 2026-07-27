#!/bin/bash
# 腾讯云 OrcaTerm：bash /var/teacher-api/scripts/env-audit.sh
# 只显示「已配置 / 缺失」，不打印密钥内容
set -e
cd /var/teacher-api

for f in .env .env.local; do
  test -f "$f" && echo "找到 $f" || echo "未找到 $f（可选）"
done

check() {
  local name="$1"
  local required="$2"
  local val
  val="$(grep -h "^${name}=" .env .env.local 2>/dev/null | tail -1 | cut -d= -f2- | tr -d ' \r')"
  if [ -n "$val" ]; then
    echo "✅ $name"
  elif [ "$required" = "must" ]; then
    echo "❌ $name（必填，缺失）"
    MISSING=1
  else
    echo "⚠️  $name（建议配置，当前缺失）"
  fi
}

echo ""
echo "========== 腾讯云 teacher-api 环境变量 =========="
MISSING=0
check SUPABASE_URL must
check SUPABASE_SERVICE_ROLE_KEY must
check DEEPSEEK_API_KEY must
check TEACHER_API_URL must
check DECOMPOSE_PROCESS_URL suggest
check HEALTH_API_ROOT_URL suggest
check ALIBABA_ACCESS_KEY_ID suggest
check ALIBABA_ACCESS_KEY_SECRET suggest
check BATCH_WORKER_SECRET suggest
check DOUBAO_API_KEY optional
check QIANWEN_API_KEY optional

echo ""
echo "========== 服务状态 =========="
pm2 describe teacher-api >/dev/null 2>&1 && pm2 status teacher-api | grep teacher-api || echo "❌ PM2 未运行 teacher-api"
curl -sf http://127.0.0.1:3001/api/batch/health >/dev/null && echo "✅ 本机 health 正常" || echo "❌ 本机 health 失败"

echo ""
if [ "$MISSING" = "1" ]; then
  echo "结论：有必填项缺失，请补全 /var/teacher-api/.env 后 pm2 restart teacher-api"
  exit 1
fi
echo "结论：必填项齐全。若功能仍异常，检查密钥是否有效、DeepSeek/阿里 OCR 余额。"
