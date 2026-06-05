/** PM2 配置：cd /var/teacher-api && pm2 start ecosystem.config.cjs */
module.exports = {
  apps: [
    {
      name: 'teacher-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
}
