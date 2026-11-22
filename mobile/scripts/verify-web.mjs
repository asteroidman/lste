/* 构建前的网页资源校验：与单文件产物一致、无外链、含打印容器与引擎标记。 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.resolve(root, 'www', 'index.html');
const single = path.resolve(root, '..', 'single', '罗森塔尔.html');

if (!fs.existsSync(web)) throw new Error('缺少 www/index.html，先运行 npm run web');
const html = fs.readFileSync(web, 'utf8');
if (fs.existsSync(single) && Buffer.compare(fs.readFileSync(web), fs.readFileSync(single)) !== 0) {
  throw new Error('www/index.html 与 single/罗森塔尔.html 不一致，请重新 npm run web');
}
const checks = [
  [/https?:\/\//, '出现外链'],
  [/<script\s+src=/i, '出现外部脚本'],
  [/\bfetch\(|XMLHttpRequest|sendBeacon|importScripts/, '出现网络调用'],
];
for (const [re, msg] of checks) if (re.test(html)) throw new Error(msg);
if (!html.includes('id="print-root"')) throw new Error('缺少打印容器');
if (!html.includes('__req("./store.js")')) throw new Error('缺少内联引擎');
console.log('网页资源校验通过：单文件同源 · 零外链 · 零网络调用');
