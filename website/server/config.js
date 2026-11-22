/* ============================================================
   website · server/config.js
   读取环境变量（.env）。不填 DB_HOST/DB_USER 时走内存数据源，
   方便本地开发与测试；线上在宝塔里填 MySQL。
   ============================================================ */
'use strict';

require('dotenv').config();

const env = process.env;

const config = {
  port: Number(env.PORT || 3000),
  /* 线上让 Nginx 反代到 127.0.0.1:3000，不直接对外暴露 Node */
  host: env.HOST || '127.0.0.1',
  nodeEnv: env.NODE_ENV || 'development',
  sessionSecret: env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  bcryptRounds: Number(env.BCRYPT_ROUNDS || 10),
  /* 走 HTTPS 时设为 true（宝塔申请证书后）；纯 IP/HTTP 调试时保持 false，否则 cookie 发不出去 */
  cookieSecure: String(env.COOKIE_SECURE || '').toLowerCase() === 'true',
  db: {
    host: env.DB_HOST || '',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || '',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || '',
  },
};

// 配了 host + user + database 才认为要用 MySQL
config.useMysql = !!(config.db.host && config.db.user && config.db.database);

module.exports = config;
