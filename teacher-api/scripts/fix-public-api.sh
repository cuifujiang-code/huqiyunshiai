#!/bin/bash
# 修复：公网 api 子域 + 拆题「一直处理中」（内部回调走本机）
set -e
cd /var/teacher-api

echo ">>> 1) .env 内部回调改本机（解决拆题卡住）"
touch .env
for kv in \
  'TEACHER_API_URL=http://127.0.0.1:3001' \
  'DECOMPOSE_PROCESS_URL=http://127.0.0.1:3001/api/decompose-process' \
  'HEALTH_API_ROOT_URL=http://127.0.0.1:3001/api'
do
  key="${kv%%=*}"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${kv}|" .env
  else
    echo "$kv" >> .env
  fi
done

pm2 restart teacher-api
sleep 2

echo ">>> 2) 检查 Nginx"
if ! command -v nginx >/dev/null; then
  echo "未安装 nginx，请先在腾讯云装 nginx"
  exit 1
fi

sudo tee /etc/nginx/sites-available/teacher-api >/dev/null <<'NGINX'
server {
    listen 80;
    server_name api.huqiyunshiai.online;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 100m;
        proxy_read_timeout 300s;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/teacher-api /etc/nginx/sites-enabled/teacher-api
sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
sudo nginx -t
sudo systemctl reload nginx

echo ">>> 3) 验证"
curl -s http://127.0.0.1:3001/api/batch/health | head -c 200
echo ""
curl -s http://api.huqiyunshiai.online/api/batch/health 2>/dev/null | head -c 200 || curl -s http://127.0.0.1/api/batch/health -H "Host: api.huqiyunshiai.online" | head -c 200
echo ""
echo "完成。浏览器先试： http://api.huqiyunshiai.online/api/batch/health"
echo "若要用 https，再执行： sudo certbot --nginx -d api.huqiyunshiai.online"
