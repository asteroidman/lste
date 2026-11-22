/* ============================================================
   website · server/index.js
   入口：选数据源（MySQL 或内存）→ 建应用 → 监听。
   ============================================================ */
'use strict';

const config = require('./config');
const createApp = require('./app');
const { createMemoryRepo } = require('./lib/repo-memory');

let repo;
let sessionStore;

if (config.useMysql) {
  const { createMysqlRepo } = require('./lib/repo-mysql');
  const { createMysqlSessionStore } = require('./lib/session-store');
  repo = createMysqlRepo(config.db);
  sessionStore = createMysqlSessionStore(config.db);
  console.log('[rosenthal] 数据源：MySQL (' + config.db.database + '@' + config.db.host + ')');
} else {
  repo = createMemoryRepo();
  console.warn('[rosenthal] 未配置 MySQL（DB_HOST/DB_USER/DB_NAME）→ 使用内存数据源；' +
               '进程重启即清空，仅供本地开发。生产请在 .env 里配好 MySQL。');
}

const app = createApp({ repo, sessionStore });

app.listen(config.port, config.host, () => {
  console.log('[rosenthal] 网页版已启动：http://' + config.host + ':' + config.port +
    '（NODE_ENV=' + config.nodeEnv + '；Nginx 反代请指向这里）');
});
