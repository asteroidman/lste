/* ============================================================
   罗森塔尔 · 单文件家庭版 · 构建脚本
   把 miniprogram 的规则引擎（templates/compat/store）+ 界面源码
   内联进一个 HTML 文件：lste/罗森塔尔.html。
   用法：node lste/build.mjs
   ============================================================ */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

/** CommonJS 微运行时：让小程序的 require/module.exports 在浏览器里原样工作 */
const RUNTIME = `\
"use strict";
const __mods = Object.create(null);
function __def(name, factory) { __mods[name] = { factory: factory, inst: null }; }
function __req(name) {
  const m = __mods[name];
  if (!m) throw new Error("module not found: " + name);
  if (m.inst) return m.inst.exports;
  const mod = { exports: {} };
  m.inst = mod;
  m.factory(__req, mod, mod.exports);
  return mod.exports;
}`;

function wrapCJS(name, code) {
  return `__def(${JSON.stringify(name)}, function (require, module, exports) {\n${code}\n});`;
}
function wrapIIFE(code) {
  return `(function () {\n${code}\n})();`;
}

export function build() {
  const css = read('src/style.css');
  const shell = read('src/shell.html');
  const app = read('src/app.js');
  const pin = read('src/pin.js');
  const print = read('src/print.js');

  const lib = [
    RUNTIME,
    wrapCJS('./templates.js', read('../miniprogram/utils/templates.js')),
    wrapCJS('./compat.js', read('../miniprogram/utils/compat.js')),
    wrapCJS('./store.js', read('../miniprogram/utils/store.js')),
    'const RosStore = __req("./store.js");',
    wrapIIFE(pin),
    wrapIIFE(print),
  ].join('\n');

  /* 内联安全检查：脚本里绝不能出现 </script>（会提前闭合标签） */
  for (const [label, code] of [['css', css], ['lib', lib], ['app', app]]) {
    if (/<\/script/i.test(code)) throw new Error(label + ' 含 </script>，不能内联');
    if (code.indexOf('/*__LIB__*/') >= 0 || code.indexOf('/*__APP__*/') >= 0 || code.indexOf('/*__CSS__*/') >= 0) {
      throw new Error(label + ' 含未替换的占位符');
    }
  }

  return shell
    .replace('/*__CSS__*/', () => css)
    .replace('/*__LIB__*/', () => lib)
    .replace('/*__APP__*/', () => wrapIIFE(app));
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const html = build();
  const out = path.join(root, '罗森塔尔.html');
  fs.writeFileSync(out, html);
  console.log('已生成 ' + out + '（' + html.length + ' 字节）');
}
