/* ============================================================
   生成赞助兑换码：node tools/gen-code.js [数量]
   输出兑码与可直接执行的 MySQL INSERT 语句。
   本地开发也可把码写进环境变量 SEED_REDEEM_CODES（逗号分隔）。
   ============================================================ */
'use strict';

const { inviteCode } = require('../server/lib/secure');

const n = Math.max(1, Number(process.argv[2]) || 1);
for (let i = 0; i < n; i++) {
  const code = 'SP-' + inviteCode(6);
  console.log(code + '\t' +
    "INSERT INTO redeem_code (code, kind, `value`, used, created_at) VALUES ('" +
    code + "', 'sponsor_unlock', 1, 0, " + Date.now() + ');');
}
