/* ============================================================
   PM2 配置：宝塔「PM2管理器 / Node 项目管理器」可直接指向本文件。
   启动：pm2 start deploy/ecosystem.config.js --update-env
   ============================================================ */
'use strict';

const path = require('path');

module.exports = {
  apps: [
    {
      name: 'rosenthal-web',
      script: 'server/index.js',
      cwd: path.resolve(__dirname, '..'),
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '300M',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '127.0.0.1',     // 只监听本机，由 Nginx 反代
      },
      out_file: path.resolve(__dirname, '..', 'logs', 'out.log'),
      error_file: path.resolve(__dirname, '..', 'logs', 'error.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
