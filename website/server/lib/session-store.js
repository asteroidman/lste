/* ============================================================
   website · server/lib/session-store.js
   会话存 MySQL（express-mysql-session）。仅在配了 MySQL 时加载。
   ============================================================ */
'use strict';

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

function createMysqlSessionStore(dbConfig) {
  return new MySQLStore({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    createDatabaseTable: true,
    charset: 'utf8mb4',
  });
}

module.exports = { createMysqlSessionStore };
