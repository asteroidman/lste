/* ============================================================
   把真源 ../miniprogram 镜像到 ./miniprogram（DevTools 用）。
   —— 为什么需要它：微信开发者工具的编译器/文件监听**不跟随 Windows 目录联接
      （junction / reparse point）**，指向联接时会报
      「miniprogramRoot 指定的小程序目录下未找到 app.json」。
      所以 DevTools 项目里放一份**真实目录**，由本脚本从单一真源同步生成。

   真源永远是 ../miniprogram；这里只是它的只读镜像，不要在这里改代码。
   运行：npm run sync（npm test 也会先自动 sync 一次）。
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..', 'miniprogram');
const DST = path.resolve(HERE, '..', 'miniprogram');

if (!fs.existsSync(path.join(SRC, 'app.json'))) {
  console.error('[sync] 找不到真源 app.json：' + SRC + '（lste-wx 应与 miniprogram 同级）');
  process.exit(1);
}

/** 目标是不是链接（junction / symlink）：realpath 与自身不同即视为链接，避免递归删除真源 */
function isLink(p) {
  try {
    const real = fs.realpathSync.native(p);
    return real.toLowerCase() !== path.resolve(p).toLowerCase();
  } catch { return false; }
}

function rm(p) {
  const st = fs.lstatSync(p, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isSymbolicLink() || isLink(p)) fs.unlinkSync(p);      // 只删链接，不跟随
  else fs.rmSync(p, { recursive: true, force: true });
}

rm(DST);
fs.mkdirSync(DST, { recursive: true });
fs.cpSync(SRC, DST, { recursive: true });

const n = fs.readdirSync(path.join(DST, 'pages')).length;
console.log('[sync] ' + SRC + '  →  ' + DST + '（' + n + ' 个页面）');
