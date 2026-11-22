/* @capacitor/assets 默认给自适应图标的「背景层」也套 16.7% inset，
   在圆形遮罩下会露出一圈透明边。把背景改成全幅，只让前景内缩。
   每次 npm run assets 之后自动跑，避免生成步骤覆盖掉手工修正。 */
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(root, 'android/app/src/main/res/mipmap-anydpi-v26');
const before = /<background>\s*<inset[^>]*\/>\s*<\/background>/;
const after = '<background android:drawable="@mipmap/ic_launcher_background" />';

let changed = 0;
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const f = path.join(dir, name);
  if (!fs.existsSync(f)) continue;
  const txt = fs.readFileSync(f, 'utf8');
  if (!before.test(txt)) continue;
  fs.writeFileSync(f, txt.replace(before, after));
  changed++;
}
console.log('自适应图标背景层修正：' + changed + ' 个文件');
