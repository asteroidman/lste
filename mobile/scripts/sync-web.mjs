/* 把 single/罗森塔尔.html 逐字节复制成 Capacitor 的 webDir（www/index.html）。
   单文件版是唯一事实来源：改界面只动 single/src/*，不要手改 www/index.html。 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.resolve(root, '..', 'single', '罗森塔尔.html');
const dst = path.resolve(root, 'www', 'index.html');

if (!fs.existsSync(src)) throw new Error('找不到 ' + src + '，先运行 node single/build.mjs');
const buf = fs.readFileSync(src);
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, buf);
console.log('www/index.html ← single/罗森塔尔.html（' + buf.length + ' 字节）');
