#!/bin/bash
cd /var/teacher-api
mkdir -p server/batch
cp -f /root/server.js ./server.js
cp -f /root/batchHealthCheck.js ./server/batch/batchHealthCheck.js
touch .env
grep -q '^HEALTH_API_ROOT_URL=' .env && sed -i 's|^HEALTH_API_ROOT_URL=.*|HEALTH_API_ROOT_URL=http://127.0.0.1:3001/api|' .env || echo 'HEALTH_API_ROOT_URL=http://127.0.0.1:3001/api' >> .env
npm install pg
pm2 delete teacher-api 2>/dev/null
pm2 start server.js --name teacher-api --cwd /var/teacher-api
pm2 save
sleep 3
curl -s http://127.0.0.1:3001/api/batch/health
