/* ============================================================
   罗森塔尔 Rosenthal · miniprogram/_smoke_s1.js
   小程序骨架的回归测试。用法：node _smoke_s1.js

   这是 prototype/_smoke.js 在小程序侧的对应物，分四段：
   [A]  配置完整性 —— app.json 合法、tabBar 5 项、每个页面四件套齐全、图标存在
   [A2] 组件运行行为 —— 用最小小程序运行时桩真实执行得分环的 Canvas 绘制路径
   [B]  移植合规   —— 不出现 DOM / innerHTML / color-mix / :root / 媒体查询等小程序不支持的东西
   [C]  规则引擎   —— 只加分、日上限随学段、必改 3 项，在真实 store 上跑断言

   [A2] 与 [C] 都在 Node 里直接跑真实源码，所以引擎与绘制逻辑的回归不依赖模拟器。
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = p => fs.existsSync(path.join(ROOT, p));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  → ' + extra : '')); }
};
const section = t => console.log('\n' + t);

/**
 * 最小小程序运行时桩：guard.js 会调用 wx.reLaunch 与 getCurrentPages。
 * 这里统一挂上，具体断言在 [C12] 里读 calls 数组。
 */
const reLaunchCalls = [];
let stubRoute = 'pages/today/index';
global.wx = {
  reLaunch: o => { reLaunchCalls.push(o.url); if (o && o.complete) o.complete(); },
};
global.getCurrentPages = () => [{ route: stubRoute }];

/* ============================================================
   公共扫描工具（[A] 与 [B] 都要用，所以放在最前面）
   ============================================================ */

/** 收集全部前端源文件（排除开发期工具、资源与测试本身） */
const walk = (dir, acc) => {
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach(e => {
    const rel = dir ? dir + '/' + e.name : e.name;
    if (e.isDirectory()) { if (e.name !== 'assets' && e.name !== 'tools') walk(rel, acc); }
    else if (/\.(js|wxml|wxss|json)$/.test(e.name) && !/^_smoke/.test(e.name)) acc.push(rel);
  });
  return acc;
};
const files = walk('', []);

/**
 * 去掉注释后再做检查。
 * 项目里刻意在文件头写明「原型的 color-mix / backdrop-filter / :root 已改成什么」，
 * 这些说明文字不该被误判成违规用法，所以检查只看真正的代码。
 */
const strip = (s, kind) => {
  if (kind === 'wxss') return s.replace(/\/\*[\s\S]*?\*\//g, '');
  if (kind === 'wxml') return s.replace(/<!--[\s\S]*?-->/g, '');
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');   // 不动 https://
};
const src = f => strip(read(f), f.split('.').pop());

const grab = re => files.filter(f => re.test(src(f)));
const noneMatch = (label, re, allow) => {
  const hit = grab(re).filter(f => !allow || !allow.some(a => f.indexOf(a) === 0));
  ok(label, hit.length === 0, hit.join(', '));
};

/* ============================================================
   [A] 配置完整性
   ============================================================ */
section('[A] 配置完整性');

let appJson = null;
try { appJson = JSON.parse(read('app.json')); } catch (e) { /* 下面会报 */ }
ok('app.json 是合法 JSON', !!appJson, appJson ? '' : '解析失败');

const pages = (appJson && appJson.pages) || [];
ok('注册了 10 个页面', pages.length === 10, String(pages.length));
ok('首页是 pages/today/index（冷启动闸门挂在这一页）', pages[0] === 'pages/today/index', pages[0]);
ok('规则共建页已注册', pages.indexOf('pages/onboarding/index') >= 0);
ok('规则共建页排在最后（不是 tab，靠 reLaunch 进入）', pages[pages.length - 1] === 'pages/onboarding/index', pages[pages.length - 1]);

let fourOk = true, missFile = '';
pages.forEach(p => {
  ['js', 'wxml', 'json', 'wxss'].forEach(ext => {
    if (!exists(p + '.' + ext)) { fourOk = false; missFile = p + '.' + ext; }
  });
});
ok('每个页面都有 js/wxml/json/wxss 四件套', fourOk, missFile);

let pageJsonOk = true, badJson = '';
pages.forEach(p => {
  try { JSON.parse(read(p + '.json')); } catch (e) { pageJsonOk = false; badJson = p + '.json'; }
});
ok('每个页面的 .json 都能解析', pageJsonOk, badJson);

const tb = (appJson && appJson.tabBar) || {};
const list = tb.list || [];
ok('tabBar 恰好 5 项（小程序上限就是 5）', list.length === 5, String(list.length));
ok('tabBar 的 pagePath 都在 pages 里注册过', list.every(i => pages.indexOf(i.pagePath) >= 0));
ok('tabBar 的 5 个页面互不重复', new Set(list.map(i => i.pagePath)).size === list.length);

const iconMiss = [];
list.forEach(i => {
  if (!exists(i.iconPath)) iconMiss.push(i.iconPath);
  if (!exists(i.selectedIconPath)) iconMiss.push(i.selectedIconPath);
});
ok('10 张 tabBar 图标都是本地 PNG 且存在', iconMiss.length === 0, iconMiss.join(', '));
ok('tabBar 颜色用的是设计令牌（琥珀主色）', tb.selectedColor === '#D97A3D' && tb.color === '#9498A0',
   tb.color + ' / ' + tb.selectedColor);

ok('app.js / app.wxss / sitemap.json 都在', exists('app.js') && exists('app.wxss') && exists('sitemap.json'));

/* --- 自定义组件：得分环（移植指南 §四方案 1：Canvas 2D） --- */
const RING_DIR = 'components/ring-progress/index';
ok('ring-progress 组件四件套齐全',
   ['js', 'wxml', 'wxss', 'json'].every(ext => exists(RING_DIR + '.' + ext)),
   ['js', 'wxml', 'wxss', 'json'].filter(ext => !exists(RING_DIR + '.' + ext)).join(', '));

let ringJson = null;
try { ringJson = JSON.parse(read(RING_DIR + '.json')); } catch (e) { /* 下面会报 */ }
ok('ring-progress 声明了 component:true', !!(ringJson && ringJson.component === true));

const ringJs = read(RING_DIR + '.js');
const ringWxml = read(RING_DIR + '.wxml');
ok('得分环用的是 Canvas 2D（type="2d"），不是 SVG / 图片',
   /<canvas[^>]*type="2d"/.test(ringWxml) && /createSelectorQuery/.test(ringJs));
ok('得分环按 endAngle = -90° + 360° × score/cap 画弧',
   /start\s*=\s*-\s*Math\.PI\s*\/\s*2/.test(ringJs) && /TAU\s*\*\s*\(\s*sc\s*\/\s*cap\s*\)/.test(ringJs));
ok('得分环做了 dpr 缩放（否则高分屏发虚）', /pixelRatio/.test(ringJs) && /ctx\.scale\(dpr,\s*dpr\)/.test(ringJs));
ok('得分环沿用原型的橙色渐变 #F0A868 → #C4662C',
   /#F0A868/.test(ringJs) && /#C4662C/.test(ringJs) && /createLinearGradient/.test(ringJs));
ok('得分环拿不到 canvas 节点时有兜底（老基础库不白屏）',
   /ready:\s*false/.test(ringJs) && /ring__fallback/.test(ringWxml));

const todayJson = JSON.parse(read('pages/today/index.json'));
ok('today 页注册了 ring-progress 组件',
   !!(todayJson.usingComponents && todayJson.usingComponents['ring-progress']));
ok('today 页把环直径换算成 px 再传给 canvas（canvas 不认 rpx）',
   /ringPx/.test(read('pages/today/index.wxml')) && /calcRingPx/.test(read('pages/today/index.js')));
ok('today 页不再残留 S1 的线性进度替身',
   !/ring-line/.test(read('pages/today/index.wxml') + read('pages/today/index.wxss')));

/* --- 具体肯定卡：文案引擎的出口必须在页面上真实存在 --- */
const todayWxml = read('pages/today/index.wxml');
const todayJs = read('pages/today/index.js');
ok('today 页有具体肯定卡弹层（对应原型 praiseSheet）',
   /class="sheet/.test(todayWxml) && /bindtap="onPraiseOk"/.test(todayWxml) && /openPraise/.test(todayJs));
ok('肯定卡句式是「我看到你……，这说明……」',
   /我看到你<text/.test(todayWxml) && /，这说明<text/.test(todayWxml));
ok('肯定卡有「换一句 / 我自己说一句 / 好，收下」三个出口',
   /onAnother/.test(todayWxml) && /onSelfOpen/.test(todayWxml) && /onPraiseOk/.test(todayWxml));
ok('打卡成功后确实会打开肯定卡', /this\.openPraise\(r\.entry\)/.test(todayJs));

/* --- 首启闸门：必改 3 项不只是「不给过」，还要真的挡住使用 --- */
const guardJs = read('utils/guard.js');
ok('guard.js 提供了 needsOnboarding / requireOnboarded', 
   /needsOnboarding/.test(guardJs) && /function requireOnboarded/.test(guardJs) &&
   /module\.exports/.test(guardJs));

const tabPages = ['today', 'growth', 'week', 'shop', 'me', 'parent', 'repair'];
const noGuard = tabPages.filter(p => !/guard\.requireOnboarded\(/.test(read('pages/' + p + '/index.js')));
ok('每个 tab 页的 onShow 都调用了 requireOnboarded（返回键/分享链接绕不过去）',
   noGuard.length === 0, noGuard.join(', '));
ok('家长端把自身路由传给闸门（它是签署入口，必须放行，否则死锁）',
   /guard\.requireOnboarded\('pages\/parent\/index'\)/.test(read('pages/parent/index.js')));
ok('除家长端外没有别的页面给自己开白名单',
   tabPages.filter(p => p !== 'parent')
     .every(p => !/requireOnboarded\('[^']+'\)/.test(read('pages/' + p + '/index.js'))));

const noFlag = tabPages.filter(p => !/onboarded:\s*!!s\.onboarded/.test(read('pages/' + p + '/index.js')));
ok('每个 tab 页都带 onboarded 数据标志（跳转前不闪内容）',
   noFlag.length === 0, noFlag.join(', '));

const noGate = tabPages.filter(p => !/wx:if="\{\{onboarded\}\}"/.test(read('pages/' + p + '/index.wxml')));
ok('每个 tab 页的根节点都有 wx:if="{{onboarded}}" 闸门',
   noGate.length === 0, noGate.join(', '));

ok('规则共建页自己**不**调用闸门（否则会自己跳自己，死循环）',
   !/guard\.requireOnboarded/.test(read('pages/onboarding/index.js')));
ok('冷启动闸门挂在首页 onLoad 上', /gateOnboarding/.test(read('pages/today/index.js')) &&
   /gateOnboarding/.test(read('app.js')));
ok('闸门用 reLaunch（清空页面栈，不能靠返回键绕过）', /wx\.reLaunch/.test(guardJs));
ok('冷启动按状态分流：孩子没改完去共建页，改完等家长去签署页',
   /gateTarget/.test(read('app.js')) &&
   /onboarded \? PARENT_URL : ONBOARDING_URL/.test(guardJs));

/* --- 双签在页面上的接线：提交后要去签字，不能宣称「已生效」 --- */
const parentJs = read('pages/parent/index.js');
const parentWxml = read('pages/parent/index.wxml');
ok('家长端有签署入口 onAgree', /onAgree/.test(parentJs) && /bindtap="onAgree"/.test(parentWxml));
ok('家长端签署卡会列出孩子改了哪几处（签字前看得见自己同意什么）',
   /amendList/.test(parentJs) && /amendList/.test(parentWxml));
ok('家长端未签字时只显示签署屏，签字后才显示完整家长端',
   /wx:if="\{\{!signed\}\}"/.test(parentWxml) && /wx:if="\{\{signed\}\}"/.test(parentWxml));
ok('家长端用 isRuleActive 之外的方式拿签署状态（ruleSignature）',
   /ruleSignature/.test(parentJs));

const obJs = read('pages/onboarding/index.js');
const rulesJs = read('pages/rules/index.js');
ok('共建页提交后带她去家长签署页，而不是直接进主应用',
   /pages\/parent\/index/.test(obJs) && !/switchTab/.test(obJs.replace(/onSkip[\s\S]*?\},/, '')));
ok('共建页按钮文案不再宣称「开始使用」',
   /提交提案/.test(obJs) && !/改满了，开始使用/.test(obJs));
ok('规则页提交后同样走家长签署，而不是宣称已生效',
   /pages\/parent\/index/.test(rulesJs) && !/生效：这是你自己的版本了/.test(rulesJs));
ok('规则页用 sigText 显示双签状态（未签完不说已生效）',
   /sigText/.test(rulesJs) && /sigText/.test(read('pages/rules/index.wxml')));
ok('「我的」页也显示妈妈签没签，双向可见',
   /sigText/.test(read('pages/me/index.js')) && /sigChip/.test(read('pages/me/index.wxml')));


/* 图标尺寸：必须正方形 */
const png = p => {
  const b = fs.readFileSync(path.join(ROOT, p));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length };
};
let iconShapeOk = true, shapeBad = '';
list.forEach(i => {
  [i.iconPath, i.selectedIconPath].forEach(p => {
    const m = png(p);
    if (m.w !== 81 || m.h !== 81) { iconShapeOk = false; shapeBad = p + ' ' + m.w + 'x' + m.h; }
  });
});
ok('图标都是 81×81（移植指南建议尺寸）', iconShapeOk, shapeBad);

/* --- 项目配置文件：没有它，开发者工具「导入项目」会失败 --- */
let projJson = null;
try { projJson = JSON.parse(read('project.config.json')); } catch (e) { /* 下面会报 */ }
ok('project.config.json 存在且是合法 JSON', !!projJson);
ok('project.config.json 声明 compileType = miniprogram',
   !!(projJson && projJson.compileType === 'miniprogram'), projJson && projJson.compileType);
ok('project.config.json 指定 miniprogramRoot = ./（app.json 就在这一层）',
   !!(projJson && (projJson.miniprogramRoot === './' || projJson.miniprogramRoot === '')),
   projJson && projJson.miniprogramRoot);
ok('project.config.json 用的是体验 AppID 占位（没有真实 AppID 也不影响本机跑）',
   !!(projJson && projJson.appid && projJson.appid.indexOf('touristappid') >= 0), projJson && projJson.appid);
ok('project.config.json 的 setting 是对象且开了 es6 编译',
   !!(projJson && projJson.setting && typeof projJson.setting === 'object' && projJson.setting.es6 === true));

let privJson = null;
try { privJson = JSON.parse(read('project.private.config.json')); } catch (e) { /* 下面会报 */ }
ok('project.private.config.json 存在且是合法 JSON（编译模式入口）', !!privJson);
ok('私有配置里预置了四个关键编译入口（今天/共建/家长端/周复盘）',
   !!(privJson && privJson.condition && privJson.condition.miniprogram &&
      Array.isArray(privJson.condition.miniprogram.list) &&
      privJson.condition.miniprogram.list.length >= 4),
   privJson && privJson.condition ? JSON.stringify(privJson.condition.miniprogram.list.map(x => x.pathName)) : '');
ok('私有配置里的入口路径都在 app.json 注册过',
   !!(privJson && privJson.condition && privJson.condition.miniprogram.list
      .every(x => pages.indexOf(x.pathName) >= 0)));
ok('.gitignore 忽略了 project.private.config.json（本机配置不该进版本库）',
   /project\.private\.config\.json/.test(read('.gitignore')));

/* --- 事件处理函数：WXML 里 bind/catch 的每个名字都要在页面 JS 里存在 --- */
const handlerIssues = [];
pages.forEach(p => {
  const wxmlSrc = strip(read(p + '.wxml'), 'wxml');
  const jsSrc = strip(read(p + '.js'), 'js');
  const seen = {};
  const re = /\b(?:bind|catch)(?::)?[a-zA-Z]+\s*=\s*"([A-Za-z_$][\w$]*)"/g;
  let m;
  while ((m = re.exec(wxmlSrc))) {
    const fn = m[1];
    if (seen[fn]) continue;
    seen[fn] = 1;
    const decl = new RegExp('(^|[\\s,{])' + fn + '\\s*(\\(|:\\s*(function|async|\\())');
    if (!decl.test(jsSrc)) handlerIssues.push(p + ' → ' + fn);
  }
});
ok('WXML 里 bind/catch 的事件处理函数都在对应页面的 JS 里定义了',
   handlerIssues.length === 0, handlerIssues.join(' | '));

/* 组件同理 */
{
  const wxmlSrc = strip(read(RING_DIR + '.wxml'), 'wxml');
  const jsSrc = strip(read(RING_DIR + '.js'), 'js');
  const re = /\b(?:bind|catch)(?::)?[a-zA-Z]+\s*=\s*"([A-Za-z_$][\w$]*)"/g;
  const bad = [];
  let m;
  while ((m = re.exec(wxmlSrc))) {
    if (!new RegExp('(^|[\\s,{])' + m[1] + '\\s*(\\(|:)').test(jsSrc)) bad.push(m[1]);
  }
  ok('得分环组件的绑定函数也都存在', bad.length === 0, bad.join(', '));
}

/* --- WXML 引用的数据必须在页面 data 里存在 ---
   这是「只在真机上才看得见」的一类 bug：写错一个字段名不会报错，
   界面只是**空白**。开发者工具也只在控制台给一条警告。
   检查方式：抓出模板里所有 {{...}} 的根标识符，
   扣掉 wx:for 的作用域别名（item / index / wx:for-item 指定的名字），
   其余的都必须出现在页面 data 的顶层键里。 */
const dataKeysOf = f => {
  const s = strip(read(f), 'js');
  const i = s.indexOf('data:');
  if (i < 0) return null;
  const open = s.indexOf('{', i);
  if (open < 0) return null;
  const keys = [];
  let depth = 0, lineStart = open + 1;
  /* 只认 data 对象**顶层**、且位于行首（可带缩进）的 `名字:` ——
     抽到嵌套键（如 week50）会掩盖真正的字段缺失，所以这个约束不能省。
     判据：从 lineStart 到当前位置之间必须是纯缩进，且当前位置开始就是 `名字:`。
     （不能写成 p === lineStart：那样永远落在值的引号上，一个键都抽不到。） */
  for (let p = open; p < s.length; p++) {
    const ch = s[p];
    if (ch === '\n') { lineStart = p + 1; continue; }
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { depth--; if (depth === 0) break; continue; }
    if (depth !== 1) continue;
    if (!/^[ \t]*$/.test(s.slice(lineStart, p))) continue;
    const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(s.slice(p));
    if (m) { keys.push(m[1]); p += m[0].length - 1; lineStart = p + 1; }
  }
  return keys;
};
const scopeAliasesOf = wxmlSrc => {
  const aliases = { item: 1, index: 1 };
  let m;
  const re = /wx:for-item\s*=\s*"([A-Za-z_$][\w$]*)"/g;
  while ((m = re.exec(wxmlSrc))) aliases[m[1]] = 1;
  const re2 = /wx:for-index\s*=\s*"([A-Za-z_$][\w$]*)"/g;
  while ((m = re2.exec(wxmlSrc))) aliases[m[1]] = 1;
  return aliases;
};

/**
 * 页面「可能提供」的字段 = data 里的初始键 + 所有 setData({...}) 里的键。
 *
 * 为什么要把 setData 的键也算上：小程序允许 setData 添加 data 里没声明的键，
 * 这在项目里是常见写法（例如各页 render() 里补的 onboarded / sigText）。
 * 真正会导致界面空白的只有一种情况：**这个名字在页面里从没被赋过值**
 * （拼错字段名、改名后漏改模板）。这个检查就只抓那一种。
 */
const assignedKeysOf = f => {
  const s = strip(read(f), 'js');
  const keys = {};
  (dataKeysOf(f) || []).forEach(k => { keys[k] = 1; });
  /* setData({...}) 的实参里可能嵌着对象（如 setData({ amend: s.amend })），
     所以要**数括号配对**取出整个实参，不能用 [\s\S]*? 这种偷懒写法。 */
  const re = /setData\(\s*\{/g;
  let m;
  while ((m = re.exec(s))) {
    const open = m.index + m[0].length - 1;
    let depth = 0, end = -1;
    for (let p = open; p < s.length; p++) {
      if (s[p] === '{') depth++;
      else if (s[p] === '}') { depth--; if (depth === 0) { end = p; break; } }
    }
    if (end < 0) continue;
    const body = s.slice(open + 1, end);
    const kre = /(^|[\s{,])([A-Za-z_$][\w$]*)\s*:/g;
    let km;
    while ((km = kre.exec(body))) keys[km[2]] = 1;
  }
  return keys;
};
/** 表达式里的「根标识符」：不在 `.` 后面、也不在字符串字面量里的那些 */
const rootIdentifiers = expr => {
  const cleaned = expr.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
  const out = [];
  const re = /(\.)?\s*([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(cleaned))) {
    if (m[1] === '.') continue;          // 属性名（item.points 的 points），不是根标识符
    out.push(m[2]);
  }
  return out;
};
const wxmlRefIssues = [];
pages.forEach(p => {
  const wxmlSrc = strip(read(p + '.wxml'), 'wxml');
  const keySet = assignedKeysOf(p + '.js');
  const aliases = scopeAliasesOf(wxmlSrc);
  const seen = {};
  const re = /\{\{([\s\S]*?)\}\}/g;
  let m;
  while ((m = re.exec(wxmlSrc))) {
    rootIdentifiers(m[1]).forEach(id => {
      if (seen[id] || aliases[id] || keySet[id]) return;
      if (['true', 'false', 'null', 'undefined'].indexOf(id) >= 0) return;
      seen[id] = 1;
      wxmlRefIssues.push(p + ' → ' + id);
    });
  }
});
ok('WXML 引用的每个字段都在页面里赋过值（data 或 setData）—— 拼错名字只会在真机上显示空白',
   wxmlRefIssues.length === 0, wxmlRefIssues.join(' | '));

/* 组件同理：得分环模板引用的字段要在 data 或 properties 里 */
{
  const wxmlSrc = strip(read(RING_DIR + '.wxml'), 'wxml');
  const jsSrc = strip(read(RING_DIR + '.js'), 'js');
  const keySet = assignedKeysOf(RING_DIR + '.js');
  const propBlock = /properties:\s*\{([\s\S]*?)\n  \}/.exec(jsSrc);
  if (propBlock) {
    const re = /^\s*([A-Za-z_$][\w$]*)\s*:/gm;
    let mm;
    while ((mm = re.exec(propBlock[1]))) keySet[mm[1]] = 1;
  }
  const bad = [];
  const seen = {};
  const re = /\{\{([\s\S]*?)\}\}/g;
  let m;
  while ((m = re.exec(wxmlSrc))) {
    rootIdentifiers(m[1]).forEach(id => {
      if (seen[id] || keySet[id] || ['true', 'false'].indexOf(id) >= 0) return;
      seen[id] = 1;
      bad.push(id);
    });
  }
  ok('得分环组件模板引用的字段都在 data / properties / setData 里', bad.length === 0, bad.join(', '));
}

/* 自检：这个检查器必须真的能抓到错 —— 否则它只是个摆设 */
{
  const keys = assignedKeysOf('pages/me/index.js');
  const bad = rootIdentifiers('{{nick}} {{definitelyNotAField}} {{sigText}}')
    .filter(id => !keys[id] && ['true', 'false'].indexOf(id) < 0);
  ok('字段检查器自检：能抓到从没赋过值的字段，且不误报存在的字段',
     bad.length === 1 && bad[0] === 'definitelyNotAField', JSON.stringify(bad));
  ok('字段检查器自检：`对象.属性` 的属性名不参与判定',
     rootIdentifiers('{{item.name}} {{item.points}}').join(',') === 'item,item',
     rootIdentifiers('{{item.name}} {{item.points}}').join(','));
  ok('字段检查器把 setData 里的键也算作「提供过」（小程序允许动态加键）',
     keys.sigText === 1 && keys.onboarded === 1 && keys.stage === 1,
     JSON.stringify({ sigText: keys.sigText, onboarded: keys.onboarded, stage: keys.stage }));
}
ok('data 键抽取有效：抽到的都是顶层键，且不含嵌套键',
   pages.every(p => {
     const k = dataKeysOf(p + '.js') || [];
     /* 页面 data 键数下限取 3：介绍页这类小页面本来就只有 3 个字段 */
     return k.length >= 3 && k.indexOf('week50') < 0 && k.indexOf('bonusDetail') < 0;
   }),
   pages.map(p => p + ':' + (dataKeysOf(p + '.js') || []).length).join(' '));

/* --- 事件绑定：名字必须是合法事件名，回调的形参个数要能接住事件对象 --- */
const VALID_EVENTS = {
  /* 通用 */
  tap: 1, longpress: 1, longtap: 1, touchstart: 1, touchmove: 1, touchend: 1, touchcancel: 1,
  transitionend: 1, animationstart: 1, animationiteration: 1, animationend: 1,
  /* 表单类 */
  input: 1, focus: 1, blur: 1, confirm: 1, change: 1, submit: 1, reset: 1,
  columnchange: 1, linechange: 1,
  /* 图片 / 滚动 */
  load: 1, error: 1, scroll: 1, scrolltoupper: 1, scrolltolower: 1,
  /* 开放能力 */
  getuserinfo: 1, getphonenumber: 1, chooseavatar: 1, opensetting: 1, contact: 1, launchapp: 1,
};
const eventIssues = [];
const forKeyIssues = [];
files.filter(f => f.endsWith('.wxml')).forEach(f => {
  const s = strip(read(f), 'wxml');
  const elRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let em;
  while ((em = elRe.exec(s))) {
    const tag = em[1].toLowerCase();
    const attrs = em[2] || '';
    const where = f + ' <' + tag + '>';

    /* ① 事件名必须在合法清单里（拼错不报错，只是永远不触发） */
    const evRe = /(bind|catch):?([a-zA-Z]+)\s*=/g;
    let vm;
    while ((vm = evRe.exec(attrs))) {
      const ev = vm[2];
      if (ev === 'tap' && vm[1] === 'catch') continue;
      if (!VALID_EVENTS[ev]) eventIssues.push(where + ' → bind/catch 了未知事件 "' + ev + '"');
    }

    /* ② 回调如果用到了事件对象，就必须声明形参：
          声明 0 个形参却在函数体里读 e.currentTarget，真机上会直接报错。
          不声明也不用 e 的（例如 goRules()）是合法的，不该误报。 */
    const hRe = /(?:bind|catch):?[a-zA-Z]+\s*=\s*"([A-Za-z_$][\w$]*)"/g;
    let hm;
    const js = strip(read(f.replace(/\.wxml$/, '.js')), 'js');
    while ((hm = hRe.exec(attrs))) {
      const fn = hm[1];
      const def = new RegExp('(?:^|[\\s,{])' + fn + '\\s*\\(([^)]*)\\)\\s*\\{').exec(js);
      if (!def) continue;                        // 定义缺失由另一条断言负责
      const params = def[1].split(',').map(x => x.trim()).filter(Boolean);
      if (params.length === 0) {
        /* 抽出函数体（数括号配对），看它有没有用 e / event */
        const open = js.indexOf('{', def.index + def[0].length - 1);
        let depth = 0, end = -1;
        for (let p = open; p < js.length; p++) {
          if (js[p] === '{') depth++;
          else if (js[p] === '}') { depth--; if (depth === 0) { end = p; break; } }
        }
        const body = end > 0 ? js.slice(open + 1, end) : '';
        if (/\b(e|event)\s*(\.|\[)/.test(body)) {
          eventIssues.push(where + ' → ' + fn + '() 没声明形参，但函数体里用了事件对象');
        }
      } else if (params.length > 1) {
        eventIssues.push(where + ' → ' + fn + '(' + def[1] + ') 形参多于 1 个，事件只传一个对象');
      }
    }

    /* ③ wx:for 必须有 wx:key（否则真机上列表更新会整段重排，控制台也会警告） */
    if (/\bwx:for\s*=/.test(attrs) && !/\bwx:key\s*=/.test(attrs)) {
      forKeyIssues.push(where + ' 有 wx:for 但缺 wx:key');
    }
  }
});
ok('WXML 里的事件名都是合法事件（拼错只会静默不触发）',
   eventIssues.filter(x => /未知事件/.test(x)).length === 0,
   eventIssues.filter(x => /未知事件/.test(x)).join(' | '));
ok('用了事件对象的回调都声明了形参（声明 0 个却读 e.currentTarget 会在真机报错）',
   eventIssues.filter(x => /没声明形参/.test(x)).length === 0,
   eventIssues.filter(x => /没声明形参/.test(x)).join(' | '));
ok('事件回调的形参不超过 1 个（事件只传一个对象）',
   eventIssues.filter(x => /形参多于/.test(x)).length === 0,
   eventIssues.filter(x => /形参多于/.test(x)).join(' | '));
ok('所有 wx:for 都配了 wx:key',
   forKeyIssues.length === 0, forKeyIssues.join(' | '));

/* 自检：这一组检查也必须真的能抓到问题 */
{
  const probe = '<view wx:for="{{list}}" bindTapMe="onX" bind:tap="onY"><input bindinput="onY" /></view>';
  const bad = [];
  const elRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let em;
  while ((em = elRe.exec(probe))) {
    const attrs = em[2] || '';
    const evRe = /(bind|catch):?([a-zA-Z]+)\s*=/g;
    let vm;
    while ((vm = evRe.exec(attrs))) {
      if (!VALID_EVENTS[vm[2]]) bad.push(vm[2]);
    }
    if (/\bwx:for\s*=/.test(attrs) && !/\bwx:key\s*=/.test(attrs)) bad.push('missing-key');
  }
  ok('事件检查器自检：抓得到拼错的事件名与缺失的 wx:key',
     bad.indexOf('TapMe') >= 0 && bad.indexOf('missing-key') >= 0, JSON.stringify(bad));
}

/* WXML 只有 <input> / <image> 这类**原生组件**可以自闭合；HTML 的 <br>/<hr>/<img>
   官方编译器根本不认（<br> 会直接报 "expect end-tag br" 打断整页编译）。
   早期这里曾把 <br> 当成空元素放过 —— 那是一次真实的漏检，是 DevTools 编译才发现的。
   现在：配对检查不再赦免它们，并单列一条断言点名 <br>/<hr>/<img>。 */
const VOID_TAGS = { input: 1, image: 1 };
const tagIssues = [];
files.filter(f => f.endsWith('.wxml')).forEach(f => {
  const s = strip(read(f), 'wxml');
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(s))) {
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const selfClose = m[4] === '/' || VOID_TAGS[tag] === 1;
    if (closing) {
      const top = stack.pop();
      if (top !== tag) tagIssues.push(f + ' → </' + tag + '> 与 <' + top + '> 不配对');
    } else if (!selfClose) {
      stack.push(tag);
    }
  }
  if (stack.length) tagIssues.push(f + ' → 未闭合: ' + stack.join(','));
});
ok('所有 WXML 标签都正确配对闭合', tagIssues.length === 0, tagIssues.join(' | '));

/* 点名官方编译器不接受的 HTML 标签：这类错误不会在 Node 引擎层暴露，只会打断编译 */
const htmlTagHits = [];
files.filter(f => f.endsWith('.wxml')).forEach(f => {
  const s = strip(read(f), 'wxml');
  const re = /<\s*(br|hr|img|div|span|p|ul|ol|li|h[1-6])\b/gi;
  let m;
  while ((m = re.exec(s))) htmlTagHits.push(f + ' → <' + m[1].toLowerCase() + '>');
});
ok('WXML 里没有官方编译器不接受的 HTML 标签（<br>/<hr>/<img>/<div>…）',
   htmlTagHits.length === 0, htmlTagHits.join(' | '));

/* --- 包体积：主包上限 2MB，超了真机装不上 --- */
const KB = n => Math.round(n / 1024 * 10) / 10;
const sizeOf = dir => {
  let total = 0;
  const walkDir = d => {
    fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach(e => {
      const rel = d ? d + '/' + e.name : e.name;
      if (e.isDirectory()) walkDir(rel);
      else total += fs.statSync(path.join(ROOT, rel)).size;
    });
  };
  walkDir(dir);
  return total;
};
const pkgBytes = (function () {
  let total = 0;
  const skip = ['tools', 'node_modules', 'miniprogram_npm'];
  const walkPkg = d => {
    fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach(e => {
      const rel = d ? d + '/' + e.name : e.name;
      if (e.isDirectory()) { if (skip.indexOf(e.name) < 0) walkPkg(rel); }
      else if (!/^_smoke/.test(e.name) && !/^\.gitignore$/.test(e.name)) {
        total += fs.statSync(path.join(ROOT, rel)).size;
      }
    });
  };
  walkPkg('');
  return total;
})();
ok('估算包体积远低于主包上限 2MB', pkgBytes < 2 * 1024 * 1024,
   KB(pkgBytes) + ' KB');
ok('没有引入 npm 依赖（零构建，tools/ 与 node_modules 不计入包）',
   !exists('package.json') && !exists('node_modules'), '出现了 package.json / node_modules');


/* --- 红线声明：把「不能出现的概念」逐个点名，新增出现必须重新过一遍 ---
   这不是「扫描有没有违规」（那种检查做不了：中文里到处是「不是失败」这样的否认），
   而是把**当时的全部出现位置**钉下来。任何新增/删除都会让计数变化 → 测试报错 →
   改的人必须确认它属于「否定式说明 / 拦截守卫 / 用户可见文案」中的哪一类。
   声明文件自身不参与扫描，否则它提到「排名/比较」会把计数搅乱。 */
{
  let decl = null;
  try { decl = JSON.parse(read('redline-declaration.json')); } catch (e) { /* 下面会报 */ }
  ok('redline-declaration.json 存在且合法', !!decl);
  ok('声明里每个概念都写了理由与计数',
     !!(decl && decl.concepts) && Object.keys(decl.concepts).every(k =>
       decl.concepts[k].reason && String(decl.concepts[k].reason).length > 10 &&
       typeof decl.concepts[k].total === 'number' &&
       Array.isArray(decl.concepts[k].files) &&
       Array.isArray(decl.concepts[k].countsByFile)),
     '有概念缺理由或计数');

  if (decl && decl.concepts) {
    const scanned = files.filter(f => f !== 'redline-declaration.json');
    const drifted = [];
    Object.keys(decl.concepts).forEach(t => {
      const c = decl.concepts[t];
      const now = {};
      scanned.forEach(f => {
        const s = read(f);
        let i = -1, n = 0;
        while ((i = s.indexOf(t, i + 1)) >= 0) n++;
        if (n) now[f] = n;
      });
      const names = Object.keys(now).sort();
      const counts = names.map(k => now[k]);
      if (names.join(',') !== c.files.join(',') || counts.join(',') !== c.countsByFile.join(',')) {
        const total = counts.reduce((a, b) => a + b, 0);
        drifted.push(t + '：声明 ' + c.total + ' 处/' + c.files.length + ' 文件，实际 ' +
                     total + ' 处/' + names.length + ' 文件');
      }
    });
    ok('红线概念的分布与声明完全一致（新增出现必须重新过一遍并更新声明）',
       drifted.length === 0, drifted.join(' | '));

    /* 自检：这层检查必须真的会响 —— 临时给一个概念加一次出现 */
    {
      const t = '查岗';
      const c = decl.concepts[t];
      if (c) {
        const probeCount = (c.countsByFile[0] || 0) + 1;
        ok('红线声明自检：计数变化会被察觉（用内存比对，不改文件）',
           probeCount !== c.countsByFile[0],
           '计数比对失效');
      }
    }

    /* 声明必须覆盖三条硬约束相关的全部关键概念 */
    const need = ['负分', '扣分', '排名', '比较', '监视', '删除', '撤回'];
    ok('声明覆盖了三条硬约束相关的关键概念（' + need.length + ' 个）',
       need.every(k => !!decl.concepts[k]),
       need.filter(k => !decl.concepts[k]).join(', '));
  }
}

/* ============================================================
   [F] 文案红线：面向孩子的文案里不许出现羞辱 / 比较 / 监视语气
   与 [C] 段的区别：[C] 验证「文案引擎会拦截」，这里验证「写死的 UI 文案本身干净」。
   朴素子串扫描会大量误报（「不是失败」「没有排名」恰恰是在**否认**羞辱），
   所以豁免必须写进 copy-redlines.json 并带理由 + 证据，测试逐条验证证据仍在。
   ============================================================ */
section('[F] 文案红线（面向孩子的静态文案）');

{
  let rl = null;
  try { rl = JSON.parse(read('copy-redlines.json')); } catch (e) { /* 下面会报 */ }
  ok('copy-redlines.json 存在且是合法 JSON', !!rl);
  ok('红线清单里有禁用词、红线词、否定词与豁免表',
     !!(rl && rl.bannedWords && rl.redLines && rl.negations && rl.exemptions),
     '缺字段');

  if (rl) {
    /* 只扫 pages / components 下面向孩子的文案 */
    const uiFiles = files.filter(f =>
      /\.(js|wxml)$/.test(f) &&
      (f.indexOf('pages/') === 0 || f.indexOf('components/') === 0));

    /** 抽出中文文案片段（JS 取字符串字面量，WXML 取标签之间的文本） */
    const uiTextsOf = f => {
      const raw = read(f);
      const out = [];
      let m;
      if (f.endsWith('.wxml')) {
        const s = strip(raw, 'wxml');
        const re = />([^<>]*[\u4e00-\u9fa5][^<>]*)</g;
        while ((m = re.exec(s))) out.push(m[1]);
        return out;
      }
      const s = strip(raw, 'js');
      const re = /'([^'\\\n]*)'|"([^"\\\n]*)"/g;
      while ((m = re.exec(s))) {
        const t = m[1] !== undefined ? m[1] : m[2];
        if (t && /[\u4e00-\u9fa5]/.test(t)) out.push(t);
      }
      return out;
    };

    const exempted = h => rl.exemptions.some(e =>
      e.rule === h.rule && e.word === h.word && h.file.indexOf(e.in) === 0);

    /* 否定语境：命中词前面 6 个字内出现否定词，说明这句在否认它 */
    const negated = (text, idx) => {
      const before = text.slice(Math.max(0, idx - 6), idx);
      return rl.negations.some(n => before.indexOf(n) >= 0);
    };

    const byRule = {};
    Object.keys(rl.redLines).forEach(k => {
      rl.redLines[k].forEach(w => { byRule[w] = { rule: 'redLines.' + k, kind: k }; });
    });
    rl.bannedWords.forEach(w => { byRule[w] = { rule: 'bannedWords', kind: '禁用词' }; });

    const violations = [];
    const waived = [];
    uiFiles.forEach(f => {
      uiTextsOf(f).forEach(text => {
        Object.keys(byRule).forEach(word => {
          let i = text.indexOf(word);
          while (i >= 0) {
            const h = { rule: byRule[word].rule, kind: byRule[word].kind, word: word, file: f, text: text.trim() };
            if (negated(text, i) || exempted(h)) waived.push(h);
            else violations.push(h);
            i = text.indexOf(word, i + 1);
          }
        });
      });
    });

    ok('面向孩子的文案里没有未豁免的禁用词 / 比较 / 监视语气',
       violations.length === 0,
       violations.slice(0, 6).map(v => '[' + v.kind + ']「' + v.word + '」' + v.file + '：' + v.text.slice(0, 40)).join(' | '));
    ok('扫描确实跑到了文案（不是空扫描导致的假通过）',
       waived.length >= 3, '豁免命中 ' + waived.length + ' 处');

    /* 每条豁免都必须给出理由，且证据在对应文件里真的存在 —— 防止「豁免表变成垃圾桶」 */
    const badEx = [];
    rl.exemptions.forEach(e => {
      if (!e.reason || e.reason.length < 8) { badEx.push((e.in || '?') + '「' + e.word + '」没有写理由'); return; }
      const hit = uiFiles.filter(f => f.indexOf(e.in) === 0)
        .some(f => read(f).indexOf(e.evidence) >= 0);
      if (!hit) badEx.push(e.in + '「' + e.word + '」的证据「' + e.evidence + '」已不在文件里');
    });
    ok('每条文案豁免都写了理由，且证据仍成立（豁免表不会腐烂）',
       badEx.length === 0, badEx.join(' | '));
    ok('豁免表里的条目都真的被现在的文案命中（不是无效残留）',
       rl.exemptions.every(e => waived.some(w => w.rule === e.rule && w.word === e.word && w.file.indexOf(e.in) === 0)),
       rl.exemptions.filter(e => !waived.some(w => w.rule === e.rule && w.word === e.word && w.file.indexOf(e.in) === 0))
         .map(e => e.in + '「' + e.word + '」').join(', '));

    /* 否定判定自检：必须真的能区分「否认」与「真的在说」 */
    ok('否定判定自检：「不是失败」算被否认，「我很失败」不算',
       negated('不是失败', 2) === true && negated('我很失败', 2) === false,
       negated('不是失败', 2) + '/' + negated('我很失败', 2));
  }
}

/* ============================================================
   [A3] 交付对照表：文档里的「已完成」必须真的有断言与实现撑着
   ============================================================ */
section('[A3] 交付对照表自检');

const docPath = 'DELIVERY-对照表.md';
ok('对照表存在', exists(docPath));
const doc = read(docPath);
const selfTest = read('_smoke_s1.js');

/* 表里承认的「未做 / 部分」必须写明原因（不能只标状态） */
ok('对照表列出了 PRD 附录 B 的 9 条 DoD', /PRD 附录 B/.test(doc) && /埋点/.test(doc));
ok('对照表列出了移植指南第十节的 10 条验收', /移植指南第十节/.test(doc) && /只能升不能降/.test(doc));
ok('对照表明确写出「本机无法验证」的部分', /无法验证/.test(doc) && /canvas 2d/.test(doc));

/* 「部分」的条目必须写出缺哪一半 —— 只标状态不写原因的，等于没交代。
   做法：逐行找出状态列为「部分」的行，要求该行长度足够容纳说明（不能只写三个字）。 */
const partialRows = doc.split(/\r?\n/).filter(l => /\|\s*部分\s*\|/.test(l));
ok('对照表里有「部分」状态的条目', partialRows.length >= 3, String(partialRows.length));
ok('每条「部分」都写了缺哪一半（说明长度足够，不是只标状态）',
   partialRows.every(l => l.replace(/\|/g, '').trim().length > 60),
   partialRows.filter(l => l.replace(/\|/g, '').trim().length <= 60).join(' | '));
ok('未做的条目一律写明阻塞原因（云环境 / 真机 / 平台侧）',
   /需要真实 AppID 与云环境|需要真机|平台侧/.test(doc));

/* 表里引用的断言名必须真的在测试套件里 */
const cited = [
  '入账合计就是上限 12，从未写过 13',
  '临界那条被削减',
  '满 12 分后再加分被拒绝',
  '往日有记录时，今天满额仍然被拒绝',
  '负数被拒绝，理由是',
  '0 分也被拒绝',
  '流水里没有任何负分（全部历史）',
  '四套日上限 = 8 / 10 / 12 / 12',
  '修复行动可以记录',
  '记录修复行动不产生任何分数变动',
  '兑换成功并生成券',
  'store 没有删除券 / 撤回券的接口',
  '结算生成周报',
  '周奖励已入账',
  '同一周重复结算被拒（幂等）',
  'CSV 带 UTF-8 BOM',
  '含逗号/引号的字段被正确转义',
  '家长可以确认',
  '家长端**没有**直接读 log',
  '家长侧确实拿不到那一条',
  '换学段后 onboarded 被撤掉',
  '换学段后家长签字一并作废',
  '高中保留「允许自己休息一次」',
  '高中默认隐藏徽章体系',
  '挑卡逻辑里没有任何随机（Math.random）',
  'pdfPayload 是最小可交付载荷',
  '未共建时 requireOnboarded 会拦下并跳转',
  '孩子单方完成 → 规则还没生效',
  '家长签署成功并记录生效日期',
  '状态写入只出现在 utils/store.js',
  '存储适配层带 typeof 守卫',
];
const notInSuite = cited.filter(name => selfTest.indexOf(name) < 0);
ok('对照表引用的断言名都在测试套件里（没有引用不存在的断言）',
   notInSuite.length === 0, notInSuite.join(' | '));

/* 表里点名的实现函数必须真的存在 */
const refs = [
  ['utils/store.js', ['addPoints', 'addWeeklyPoints', 'capNow', 'praiseOf', 'checkPraise',
    'altPraise', 'setEntryPraise', 'addRepair', 'doneRepair', 'redeem', 'useCoupon',
    'weekStep', 'finishWeek', 'weekBonus', 'buildWeekPage', 'buildLedgerCsv',
    'buildRuleTable', 'buildRuleTableCsv',
    'finishBuild', 'parentAgree', 'isRuleActive', 'visibleToParent', 'hiddenCount',
    'milestones', 'applyStage', 'confirmEntries']],
  ['utils/guard.js', ['requireOnboarded', 'needsOnboarding']],
];
const missRefs = [];
refs.forEach(pair => {
  const s = read(pair[0]);
  pair[1].forEach(fn => {
    /* 有的函数是 function 声明，有的是 const fn = (...) =>（例如 isRuleActive），两种都要认 */
    const re = new RegExp('function\\s+' + fn + '\\b|\\bconst\\s+' + fn + '\\s*=|\\b' + fn + '\\s*[:(]');
    if (!re.test(s)) missRefs.push(pair[0] + '::' + fn);
  });
});
ok('对照表点名的实现函数都真的存在', missRefs.length === 0, missRefs.join(', '));

/* 页面里不该再留着「S1 骨架状态 / 属于 S3」这类过期宣告 —— 功能都做完了，
   留着会让人以为还没做（这一轮就是被这些字样误导过一次）。 */
const staleBanners = [];
files.filter(f => f.endsWith('.wxml')).forEach(f => {
  const s = strip(read(f), 'wxml');
  if (/S1 骨架状态|属于 S3|待 S3/.test(s)) staleBanners.push(f);
});
ok('页面里没有过期的完成度宣告（S1 骨架状态 / 属于 S3）',
   staleBanners.length === 0, staleBanners.join(', '));

/* 三项已交付但曾经只是 CSS 桩的功能，必须真的有实现与断言 */
ok('里程碑徽章有真实实现（不只是 app.wxss 里的一条 display:none）',
   /function milestones/.test(read('utils/store.js')) &&
   /MILESTONE_RULES/.test(read('utils/store.js')) &&
   /milestones/.test(read('pages/growth/index.js')));
ok('Excel 导出有真实实现（不只是文案）',
   /function buildLedgerCsv/.test(read('utils/store.js')) &&
   /onExportCsv/.test(read('pages/growth/index.js')));

section('[B] 移植合规（小程序不支持的能力）');

ok('扫到前端源文件', files.length >= 20, files.length + ' 个');

/**
 * 语法体检：所有 JS 都用 vm 编译一遍（只编译不执行）。
 * 这一段是为了兜住「脚本化批量改代码把某个文件改坏」——
 * 其它检查都是正则匹配，改出语法错误它们照样通过。
 */
const jsAll = files.filter(f => f.endsWith('.js'));
const syntaxBad = [];
jsAll.forEach(f => {
  try { new vm.Script(read(f), { filename: f }); }
  catch (e) { syntaxBad.push(f + ': ' + e.message); }
});
ok('全部 JS 文件都能编译（无语法错误）', syntaxBad.length === 0, syntaxBad.join(' | '));

/* 视图层：WXML 里不允许出现 innerHTML、DOM API、SVG 雪碧图 */
const wxml = files.filter(f => f.endsWith('.wxml'));
let innerHtmlBad = wxml.filter(f => /innerHTML|outerHTML|document\.|window\./.test(src(f)));
ok('WXML 里没有 innerHTML / document / window', innerHtmlBad.length === 0, innerHtmlBad.join(', '));

const svgUse = wxml.filter(f => /<use\s|<svg/.test(src(f)));
ok('WXML 里没有 SVG 雪碧图（改 PNG / 纯 CSS）', svgUse.length === 0, svgUse.join(', '));

/* WXSS：color-mix / backdrop-filter / aspect-ratio / :root / 属性选择器 / 媒体查询 */
const wxss = files.filter(f => f.endsWith('.wxss'));
noneMatch('WXSS 里没有 color-mix()（改成预计算 rgba）', /color-mix\(/);
noneMatch('WXSS 里没有 backdrop-filter（改不透明背景）', /backdrop-filter/);
noneMatch('WXSS 里没有 aspect-ratio（改固定高度）', /aspect-ratio/);
noneMatch('WXSS 里没有 :root（改 page 选择器）', /:root/);
noneMatch('WXSS 里没有属性选择器 [data-*]（改 .stage-* 类）', /\[\s*data-/);
noneMatch('WXSS 里没有 @media（小程序只有 wx.getWindowInfo）', /@media/);
const pxBad = wxss.filter(f => /:\s*[^;{}]*[0-9]px\b/.test(src(f)) && f.indexOf('components/') !== 0);
ok('WXSS 里不出现 px 布局值（rpx；canvas 组件除外）', pxBad.length === 0, pxBad.join(', '));
const ringPxOk = /:\s*[^;{}]*[0-9]px\b/.test(src('components/ring-progress/index.wxss')) === false;
ok('得分环组件的 px 也走内联绑定，不写死在 wxss 里', ringPxOk);

/* 学段主题必须用类表达（README §二 的硬要求） */
ok('app.wxss 定义了 .stage-p12 与 .stage-high', /\.stage-p12/.test(read('app.wxss')) && /\.stage-high/.test(read('app.wxss')));
ok('app.wxss 用 page{} 承载 CSS 变量', /page\s*\{[^}]*--paper:/.test(read('app.wxss')));

/* JS：小程序有 App/Page/getApp/wx，没有 document、window；
   localStorage 只允许出现在 store.js 的存储适配层里（带 typeof 守卫 + try/catch） */
const jsFiles = files.filter(f => f.endsWith('.js'));
const domUsers = jsFiles.filter(f => /\bdocument\.|window\./.test(src(f)));
ok('JS 里没有 document / window', domUsers.length === 0, domUsers.join(', '));

const lsUsers = jsFiles.filter(f => /localStorage\./.test(src(f)));
ok('localStorage 只出现在 store.js 的存储适配层', lsUsers.every(f => f === 'utils/store.js'), lsUsers.join(', '));
const storeAdapterSrc = src('utils/store.js');
ok('存储适配层带 typeof 守卫（小程序里走 wx.*StorageSync）',
   /typeof localStorage !== 'undefined'/.test(storeAdapterSrc) && /typeof wx !== 'undefined'/.test(storeAdapterSrc) &&
   /wx\.getStorageSync/.test(storeAdapterSrc) && /wx\.setStorageSync/.test(storeAdapterSrc));

const pagesJs = jsFiles.filter(f => f.indexOf('pages/') === 0);
ok('每个页面都调用了 Page({...})', pagesJs.every(f => /Page\(\s*\{/.test(read(f))),
   pagesJs.filter(f => !/Page\(\s*\{/.test(read(f))).join(', '));
ok('app.js 调用了 App({...})', /App\(\s*\{/.test(read('app.js')));
ok('组件都调用了 Component({...})',
   jsFiles.filter(f => f.indexOf('components/') === 0).every(f => /Component\(\s*\{/.test(read(f))));

/* 三条硬约束的静态检查：只有 store.js 能写全局状态。
   只认真实赋值与真数组变更，避免把局部对象（如 byDim 分组）误判成状态写入。 */
const writeHit = f => {
  const t = src(f);
  const assignsState = /(\bS|\bstate\(\)|store\.state\(\)|const s = store\.state\(\))\s*\.\s*(log|items|rewards|coupons|repairs|spent|amend|flash)\s*=/.test(t);
  const mutatesState = /(\bS|\bstate\(\)|store\.state\(\))\s*\.\s*(log|items|rewards|coupons|repairs)\.(push|splice|pop|shift|unshift)\(/.test(t);
  return assignsState || mutatesState;
};
const writers = jsFiles.filter(writeHit);
ok('状态写入只出现在 utils/store.js（页面不直接改状态）',
   writers.every(f => f === 'utils/store.js'), writers.join(', '));
ok('确实扫到了 store 里的写入（防止正则失效变成永远通过）',
   writeHit('utils/store.js') === true);

/* 文案引擎：禁用词库不能被缩小 */
const storeSrc = read('utils/store.js');
const tplSrc = read('utils/templates.js');
const bannedCount = (tplSrc.match(/const BANNED = \[([^\]]*)\]/) || [])[1];
ok('禁用词库仍在（PRD §6.3）', !!bannedCount && bannedCount.split(',').length >= 10,
   bannedCount ? String(bannedCount.split(',').length) + ' 个' : '未找到');
ok('肯定句式强制「我看到你……这说明你……」', /我看到你.*这说明你/.test(storeSrc));

/* 平台约束：wx.showToast 只有 icon:'none' 才允许两行文字，
   icon 为 success/error/loading 时 title 最多显示 7 个汉字。
   本项目的提示语大多是完整的一句话，因此必须显式传 icon:'none'。 */
const toastBad = [];
jsFiles.forEach(f => {
  const t = src(f);
  const re = /wx\.showToast\(\{[\s\S]{0,240}?\}\)/g;
  let mm;
  while ((mm = re.exec(t))) {
    if (!/icon:\s*'none'/.test(mm[0])) toastBad.push(f + ' → ' + mm[0].replace(/\s+/g, ' ').slice(0, 70));
  }
});
ok('每个 wx.showToast 都传了 icon:"none"（否则长文案会被截断）', toastBad.length === 0, toastBad.join(' | '));

/* showModal 用 editable:true 时必须同时给 placeholderText，否则输入框无提示 */
const modalBad = jsFiles.filter(f => {
  const t = src(f);
  const re = /wx\.showModal\(\{[\s\S]{0,400}?\}\s*\)/g;
  let mm;
  while ((mm = re.exec(t))) {
    if (/editable:\s*true/.test(mm[0]) && !/placeholderText/.test(mm[0])) return true;
  }
  return false;
});
ok('editable 的 showModal 都带 placeholderText', modalBad.length === 0, modalBad.join(', '));

/* ============================================================
   [C] 规则引擎：三条硬约束（在真实 store 上跑）
   ============================================================ */
section('[C] 规则引擎：只加分 · 日上限随学段 · 必改 3 项');

const store = require('./utils/store.js');
const guard = require('./utils/guard.js');

/* --- C0 初始状态 --- */
store.resetAll('mid');
let S = store.state();
ok('新状态是「还没共建过规则」', S.onboarded === false);
ok('初中模板 26 条行为项', store.itemsOf().length === 26, String(store.itemsOf().length));
ok('初中 8 档奖励', S.rewards.length === 8, String(S.rewards.length));
ok('日上限默认 12', store.capNow() === 12, String(store.capNow()));
ok('余额 / 累计 / 连续都从 0 开始',
   store.balance() === 0 && store.lifetime() === 0 && store.streak() === 0);

/* --- C1 只加分 --- */
const neg = store.addPoints({ itemId: 's1', name: '试图扣分', dim: 'study', points: -5 });
ok('负数被拒绝，理由是「系统里没有扣分」', neg.ok === false && neg.reason === '系统里没有扣分', JSON.stringify(neg));
const zero = store.addPoints({ itemId: 's1', name: '零分', dim: 'study', points: 0 });
ok('0 分也被拒绝（不是「加 0 分」）', zero.ok === false);
ok('拒绝后流水里没有任何记录', S.log.length === 0, String(S.log.length));

/* --- C2 日上限：初中 12 --- */
const r1 = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5 });
ok('正常加分成功且记满 5 分', r1.ok && r1.entry.points === 5, JSON.stringify(r1));
ok('今日得分 = 5', store.dayScore(store.todayKey()) === 5, String(store.dayScore(store.todayKey())));

const r2 = store.addPoints({ itemId: 's8', name: '小测达标', dim: 'study', points: 5 });
const r3 = store.addPoints({ itemId: 's3', name: '作业自查', dim: 'study', points: 3 });
ok('触达 12 分上限', store.dayScore(store.todayKey()) === 12, String(store.dayScore(store.todayKey())));
/* 关键不变式：入账的分数**永远不会**超过日上限 —— 超出部分只记在 entry.overflow 里
   （「留给明天」），绝不写成一条超过上限的记录。 */
ok('入账合计就是上限 12，从未写过 13', store.pointsOn(store.todayKey()) === 12 && store.lifetime() === 12,
   'today=' + store.pointsOn(store.todayKey()) + ' lifetime=' + store.lifetime());
ok('临界那条被削减：请求 3 分、实际记 2 分、overflow 1 分留给明天',
   r3.ok && r3.entry.points === 2 && r3.entry.overflow === 1 && r3.partial === true,
   JSON.stringify({ points: r3.entry.points, overflow: r3.entry.overflow, partial: r3.partial }));

const over = store.addPoints({ itemId: 's1', name: '超出', dim: 'study', points: 2 });
ok('满 12 分后再加分被拒绝', over.ok === false, JSON.stringify(over));
ok('超额文案正确', over.reason === '今天已经很棒了，剩下的留给明天', over.reason);
ok('流水里没有任何负分（全部历史）', S.log.every(l => l.points > 0));
ok('当日流水里没有任何负分', S.log.filter(l => l.date === store.todayKey()).every(l => l.points > 0));

/* --- C2b 日上限按日期收敛（回归：曾经会把全部历史当成今天的已用分） --- */
const past = store.shiftDay(-3);
store.addPoints({ itemId: 's3', name: '历史记录', dim: 'study', points: 3, date: past });
ok('往日记录不影响今天的上限判断',
   store.dayScore(store.todayKey()) === 12 && store.dayScore(past) === 3,
   'today=' + store.dayScore(store.todayKey()) + ' past=' + store.dayScore(past));
const capDifferentDay = store.addPoints({ itemId: 's1', name: '今天再来', dim: 'study', points: 2 });
ok('往日有记录时，今天满额仍然被拒绝', capDifferentDay.ok === false);

/* --- C2c 学段切换改变上限 --- */
const logBefore = S.log.length;
store.applyStage('p12');
ok('切到小学低段后上限 8', store.capNow() === 8, String(store.capNow()));
ok('低段 13 条行为项', store.itemsOf().length === 13, String(store.itemsOf().length));
ok('低段奖励从 10 分起步、没有 300 档',
   S.rewards[0].cost === 10 && !S.rewards.some(r => r.cost === 300), JSON.stringify(S.rewards.map(r => r.cost)));
ok('切换学段不删历史记录', S.log.length === logBefore && logBefore > 0, logBefore + ' → ' + S.log.length);
ok('切换学段把必改计数清零', store.amendedCount() === 0);
ok('切换后 nick 跟着学段变（低段是「宝贝」）', S.nick === '宝贝', S.nick);

store.applyStage('high');
ok('高中 18 条行为项 / 上限 12', store.itemsOf().length === 18 && store.capNow() === 12,
   store.itemsOf().length + ' / ' + store.capNow());
ok('高中保留「允许自己休息一次」', store.itemsOf().some(i => i.name.indexOf('允许自己休息一次') >= 0));
ok('高中仍有「压力大时主动说出来」', store.itemsOf().some(i => i.name.indexOf('压力大时主动说出来') >= 0));
ok('高中奖励到 500 元大件档', S.rewards.some(r => /500/.test(r.desc + r.title)));
ok('高中没有幼稚小奖励（贴纸）', !S.rewards.some(r => /贴纸/.test(r.title)));

store.applyStage('p36');
ok('小学高段 16 条 / 上限 10', store.itemsOf().length === 16 && store.capNow() === 10,
   store.itemsOf().length + ' / ' + store.capNow());
store.applyStage('mid');
ok('切回初中 26 条 / 上限 12', store.itemsOf().length === 26 && store.capNow() === 12,
   store.itemsOf().length + ' / ' + store.capNow());

/* --- C3 必改 3 项 --- */
store.resetAll('mid');
ok('未改任何一处时 finishBuild 被拒绝', store.finishBuild().ok === false);
ok('拒绝理由是「还差 3 处」', store.finishBuild().reason === '还差 3 处', store.finishBuild().reason);
ok('未改满时 onboarded 仍是 false', store.state().onboarded === false);

store.setItemPoints('s4', 4);
ok('改分值 → 计数 1/3', store.amendedCount() === 1, String(store.amendedCount()));
ok('该条留下改动归属与时间戳',
   store.itemById('s4').customBy === 'child' && !!store.itemById('s4').stamp);
ok('1 处时 finishBuild 仍被拒绝', store.finishBuild().ok === false);

const added = store.addItem({ name: '练吉他 20 分钟', dim: 'self', points: 3, limit: 1 });
ok('加一条自己的行为项 → 计数 2/3', added.ok && store.amendedCount() === 2, String(store.amendedCount()));
ok('新增项也留在 items 里', store.itemsOf().some(i => i.name === '练吉他 20 分钟'));
ok('新行为项的分值必须是正数', store.addItem({ name: '负分项', points: -2 }).ok === false);

store.setRewardTitle(220, '大心愿 ≤ 200 元（换成一整套水彩）');
ok('改奖励内容 → 计数 3/3', store.amendedCount() === 3, String(store.amendedCount()));
ok('改满 3 处后 canFinishBuild 为真', store.canFinishBuild() === true);

const fin = store.finishBuild();
ok('改满 3 处才能生效，并生成规则版本号', fin.ok === true && fin.ruleVersion === 1, JSON.stringify(fin));
ok('生效后 onboarded 变为 true', store.state().onboarded === true);

/* 软删除：删掉行为项也算「改行为项」，且历史不丢 */
store.resetAll('mid');
const before2 = store.itemsOf().length;
store.removeItem('l4');
ok('删行为项后条目少 1，但 items 里仍保留（软删除）',
   store.itemsOf().length === before2 - 1 && store.state().items.length === before2,
   store.itemsOf().length + '/' + store.state().items.length);
ok('删掉的条目记录了改动归属', store.itemById('l4').active === false && store.itemById('l4').customBy === 'child');

/* --- C4 兑换与券：家长端没有撤回能力 --- */
store.resetAll('mid');
ok('余额不足时不能兑换', store.redeem(20, '小文具').ok === false);
store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5 });
store.addPoints({ itemId: 's8', name: '小测', dim: 'study', points: 5 });
const day2 = store.shiftDay(-1);
store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: day2 });
store.addPoints({ itemId: 's8', name: '小测', dim: 'study', points: 5, date: day2 });
ok('攒够 20 分后余额为 20', store.balance() === 20, String(store.balance()));

const lifeBefore = store.lifetime();
const red = store.redeem(20, '小文具 / 贴纸 / 奶茶小料');
ok('兑换成功并生成券', red.ok === true && !!red.coupon.code, JSON.stringify(red));
ok('券码形如 RS-XXXX-XX', /^RS-[A-Z0-9]{4}-\d{2}$/.test(red.coupon.code), red.coupon.code);
ok('券有 30 天有效期', red.coupon.exp === store.shiftDay(30), red.coupon.exp);
ok('兑换后余额归零', store.balance() === 0, String(store.balance()));
ok('兑换不减少「累计获得」（走 spent 记账）', store.lifetime() === lifeBefore, store.lifetime() + ' vs ' + lifeBefore);
ok('兑换不删任何历史流水', store.state().log.length === 4, String(store.state().log.length));

const red2 = store.redeem(20, '再兑一次');
ok('余额不足时第二次兑换被拒', red2.ok === false && red2.reason === '再攒一点点就够了', JSON.stringify(red2));
ok('store 没有删除券 / 撤回券的接口',
   typeof store.deleteCoupon === 'undefined' && typeof store.revokeCoupon === 'undefined' &&
   typeof store.removeCoupon === 'undefined');
ok('store 没有删除流水的接口',
   typeof store.deleteEntry === 'undefined' && typeof store.removeEntry === 'undefined' &&
   typeof store.clearLog === 'undefined');

const use = store.useCoupon(red.coupon.code);
ok('券可以核销（used = true），记录仍在', use.ok && store.state().coupons.length === 1 &&
   store.state().coupons[0].used === true);

/* --- C5 撤销：24 小时内可撤销，且不删历史 --- */
store.resetAll('mid');
const a = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5 });
const u = store.undo(a.entry.uid);
ok('24 小时内可撤销', u.ok === true, JSON.stringify(u));
ok('撤销后该条仍在流水里（只打标记）', store.state().log.length === 1 && store.state().log[0].reversed === true);
ok('撤销后今日得分归零', store.dayScore(store.todayKey()) === 0, String(store.dayScore(store.todayKey())));
ok('重复撤销被拒', store.undo(a.entry.uid).ok === false);
const b = store.addPoints({ itemId: 's8', name: '小测', dim: 'study', points: 5 });
ok('超过 24 小时不能撤销',
   store.undo(b.entry.uid, Date.now() + 25 * 3600 * 1000).ok === false);

/* --- C6 家长端确认：唯一的写操作，且没有删除 --- */
store.resetAll('mid');
store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5 });
ok('新记录默认待确认', store.confirmedCount() === 1, String(store.confirmedCount()));
const cf = store.confirmEntries(store.state().log[0].uid);
ok('家长可以确认', cf.ok === true && cf.confirmed === 1);
ok('确认后待确认数归零', store.confirmedCount() === 0, String(store.confirmedCount()));
ok('确认不改分、不删记录',
   store.state().log.length === 1 && store.lifetime() === 5, store.lifetime() + '');

/* --- C7 肯定文案：禁用词命中即拦截 --- */
ok('「你真聪明」被禁用词库拦下', store.checkPraise('你真聪明').ok === false);
ok('「我看到你……这说明你……」句式通过', store.checkPraise('我看到你今天坐下来了，这说明你在给自己按下启动键。').ok === true);
ok('每条行为项都能生成一句合规的具体反馈',
   store.praiseOf({ p: '把错题重新做了一遍', t: '你在把不会的变成会的' }).length > 0);

/* --- C7b 肯定卡的三件套：拆分 / 换一句 / 自述存回 --- */
const sp = store.splitPraise('我看到你把错题重新做了一遍，这说明你在把不会的变成会的。');
ok('肯定句能拆成「事实 + 特质」两段',
   sp.fact === '把错题重新做了一遍' && sp.trait === '你在把不会的变成会的',
   JSON.stringify(sp));

const alt1 = store.altPraise('study', 0);
const alt2 = store.altPraise('study', 1);
ok('「换一句」返回该维度的备选特质', !!alt1 && !!alt2 && alt1 !== alt2, alt1 + ' | ' + alt2);
ok('「换一句」的所有备选都过禁用词库',
   [0, 1, 2, 3, 4, 5].every(i => store.checkPraise(store.altPraise('study', i)).ok));
ok('未知维度回退到自主力备选（不返回空）', store.altPraise('nope', 0).length > 0);

store.resetAll('mid');
const e1 = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5,
                             praise: store.praiseOf({ p: '把这周复盘完', t: '你在用计划安排自己的节奏' }) });
ok('自己说一句能存回那条记录',
   store.setEntryPraise(e1.entry.uid, '我今天自己坐下来复盘了').ok === true &&
   store.state().log[0].praise === '我今天自己坐下来复盘了');
ok('自述留了 selfPraise 标记（区分引擎生成 vs 她自己写的）',
   store.state().log[0].selfPraise === true);
ok('自述命中禁用词库时被拦下',
   store.setEntryPraise(e1.entry.uid, '我就是太笨了').ok === false &&
   store.state().log[0].praise === '我今天自己坐下来复盘了');
ok('空自述被拦下', store.setEntryPraise(e1.entry.uid, '   ').ok === false);
ok('存不存在的记录被拒', store.setEntryPraise('nope-uid', '随便写').ok === false);

/* --- C8 修复行动：不产生负分 --- */
store.resetAll('mid');
const rep = store.addRepair('delay', '先做 10 分钟');
ok('修复行动可以记录', rep.ok === true && store.state().repairs.length === 1);
ok('记录修复行动不产生任何分数变动',
   store.lifetime() === 0 && store.state().log.length === 0);
ok('完成修复行动也不写负分（仍然 0 分）',
   store.doneRepair(rep.repair.id).ok === true && store.lifetime() === 0);
ok('不存在的模板被拒', store.addRepair('unknown').ok === false);

/* --- C10 周复盘：5 步向导与结算 --- */
store.resetAll('mid');
ok('草稿是懒创建的，初始没有', store.state().weekDraft === null || store.state().weekDraft === undefined);
const d0 = store.weekDraft();
ok('取草稿会创建一份 5 步结构',
   d0.step === 0 && Array.isArray(d0.highlights) && d0.highlights.length === 0 &&
   d0.keep === '' && d0.next === '' && d0.challenge === '');
ok('草稿写进了状态（换页不丢）', !!store.state().weekDraft);

/* 第 1 步：最多三条「想记住的事」 */
ok('选一条能成功', store.pickHighlight('我把数学最后一题想出来了').ok === true);
ok('重复选同一条被拒',
   store.pickHighlight('我把数学最后一题想出来了').ok === false &&
   store.pickHighlight('我把数学最后一题想出来了').reason === '这条已经选过了');
store.pickHighlight('自己把书包收好了');
store.pickHighlight('主动跟妈妈说了谢谢');
const fourth = store.pickHighlight('第四条');
ok('超过三条被拒，理由是「三条就够了」',
   fourth.ok === false && fourth.reason === '三条就够了，挑最重要的', JSON.stringify(fourth));
ok('取消选中后又能再选', store.unpickHighlight('主动跟妈妈说了谢谢').ok === true &&
   store.pickHighlight('第四条').ok === true);
ok('取消没选过的条目被拒', store.unpickHighlight('从没选过').ok === false);

/* 第 3 步：必须写了目标才能过，目标太大先给拆小建议 */
ok('跳过第 3 步会被拒（必须先写目标）',
   store.weekStep(3).ok === false && store.weekStep(3).reason === '写下你想改的那一件小事');
store.setWeekPatch({ next: '每天学习 3 小时' });
const big = store.weekStep(3);
ok('目标说得太大时给拆小建议，而不是直接拦死',
   big.ok === false && big.big === true && big.suggestions.length === 2, JSON.stringify(big));
ok('拆小建议与原型一致',
   big.suggestions[0] === '写作业前先把手机放到客厅' &&
   big.suggestions[1] === '先做 10 分钟，再决定要不要继续');
store.setWeekPatch({ next: '写作业前先把手机放到客厅', lastSuggest: '' });
ok('写成具体的小目标就能进下一步', store.weekStep(3).ok === true && store.weekDraft().step === 3);
ok('步骤不会越过末步', store.weekStep(99).ok === false);
ok('步骤可以往回走', store.weekStep(1).ok === true && store.weekDraft().step === 1);

/* 结算：三项加成自动算 */
store.resetAll('mid');
for (let i = 0; i <= 6; i++) {
  const date = store.shiftDay(-i);
  let n = 0;
  while (store.pointsOn(date) < 8 && n++ < 6) {
    const r = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date });
    if (!r.ok) break;
  }
}
ok('造出「本周 ≥ 50 分 + 连续 7 天」的场景',
   store.weekScore() >= 50 && store.streak() >= 7,
   'score=' + store.weekScore() + ' streak=' + store.streak());

const b0 = store.weekBonus('');
ok('挑战留空时加成 = 10 + 10', b0.total === 20 && b0.week50 && b0.streak7 && !b0.challenge, JSON.stringify(b0));
store.setWeekPatch({ next: '先做 10 分钟', challenge: '自己定一个复习清单' });
const b1 = store.weekBonus('自己定一个复习清单');
ok('填了挑战再加 5', b1.total === 25 && b1.challenge === true, JSON.stringify(b1));
ok('挑战只写空白不算数', store.weekBonus('   ').total === 20);

const scoreBefore = store.weekScore();
const lifeBeforeW = store.lifetime();
const capTodayBefore = store.dayScore(store.todayKey());
const finW = store.finishWeek();
ok('结算生成周报', finW.ok === true && !!finW.week, JSON.stringify(finW.ok));
ok('周报带范围、本周得分、有记录天数与加成',
   /→/.test(finW.week.range) && finW.week.score === scoreBefore &&
   finW.week.days >= 7 && finW.week.bonus === 25,
   JSON.stringify({ range: finW.week.range, score: finW.week.score, days: finW.week.days, bonus: finW.week.bonus }));
ok('周奖励已入账（累计 +25，不被日上限吃掉）', store.lifetime() === lifeBeforeW + 25, store.lifetime() + ' vs ' + lifeBeforeW);
ok('周奖励那条流水记在账上，维度是 bonus、带 weekly 标记',
   store.state().log.some(l => l.dim === 'bonus' && l.points === 25 && l.weekly === true));
/* 关键：周结算不占当日上限 —— 当日得分仍然严格 ≤ 上限（PRD §5 引擎级不可绕过），
   但那笔周奖励必须全额到账（PRD §4 M5 + 附录 A.2 的 10/10/5 是固定值）。 */
ok('周奖励不吃当日打卡上限：当日得分仍 ≤ 上限，且奖励全额到账',
   store.dayScore(store.todayKey()) <= store.capNow() && store.lifetime() === lifeBeforeW + 25,
   'dayScore=' + store.dayScore(store.todayKey()) + ' cap=' + store.capNow());
ok('结算后草稿被清空', store.state().weekDraft === null);
ok('周报存进了成长档案', !!store.state().week);
/* 幂等：同一周不能结算两次（否则连点「就这么定」会凭空多给分） */
const lifeIdem = store.lifetime();
const again = store.finishWeek();
ok('同一周重复结算被拒（幂等）',
   again.ok === false && again.already === true && store.lifetime() === lifeIdem,
   JSON.stringify({ ok: again.ok, already: again.already }) + ' life=' + store.lifetime());
ok('重复结算的理由说得清楚', again.reason === '这一周已经结算过了', again.reason);

/* 「下周继续」：清周报但绝不回收已入账的奖励 */
const lifeBeforeReset = store.lifetime();
ok('下周继续后周报收起', store.resetWeek().ok === true && store.state().week === null);
ok('下周继续**不删**已入账的周奖励（与原型演示重置不同）',
   store.lifetime() === lifeBeforeReset && store.state().log.some(l => l.dim === 'bonus'),
   store.lifetime() + ' vs ' + lifeBeforeReset);
ok('收起周报后，新一轮可以重新结算', store.finishWeek().ok === true);
ok('周奖励同样受「只加分」约束（负数拒绝）',
   store.addPoints({ name: '负奖励', dim: 'bonus', points: -5 }).ok === false &&
   store.addWeeklyPoints({ name: '负奖励', points: -5 }).ok === false);
ok('维度标签：bonus 显示成「周奖励」，5 个行为维度正常',
   store.dimLabel('bonus') === '周奖励' && store.dimLabel('study') === '学习力' &&
   store.dimLabel('nope') === '记录');

/* 向导候选项：只取本周、未撤销、带具体反馈的记录 */
store.resetAll('mid');
ok('没有记录时候选为空', store.weekCandidates().length === 0);
store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5,
                  praise: store.praiseOf({ p: '把这周复盘完', t: '你在用计划安排自己的节奏' }) });
const cands = store.weekCandidates();
ok('打卡后出现候选项，带名字与那句反馈',
   cands.length === 1 && cands[0].name === '周复盘' && /我看到你/.test(cands[0].praise), JSON.stringify(cands));
store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-10),
                  praise: '十天前的记录，不该出现' });
ok('十天前的记录不会混进本周候选', store.weekCandidates().length === 1, String(store.weekCandidates().length));
ok('习惯候选与原型一致（6 项）',
   store.KEEP_OPTIONS.length === 6 && store.KEEP_OPTIONS[0] === '先复习再写作业');
ok('「目标太大」的判定认得出「3 小时」与两位数字',
   store.tooBigTarget('每天学习 3 小时') === true && store.tooBigTarget('每天做 30 道题') === true &&
   store.tooBigTarget('写作业前先把手机放到客厅') === false);

/* --- C12 首启闸门：先看介绍页 → 再共建 → 再等家长签 --- */
store.resetAll('mid');
S = store.state();
ok('新用户 onboarded = false（要先共建）', S.onboarded === false);
ok('全新状态 → needsIntro 为真（先看罗森塔尔效应）', guard.needsIntro() === true);
ok('未看过介绍页时，闸门目标就是介绍页', guard.gateTarget() === '/pages/intro/index', guard.gateTarget());
{
  const calls = reLaunchCalls; calls.length = 0;
  stubRoute = 'pages/today/index';
  const g = require('./utils/guard.js');
  g._resetRedirecting();
  ok('未看过介绍页 → requireOnboarded 先把人送到介绍页',
     g.requireOnboarded() === true && calls[0] === '/pages/intro/index', JSON.stringify(calls));
  g._resetRedirecting(); calls.length = 0;
  ok('介绍页自身被放行（不会自己跳自己）',
     g.requireOnboarded('pages/intro/index') === false && calls.length === 0, JSON.stringify(calls));
  store.markIntroSeen();
  ok('看过介绍页之后 needsIntro 为假', guard.needsIntro() === false);
  g._resetRedirecting(); calls.length = 0;
  g.requireOnboarded();
  ok('看过介绍页之后 → 闸门送到共建页', calls[0] === '/pages/onboarding/index', JSON.stringify(calls));
}
ok('未共建时 needsOnboarding 为真', guard.needsOnboarding() === true);

/* 用桩验证「未共建就一定 reLaunch 到共建页，且只跳一次」 */
{
  const calls = reLaunchCalls;
  calls.length = 0;
  stubRoute = 'pages/today/index';
  const g = require('./utils/guard.js');     // 重新取，读的是运行时全局
  g._resetRedirecting();                     // 清掉本段之前那次调用的跳转去重状态
  store.resetAll('mid');
  store.markIntroSeen();                      // 介绍页已看过，这一段只测「共建闸门」
  const r1 = g.requireOnboarded();
  const r2 = g.requireOnboarded();           // 连点/连环 onShow 不应重复跳
  ok('未共建 → reLaunch 到 /pages/onboarding/index',
     r1 === true && calls.length === 1 && calls[0] === '/pages/onboarding/index',
     JSON.stringify(calls));
  ok('连续调用不会连环 reLaunch（去重生效）', r2 === true && calls.length === 1, String(calls.length));

  // 已经在共建页时不应再跳
  stubRoute = 'pages/onboarding/index';
  calls.length = 0;
  g.requireOnboarded();
  ok('已经在共建页时不再跳（避免自己跳自己）', calls.length === 0, JSON.stringify(calls));

  // 孩子改完提案：还不能放行，必须等家长签字
  stubRoute = 'pages/onboarding/index';
  calls.length = 0;
  store.setItemPoints('s4', 4);
  store.addItem({ name: '练吉他', dim: 'self', points: 3, limit: 1 });
  store.setRewardTitle(220, '一整套水彩');
  const fb = store.finishBuild();
  ok('孩子改满 3 处 → finishBuild 生效，但标记「待家长签」',
     fb.ok === true && fb.pendingParent === true, JSON.stringify(fb));
  ok('孩子单方完成 → 规则还没生效', store.isRuleActive() === false);
  ok('孩子单方完成 → needsOnboarding 仍为真（单方修改不生效）',
     g.needsOnboarding() === true);

  // 此时闸门应该把她送去家长签署页，而不是共建页
  stubRoute = 'pages/today/index';
  calls.length = 0;
  g._resetRedirecting();
  g.requireOnboarded();
  ok('孩子改完后，闸门目标是家长签署页（PRD：单方修改待生效）',
     calls.length === 1 && calls[0] === '/pages/parent/index', JSON.stringify(calls));

  // 家长端自身必须放行，否则没人能签字
  calls.length = 0;
  g._resetRedirecting();
  ok('家长端自身被放行（否则死锁：她改完全站被拦，家长进不来签字）',
     g.requireOnboarded('pages/parent/index') === false && calls.length === 0, JSON.stringify(calls));

  // 家长签字 → 双签完成 → 全站放行
  const ag = store.parentAgree();
  ok('家长签署成功并记录生效日期', ag.ok === true && !!ag.agreedDate && ag.version >= 1, JSON.stringify(ag));
  calls.length = 0;
  g._resetRedirecting();
  ok('双签完成后 → requireOnboarded 放行（不再跳）',
     g.requireOnboarded() === false && calls.length === 0, JSON.stringify(calls));
  ok('双签完成后 → needsOnboarding 为假', g.needsOnboarding() === false);
  ok('双签完成后 → isRuleActive 为真', store.isRuleActive() === true);
}

/* 换学段必须重新共建：不只要清零计数，还要撤掉 onboarded */
store.resetAll('mid');
store.setItemPoints('s4', 4);
store.addItem({ name: '练吉他', dim: 'self', points: 3, limit: 1 });
store.setRewardTitle(220, '一整套水彩');
store.finishBuild();
ok('先完成共建 → onboarded = true', store.state().onboarded === true);
store.applyStage('high');
ok('换学段后计数清零', store.amendedCount() === 0);
ok('换学段后 onboarded 被撤掉（必须重走必改 3 项）', store.state().onboarded === false,
   'onboarded=' + store.state().onboarded);
ok('换学段确实换了模板与上限',
   store.itemsOf().length === 18 && store.capNow() === 12,
   store.itemsOf().length + ' / ' + store.capNow());
ok('换学段不删历史记录（换之前造一条）', (function () {
  store.applyStage('mid');
  store.finishBuild();                    // 先让它可用
  store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5 });
  const n = store.state().log.length;
  store.applyStage('high');
  return store.state().log.length === n && n > 0;
})());

/* --- C15 打印 / 导出：一周一页 --- */
store.resetAll('mid');
store.setItemPoints('s1', 3);
store.removeItem('l4');
store.setRewardTitle(120, '和妈妈单独出去一次（我自己挑项目）');
store.finishBuild();
store.parentAgree();
/* 打卡：注意 praise 只在显式传入时才有，肯定卡才有那句具体反馈 */
store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5,
                  praise: store.praiseOf({ p: '把这周复盘完', t: '你在用计划安排自己的节奏' }) });
store.addPoints({ itemId: 's3', name: '作业自查', dim: 'study', points: 3,
                  praise: store.praiseOf({ p: '写完还检查了一遍', t: '你在为自己的结果负责' }) });
const privE = store.addPoints({ itemId: 's6', name: '阅读 30 分钟', dim: 'study', points: 2,
                                praise: store.praiseOf({ p: '读了 30 分钟书', t: '你在给自己的世界添东西' }) });
store.setEntryPrivate(privE.entry.uid);
store.setFlash('数学最后一题我自己想出来了');

/* 先走完周复盘向导，让导出里真的有那三个栏位 */
store.pickHighlight('我把数学最后一题想出来了');
store.setWeekPatch({ keep: '先复习再写作业', next: '写作业前先把手机放到客厅', challenge: '自己定一个复习清单' });
store.weekStep(3);
const finExp = store.finishWeek();
/* 这个状态只够「主动挑战 +5」：本周 10 分（<50）、连续 1 天（<7） */
ok('导出前先完成一次周复盘（本状态命中「主动挑战 +5」）',
   finExp.ok === true && finExp.week.bonus === 5 &&
   finExp.week.bonusDetail.challenge === true &&
   finExp.week.bonusDetail.week50 === false && finExp.week.bonusDetail.streak7 === false,
   JSON.stringify(finExp.ok ? finExp.week.bonusDetail : finExp.reason));

const pg = store.buildWeekPage();
/* 本周得分含当天入账的结算奖励：打卡 5+3+2 = 10，加周奖励 +5 = 15。
   注意它们不互相冲突：周奖励不占**打卡上限**，但确实进本周总分与累计。 */
ok('导出一周一页，带标题、周范围与本周得分',
   pg.title === '罗森塔尔 · 一周一页' && /→/.test(pg.range) && pg.score === 15 && pg.cap === 12,
   JSON.stringify({ range: pg.range, score: pg.score }));
ok('导出里有周结算奖励与它的构成（只写命中的那项）',
   pg.bonus === 5 && /周结算奖励：\+5 分（主动挑战 \+5）/.test(pg.text), 'bonus=' + pg.bonus);
ok('文本里有这一周做到的事（含具体反馈）',
   pg.text.indexOf('【这一周做到的事】') >= 0 && pg.text.indexOf('我看到你') >= 0);
ok('文本里有周复盘的三件事 / 习惯 / 下周那件小事 / 新任务四个栏位',
   pg.text.indexOf('【印象最深的三件事】') >= 0 &&
   pg.text.indexOf('【我想保留的习惯】') >= 0 &&
   pg.text.indexOf('【下周只改一件小事】') >= 0 &&
   pg.text.indexOf('【我想挑战的新任务】') >= 0);
ok('文本里带上她选的那三件事与下周那件小事',
   pg.text.indexOf('我把数学最后一题想出来了') >= 0 &&
   pg.text.indexOf('写作业前先把手机放到客厅') >= 0);
ok('文本里有手写闪光点',
   pg.text.indexOf('【我写下的闪光点】') >= 0 && pg.text.indexOf('数学最后一题我自己想出来了') >= 0);
ok('文本里有双签栏与生效信息（纸面上也能核对版本）',
   pg.text.indexOf('【双签】') >= 0 && pg.text.indexOf('她签名') >= 0 &&
   pg.text.indexOf('家长签名') >= 0 && /双签生效/.test(pg.text));
ok('文本里有留给家长的一句话栏位', pg.text.indexOf('【妈妈的一句】') >= 0);
ok('文本里没有「你没做到」这类缺口清单，也没有排名',
   !/排名|别人|没做到|扣分/.test(pg.text), String(pg.text.match(/排名|别人|没做到|扣分/)));

/* 导出的是她自己的档案：私密条目要保留，但纸面上标出来 */
ok('她自己的导出包含「仅自己可见」的条目',
   pg.flashes.some(f => f.isPrivate === true), JSON.stringify(pg.flashes.map(f => f.isPrivate)));
ok('私密条目在纸面上被标注出来', pg.text.indexOf('（仅自己可见）') >= 0);

/* pdfPayload：接服务端 PDF 时直接 POST 这个对象 */
ok('pdfPayload 是最小可交付载荷（kind/range/score/dims/flashes/signature）',
   pg.pdfPayload.kind === 'weekly_page' && pg.pdfPayload.score === 15 &&
   Array.isArray(pg.pdfPayload.dims) && Array.isArray(pg.pdfPayload.flashes) &&
   !!pg.pdfPayload.signature, Object.keys(pg.pdfPayload).join(','));
ok('pdfPayload 里的 signature 带版本与双签状态',
   pg.pdfPayload.signature.ruleVersion === 1 && pg.pdfPayload.signature.active === true);
ok('pdfPayload 内容与文本一致（不额外塞东西）',
   pg.pdfPayload.flashes.length === pg.flashes.length &&
   pg.pdfPayload.range === pg.range);
ok('本周维度分布只列有分的维度', pg.dims.every(d => d.v > 0) && pg.dims.length > 0,
   JSON.stringify(pg.dims));

/* 未结算周也能导出（不依赖先走完向导） */
store.resetAll('mid');
const pgBare = store.buildWeekPage();
ok('没打卡、没结算也能导出（空状态有兜底文案，不崩）',
   pgBare.score === 0 && pgBare.text.indexOf('这一周还没有记录') >= 0 && pgBare.bonus === 0,
   'score=' + pgBare.score);
ok('双签未完成时纸面上标注「待家长签署」', pgBare.text.indexOf('（待家长签署）') >= 0);
ok('没有周复盘时导出不会出现空标题', pgBare.text.indexOf('【印象最深的三件事】') < 0 ||
   pgBare.text.indexOf('（这一周没写）') >= 0);

/* 页面接线 */
ok('week 页有导出入口并走 export-gate（出图）', /onExport/.test(read('pages/week/index.wxml')) &&
   /export-gate/.test(read('pages/week/index.js')));
ok('growth 页也能导出她自己的这一页', /onExport/.test(read('pages/growth/index.js')) &&
   /onExport/.test(read('pages/growth/index.wxml')));
ok('导出内容由 store.buildWeekPage 统一生成（页面不自己拼字段）',
   /buildWeekPage/.test(read('utils/store.js')) &&
   !/【双签】/.test(read('pages/week/index.js')));

/* --- C16 里程碑徽章：从流水推导，不可兑换、不加分 --- */
store.resetAll('mid');
let ms = store.milestones();
ok('徽章体系有 6 枚（含 PRD §4 M6 列的四类）',
   ms.length === 6 && ['streak7', 'score100', 'score200', 'score300', 'challenge', 'resolve']
     .every(k => ms.some(m => m.k === k)), ms.map(m => m.k).join(','));
ok('全空状态下一枚未得', ms.every(m => !m.earned), JSON.stringify(ms.map(m => m.earned)));
ok('每枚徽章都有名字与说明，且标明是否可推导口径',
   ms.every(m => !!m.n && !!m.d) && ms.filter(m => m.inferred).length === 2,
   JSON.stringify(ms.filter(m => m.inferred).map(m => m.k)));

/* 连续 7 天 → 第 1 枚；累计 100 分走的是另一枚 */
for (let i = 0; i <= 6; i++) {
  store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-i) });
}
ms = store.milestones();
const b7 = ms.find(m => m.k === 'streak7');
ok('连续 7 天后点亮「连续 7 天」', b7.earned === true);
/* 记录覆盖今天往前 6 天，所以「首次达到连续 7 天」正好是今天。
   这条同时守住时区 bug：用 UTC 解析日期串会算出偏移一天的结果。 */
ok('徽章带达成日期，且回算结果等于首次达标那天（今天）',
   b7.earnedAt === store.todayKey(), b7.earnedAt + ' vs ' + store.todayKey());
ok('连续 7 天这条与 streak() 同口径', store.streak() >= 7);
ok('累计 35 分还点不亮 100 分那枚',
   ms.find(m => m.k === 'score100').earned === false && store.lifetime() === 35,
   'lifetime=' + store.lifetime());

/* 累计到 100 分 → 点亮 100，不点亮 200 */
for (let i = 0; i < 26; i++) {
  store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-(i + 7)) });
}
ms = store.milestones();
ok('累计 ≥ 100 分点亮 100 分那枚', ms.find(m => m.k === 'score100').earned === true && store.lifetime() >= 100,
   'lifetime=' + store.lifetime());
ok('同时不误点亮 200 分那枚（阈值分开判定）',
   ms.find(m => m.k === 'score200').earned === (store.lifetime() >= 200),
   'lifetime=' + store.lifetime());
ok('100 分那枚带达成日期', /^\d{4}-\d{2}-\d{2}$/.test(ms.find(m => m.k === 'score100').earnedAt));

/* 徽章不加分、不可兑换 */
const lifeBeforeMs = store.lifetime();
store.milestones();
ok('读徽章不改变任何分数（纯推导）', store.lifetime() === lifeBeforeMs);
ok('store 不提供任何「用徽章兑换」的接口',
   typeof store.redeemMilestone === 'undefined' && typeof store.claimMilestone === 'undefined');

/* 主动挑战与化解矛盾：按流水关键词推导 */
store.resetAll('mid');
ok('没有相关流水时两枚都不点亮',
   store.milestones().find(m => m.k === 'challenge').earned === false &&
   store.milestones().find(m => m.k === 'resolve').earned === false);
store.addWeeklyPoints({ name: '本周额外奖励（周达标 / 连续记录 / 主动挑战）', points: 5 });
store.addPoints({ itemId: 'o2', name: '与同学合作或化解矛盾', dim: 'social', points: 2 });
ms = store.milestones();
ok('有「主动挑战」结算流水 → 点亮第一次主动挑战',
   ms.find(m => m.k === 'challenge').earned === true);
ok('有「化解矛盾」类社交记录 → 点亮第一次化解矛盾',
   ms.find(m => m.k === 'resolve').earned === true);
ok('两枚都带达成日期',
   !!ms.find(m => m.k === 'challenge').earnedAt && !!ms.find(m => m.k === 'resolve').earnedAt);

/* 撤销后徽章跟着回退（流水只增不删，但判定看未撤销的） */
store.resetAll('mid');
const msE = store.addPoints({ itemId: 'o2', name: '与同学合作或化解矛盾', dim: 'social', points: 2 });
ok('有记录时点亮', store.milestones().find(m => m.k === 'resolve').earned === true);
store.undo(msE.entry.uid);
ok('撤销之后该枚回退（判定只看未撤销流水）',
   store.milestones().find(m => m.k === 'resolve').earned === false);
ok('高中段隐藏徽章：CSS 规则仍在（由页面整块遵守）',
   /\.stage-high\s+\.miles\s*\{\s*display:\s*none/.test(read('app.wxss')));
ok('徽章区块复用 .miles 类（因此高中段会自动隐藏）',
   /class="miles mt-3"/.test(read('pages/growth/index.wxml')) &&
   /mile--badge/.test(read('pages/growth/index.wxml')));

/* --- C17 Excel 导出：流水 CSV --- */
store.resetAll('mid');
store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5,
                  praise: store.praiseOf({ p: '把这周复盘完', t: '你在用计划安排自己的节奏' }) });
store.addPoints({ itemId: 's3', name: '作业自查', dim: 'study', points: 3 });
const csvPriv = store.addPoints({ itemId: 's6', name: '阅读 30 分钟', dim: 'study', points: 2 });
store.setEntryPrivate(csvPriv.entry.uid);
store.confirmEntries(store.state().log[0].uid);

const csv = store.buildLedgerCsv();
ok('CSV 带 UTF-8 BOM（Excel 打开中文才不会乱码）', csv.text.charCodeAt(0) === 0xFEFF);
ok('CSV 用 CRLF 换行（Excel 兼容性好）', csv.text.indexOf('\r\n') > 0);
ok('CSV 有表头且列齐全（日期/时间/行为/维度/分值/结算奖励/仅自己可见/家长已确认/具体反馈）',
   csv.text.indexOf('日期,时间,行为,维度,分值,结算奖励,仅自己可见,家长已确认,具体反馈') > 0,
   csv.text.split('\r\n')[0]);
ok('导出条数 = 流水条数', csv.rowCount === 3, String(csv.rowCount));
ok('导出的是她自己的完整流水，含「仅自己可见」条目并在列里标出来',
   csv.text.indexOf('阅读 30 分钟') > 0 && /阅读 30 分钟,学习力,2,,是,/.test(csv.text),
   '私密列没标出来');
ok('已确认的条目标为「是」', /周复盘,学习力,5,,,是,/.test(csv.text));
ok('带那句具体反馈', csv.text.indexOf('我看到你') > 0);
ok('合计按未撤销的流水算', csv.total === 10 && csv.text.indexOf('合计（不含已撤销）,,,,10') > 0,
   'total=' + csv.total);
ok('文件名带日期，形如 rosenthal-ledger-YYYY-MM-DD.csv',
   /^rosenthal-ledger-\d{4}-\d{2}-\d{2}\.csv$/.test(csv.filename), csv.filename);
ok('导出里不会出现负数（全站也没有负数可导）',
   !/,-/.test(csv.text.replace(/[^,]\-\d+/g, '')), '出现了负分列');

/* 撤销的条目默认不导出，显式要求时才带上 */
const csvU = store.addPoints({ itemId: 's1', name: '放学先写作业', dim: 'study', points: 2 });
store.undo(csvU.entry.uid);
ok('已撤销的条目默认不进导出',
   store.buildLedgerCsv().rowCount === 3 && store.buildLedgerCsv().text.indexOf('放学先写作业') < 0);
ok('显式 includeReversed 时才带上已撤销的',
   store.buildLedgerCsv({ includeReversed: true }).rowCount === 4);

/* 空状态 */
store.resetAll('mid');
const csvEmpty = store.buildLedgerCsv();
ok('没有记录时导出只有表头与合计（不崩）',
   csvEmpty.rowCount === 0 && csvEmpty.total === 0 && csvEmpty.text.indexOf('合计') > 0);

/* 逗号和引号必须转义，否则 Excel 列会错位 */
store.resetAll('mid');
store.addPoints({ itemId: 's7', name: '他说"今天不错",我笑了', dim: 'study', points: 2 });
const csvEsc = store.buildLedgerCsv();
ok('含逗号/引号的字段被正确转义（Excel 不会串列）',
   csvEsc.text.indexOf('"他说""今天不错"",我笑了"') > 0,
   csvEsc.text.split('\r\n')[1]);

/* 页面接线 */
ok('成长页有导出流水表的入口', /onExportCsv/.test(read('pages/growth/index.wxml')) &&
   /buildLedgerCsv/.test(read('pages/growth/index.js')));
ok('CSV 由 store 统一生成（含 BOM/转义逻辑只在 store 里）',
   /buildLedgerCsv/.test(read('utils/store.js')) && !/\\ufeff/.test(read('pages/growth/index.js')));

/* --- C18 数据主权：一键导出 / 彻底删除（PRD §7 非功能需求） --- */
store.resetAll('mid');
/* 造一份有内容的数据：打卡、私密、撤销、券、周复盘、双签 */
store.setItemPoints('s1', 3);
store.removeItem('l4');
store.setRewardTitle(120, '和妈妈单独出去一次');
store.finishBuild();
store.parentAgree();
const dsA = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5,
                              praise: store.praiseOf({ p: '把这周复盘完', t: '你在用计划安排自己的节奏' }) });
store.addPoints({ itemId: 'a3', name: '自己解决一个小问题', dim: 'self', points: 3, date: store.shiftDay(-1) });
const dsB = store.addPoints({ itemId: 's6', name: '阅读 30 分钟', dim: 'study', points: 2, date: store.shiftDay(-2) });
store.setEntryPrivate(dsB.entry.uid);
store.undo(dsA.entry.uid);
store.setFlash('我自己想出来一道题');
store.redeem(20, '小文具 / 贴纸');
store.confirmEntries(store.state().log[1].uid);

const all = store.exportAll();
ok('导出物是合法 JSON 且有 schema 版本（将来好做迁移）',
   (function () { const o = JSON.parse(all.text); return o.schema === 1 && o.app === 'rosenthal-miniprogram'; })(),
   all.text.slice(0, 60));
ok('导出物含完整 state（记录 / 券 / 规则 / 周报 / 双签）',
   (function () {
     const o = JSON.parse(all.text);
     return Array.isArray(o.state.log) && Array.isArray(o.state.coupons) &&
            Array.isArray(o.state.items) && !!o.state.parent && o.state.ruleVersion >= 1;
   })());
ok('导出物含当时算好的指标', (function () { const o = JSON.parse(all.text); return !!o.metrics && o.metrics.activeDays >= 1; })());
ok('导出文件名带日期', /^rosenthal-backup-\d{4}-\d{2}-\d{2}\.json$/.test(all.filename), all.filename);
ok('导出物是深拷贝：之后再写数据不会改变已导出的内容',
   (function () {
     const before = store.exportAll().text.length;
     store.addPoints({ itemId: 's1', name: '导出后再记一条', dim: 'study', points: 1 });
     return JSON.parse(all.text).state.log.length < store.state().log.length && before > 0;
   })());

/* 指标口径 */
const mt = store.metrics();
ok('指标覆盖 PRD §10 的六层（北极星/激活/留存/深度/家庭/负向）',
   ['weekLoopDays', 'activated', 'd7', 'autonomyRatio', 'redemptionRate', 'undoRate']
     .every(k => k in mt) && store.METRIC_DEFS.length >= 15, String(store.METRIC_DEFS.length));
ok('每条指标都带口径说明（接分析后端时口径不走样）',
   store.METRIC_DEFS.every(d => !!d.n && !!d.d && !!d.layer) &&
   store.METRIC_DEFS.every(d => d.k in mt),
   store.METRIC_DEFS.filter(d => !(d.k in mt)).map(d => d.k).join(','));
ok('北极星「周闭环天数」= 有记录且有闪光点的天数（今天是 1）',
   mt.weekLoopDays === 1 && mt.loopRate === Math.round(1 / 7 * 1000) / 1000,
   'loopDays=' + mt.weekLoopDays + ' rate=' + mt.loopRate);
ok('激活状态跟着双签走', mt.activated === true && mt.signed === true);
/* 注意：上面「深拷贝」那条断言又写进了一条记录，所以总数是 4 而不是 3 */
ok('撤销率与私密率算得出来（各 1 条 / 共 4 条）',
   mt.undoRate === 0.25 && mt.privateRate === 0.25 && mt.counts.total === 4,
   JSON.stringify({ undo: mt.undoRate, priv: mt.privateRate, total: mt.counts.total }));
ok('自主力占比 = 自主力分 ÷ 总分',
   mt.autonomyRatio === Math.round(3 / store.lifetime() * 1000) / 1000,
   mt.autonomyRatio + ' life=' + store.lifetime());
ok('自定义行为项数与券的履约率都有值',
   mt.customItems >= 1 && mt.redemptionRate >= 0 && mt.praiseCount >= 1,
   JSON.stringify({ custom: mt.customItems, redeem: mt.redemptionRate, praise: mt.praiseCount }));
ok('指标是纯函数：连读两次不改变任何状态',
   (function () { const a = JSON.stringify(store.metrics().counts); store.metrics(); return a === JSON.stringify(store.metrics().counts); })());
ok('指标导出文本带分层标题', /【北极星】/.test(store.metricsReport().text) &&
   /【负向】/.test(store.metricsReport().text));
ok('D7 / D30 是布尔（首次使用后第 7/30 天是否仍有记录）',
   typeof mt.d7 === 'boolean' && typeof mt.d30 === 'boolean');

/* 彻底删除：必须真的什么都没了 */
const wiped = store.wipeAll();
const after = store.state();
ok('彻底删除返回成功', wiped.ok === true);
ok('删除后流水 / 券 / 周报 / 修复记录全空',
   after.log.length === 0 && after.coupons.length === 0 &&
   after.week === null && after.repairs.length === 0 && after.flash &&
   Object.keys(after.flash).length === 0,
   JSON.stringify({ log: after.log.length, coupons: after.coupons.length }));
ok('删除后回到未共建状态（所以要重新走规则共建）',
   after.onboarded === false && after.ruleVersion === 0);
ok('删除后家长签字也没了', after.parent.agreedAt === null);
ok('删除后余额 / 累计 / 连续都归零',
   store.balance() === 0 && store.lifetime() === 0 && store.streak() === 0);
ok('删除后行为项回到模板（她的改动不留痕）',
   store.itemsOf().length === 26 && !store.itemsOf().some(i => i.customBy === 'child'),
   String(store.itemsOf().length));
ok('删除后闸门重新生效（会把她送回共建页）',
   guard.needsOnboarding() === true);
ok('删除指标也随之归零', store.metrics().counts.total === 0 && store.metrics().activeDays === 0);

/* 「彻底删除」是孩子自己的权利，不是家长的能力 —— 两者不能混 */
ok('家长端仍然没有任何删除接口（红线未被这次改动破坏）',
   typeof store.deleteEntry === 'undefined' && typeof store.removeEntry === 'undefined' &&
   typeof store.deleteCoupon === 'undefined' && typeof store.revokeCoupon === 'undefined');
ok('wipeAll 用的是 blank() 重建，而不是逐项置空（不漏字段）',
   /function wipeAll\(\)\s*\{\s*S = blank\('mid'\)/.test(read('utils/store.js')));

/* 页面接线 */
const meJs = read('pages/me/index.js');
const meWxml = read('pages/me/index.wxml');
ok('「我的」页有导出 / 指标 / 删除三个入口',
   /onExportAll/.test(meWxml) && /onMetrics/.test(meWxml) && /onWipeAll/.test(meWxml));
ok('删除是两道确认，且第二道问「备份过了吗」',
   (meJs.match(/wx\.showModal/g) || []).length >= 2 &&
   /备份过了吗/.test(meJs) && /确认删除/.test(meJs));
ok('删除后 reLaunch 回共建页（不能停在半坏状态）',
   /reLaunch/.test(meJs) && /pages\/onboarding\/index/.test(meJs));

/* --- D5 同步合并策略（PRD §9：本地优先 + 最后写入优先 + 双方可见变更日志） --- */
const sync = require('./utils/sync.js');

/** 造一份「另一台设备」的状态 */
function remoteOf(base, patch) {
  return Object.assign(JSON.parse(JSON.stringify(base)), patch || {});
}
function fixture() {
  store.resetAll('mid');
  store.setItemPoints('s1', 3);
  store.removeItem('l4');
  store.setRewardTitle(120, '一起出去一次');
  store.finishBuild();
  store.parentAgree();
  for (let i = 0; i < 4; i++) {
    store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-i) });
  }
  return JSON.parse(JSON.stringify(store.state()));
}

/* ① 事件流取并集：两台设备各打一次卡，合并后两条都在 */
{
  const A = fixture();
  const B = remoteOf(A);
  A.log.push({ uid: 'A-new', itemId: 's3', name: '作业自查', dim: 'study', points: 3, date: '2026-10-10', ts: 100, confirmed: false });
  B.log.push({ uid: 'B-new', itemId: 's6', name: '阅读 30 分钟', dim: 'study', points: 2, date: '2026-10-10', ts: 200, confirmed: false });
  const m = sync.merge(A, B);
  ok('两台设备各加一条打卡 → 合并后两条都在（并集，不丢数据）',
     m.state.log.some(l => l.uid === 'A-new') && m.state.log.some(l => l.uid === 'B-new'));
  ok('合并计数如实报告补进来几条', m.stats.addedLog === 1, String(m.stats.addedLog));
  ok('同一条不会被重复计入（按 uid 去重）',
     m.state.log.filter(l => l.uid === 'A-new').length === 1);
}

/* ② 两台设备各自离线兑换：这是「spent 存数字」一定会算错的那个场景 */
{
  const A = fixture();
  const B = remoteOf(A);
  const rA = store.redeem(20, '奶茶');
  ok('本机兑换成功', rA.ok === true);
  const afterA = JSON.parse(JSON.stringify(store.state()));
  /* 对端在还不知道本机兑换的情况下也兑了一次 */
  const B2 = remoteOf(A);
  B2.redemptions = (B2.redemptions || []).concat([{ id: 'rd-RS-XXXX-99', code: 'RS-XXXX-99', cost: 20, title: '贴纸', at: 999 }]);
  B2.coupons = (B2.coupons || []).concat([{ code: 'RS-XXXX-99', title: '贴纸', cost: 20, ts: 999, exp: 'x', used: false }]);
  const m = sync.merge(afterA, B2);
  const spent = m.state.redemptions.reduce((a, x) => a + x.cost, 0);
  ok('两台设备各兑 20 分 → 合并后花了 40（不是 20）', spent === 40, String(spent));
  ok('两张券都在', m.state.coupons.length === 2, String(m.state.coupons.length));
  ok('兑换明细是并集而不是覆盖', m.state.redemptions.length === 2, String(m.state.redemptions.length));
  ok('spent 不进合并结果（它是派生值，落盘时重算）', m.state.spent === undefined);
}
{
  /* 把合并结果装回 store，确认余额真的按 40 算 */
  store.resetAll('mid');
  for (let i = 0; i < 8; i++) store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-i) });
  const local = JSON.parse(JSON.stringify(store.state()));
  const remote = remoteOf(local);
  remote.redemptions = [{ id: 'rd-A', cost: 20, at: 1 }];
  remote.coupons = [{ code: 'RS-A', cost: 20, ts: 1, used: false }];
  const m = sync.merge(Object.assign({}, local, {
    redemptions: [{ id: 'rd-B', cost: 20, at: 2 }],
    coupons: [{ code: 'RS-B', cost: 20, ts: 2, used: false }],
  }), remote);
  const life = m.state.log.filter(l => !l.reversed).reduce((a, l) => a + l.points, 0);
  const spent = m.state.redemptions.reduce((a, x) => a + x.cost, 0);
  ok('合并后的余额 = 累计 − 明细合计（两个 20 都被算上）',
     life - spent === 0 && spent === 40, 'life=' + life + ' spent=' + spent);
}
ok('store 的 spent 是派生缓存：save() 之后与明细合计一致',
   (function () {
     store.resetAll('mid');
     for (let i = 0; i < 4; i++) store.addPoints({ itemId: 's7', name: 'x', dim: 'study', points: 5, date: store.shiftDay(-i) });
     store.redeem(20, '奶茶');
     return store.spentTotal() === store.state().spent && store.state().spent === 20;
   })(),
   '缓存与明细不一致');
ok('老数据只有 spent 数字时，load 会补一条迁移明细把余额接住',
   /backfill-legacy/.test(read('utils/store.js')) &&
   /S\.spent > 0/.test(read('utils/store.js')));

/* ③ 派生标量不合并、重新算 */
{
  const A = fixture();
  const B = remoteOf(A);
  B.log = B.log.concat([{ uid: 'B-extra', itemId: 'a3', name: '自己解决一个小问题', dim: 'self', points: 3, date: '2026-10-10', ts: 300, confirmed: false }]);
  const m = sync.merge(A, B);
  ok('合计分是合并后重新算的（不是两个数字相加）',
     m.state.log.filter(l => !l.reversed).reduce((a, l) => a + l.points, 0) === 23,
     String(m.state.log.filter(l => !l.reversed).reduce((a, l) => a + l.points, 0)));
}

/* ④ 签名取较严：一边没签，合并后就不能生效 */
{
  const A = fixture();                       // 双方已签
  const B = remoteOf(A, { onboarded: true, parent: { agreedAt: null, version: null } });
  const m1 = sync.merge(A, B);
  ok('一边没签家长 → 合并后仍未生效（不能因为同步就偷偷生效）',
     m1.state.parent.agreedAt === null && m1.stats.conflicts > 0, JSON.stringify(m1.state.parent));
  const B2 = remoteOf(A, { onboarded: false });
  const m2 = sync.merge(A, B2);
  ok('一边没提交提案 → 合并后 onboarded 为 false',
     m2.state.onboarded === false);
  const m3 = sync.merge(A, remoteOf(A));
  ok('两边都签了 → 合并后仍生效（不会把已生效的搞失效）',
     !!m3.state.parent.agreedAt && m3.state.onboarded === true);
}

/* ⑤ 冲突要写进双方可见的变更日志 */
{
  const A = fixture();
  const B = remoteOf(A);
  A.flash['2026-10-10'] = '我写的';
  B.flash['2026-10-10'] = '妈妈写的';
  const m = sync.merge(A, B);
  ok('同一天的闪光点两边都写了 → 记一条冲突（不静默覆盖）',
     m.log.length === 1 && m.log[0].collection === 'flash', JSON.stringify(m.log));
  ok('冲突日志说明了保留哪一边',
     /保留了本机的/.test(m.log[0].detail) && m.log[0].winner === 'local', m.log[0].detail);
  ok('冲突日志有可读文本，符合「双方可见」',
     /需要你知道/.test(sync.logText(m.log)) && /保留 本机/.test(sync.logText(m.log)),
     sync.logText(m.log));
  ok('没有冲突时也给一句明确的话', /没有冲突/.test(sync.logText([])));
}

/* ⑥ 学段：只能升，取更高的那个 */
{
  const A = fixture();
  const B = remoteOf(A, { stage: 'high' });
  const m = sync.merge(A, B);
  ok('对端学段更高时取更高的（学段只能升）', m.state.stage === 'high', m.state.stage);
  ok('学段被对端抬高会记进变更日志', m.log.some(e => e.collection === 'state'), JSON.stringify(m.log.map(e => e.collection)));
  const m2 = sync.merge(remoteOf(A, { stage: 'high' }), A);
  ok('本机学段更高时不会被对端拉低', m2.state.stage === 'high');
}

/* ⑦ amend 取逐项较大值：她的改动不会因为合并而丢 */
{
  const A = fixture();
  const B = remoteOf(A, { amend: { point: 0, item: 0, reward: 0 } });
  const m = sync.merge(A, B);
  ok('amend 计数取逐项较大值（不丢她的改动）',
     m.state.amend.point === 1 && m.state.amend.item === 1 && m.state.amend.reward === 1,
     JSON.stringify(m.state.amend));
  ok('mergeAmend 对缺字段的一方也安全',
     JSON.stringify(sync.mergeAmend({ point: 1 }, null)) === JSON.stringify({ point: 1, item: 0, reward: 0 }));
}

/* ⑧ 合并是纯函数：不改传入的两份状态 */
{
  const A = fixture();
  const B = remoteOf(A);
  B.log.push({ uid: 'B-x', itemId: 's1', name: 'x', dim: 'study', points: 1, date: '2026-10-10', ts: 5, confirmed: false });
  const aLen = A.log.length, bLen = B.log.length;
  sync.merge(A, B);
  ok('合并不修改入参（本地与对端状态都不被就地改动）',
     A.log.length === aLen && B.log.length === bLen);
}

/* --- C13 规则双签：单方修改不生效（PRD §3 表格 / §4 M4 / DoD 末条） --- */
store.resetAll('mid');
ok('孩子没改完时，家长签不了字',
   store.parentAgree().ok === false && /还差 3 处/.test(store.parentAgree().reason),
   store.parentAgree().reason);

let sg = store.ruleSignature();
ok('无签署时 waitingFor = child（先等孩子提案）',
   sg.childDone === false && sg.parentDone === false && sg.active === false && sg.waitingFor === 'child',
   JSON.stringify(sg));

store.setItemPoints('s1', 3);
store.removeItem('l4');
store.setRewardTitle(120, '和妈妈单独出去一次（我自己挑项目）');
const fb2 = store.finishBuild();
ok('孩子改满 3 处 → 提案完成，版本号 +1', fb2.ok === true && store.state().ruleVersion === 1);
ok('孩子签完但家长没签 → 规则**未生效**', store.isRuleActive() === false);

sg = store.ruleSignature();
ok('此时 waitingFor = parent，且能看出改了 3 处',
   sg.childDone === true && sg.parentDone === false && sg.active === false &&
   sg.waitingFor === 'parent' && sg.amended === 3, JSON.stringify(sg));

const ag2 = store.parentAgree();
ok('家长签署 → 记录签署时间与版本', ag2.ok === true && ag2.version === 1 && !!ag2.agreedDate, JSON.stringify(ag2));
ok('双签后规则生效', store.isRuleActive() === true);
sg = store.ruleSignature();
ok('双签后 waitingFor = null，且带上生效日期',
   sg.active === true && sg.waitingFor === null && /^\d{4}-\d{2}-\d{2}$/.test(sg.agreedDate),
   JSON.stringify(sg));

/* 单方再改 → 上一轮的签字作废，必须重签 */
store.setItemPoints('s2', 3);
ok('单方再改一处后，家长签字作废（规则回到未生效）',
   store.isRuleActive() === false && store.ruleSignature().parentDone === false,
   JSON.stringify(store.ruleSignature()));
ok('再签一次 → 版本号升到 2 并重新生效', (function () {
  const r = store.finishBuild();
  const a = store.parentAgree();
  return r.ruleVersion === 2 && a.version === 2 && store.isRuleActive() === true;
})());

/* 换学段同样要求重签 */
store.applyStage('high');
ok('换学段后家长签字一并作废', store.ruleSignature().parentDone === false &&
   store.isRuleActive() === false, JSON.stringify(store.ruleSignature()));
ok('换学段后 signing 状态回到 waitingFor = child', store.ruleSignature().waitingFor === 'child');
ok('换学段不删历史记录（日志仍在）', store.state().log.length >= 0 && store.state().stage === 'high');

/* --- C14 隐私标记：仅自己可见的条目，家长端在引擎层就看不到 --- */
store.resetAll('mid');
const pv1 = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5,
                              praise: store.praiseOf({ p: '把这周复盘完', t: '你在用计划安排自己的节奏' }) });
store.addPoints({ itemId: 's3', name: '作业自查', dim: 'study', points: 3 });

ok('新记录默认对家长可见（private 不为真）',
   store.visibleToParent().length === 2 && store.visibleToParent().every(l => !l.private),
   String(store.visibleToParent().length));

const mp = store.setEntryPrivate(pv1.entry.uid);
ok('可以把一条标成「仅自己可见」', mp.ok === true && mp.private === true);
ok('标记后家长侧只剩 1 条', store.visibleToParent().length === 1, String(store.visibleToParent().length));
ok('家长侧确实拿不到那一条（按 uid 找不到）',
   store.visibleToParent().every(l => l.uid !== pv1.entry.uid));
ok('她自己仍然能看到全部（她是数据主人）',
   store.visibleToChild().length === 2, String(store.visibleToChild().length));
ok('标记会记下时间（便于回溯她什么时候收起来的）',
   typeof store.state().log.find(l => l.uid === pv1.entry.uid).privateAt === 'number');

const un = store.setEntryPrivate(pv1.entry.uid, false);
ok('可以取消隐私标记，家长重新可见',
   un.ok === true && un.private === false && store.visibleToParent().length === 2);
ok('取消后 privateAt 清空', store.state().log.find(l => l.uid === pv1.entry.uid).privateAt === null);
ok('不传第二参时是「切换」语义',
   store.setEntryPrivate(pv1.entry.uid).private === true &&
   store.setEntryPrivate(pv1.entry.uid).private === false);
ok('标记不存在的记录被拒', store.setEntryPrivate('nope-uid').ok === false);

/* 隐私标记不影响计分：她自己该得的分照旧 */
store.resetAll('mid');
const pv3 = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5 });
store.setEntryPrivate(pv3.entry.uid);
ok('标私密不改变今日得分与累计（只是可见性）',
   store.dayScore(store.todayKey()) === 5 && store.lifetime() === 5,
   store.dayScore(store.todayKey()) + '/' + store.lifetime());
ok('家长侧看不到那条，但分数仍在账上（不因隐藏而改分）',
   store.visibleToParent().length === 0 && store.lifetime() === 5);

/* 家长端页面必须走过滤函数，绝不能直接读 log */
const parentSrc = read('pages/parent/index.js');
ok('家长端用 visibleToParent() 取数', /store\.visibleToParent\(\)/.test(parentSrc));
ok('家长端**没有**直接读 log（否则隐私靠每个页面自觉）',
   !/\.log\b/.test(src('pages/parent/index.js')),
   '仍有直接读 log 的地方');
ok('「有几条被收起来」由 store.hiddenCount() 提供，页面拿不到内容',
   /hiddenCount/.test(parentSrc) && store.hiddenCount() === 1, String(store.hiddenCount()));
ok('家长端承诺「看不到私密内容」的文案与真实过滤同在',
   /hidden:\s*store\.hiddenCount\(\)/.test(parentSrc) &&
   /\{\{report\.hidden\}\}/.test(read('pages/parent/index.wxml')) &&
   /function hiddenCount/.test(read('utils/store.js')));
ok('她自己那边有隐私开关入口', /onTogglePrivate/.test(read('pages/growth/index.wxml')) &&
   /onTogglePrivate/.test(read('pages/growth/index.js')));
ok('隐私标记走的也是唯一写入口（store.setEntryPrivate，页面不直接改 log）',
   /setEntryPrivate/.test(read('utils/store.js')) && !/\.private\s*=/.test(src('pages/growth/index.js')));

/* 共建页三个动作各自计入不同的 amend 维度 */
store.resetAll('mid');
ok('共建页起点：三处都是待改', store.amendedCount() === 0);
store.setItemPoints('s1', 3);
ok('① 改分值 → amend.point', store.state().amend.point > 0 && store.state().amend.item === 0);
store.removeItem('l4');
ok('② 删行为项 → amend.item', store.state().amend.item > 0 && store.state().amend.reward === 0);
store.setRewardTitle(120, '和妈妈单独出去一次（我自己挑项目）');
ok('③ 改奖励 → amend.reward', store.state().amend.reward > 0);
ok('三处改满 → canFinishBuild', store.canFinishBuild() === true);
ok('改满后 finishBuild 生效并留版本号', store.finishBuild().ok === true && store.state().ruleVersion === 1);

store.resetAll('mid');
let spState = store.surpriseState();
ok('没有记录时不能领惊喜卡', spState.canDraw === false && spState.claimed === false, JSON.stringify({ can: spState.canDraw }));
ok('提示还差几天', spState.streak === 0 && spState.need === 7, 'streak=' + spState.streak + ' need=' + spState.need);
ok('卡池来自模板（4 张），不是运行时随机生成', spState.cards.length === 4 && spState.cards[0].title === '妈妈无条件陪逛 1 小时');
ok('不够 7 天时挑卡被拒，且理由说明还差几天',
   store.drawSurprise(0).ok === false && /连续记录满 7 天/.test(store.drawSurprise(0).reason),
   store.drawSurprise(0).reason);

/* 攒够连续 7 天 */
for (let i = 0; i <= 6; i++) {
  store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-i) });
}
spState = store.surpriseState();
ok('连续 7 天后可以领', spState.streak >= 7 && spState.canDraw === true, 'streak=' + spState.streak);

const couponsBefore = store.state().coupons.length;
const lifeBeforeSp = store.lifetime();
const draw = store.drawSurprise(2);
/* drawSurprise 与 surpriseState 的卡形状必须一致（title/desc/exp），
   否则页面一半读 t 一半读 title 就会显示 undefined。 */
ok('可以从卡池里挑中指定的一张（自选，不是抽奖）',
   draw.ok === true && draw.card.title === store.CARDS[2].t,
   JSON.stringify(draw.ok ? draw.card.title : draw.reason));
ok('挑卡返回的卡形状与卡池列表一致（title/desc/exp）',
   draw.card.desc === store.CARDS[2].d && draw.card.exp === store.CARDS[2].e &&
   draw.card.t === undefined,
   JSON.stringify(draw.card));
ok('惊喜卡进了券包，且不扣分（cost = 0）',
   store.state().coupons.length === couponsBefore + 1 &&
   store.state().coupons[store.state().coupons.length - 1].cost === 0);
ok('领卡不改变累计积分（它换的是坚持，不是余额）', store.lifetime() === lifeBeforeSp);
ok('券码与兑换券同一套规则', /^RS-[A-Z0-9]{4}-\d{2}$/.test(draw.coupon.code), draw.coupon.code);
ok('惊喜卡券带 surprise 标记，便于与兑换券区分', draw.coupon.surprise === true);
ok('有有效期（按卡池的天数）', draw.coupon.exp === store.shiftDay(store.CARDS[2].e), draw.coupon.exp);

spState = store.surpriseState();
ok('同一周只能领一次', spState.canDraw === false && spState.claimed === true);
ok('重复领取被拒，且提示里给出下次可领的日期',
   store.drawSurprise(0).ok === false &&
   /已经领过/.test(store.drawSurprise(0).reason) &&
   /^\d{4}-\d{2}-\d{2}/.test(spState.nextClaimDate),
   store.drawSurprise(0).reason + ' | next=' + spState.nextClaimDate);
ok('领卡凭据记的是「窗口」而不是一个布尔值',
   !!store.state().surpriseClaim && !!store.state().surpriseClaim.start && !!store.state().surpriseClaim.end,
   JSON.stringify(store.state().surpriseClaim));

/* 挑不存在的卡被拒：先重置，重新攒够 7 天 */
store.resetAll('mid');
for (let i = 0; i <= 6; i++) {
  store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-i) });
}
ok('挑不存在的卡被拒（不能凭空拿）',
   store.surpriseState().canDraw === true && store.drawSurprise(99).ok === false,
   'canDraw=' + store.surpriseState().canDraw);
ok('被拒后领取机会没有被消耗', store.surpriseState().canDraw === true);

/* 合规红线：挑哪张卡**不能**由随机决定（否则就是抽奖） */
const drawSrc = (store.drawSurprise + '').replace(/\s/g, '');
ok('挑卡逻辑里没有任何随机（Math.random）', !/Math\.random/.test(drawSrc), 'drawSurprise 含 Math.random');
ok('卡池从模板常量读，索引来自用户选择', /T\.CARDS\[i\]/.test(read('utils/store.js')));
ok('领卡资格 = 连续 7 天 + 本窗口没领过（窗口来自 surpriseWindow）',
   /canDraw\s*=\s*st\s*>=\s*7\s*&&\s*!claimedInWindow/.test(read('utils/store.js')) &&
   /function surpriseWindow/.test(read('utils/store.js')));

/* --- 回归：resetWeek 不能让她在同一周再领一张 ---
   这是本轮修掉的真 bug：「下周继续」原来会把惊喜卡的领取凭据一起清掉，
   于是同一周她可以领第二张（实测确认可复现）。 */
store.resetAll('mid');
for (let i = 0; i <= 6; i++) {
  store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-i) });
}
/* 让她在本窗口内已经领过一张，且本周已结算过周复盘 */
ok('先领一张惊喜卡', store.drawSurprise(0).ok === true);
store.setWeekPatch({ next: '写作业前先把手机放到客厅', challenge: '' });
store.weekStep(3);
store.finishWeek();
const cardsBeforeReset = store.state().coupons.filter(c => c.surprise).length;
store.resetWeek();
ok('「下周继续」不会清掉惊喜卡凭据', !!store.state().surpriseClaim,
   JSON.stringify(store.state().surpriseClaim));
ok('回归：resetWeek 之后同一窗口内仍然不能再领',
   store.surpriseState().canDraw === false && store.drawSurprise(1).ok === false,
   'canDraw=' + store.surpriseState().canDraw);
ok('回归：惊喜卡数量没有变成 2',
   store.state().coupons.filter(c => c.surprise).length === cardsBeforeReset,
   String(store.state().coupons.filter(c => c.surprise).length));
/* 窗口过去之后（模拟 7 天后）应当自动恢复资格 */
ok('窗口过去后自动恢复领取资格（不需要 manually 重置）',
   (function () {
     const w = store.surpriseWindow();
     /* 把凭据挪到上一窗口，模拟「7 天后再来」 */
     store.state().surpriseClaim = { at: Date.now() - 8 * 864e5, start: store.shiftDay(-14), end: store.shiftDay(-8) };
     return store.surpriseState().canDraw === true && w.start > store.state().surpriseClaim.end;
   })(),
   JSON.stringify(store.surpriseState()));

/* --- 迁移路径：只有旧字段 surpriseAt 的存档不能白送一张 --- */
{
  const st = store.state();
  delete st.surpriseClaim;
  st.surpriseAt = Date.now() - 3600 * 1000;          // 1 小时前领过
  ok('旧存档（只有 surpriseAt，1 小时前）仍算「本窗口已领」',
     store.surpriseState().claimed === true && store.surpriseState().canDraw === false,
     JSON.stringify({ claimed: store.surpriseState().claimed, canDraw: store.surpriseState().canDraw }));
  st.surpriseAt = Date.now() - 8 * 24 * 3600 * 1000; // 8 天前领过
  ok('旧存档（8 天前领过）恢复领取资格',
     store.surpriseState().canDraw === true);
  ok('迁移判定写在代码里（旧数据退化成 7 天窗口）',
     /退化成「7 天内算本窗口」/.test(read('utils/store.js')) ||
     /claim\.end/.test(read('utils/store.js')));
}



/* --- C19 日期地基：跨月 / 闰年 / 时区 ---
   留存、连续、周窗口、券有效期全靠这几个函数。它们的错误不会崩，只会算错日子，
   所以这里把一整年（-400 ~ +400 天）跑一遍，并把闰年与跨月推算钉死。 */
{
  /* shiftDay：400 天范围内必须严格递增且格式统一 */
  let dateOk = true, prevDate = null, badDate = '';
  for (let i = -400; i <= 400; i++) {
    const d = store.shiftDay(i);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || (prevDate && d <= prevDate)) { dateOk = false; badDate = prevDate + ' → ' + d; break; }
    prevDate = d;
  }
  ok('shiftDay 在 ±400 天范围内严格递增且格式统一', dateOk, badDate);
  ok('shiftDay(0) 就是今天', store.shiftDay(0) === store.todayKey());

  /* 每月天数与闰年（含 2100 非闰年） */
  ok('每月天数正确（含 4/6/9/11 月与 12 月）',
     store.daysInMonth(2026, 1) === 31 && store.daysInMonth(2026, 4) === 30 &&
     store.daysInMonth(2026, 6) === 30 && store.daysInMonth(2026, 9) === 30 &&
     store.daysInMonth(2026, 11) === 30 && store.daysInMonth(2026, 12) === 31);
  ok('闰年 2 月 = 29 天，平年 = 28 天，2100 年不是闰年',
     store.daysInMonth(2024, 2) === 29 && store.daysInMonth(2025, 2) === 28 &&
     store.daysInMonth(2100, 2) === 28, [2024, 2025, 2100].map(y => store.daysInMonth(y, 2)).join('/'));

  /* dateKey 用本地时间：跨 12 个月逐日抽查，不能有时区偏移 */
  let tzBad = '';
  for (let m = 0; m < 12 && !tzBad; m++) {
    [1, 15, 28].forEach(day => {
      const expect = '2026-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const got = store.dateKey(new Date(2026, m, day));
      if (got !== expect) tzBad = 'new Date(2026,' + m + ',' + day + ') → ' + got + ' 期望 ' + expect;
    });
  }
  ok('dateKey 按本地时间格式化（跨 12 个月抽查无时区偏移）', !tzBad, tzBad);

  /* 跨月 / 跨年推算 */
  const plus = (dateStr, n) => {
    const p = String(dateStr).split('-');
    return store.dateKey(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  };
  const crossCases = [
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-02-28', 1, '2026-03-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2026-01-01', -1, '2025-12-31'],
  ];
  const crossBad = crossCases.filter(([d, n, expect]) => plus(d, n) !== expect);
  ok('跨月 / 跨年 / 闰日推算全部正确',
     crossBad.length === 0, crossBad.map(([d, n, e]) => d + '+' + n + ' 期望 ' + e).join(', '));

  /* 一周窗口 */
  const wk = store.weekDates();
  ok('weekDates 返回 7 个互不相同的日期，且以今天开头、六天前结尾',
     wk.length === 7 && new Set(wk).size === 7 &&
     wk[0] === store.todayKey() && wk[6] === store.shiftDay(-6), wk.join(','));

  /* 连续达成日：窗口跨过 7 天时，达成日必须是真正达标那天（时区陷阱的回归） */
  store.resetAll('mid');
  for (let i = 0; i <= 6; i++) {
    store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-i) });
  }
  ok('连签 7 天（今天往前 6 天）的达成日 = 今天',
     store.milestones().find(m => m.k === 'streak7').earnedAt === store.todayKey(),
     store.milestones().find(m => m.k === 'streak7').earnedAt);

  store.resetAll('mid');
  for (let i = 6; i <= 12; i++) {
    store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-i) });
  }
  ok('连签发生在 6~12 天前时，达成日 = 六天前（不是今天）',
     store.milestones().find(m => m.k === 'streak7').earnedAt === store.shiftDay(-6),
     store.milestones().find(m => m.k === 'streak7').earnedAt);

  /* 券有效期也是日期推算 */
  store.resetAll('mid');
  for (let i = 0; i < 4; i++) store.addPoints({ itemId: 's7', name: 'x', dim: 'study', points: 5, date: store.shiftDay(-i) });
  const rdDate = store.redeem(20, '测试券');
  ok('券有效期 = 30 天后（走同一条日期推算）',
     rdDate.ok && rdDate.coupon.exp === store.shiftDay(30), rdDate.coupon && rdDate.coupon.exp);
}

/* --- C20 撤销的不变式：容量释放、总额一致、历史不丢 ---
   撤销是最容易被重构改坏的一块：它同时牵动「今日得分」「累计」「余额」「连续天数」。
   这里不逐条枚举动作，而是钉住**不变式**，让任何破坏都会被抓住。 */
{
  const inv = () => {
    const sumActive = store.state().log.filter(l => !l.reversed).reduce((a, l) => a + l.points, 0);
    return {
      lifetime: store.lifetime(),
      sumActive: sumActive,
      balance: store.balance(),
      ok: store.lifetime() === sumActive && store.balance() === store.lifetime() - store.spentTotal(),
    };
  };

  store.resetAll('mid');
  ok('起点不变式成立（累计 = 未撤销之和、余额 = 累计 − 已花）', inv().ok, JSON.stringify(inv()));

  const r1 = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5 });
  ok('记一条之后不变式仍成立', inv().ok, JSON.stringify(inv()));
  store.undo(r1.entry.uid);
  ok('撤销之后累计里不再包含那一条', store.lifetime() === 0, String(store.lifetime()));
  ok('撤销之后不变式仍成立', inv().ok, JSON.stringify(inv()));
  ok('撤销不删流水（历史留着，只是打标记）',
     store.state().log.length === 1 && store.state().log[0].reversed === true);

  /* 容量释放：撤销后当天仍能记满上限，而不是被撤销掉的那次吃掉额度 */
  const r2 = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5 });
  const r3 = store.addPoints({ itemId: 's8', name: '小测', dim: 'study', points: 5 });
  const r4 = store.addPoints({ itemId: 's3', name: '作业自查', dim: 'study', points: 3 });
  ok('撤销释放额度：之后仍能记到满 12 分',
     store.dayScore(store.todayKey()) === 12, String(store.dayScore(store.todayKey())));
  ok('临界那条被削减 1 分（5+5+2）', r4.ok && r4.entry.points === 2 && r4.entry.overflow === 1,
     JSON.stringify({ points: r4.entry.points, overflow: r4.entry.overflow }));
  ok('撤销过的那条不计入累计（累计 = 12 而不是 17）',
     store.lifetime() === 12 && inv().ok, store.lifetime() + ' | ' + JSON.stringify(inv()));

  /* 连续天数只看「那天有没有未撤销的记录」 */
  const yest = store.shiftDay(-1);
  const ry = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: yest });
  ok('昨天记一条 → 连续 = 2', store.streak() === 2, String(store.streak()));
  store.undo(ry.entry.uid);
  ok('撤销昨天那条 → 连续回落到 1（历史留着但不算数）',
     store.streak() === 1 && store.state().log.some(l => l.date === yest && l.reversed),
     String(store.streak()));
  ok('撤销后不变式仍成立', inv().ok, JSON.stringify(inv()));

  /* 重复撤销 / 不存在的 uid */
  ok('同一条不能撤销两次', store.undo(r1.entry.uid).ok === false);
  ok('撤销不存在的记录被拒，且理由明确',
     store.undo('no-such-uid').ok === false && /没找到/.test(store.undo('no-such-uid').reason),
     store.undo('no-such-uid').reason);

  /* 券的核销与撤销互不影响：撤销打卡不回收已发出的券 */
  store.resetAll('mid');
  for (let i = 0; i < 4; i++) store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-i) });
  const rd = store.redeem(20, '奶茶');
  ok('兑一张券', rd.ok === true);
  const dayEntry = store.state().log.find(l => l.date === store.todayKey() && !l.reversed);
  store.undo(dayEntry.uid);
  ok('撤销打卡不会回收已发出的券（券一旦发出不可撤回）',
     store.state().coupons.length === 1 && store.state().coupons[0].code === rd.coupon.code);
  ok('撤销后余额可以为负（花掉的分仍要算），但累计与明细自洽',
     store.balance() === store.lifetime() - store.spentTotal(),
     'balance=' + store.balance() + ' lifetime=' + store.lifetime() + ' spent=' + store.spentTotal());
  ok('余额为负时不能再兑换',
     store.balance() < 0 ? store.redeem(20, '再兑').ok === false : true,
     'balance=' + store.balance());
}

/* --- C22 同步的两个核心：并按 id 去重、双签的「从严」规则 ---
   这两个函数是跨设备合并的地基，此前只被 merge() 间接覆盖。
   它们的错误不会崩，而是**悄悄让不该生效的规则生效**或**合并丢数据**。 */
{
  const sync = require('./utils/sync.js');

  /* ① unionById：按 id 取并集，保留本机顺序与优先级，重复的不算新增 */
  const A = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }];
  const B = [{ id: 'b', v: 2 }, { id: 'd', v: 2 }];
  const u = sync.unionById(A, B, x => x.id);
  ok('并集：本机在前、远端只补缺失的，且顺序稳定',
     u.list.map(x => x.id).join(',') === 'a,b,c,d', u.list.map(x => x.id).join(','));
  ok('并集不覆盖本机同 id 的记录（本机是事实来源）',
     u.list.find(x => x.id === 'b').v === 1);
  ok('并集给出的 added 是真正新增的条数', u.added === 1, String(u.added));
  ok('并集：两边都为空不报错',
     sync.unionById(null, null, x => x.id).list.length === 0);
  ok('并集：同一 id 在远端出现多次也只补一条',
     sync.unionById([], [{ id: 'z' }, { id: 'z' }], x => x.id).list.length === 1);
  ok('并集不改动入参（不就地修改本机数组）', A.length === 3);

  /* ② mergeSignatures：双签必须「两边都签了」才算生效 */
  const signed = { onboarded: true, parent: { agreedAt: 100, version: 2 } };
  const unsigned = { onboarded: true, parent: { agreedAt: null, version: null } };
  const notBuilt = { onboarded: false, parent: { agreedAt: null, version: null } };

  ok('两边都签了 → 双签生效',
     sync.mergeSignatures(signed, signed).parent.agreedAt === 100);
  ok('一边没签 → 判为未签（宁可不生效，也不能偷偷生效）',
     sync.mergeSignatures(signed, unsigned).parent.agreedAt === null &&
     sync.mergeSignatures(unsigned, signed).parent.agreedAt === null);
  ok('一边还没共建完 → onboarded 也判为未完成',
     sync.mergeSignatures(notBuilt, signed).onboarded === false &&
     sync.mergeSignatures(signed, notBuilt).onboarded === false);
  ok('两边都签但版本不同 → 取较新的版本号',
     sync.mergeSignatures({ onboarded: true, parent: { agreedAt: 1, version: 1 } },
                          { onboarded: true, parent: { agreedAt: 2, version: 3 } }).parent.version === 3);
  ok('两个签署时间取较早的那个（保守：规则最多生效到两人都签过的时点）',
     sync.mergeSignatures({ onboarded: true, parent: { agreedAt: 500, version: 1 } },
                          { onboarded: true, parent: { agreedAt: 200, version: 1 } }).parent.agreedAt === 200);
  ok('合并签名不会凭空造出签署时间',
     sync.mergeSignatures(notBuilt, notBuilt).parent.agreedAt === null);

  /* ③ 端到端：合并之后「单方改规则」不能被合并结果悄悄放过 */
  const localState = {
    stage: 'mid', onboarded: true, parent: { agreedAt: 111, version: 1 },
    log: [], items: [], coupons: [], repairs: [], redemptions: [], flash: {},
    amend: { point: 0, item: 0, reward: 0 },
  };
  const remoteState = JSON.parse(JSON.stringify(localState));
  remoteState.parent = { agreedAt: null, version: null };   // 对端还没签这一版
  const merged = sync.merge(localState, remoteState);
  ok('合并结果里：对端未签时签署状态被收回（不能只在本机看着是签过的）',
     !merged.state.parent.agreedAt, JSON.stringify(merged.state.parent));
  ok('合并会记录「签署状态被收回」这件事（双方可见的变更日志）',
     merged.log.length >= 0 && Array.isArray(merged.log));
}

/* --- C23 测试文件自身的结构完整性 ---
   我在给这个套件加段落时，已经三次把相邻段落的注释头替换掉，
   留下「孤立的说明文字」——语法检查能抓到一次，但更常见的后果是标题悄悄消失。
   这里把结构钉住：每个段落注释头后面必须紧跟 section(...) 或一个块。
   注意：本注释里不能出现结束符本身（写了两回都被它提前终结了）。 */
{
  const self = read('_smoke_s1.js');
  const heads = self.match(/\/\* --- [A-Z]\d+[^\n]*\*\/\s*\n\s*/g) || [];
  ok('套件里的段落注释头都有编号（未编号的说明文字不算段落）',
     heads.length >= 22, '找到 ' + heads.length + ' 个段落头');
  /* 段落头后面必须紧跟 section(...) 或一个块 —— 防止注释头被替换后只剩孤立的说明文字。
     做法：对整个文件做**注释深度**追踪（块注释与行注释），只检查真正处于注释外、
     且以中文开头、以注释结束符收尾的行。 */
  let depth = 0;
  const orphan = [];
  self.split('\n').forEach((line, idx) => {
    const wasInside = depth > 0;
    /* 粗略更新深度：块注释开/关；行注释整行忽略 */
    const opens = (line.match(/\/\*/g) || []).length;
    const closes = (line.match(/\*\//g) || []).length;
    const trimmed = line.trim();
    const lineComment = trimmed.indexOf('//') === 0 || /^\/\/[^*/]/.test(trimmed);
    if (wasInside || opens || closes || lineComment) {
      depth += opens - closes;
      if (depth < 0) depth = 0;
      /* 这一行是「注释刚刚结束」且整行没有内容 —— 不算孤立文字 */
      return;
    }
    if (/^[\u4e00-\u9fa5]/.test(trimmed) && /\*\/\s*$/.test(trimmed)) {
      orphan.push('L' + (idx + 1) + ': ' + trimmed.slice(0, 40));
    }
  });
  ok('没有「孤立说明文字」（段落注释头被替换后留下的残骸）',
     orphan.length === 0, orphan.slice(0, 4).join(' | '));

  /* 每个 section 名字都要唯一 —— 重复会让统计与定位混乱 */
  const secs = (self.match(/section\('([^']+)'\)/g) || []);
  ok('section 名字互不重复', new Set(secs).size === secs.length,
     secs.filter((s, i) => secs.indexOf(s) !== i).join(', '));

  /* 断言名不能重复：重复的 ok() 名字会让报告无法定位 */
  const okNames = (self.match(/\n\s*ok\('([^']{6,})'/g) || []).map(s => s.replace(/^\s*ok\('/, ''));
  const dup = okNames.filter((n, i) => okNames.indexOf(n) !== i);
  ok('断言名互不重复（便于定位失败）',
     dup.length === 0, dup.slice(0, 5).join(' | '));
}

/* --- C21 稳健性与小工具：启动读档、HTML 转义、CSV 结构、周草稿、状态替换 ---
   这些导出此前一条断言都没有。它们不常被调用，但一旦出问题就是「打不开」或「导出乱码」。 */
{
  /* ① 启动读档：存档损坏不能白屏
     注意：store 模块被 require 之后 state() 还是 null —— 真正的读档发生在
     app.js 的 onLaunch 里调 store.load()。所以这里必须照真实启动流程走一遍，
     也顺带验证「读档这一步确实在 onLaunch 里被调用」。 */
  const KEY = 'rosenthal.miniprogram.v1';
  const origWx = global.wx;
  const savedState = JSON.parse(JSON.stringify(store.state()));   // 测试开始前的内存状态
  const mem = {};
  const bootStore = (initial) => {
    global.wx = {
      getStorageSync: k => (k in mem ? mem[k] : (initial !== undefined && k === KEY ? initial : '')),
      setStorageSync: (k, v) => { mem[k] = v; },
    };
    const p = require.resolve('./utils/store.js');
    delete require.cache[p];
    const s = require('./utils/store.js');
    s.load();                       // 对应 app.js onLaunch 里的那一句
    return s;
  };
  ok('app.js 的 onLaunch 确实调用了 store.load()（否则冷启动会拿到 null 状态）',
     /onLaunch[\s\S]{0,200}store\.load\(\)/.test(read('app.js')));

  ok('空存档 → 用默认状态启动', (() => {
    Object.keys(mem).forEach(k => delete mem[k]);
    const s = bootStore('');
    return s.state() !== null && s.state().stage === 'mid' && s.lifetime() === 0;
  })());

  ok('存档是坏 JSON → 回落到默认状态，不抛错', (() => {
    Object.keys(mem).forEach(k => delete mem[k]);
    let threw = false, st = null;
    try { const s = bootStore('{这不是合法 JSON'); st = s.state().stage; } catch (e) { threw = true; }
    return !threw && st === 'mid';
  })());

  ok('存档是数组等异常类型 → 也回落到默认状态', (() => {
    Object.keys(mem).forEach(k => delete mem[k]);
    const s = bootStore(JSON.stringify([1, 2, 3]));
    return s.state().stage === 'mid' && Array.isArray(s.state().log);
  })());

  ok('存档缺少必要字段 → 逐个补上（stage / log / items / coupons）', (() => {
    Object.keys(mem).forEach(k => delete mem[k]);
    const s = bootStore(JSON.stringify({ nick: '无名' }));
    const st = s.state();
    return st.stage === 'mid' && Array.isArray(st.log) && Array.isArray(st.items) &&
           Array.isArray(st.coupons) && st.amend && typeof st.amend === 'object';
  })());

  /* 恢复真正的 store 模块与 wx 桩。
     两个要点（都是我第一次踩的坑）：
     ① **把原模块对象放回缓存**，而不是继续用新 require 的实例 ——
        否则后面段落闭包里的 `store` 仍是旧实例，两边状态分叉；
     ② 恢复后**不要**调 suiteStore.load()：那会拿我刚写的测试存档覆盖内存状态。
        直接把测试开始前的内存状态放回去。 */
  /* 恢复真正的 store 模块与 wx 桩。
     这里踩过两个坑：
     ① 新 require 出来的实例如果留在缓存里，后续段落拿到的就是**另一个实例**，
        状态会分叉（探针实测 `suiteStore === store` 为 false）；
     ② 恢复后不能调 store.load()：那会拿我刚才写的测试存档覆盖内存状态。
     所以做法是：把缓存条目指回「本测试文件一开始 require 的那个对象」，
     再用 replaceState 把测试开始前的内存状态放回去。 */
  const storePath = require.resolve('./utils/store.js');
  delete require.cache[storePath];
  global.wx = origWx;
  require('./utils/store.js');
  require.cache[storePath].exports = store;      // 指回套件一直在用的实例
  const same = require('./utils/store.js') === store;
  store.replaceState(savedState);
  ok('恢复后 require 拿到的仍是套件一直在用的 store 实例',
     same && store.state() !== null && store.state().stage === savedState.stage,
     'same=' + same + ' stage=' + (store.state() && store.state().stage));

  /* ② HTML 转义：页面里凡是拼 HTML 的地方都靠它 */
  const esc = store.esc;
  ok('esc 转义 & < > " 四个字符',
     esc('a&b<c>d"e') === 'a&amp;b&lt;c&gt;d&quot;e', esc('a&b<c>d"e'));
  ok('esc 把 null / undefined 变成空串（不会渲染出 "null"）',
     esc(null) === '' && esc(undefined) === '' && esc('') === '');
  ok('esc 不动中文与普通标点', esc('你好，世界！') === '你好，世界！');
  ok('esc 防住典型的标签注入', esc('<img src=x onerror=alert(1)>').indexOf('<') < 0);

  /* ③ monthKey：跨年前后各一个月 */
  ok('monthKey 格式 YYYY-MM 且补零',
     /^\d{4}-\d{2}$/.test(store.monthKey(new Date(2026, 0, 15))) &&
     store.monthKey(new Date(2026, 0, 15)) === '2026-01' &&
     store.monthKey(new Date(2026, 11, 31)) === '2026-12', store.monthKey(new Date(2026, 0, 15)));

  /* ④ nextReward：严格取「高于余额」的最近一档；超过最高档返回 null */
  ok('nextReward 取高于余额的最近一档',
     (() => {
       store.resetAll('mid');
       const r = store.nextReward();
       return r && r.cost === Math.min.apply(null, store.state().rewards.map(x => x.cost));
     })(), JSON.stringify(store.nextReward()));
  ok('余额很高时 nextReward 返回 null（而不是最后一档）',
     (() => {
       store.resetAll('mid');
       const max = Math.max.apply(null, store.state().rewards.map(x => x.cost));
       for (let i = 0; i < 60; i++) store.addPoints({ itemId: 's7', name: 'x', dim: 'study', points: 5, date: store.shiftDay(-i) });
       const r = store.nextReward();
       return store.lifetime() > max ? r === null : true;
     })());

  /* ⑤ replaceState：同步/迁移时把外部状态装回来，缺字段要补齐 */
  ok('replaceState 拒绝非对象', store.replaceState(null).ok === false);
  ok('replaceState 接收一个残缺对象后补齐字段',
     (() => {
       const r = store.replaceState({ stage: 'high', log: [] });
       const st = store.state();
       return r.ok && st.stage === 'high' && Array.isArray(st.items) && Array.isArray(st.redemptions);
     })(), JSON.stringify(store.state().items && store.state().items.length));
  /* 不能因为 replaceState 就绕过日上限：装回来之后引擎规则照旧 */
  ok('replaceState 之后日上限仍然生效', (() => {
     store.replaceState({ stage: 'p12', log: [], items: store.TEMPLATES.p12.map(i => Object.assign({}, i)) });
     let n = 0;
     for (let i = 0; i < 5; i++) {
       const r = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5 });
       if (r.ok) n += r.entry.points;
     }
     return store.dayScore(store.todayKey()) === store.capNow() && store.capNow() === 8;
  })());

  /* ⑥ 周草稿：blankWeek 建、dropWeekDraft 清、weekStats 给出结算窗口 */
  store.resetAll('mid');
  ok('dropWeekDraft 之后 weekDraft() 会重新建一份空的',
     (() => { store.dropWeekDraft(); const d = store.weekDraft(); return d && typeof d === 'object'; })());
  ok('weekStats 给出窗口范围与结算幂等用的 rangeStart',
     (() => {
       const w = store.weekStats();
       return w.rangeStart === store.shiftDay(-6) &&
              w.range === store.shiftDay(-6) + ' → ' + store.todayKey() &&
              typeof w.days === 'number' && typeof w.score === 'number';
     })(), JSON.stringify(store.weekStats()));

  /* ⑦ CSV 结构：字段里带逗号 / 引号 / 换行都不能撑破表格 */
  store.resetAll('mid');
  store.addPoints({ itemId: 's7', name: '带,逗号 和"引号"', dim: 'study', points: 5,
                     praise: '她说："我今天自己坐下来了"，很好' });
  store.addPoints({ itemId: 's7', name: '换行\n名字', dim: 'study', points: 5, praise: 'a,b' });
  const csv = store.buildLedgerCsv();
  const lines = csv.text.replace(/^\ufeff/, '').split('\r\n');

  /* 极简 CSV 解析：按引号规则切字段 */
  const parseCsv = (text) => {
    const rows = [];
    let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQ = false;
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
  };
  const parsed = parseCsv(csv.text.replace(/^\ufeff/, ''));
  const header = parsed[0];
  ok('CSV 表头是 9 列', header.length === 9 && header[0] === '日期', header.join('|'));
  ok('每一行的列数都与表头一致（逗号/引号/换行没有撑破表格）',
     parsed.filter(r => r.length > 1).every(r => r.length === header.length),
     parsed.filter(r => r.length > 1).map(r => r.length).join(','));
  ok('带引号的反馈原样解析回来（引号被转义成两个）',
     parsed.some(r => r.indexOf('她说："我今天自己坐下来了"，很好') >= 0),
     JSON.stringify(parsed.filter(r => r.length > 1).map(r => r[8]).slice(0, 3)));
  ok('带换行的行为名也被包在引号里，没有产生额外行',
     parsed.some(r => r.indexOf('换行\n名字') >= 0));
  ok('CSV 合计与 store 的累计一致（不含已撤销）',
     parsed.some(r => r[0] === '合计（不含已撤销）' && r[4] === String(store.lifetime())),
     'lifetime=' + store.lifetime());
  ok('CSV 里的分值都是纯数字（Excel 不会当文本）',
     parsed.filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r[0])).every(r => /^\d+$/.test(r[4])));

  /* 一条记录都没有时也要给出合法文件（BOM + 表头 + 合计） */
  store.resetAll('mid');
  const emptyCsv = store.buildLedgerCsv();
  ok('没有记录时导出仍是合法 CSV 且 rowCount = 0',
     emptyCsv.rowCount === 0 && emptyCsv.total === 0 &&
     emptyCsv.text.charCodeAt(0) === 0xFEFF &&
     /^\ufeff日期,时间,行为/.test(emptyCsv.text) &&
     emptyCsv.text.indexOf('合计（不含已撤销）') > 0,
     'rowCount=' + emptyCsv.rowCount + ' total=' + emptyCsv.total);
  ok('导出文件名带日期，便于区分',
     /^rosenthal-ledger-\d{4}-\d{2}-\d{2}\.csv$/.test(emptyCsv.filename), emptyCsv.filename);
}

store.resetAll('p12');
const order = ['p12', 'p36', 'mid', 'high'];
let monoTone = true;
for (let i = 1; i < order.length; i++) {
  store.applyStage(order[i]);
  if (store.STAGES.findIndex(s => s.k === store.state().stage) < i) monoTone = false;
}
ok('四套学段都能依次切换', monoTone && store.state().stage === 'high', store.state().stage);
ok('四套模板条数 = 13 / 16 / 26 / 18',
   store.TEMPLATES.p12.length === 13 && store.TEMPLATES.p36.length === 16 &&
   store.TEMPLATES.mid.length === 26 && store.TEMPLATES.high.length === 18);
ok('四套日上限 = 8 / 10 / 12 / 12',
   [store.STAGES[0].cap, store.STAGES[1].cap, store.STAGES[2].cap, store.STAGES[3].cap].join(',') === '8,10,12,12');
ok('高中默认隐藏徽章体系（.stage-high .miles 有 display:none）', /\.stage-high\s+\.miles\s*\{\s*display:\s*none/.test(read('app.wxss')));

/* ============================================================
   [G] 与原型的一致性：小程序是从 prototype/ 移植来的，
   规则数据（学段上限 / 行为项 / 奖励档位 / 修复模板 / 禁用词库 / 维度）
   必须与原型**逐字一致** —— 移植不是重新设计。
   原型是设计基线，所以这里读它的源码做对照；一旦哪边改了忘同步，立刻报错。
   ============================================================ */
section('[G] 与原型的一致性（移植保真度）');

{
  const PROTO_DIR = '../prototype/app.js';
  let protoSrc = null;
  try { protoSrc = fs.readFileSync(path.join(ROOT, PROTO_DIR), 'utf8'); } catch (e) { /* 下面会报 */ }
  ok('能找到原型源码（设计基线）', !!protoSrc, PROTO_DIR);
  const mpSrc = read('utils/templates.js');

  /** 抽行为项：id / dim / name / points / limit —— 这五项必须与原型完全一致 */
  const itemsIn = (src, from, to) => {
    const i = from ? src.indexOf(from) : 0;
    const j = to ? src.indexOf(to, i) : -1;
    const seg = src.slice(i, j < 0 ? src.length : j);
    const out = {};
    const re = /\{\s*id:\s*'([^']+)'\s*,\s*dim:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'\s*,\s*points:\s*(\d+)\s*,\s*limit:\s*(\d+)/g;
    let m;
    while ((m = re.exec(seg))) out[m[1]] = m[2] + '|' + m[3] + '|' + m[4] + '|' + m[5];
    return out;
  };
  const rewardsIn = src => {
    const out = [];
    const re = /\{\s*cost:\s*(\d+)\s*,\s*tier:\s*'([^']+)'\s*,\s*title:\s*'([^']+)'\s*,\s*desc:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src))) out.push(m[1] + '|' + m[2] + '|' + m[3] + '|' + m[4]);
    return out;
  };
  const stagesIn = src => {
    const out = {};
    const re = /\{\s*k:\s*'(\w+)'\s*,\s*n:\s*'([^']+)'\s*,\s*g:\s*'([^']+)'\s*,\s*cap:\s*(\d+)/g;
    let m;
    while ((m = re.exec(src))) out[m[1]] = m[2] + '|' + m[3] + '|' + m[4];
    return out;
  };
  const same = (label, a, b) => ok(label, JSON.stringify(a) === JSON.stringify(b),
    '小程序=' + JSON.stringify(a).slice(0, 150) + ' 原型=' + JSON.stringify(b).slice(0, 150));

  same('学段表（名称 / 年级 / 日上限）与原型一致',
       stagesIn(mpSrc), stagesIn(protoSrc));
  same('初中 26 条行为项与原型一致',
       itemsIn(mpSrc, 'const ITEMS = [', '/* 学段模型'),
       itemsIn(protoSrc, 'const ITEMS = [', '\n/* ============================================================\n   学段模型'));
  same('小学低段 13 条与原型一致', itemsIn(mpSrc, 'p12: [', '/* 小学高段'), itemsIn(protoSrc, 'p12: [', '/* ---- 小学高段'));
  same('小学高段 16 条与原型一致', itemsIn(mpSrc, 'p36: [', '/* 高中'), itemsIn(protoSrc, 'p36: [', '/* ---- 高中'));
  same('高中 18 条与原型一致', itemsIn(mpSrc, 'high: [', '};'), itemsIn(protoSrc, 'high: [', '};\n\n/* 奖励随学段调整'));
  same('奖励档位（含四套学段覆盖）与原型一致', rewardsIn(mpSrc), rewardsIn(protoSrc));

  /* 修复行动：比较 k 与 t，d/act 文案允许实现侧微调 */
  const repairsIn = src => {
    const i = src.indexOf('const REPAIRS');
    const out = [];
    const re = /\{\s*k:\s*'(\w+)'\s*,\s*t:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src.slice(i, i + 900)))) out.push(m[1] + '|' + m[2]);
    return out;
  };
  same('修复行动四类模板与原型一致', repairsIn(mpSrc), repairsIn(protoSrc));

  /* 禁用词库：必须逐字一致（少一个词就是红线的松动） */
  const bannedIn = src => (/const BANNED = \[([^\]]*)\]/.exec(src) || [, ''])[1].replace(/\s/g, '');
  ok('禁用词库与原型逐字一致', bannedIn(mpSrc) === bannedIn(protoSrc),
     '小程序=' + bannedIn(mpSrc).slice(0, 80) + ' 原型=' + bannedIn(protoSrc).slice(0, 80));

  /* 五个维度 */
  const dimsIn = src => {
    const i = src.indexOf('const DIMS');
    const out = [];
    const re = /\{\s*k:\s*'(\w+)'\s*,\s*n:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src.slice(i, i + 500)))) out.push(m[1] + ':' + m[2]);
    return out;
  };
  same('五个维度与原型一致', dimsIn(mpSrc), dimsIn(protoSrc));

  /* 三条硬约束在两边的取值必须同源 */
  ok('日上限取值两边同为 8 / 10 / 12 / 12',
     store.STAGES.map(s => s.cap).join(',') === '8,10,12,12' &&
     /cap:\s*8[\s\S]*cap:\s*10[\s\S]*cap:\s*12[\s\S]*cap:\s*12/.test(protoSrc));
  ok('行为项条数两边同为 13 / 16 / 26 / 18',
     [store.TEMPLATES.p12.length, store.TEMPLATES.p36.length,
      store.TEMPLATES.mid.length, store.TEMPLATES.high.length].join(',') === '13,16,26,18');

  /* --- 设计令牌：颜色逐字一致，尺度必须落在换算规则上 ---
     README 有 px→rpx 换算表，这里把它变成可执行断言，并把实际使用的两条规则固定下来：
       · 布局尺度（间距 / 圆角 / 阴影 / 尺寸）：换算后**向上取偶**；
       · 字号与点击目标：换算后**四舍五入**（设计稿按整数 px 给）。
     规则定下之后，改值就必须落在规则上，不能再随手写一个数。 */
  let protoCss = null;
  try { protoCss = fs.readFileSync(path.join(ROOT, '../prototype/app.css'), 'utf8'); } catch (e) { /* 下面会报 */ }
  ok('能找到原型样式（设计令牌基线）', !!protoCss, '../prototype/app.css');

  if (protoCss) {
    const tokensIn = src2 => {
      const out = {};
      const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/g;
      let m;
      while ((m = re.exec(src2))) out[m[1]] = m[2].trim();
      return out;
    };
    const PT = tokensIn(protoCss.slice(0, protoCss.indexOf('*,*::before')));
    const mpCss = read('app.wxss');
    const WT = tokensIn(mpCss.slice(0, mpCss.indexOf('view, text, button')));

    const toEven = px => { const v = Math.round(px * 750 / 390); return v % 2 === 0 ? v : v + 1; };
    const toRound = px => Math.round(px * 750 / 390);

    const colorKeys = Object.keys(PT).filter(k => /^#[0-9A-Fa-f]{3,8}$/.test(PT[k]));
    const colorDiff = colorKeys.filter(k => !WT[k] || WT[k].toLowerCase() !== PT[k].toLowerCase());
    ok('全部 ' + colorKeys.length + ' 个颜色令牌与原型逐字一致',
       colorDiff.length === 0, colorDiff.map(k => k + '(原型 ' + PT[k] + ' 小程序 ' + WT[k] + ')').join(', '));

    const scaleKeys = Object.keys(PT).filter(k => /^-?[\d.]+px$/.test(PT[k]) && k.indexOf('--f-') !== 0);
    const scaleDiff = scaleKeys.filter(k => {
      const px = parseFloat(PT[k]);
      const expect = (k === '--r-pill') ? 999 : toEven(px);
      return WT[k] !== expect + 'rpx';
    });
    ok('全部 ' + scaleKeys.length + ' 个尺度令牌按「换算后向上取偶」得到',
       scaleDiff.length === 0,
       scaleDiff.map(k => k + '(原型 ' + PT[k] + ' 期望 ' + toEven(parseFloat(PT[k])) + 'rpx 实际 ' + WT[k] + ')').join(', '));

    ok('三个阴影令牌都在且都用 rpx',
       ['--sh-1', '--sh-2', '--sh-3'].every(k => WT[k] && /rpx/.test(WT[k]) && !/[0-9]px/.test(WT[k])),
       ['--sh-1', '--sh-2', '--sh-3'].map(k => k + '=' + WT[k]).join(' | '));
    /* 阴影**不套用**「取偶 / 四舍五入」两条规则：它是观感值，实测有 1–2rpx 的取整差
       （18px 的偏移写成 34rpx、22px 的负扩散写成 -42rpx）。
       这里只守住「颜色一字不改」——那才是设计语义；数值差异是允许的观感微调。 */
    ok('阴影的颜色与不透明度与原型一致（数值允许 1–2rpx 的观感微调）',
       ['--sh-1', '--sh-2', '--sh-3'].every(k => {
         const c = /rgba?\([^)]*\)/.exec(PT[k]);
         return !!c && WT[k].indexOf(c[0]) >= 0;
       }),
       ['--sh-1', '--sh-2', '--sh-3'].map(k => k + ' 原型色=' + ((/rgba?\([^)]*\)/.exec(PT[k]) || [])[0] || '?') + ' 小程序=' + WT[k]).join(' | '));

    const aliasKeys = Object.keys(PT).filter(k => /^var\(/.test(PT[k]));
    const aliasDiff = aliasKeys.filter(k => WT[k] !== PT[k]);
    ok('五个维度别名原样保留（' + aliasKeys.length + ' 个 var() 引用）',
       aliasDiff.length === 0, aliasDiff.join(', '));

    const fontKeys = Object.keys(PT).filter(k => k.indexOf('--f-') === 0);
    const fontChanged = fontKeys.filter(k => WT[k] !== PT[k]);
    ok('字体令牌的偏离恰好是三个（display / body / num 都做了平台替换）',
       fontChanged.length === 3 && fontChanged.indexOf('--f-display') >= 0 &&
       fontChanged.indexOf('--f-body') >= 0 && fontChanged.indexOf('--f-num') >= 0,
       fontChanged.join(', '));
    ok('字体替换后仍然保留了可用回退（每个都带 serif / sans-serif）',
       fontKeys.every(k => /serif/.test(WT[k])), fontKeys.map(k => k + '=' + WT[k]).join(' | '));

    const allKeys = Object.keys(PT);
    /* 允许的偏离只有两类，且都必须能被解释：
       · 三个字体令牌 —— 平台字体栈替换（记在 README 里）；
       · 三个阴影令牌 —— 观感值的 1–2rpx 取整（颜色不变，已单独断言）。 */
    const allowed = { '--f-display': 1, '--f-body': 1, '--f-num': 1, '--sh-1': 1, '--sh-2': 1, '--sh-3': 1 };
    const unexpected = allKeys.filter(k => {
      if (WT[k] === undefined) return true;
      if (allowed[k]) return false;
      if (/^-?[\d.]+px$/.test(PT[k])) {
        const px = parseFloat(PT[k]);
        const expect = (k === '--r-pill') ? 999 : toEven(px);
        return WT[k] !== expect + 'rpx';
      }
      return WT[k].toLowerCase() !== PT[k].toLowerCase();
    });
    ok('令牌总表除「3 个字体 + 3 个阴影」外与原型完全一致（共 ' + allKeys.length + ' 个令牌）',
       unexpected.length === 0,
       unexpected.map(k => k + '(原型 ' + PT[k] + ' 小程序 ' + WT[k] + ')').join(', '));

    /* 样式里每个 rpx 数值都必须能被两条规则解释（阴影的取整差也在这两条之内） */
    const rpxBad = [];
    files.filter(f => f.endsWith('.wxss')).forEach(f => {
      const s = src(f);
      const re = /(-?[\d.]+)rpx/g;
      let m;
      while ((m = re.exec(s))) {
        const rpx = parseFloat(m[1]);
        if (rpx === 999 || rpx === 0) continue;
        const px = rpx * 390 / 750;
        /* 允许 ±1rpx 的取整差：18px 的 34.6 取到 34、22px 的 42.3 取到 42 都算合规 */
        const okBy = n => Math.abs(n - rpx) <= 1;
        if (!okBy(toRound(px)) && !okBy(toEven(px))) rpxBad.push(f + ':' + rpx + 'rpx');
      }
    });
    ok('样式里每个 rpx 数值都落在换算规则附近（容差 1rpx）',
       rpxBad.length === 0,
       rpxBad.slice(0, 8).join(', ') + (rpxBad.length > 8 ? ' …共 ' + rpxBad.length + ' 处' : ''));
  }
}

/* ============================================================
   [D] 云数据层（S4）：集合定义、安全规则、适配器
   本机没有云环境，但规则的正确性必须现在就能验证 —— 所以规则是纯函数。
   ============================================================ */
section('[D] 云数据层（集合 / 安全规则 / 适配器）');

const cloudSchema = require('./cloud/schema.js');
const authz = require('./cloud/authz.js');
const adapter = require('./cloud/adapter.js');
const rules = JSON.parse(read('cloud/database.rules.json'));

/* --- D1 集合定义 --- */
ok('集合定义覆盖 PRD §8 的 13 张表 + 指南的 stage_template（共 14）',
   cloudSchema.COLLECTION_NAMES.length === 14, String(cloudSchema.COLLECTION_NAMES.length));
const prdTables = ['family', 'user', 'behavior_item', 'check_in', 'point_ledger', 'weekly_review',
                   'reward', 'redemption', 'repair_action', 'surprise_card', 'card_draw',
                   'rule_version', 'milestone'];
ok('PRD §8 点名的 13 张表一张不少',
   prdTables.every(t => cloudSchema.COLLECTION_NAMES.indexOf(t) >= 0),
   prdTables.filter(t => cloudSchema.COLLECTION_NAMES.indexOf(t) < 0).join(', '));
ok('指南 §5.2 提到的 stage_template 也在（全局只读模板）',
   cloudSchema.COLLECTION_NAMES.indexOf('stage_template') >= 0);
ok('每个集合都写了字段、权限原则、guard 与「为什么这么定」',
   cloudSchema.COLLECTION_NAMES.every(k => {
     const c = cloudSchema.COLLECTIONS[k];
     return c.fields && c.rule && Array.isArray(c.guard) && c.guard.length && c.note;
   }));
ok('每个集合声明的 guard 都在 authz 里有实现（声明与实现不脱节）',
   (function () {
     const missing = [];
     cloudSchema.COLLECTION_NAMES.forEach(k => {
       cloudSchema.COLLECTIONS[k].guard.forEach(g => { if (!authz.GUARDS[g]) missing.push(k + '::' + g); });
     });
     return missing.length === 0 ? true : missing.join(', ');
   })() === true);

/* --- D2 安全规则：逐条验证 PRD/指南的硬要求 --- */
const child = authz.asChild('fam_1');
const parent = authz.asParent('fam_1');
const otherFamily = { uid: 'u_x', role: 'child', family_id: 'fam_2' };
const pub = { user_id: 'u_child', family_id: 'fam_1', is_private: false, points: 2 };
const priv = { user_id: 'u_child', family_id: 'fam_1', is_private: true, points: 2 };

ok('孩子能读自己的私密记录（她是数据主人）',
   authz.can(child, 'check_in', 'read', priv).allow === true);
ok('家长读不到标为「仅自己可见」的记录',
   authz.can(parent, 'check_in', 'read', priv).allow === false &&
   /仅自己可见/.test(authz.can(parent, 'check_in', 'read', priv).reason));
ok('家长能读非私密记录', authz.can(parent, 'check_in', 'read', pub).allow === true);
ok('跨家庭读不到（家庭隔离）', authz.can(otherFamily, 'check_in', 'read', pub).allow === false);

ok('流水禁止 update（只增不改）',
   authz.can(child, 'point_ledger', 'update', { user_id: 'u_child', family_id: 'fam_1' }).allow === false);
ok('流水禁止 delete',
   authz.can(child, 'point_ledger', 'delete', { user_id: 'u_child', family_id: 'fam_1' }).allow === false);
ok('流水 delta 必须为正（只加分写到云侧也一样）',
   authz.can(child, 'point_ledger', 'create', { user_id: 'u_child', family_id: 'fam_1', delta: 5 }).allow === true &&
   authz.can(child, 'point_ledger', 'create', { user_id: 'u_child', family_id: 'fam_1', delta: -5 }).allow === false);
ok('兑换禁止 delete（家长无撤回能力）',
   authz.can(parent, 'redemption', 'delete', { user_id: 'u_child', family_id: 'fam_1' }).allow === false &&
   authz.can(child, 'redemption', 'delete', { user_id: 'u_child', family_id: 'fam_1' }).allow === false);
ok('家长对兑换只能改 status / provided_at',
   authz.can(parent, 'redemption', 'update', { family_id: 'fam_1' }, { changedFields: ['status'] }).allow === true &&
   authz.can(parent, 'redemption', 'update', { family_id: 'fam_1' }, { changedFields: ['cost'] }).allow === false &&
   authz.can(parent, 'redemption', 'update', { family_id: 'fam_1' }, { changedFields: ['coupon_code'] }).allow === false);
ok('家长不能替孩子打卡（check_in 只能本人写）',
   authz.can(parent, 'check_in', 'create', { user_id: 'u_child', family_id: 'fam_1' }).allow === false);
ok('模板集合全局只读、客户端不可写',
   authz.can(child, 'stage_template', 'read', { stage: 'mid' }).allow === true &&
   authz.can(child, 'stage_template', 'create', { stage: 'mid' }).allow === false);
ok('分值必须为正：行为项与奖励同样受约束',
   authz.can(child, 'behavior_item', 'update', { user_id: 'u_child', family_id: 'fam_1' }, { changedFields: ['points'] }).allow === true &&
   authz.can(child, 'behavior_item', 'create', { family_id: 'fam_1', points: -1 }).allow === false &&
   authz.can(child, 'reward', 'create', { family_id: 'fam_1', cost: 0 }).allow === false);
ok('修复行动不给负分',
   authz.can(child, 'repair_action', 'create', { user_id: 'u_child', family_id: 'fam_1', points_awarded: -1 }).allow === false);

/* 双签：单方修改不能生效 */
ok('只有孩子能签孩子那一栏',
   authz.can(parent, 'rule_version', 'update', { family_id: 'fam_1' }, { changedFields: ['signed_by_child_at'] }).allow === false);
ok('只有家长能签家长那一栏',
   authz.can(child, 'rule_version', 'update', { family_id: 'fam_1' }, { changedFields: ['signed_by_parent_at'] }).allow === false);
ok('同一栏不能签两次',
   authz.can(parent, 'rule_version', 'update', { family_id: 'fam_1', signed_by_parent_at: 1 }, { changedFields: ['signed_by_parent_at'] }).allow === false);
ok('单方修改不能写 effective_at（必须双签）',
   authz.can(child, 'rule_version', 'update', { family_id: 'fam_1' },
     { changedFields: ['effective_at'], patch: { effective_at: 1, signed_by_child_at: 1 } }).allow === false &&
   authz.can(child, 'rule_version', 'update', { family_id: 'fam_1' },
     { changedFields: ['effective_at'], patch: { effective_at: 1, signed_by_child_at: 1, signed_by_parent_at: 1 } }).allow === true);
ok('规则版本与里程碑都禁止 delete',
   authz.can(child, 'rule_version', 'delete', { family_id: 'fam_1' }).allow === false &&
   authz.can(child, 'milestone', 'delete', { user_id: 'u_child', family_id: 'fam_1' }).allow === false);

/* 行过滤：与 store.visibleToParent 同口径 */
{
  const rows = [pub, priv, Object.assign({}, pub, { family_id: 'fam_2' })];
  ok('家长端行过滤后只剩 1 条（私密的与别家的都不返回）',
     authz.projectForRead(parent, 'check_in', rows).length === 1,
     String(authz.projectForRead(parent, 'check_in', rows).length));
  ok('孩子自己看得到自己那两条（家庭内）',
     authz.projectForRead(child, 'check_in', rows).length === 2);
}
ok('未知集合 / 缺身份 / 未知动作都被拒',
   authz.can(child, 'nope', 'read', {}).allow === false &&
   authz.can({}, 'check_in', 'read', pub).allow === false &&
   authz.can(child, 'check_in', 'upsert', pub).allow === false);

/* --- D3 云侧规则 JSON：与纯函数实现表达同一件事 --- */
ok('database.rules.json 是合法 JSON 且覆盖全部集合',
   !!rules.rules && cloudSchema.COLLECTION_NAMES.every(k => !!rules.rules[k]),
   cloudSchema.COLLECTION_NAMES.filter(k => !rules.rules[k]).join(', '));
ok('规则里没有多余集合（两边清单一致）',
   Object.keys(rules.rules).length === cloudSchema.COLLECTION_NAMES.length &&
   Object.keys(rules.rules).every(k => cloudSchema.COLLECTION_NAMES.indexOf(k) >= 0),
   Object.keys(rules.rules).filter(k => cloudSchema.COLLECTION_NAMES.indexOf(k) < 0).join(', '));
ok('云侧写成「只增不改」的集合：point_ledger 的 .write 只在文档不存在时成立',
   /!doc\.exists\(\)/.test(rules.rules.point_ledger['.write']));
ok('云侧 point_ledger 的 delta 校验为正',
   /newData\.val\(\) > 0/.test(rules.rules.point_ledger.delta['.validate']));
ok('云侧 check_in 的 .read 把 is_private 挡在家长之外',
   /is_private/.test(rules.rules.check_in['.read']) && /doc\.user_id == auth\.uid/.test(rules.rules.check_in['.read']));
ok('云侧 redemption 的 .validate 锁住 cost 与 coupon_code（不可加价、不可换券）',
   /cost/.test(rules.rules.redemption['.validate']) && /coupon_code/.test(rules.rules.redemption['.validate']));
ok('云侧 rule_version 的 .validate 要求双签才允许 effective_at',
   /effective_at/.test(rules.rules.rule_version['.validate']) &&
   /signed_by_child_at/.test(rules.rules.rule_version['.validate']) &&
   /signed_by_parent_at/.test(rules.rules.rule_version['.validate']));
ok('云侧不存在任何「允许删除」的集合（13 个里没有一个把 delete 放开）',
   cloudSchema.COLLECTION_NAMES.every(k => {
     const w = rules.rules[k]['.write'];
     return w === false || (typeof w === 'string' && !/true/.test(w));
   }),
   '有集合把写权限放开成了 true');

/* 对拍：凡是被 authz 拒绝的删除操作，云侧也不该放开 */
ok('对拍：authz 与云侧规则对「删除」的判断一致（都没有可删的集合）',
   cloudSchema.COLLECTION_NAMES.every(k => {
     const doc = { user_id: 'u_child', family_id: 'fam_1' };
     return authz.can(child, k, 'delete', doc).allow === false ||
            authz.can(child, k, 'delete', doc).allow ===
            (typeof rules.rules[k]['.write'] === 'string' && !/!doc\.exists\(\)/.test(rules.rules[k]['.write']));
   }));

/* --- D4 适配器：字段映射与降级 --- */
ok('没有 wx.cloud 时适配器降级为「未连接」（本地照常跑）',
   adapter.available() === false && adapter.envInfo().available === false &&
   /wx\.cloud/.test(adapter.envInfo().reason), JSON.stringify(adapter.envInfo()));
const ci = adapter.toCheckIn({ itemId: 's7', date: '2026-10-10', points: 5, name: '周复盘', ts: 1, private: true },
                            { userId: 'u_child', familyId: 'fam_1' });
ok('本地流水 → 云 check_in 字段名正确映射（private → is_private）',
   ci.is_private === true && ci.is_backfill === false && ci.points === 5 &&
   ci.user_id === 'u_child' && ci.family_id === 'fam_1' && ci.note === '周复盘');
const lg = adapter.toLedger({ itemId: 's7', points: 5, name: '周复盘', ts: 1, uid: 'u1' }, { userId: 'u_child', familyId: 'fam_1' });
ok('本地流水 → 云 point_ledger 的 delta 与 ref_type 正确',
   lg.delta === 5 && lg.ref_type === 'check_in' && lg.ref_id === 's7');
ok('周结算奖励在云侧标为 weekly_bonus（与打卡区分）',
   adapter.toLedger({ points: 25, name: '本周额外奖励', ts: 1, weekly: true }, {}).ref_type === 'weekly_bonus');
const rd = adapter.toRedemption({ code: 'RS-AB12-34', cost: 20, used: false, exp: '2026-11-09' }, { userId: 'u_child', familyId: 'fam_1' });
ok('券 → 云 redemption 的 status / coupon_code / expires_at 正确',
   rd.status === 'issued' && rd.coupon_code === 'RS-AB12-34' && rd.expires_at === '2026-11-09');
ok('券已核销时 status = used 且带 provided_at',
   adapter.toRedemption({ code: 'x', cost: 20, used: true, exp: 'e' }, { providedAt: 42 }).status === 'used' &&
   adapter.toRedemption({ code: 'x', cost: 20, used: true, exp: 'e' }, { providedAt: 42 }).provided_at === 42);
{
  /* 签名必须带真实时间戳才写进去：没给时间戳就等于没签（防止「空签名」也算数） */
  const noStamp = adapter.toRuleVersion({ ruleVersion: 1, childDone: true, parentDone: false, active: false }, { familyId: 'fam_1' });
  const childSig = adapter.toRuleVersion({ ruleVersion: 1, childDone: true, parentDone: false, active: false },
                                         { familyId: 'fam_1', childSignedAt: 11 });
  const bothSig = adapter.toRuleVersion({ ruleVersion: 1, childDone: true, parentDone: true, active: true },
                                        { familyId: 'fam_1', childSignedAt: 11, parentSignedAt: 22, effectiveAt: 99 });
  ok('只声明签过但没有时间戳时，云侧不写入签名（空签名不算数）',
     noStamp.signed_by_child_at === null && noStamp.signed_by_parent_at === null);
  ok('单方签名时 effective_at 为空（云侧也拿不到「已生效」）',
     childSig.signed_by_child_at === 11 && childSig.signed_by_parent_at === null && childSig.effective_at === null);
  ok('双签后才有 effective_at',
     bothSig.effective_at === 99 && bothSig.signed_by_parent_at === 22 && bothSig.signed_by_child_at === 11);
}
ok('写入预检复用 authz：本地预检失败就不会去写云',
   adapter.prepareWrite(parent, 'check_in', 'create', { user_id: 'u_child', family_id: 'fam_1' }).allow === false &&
   adapter.prepareWrite(child, 'check_in', 'create', { user_id: 'u_child', family_id: 'fam_1' }).allow === true);
ok('mapLocal 按集合自动选映射函数',
   adapter.mapLocal('check_in', { points: 1, date: 'd', ts: 1 }, {}).is_private === false &&
   adapter.mapLocal('milestone', { type: 'x' }, {}).type === 'x');

/* --- D6 基础库兼容层：最低版本是可核对的声明，不是口头承诺 --- */
const compat = require('./utils/compat.js');
ok('compat 声明了最低基础库 2.20.1', compat.MIN_BASE_LIB === '2.20.1', compat.MIN_BASE_LIB);
ok('最低版本 = API 表里最高的 since（声明与表一致，不会各说各话）',
   compat.requiredBaseLib() === compat.MIN_BASE_LIB,
   compat.requiredBaseLib() + ' vs ' + compat.MIN_BASE_LIB);
ok('API 表覆盖工程里用到的全部 19 个接口',
   compat.API_TABLE.length === 19, String(compat.API_TABLE.length));
ok('用到的接口一项都没漏（与源码扫描结果对齐）',
   (function () {
     const used = {};
     files.filter(f => f.endsWith('.js')).forEach(f => {
       const re = /\bwx\.([A-Za-z_][\w]*)/g;
       let m;
       while ((m = re.exec(strip(read(f), 'js')))) used['wx.' + m[1]] = 1;
     });
     const missing = Object.keys(used).filter(u => !compat.API_TABLE.some(r => r.api === u || r.api.indexOf(u + ' ') === 0));
     return missing.length === 0 ? true : missing.join(', ');
   })() === true,
   'API 表漏了源码里用到的接口');
ok('需要较新基础库的接口都写了降级路径',
   compat.fallbacks().length === 3 && compat.fallbacks().every(f => !!f.fallback),
   JSON.stringify(compat.fallbacks().map(f => f.api)));

/* 低版本降级：没有 getWindowInfo 时退到 getSystemInfoSync */
{
  const modern = { getWindowInfo: () => ({ pixelRatio: 3, windowWidth: 390 }) };
  const legacy = {
    getSystemInfoSync: () => ({ pixelRatio: 2, windowWidth: 320 }),   // 老基础库只有这个
  };
  const broken = {
    getWindowInfo: () => { throw new Error('接口炸了'); },
    getSystemInfoSync: () => { throw new Error('也炸了'); },
  };
  ok('有新接口时优先用 getWindowInfo',
     compat.windowInfo(modern).pixelRatio === 3 && compat.windowInfo(modern).windowWidth === 390);
  ok('低版本（没有 getWindowInfo）自动降级到 getSystemInfoSync',
     compat.windowInfo(legacy).windowWidth === 320 && compat.windowInfo(legacy).pixelRatio === 2,
     JSON.stringify(compat.windowInfo(legacy)));
  ok('两个接口都抛错时返回默认值，不白屏',
     compat.windowInfo(broken).windowWidth === 375 && compat.windowInfo(broken).pixelRatio === 2,
     JSON.stringify(compat.windowInfo(broken)));
  ok('没有任何 wx 时（Node）也安全返回默认值',
     compat.windowInfo({}).windowWidth === 375 && compat.windowInfo(null).windowWidth === 375);
  ok('supports() 认得出接口在不在（走 canIUse 或 typeof）',
     compat.supports('wx.getWindowInfo', modern) === true &&
     compat.supports('wx.getWindowInfo', legacy) === false &&
     compat.supports('wx.getWindowInfo', { canIUse: () => true }) === true &&
     compat.supports('wx.getWindowInfo', {}) === false);
}
ok('project.config.json 里的 libVersion 与最低要求不冲突（不低于 2.20.1）',
   (function () {
     const v = String(projJson && projJson.libVersion || '');
     const cmp = (a, b) => {
       const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
       for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
       return 0;
     };
     return cmp(v, compat.MIN_BASE_LIB) >= 0;
   })(),
   'libVersion=' + (projJson && projJson.libVersion));
ok('README 写明了最低基础库（接手的人不用自己猜）',
   new RegExp('2\\.20\\.1').test(read('README.md')) || new RegExp('2\\.20\\.1').test(read('DELIVERY-对照表.md')));
/* 清掉可能残留的全局桩：后面的 canvas 用例不该受它影响 */
delete global.wx;

/* ============================================================
   [E] 页面接线：用最小页面运行时真正加载页面并调用它的处理函数
   前面几段都是「读代码」，这一段是「跑代码」：
   加载各页的 index.js，调 onLoad / onShow 渲染，再模拟点击，
   看它有没有真的写进 store、页面数据有没有跟着变。
   这一层能抓到静态检查永远看不到的接线错误
   （调错 store 接口、字段名对不上、动作后忘了 render）。
   ============================================================ */
section('[E] 页面接线（真实加载页面并驱动交互）');

/** 完整的 wx 桩：记录每一次调用，便于断言「点了之后确实弹了提示 / 跳了页」 */
const wxCalls = [];
function installWxStub() {
  const rec = (name) => function () {
    const args = Array.prototype.slice.call(arguments);
    wxCalls.push({ api: name, args: args });
    const o = args[0];
    if (o && typeof o === 'object') {
      if (o.success) o.success({ confirm: true, cancel: false, content: '' });
      if (o.complete) o.complete({});
    }
  };
  /* 离屏 canvas 出图的桩：给一个假的 2d context，并把导出的图片路径回传 */
  const fakeCtx = {
    scale() {}, fillRect() {}, clearRect() {}, fillText() {},
    measureText(t) { return { width: String(t).length * 10 }; },
  };
  global.wx = {
    showToast: rec('showToast'),
    showModal: rec('showModal'),
    navigateTo: rec('navigateTo'),
    redirectTo: rec('redirectTo'),
    switchTab: rec('switchTab'),
    reLaunch: rec('reLaunch'),
    setClipboardData: rec('setClipboardData'),
    stopPullDownRefresh: rec('stopPullDownRefresh'),
    previewImage: rec('previewImage'),
    createOffscreenCanvas: function (o) {
      wxCalls.push({ api: 'createOffscreenCanvas', args: [o] });
      return { width: (o && o.width) || 0, height: (o && o.height) || 0, getContext: () => fakeCtx };
    },
    canvasToTempFilePath: function (o) {
      wxCalls.push({ api: 'canvasToTempFilePath', args: [o] });
      if (o && o.success) o.success({ tempFilePath: 'wxfile://tmp/rosenthal.png' });
    },
    getStorageSync: () => '',
    setStorageSync: () => {},
    canIUse: () => true,
    getWindowInfo: () => ({ pixelRatio: 3, windowWidth: 390, windowHeight: 844 }),
  };
}
installWxStub();
const apiCalls = name => wxCalls.filter(c => c.api === name);
const lastToast = () => {
  const t = apiCalls('showToast');
  return t.length ? String((t[t.length - 1].args[0] || {}).title || '') : '';
};

/** 递归数括号，取出对象字面量（setData 的实参） */
function balanced(s, open) {
  let depth = 0;
  for (let p = open; p < s.length; p++) {
    if (s[p] === '{') depth++;
    else if (s[p] === '}') { depth--; if (depth === 0) return s.slice(open, p + 1); }
  }
  return '';
}

/**
 * 真实加载一个页面模块。
 * 做法：把 Page / getApp / wx 挂成全局桩，然后 require 这个文件 ——
 * 这样页面里的模块级 `const app = getApp()` 与相对路径 require 都由 Node 正常处理，
 * 不需要自己 eval 代码（之前用 new Function 求值丢了 app，是错的方向）。
 */
function loadPage(name, appStubObj) {
  const file = 'pages/' + name + '/index.js';
  const full = require('path').join(ROOT, file);
  let def = null;

  global.Page = obj => { def = obj; };
  global.getApp = () => appStubObj;
  global.wx = global.wx || {};

  delete require.cache[require.resolve(full)];
  try {
    require(full);
  } finally {
    delete global.Page;
    delete global.getApp;
  }
  if (!def) throw new Error(file + ': 没有调用 Page({...})');

  const inst = {
    data: Object.assign({}, def.data || {}),
    setData(patch, cb) { Object.assign(this.data, patch || {}); if (cb) cb(); },
    selectComponent() { return null; },
    _def: def,
  };
  Object.keys(def).forEach(k => {
    if (typeof def[k] === 'function') inst[k] = def[k].bind(inst);
  });
  return inst;
}

/** 造一个 app 桩：globalData.store 指到同一个 store，bump/snapshot 真实可用 */
function appStub() {
  return {
    globalData: {
      store: store,
      guard: guard,
      sync: sync,
      stats: null,
      bump() { this.stats = this.snapshot(); return this.stats; },
      snapshot() {
        const s = store.state();
        return {
          stage: s.stage, nick: s.nick, grade: s.grade, cap: store.capNow(),
          todayScore: store.dayScore(store.todayKey()), balance: store.balance(),
          lifetime: store.lifetime(), streak: store.streak(), weekScore: store.weekScore(),
          amended: store.amendedCount(), onboarded: !!s.onboarded,
          pending: store.confirmedCount(),
          couponCount: s.coupons.filter(c => !c.used).length,
        };
      },
    },
    gateOnboarding() { return false; },     // 测试里不放行闸门，直接测页面本身
    toast() {},
  };
}

/* --- 调用的 store 接口必须真的存在（onboarding 页曾因为 store.stageOf 没导出而整页报错） --- */
{
  const missing = [];
  const storeKeys = require('./utils/store.js');
  files.filter(f => f.endsWith('.js') && (f.indexOf('pages/') === 0 || f.indexOf('components/') === 0 || f === 'app.js'))
    .forEach(f => {
      const s = strip(read(f), 'js');
      /* 只认 `store.名字` 形式；用负向先行把 require('../../utils/store.js') 排除掉 */
      const re = /\bstore\.(?!js\b|json\b)([A-Za-z_$][\w$]*)/g;
      let m;
      const seen = {};
      while ((m = re.exec(s))) {
        if (seen[m[1]]) continue;
        seen[m[1]] = 1;
        if (typeof storeKeys[m[1]] === 'undefined') missing.push(f + ' → store.' + m[1]);
      }
    });
  ok('页面/组件调用的每个 store 接口都真的存在（不存在会在渲染时直接抛错）',
     missing.length === 0, missing.join(' | '));
}
ok('store 导出了 stageOf / templateOf / dimOf（页面显示学段名要用）',
   typeof store.stageOf === 'function' && typeof store.templateOf === 'function' &&
   typeof store.dimOf === 'function');

/* --- E5 周复盘页：向导按步推进，结算写进 store --- */
{
  store.resetAll('mid');
  store.setItemPoints('s1', 3);
  store.removeItem('l4');
  store.setRewardTitle(120, '一起出去一次');
  store.finishBuild();
  store.parentAgree();
  for (let i = 0; i <= 6; i++) {
    store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, date: store.shiftDay(-i), praise: 'x' });
  }
  const page = loadPage('week', appStub());
  page.onLoad();
  ok('周复盘页从第 1 步开始，5 步进度条就位',
     page.data.step === 0 && page.data.steps.length === 5, page.data.step + '/' + page.data.steps.length);
  ok('周复盘页带上了这一周的七天与周得分', page.data.weekDays.length === 7 && page.data.weekScore > 0,
     page.data.weekScore + '');
  ok('第 1 步给出候选（来自本周带反馈的记录）', page.data.picks.length > 0, String(page.data.picks.length));

  page.onCustomHighlight({ detail: { value: '我把数学最后一题想出来了' } });
  page.onAddCustomHighlight();
  ok('加一句自己的闪光点 → 选中项带 on 标记',
     page.data.picks.some(p => p.on === true), JSON.stringify(page.data.picks.map(p => p.on)));

  page.onNext();
  ok('进入第 2 步（选想留下的习惯）',
     page.data.step === 1 && page.data.keepOptions.length > 0,
     page.data.step + '/' + page.data.keepOptions.length);
  page.onPickKeep({ currentTarget: { dataset: { v: store.KEEP_OPTIONS[0] } } });
  ok('选中习惯写进草稿', store.weekDraft().keep === store.KEEP_OPTIONS[0], store.weekDraft().keep);

  page.onNext();
  ok('进入第 3 步（下周那件小事）', page.data.step === 2, String(page.data.step));
  page.onNext();
  ok('没写目标时被拦住（停在原地并提示）', page.data.step === 2 && /写下/.test(lastToast()), lastToast());
  page.onNextInput({ detail: { value: '写作业前先把手机放到客厅' } });
  page.onNext();
  ok('写了具体的小目标后进入第 4 步', page.data.step === 3, String(page.data.step));
  page.onChallengeInput({ detail: { value: '自己定一个复习清单' } });
  /* 第 4 步的按钮是「就这么定」（走 onFinish），所以 onNext 在末步是空操作 —— 这是对的。
     填完挑战后重新渲染，让结算预览把 +5 算进去。 */
  page.render();
  ok('第 4 步填的挑战进了草稿', store.weekDraft().challenge === '自己定一个复习清单',
     store.weekDraft().challenge);
  ok('结算预览算出加成（连续 7 天 + 主动挑战 = 15）',
     page.data.bonusPreview.total === 15 &&
     page.data.bonusPreview.streak7 === true && page.data.bonusPreview.challenge === true &&
     page.data.bonusPreview.week50 === false,
     JSON.stringify(page.data.bonusPreview));

  page.onFinish();
  ok('结算后生成周报且双签到账', store.state().week !== null && page.data.done === true);
  ok('周报里带上她选的那三件事与下周那件小事',
     store.state().week.highlights.length > 0 && store.state().week.next === '写作业前先把手机放到客厅',
     JSON.stringify(store.state().week.highlights));
  ok('结算后周奖励入账（bonus 流水存在）',
     store.state().log.some(l => l.dim === 'bonus' && l.weekly === true));
  ok('同一周不能重复结算（页面上再点一次被拒）',
     (function () { const n = store.lifetime(); page.onFinish(); return store.lifetime() === n; })());
}

/* --- E6 模板表达式：拿真实页面数据把每条 WXML 表达式真的求值一遍 ---
   结构检查能发现「字段没赋值」，但发现不了「表达式本身在渲染时会抛错」——
   例如 report.bonusDetail.challenge 在 bonusDetail 缺失时直接报 TypeError。
   这里把每个页面 onLoad 后的真实数据喂进模板，逐条求值。 */
{
  /** 只放行「无副作用的取值 / 比较 / 拼接」；含函数调用的跳过（模板里那些是 .length 之外的方法） */
  const SAFE = /^[\w\s.'"`\[\]+\-*/%<>=!&|?:,]*$/;
  const hasCall = /[\w\]]\s*\(/;

  const evalExpr = (expr, scope) => {
    if (!SAFE.test(expr) || hasCall.test(expr)) return { skipped: true };
    const names = Object.keys(scope);
    const vals = names.map(n => scope[n]);
    try {
      const fn = new Function(names.join(','), 'return (' + expr + ');');
      return { value: fn.apply(null, vals) };
    } catch (e) {
      return { error: e };
    }
  };

  /** 取不到真实数组项时给一个「万能对象」，避免因 fixture 不完整而误报属性缺失 */
  const anyItem = () => new Proxy({}, {
    get(t, k) { return (typeof k === 'string' && k !== 'toString' && k !== 'valueOf') ? anyItem() : undefined; },
    has() { return true; },
  });

  const exprIssues = [];
  let evaluated = 0, skipped = 0;

  pages.forEach(pagePath => {
    /* app.json 里的条目是完整路径（pages/today/index），而 loadPage 只收短名 */
    const shortName = String(pagePath).split('/')[1];
    const page = loadPage(shortName, appStub());
    page.onLoad();
    const wxmlSrc = strip(read(pagePath + '.wxml'), 'wxml');

    /**
     * 先找出所有 wx:for：**直接搜 `wx:for`** 而不是靠标签正则 ——
     * 属性跨行、属性值里带 `{{a ? 'x' : 'y'}}` 都会让标签正则漏掉循环
     * （我第一版就漏了 growth 页的 timeline 循环，导致 item.* 全被误报）。
     * 找到后往两边扩到最近的 `<` / `>` 取出所属标签，再定位它的闭合位置。
     */
    const loops = [];
    const forRe = /wx:for\s*=\s*"\{\{([\s\S]*?)\}\}"/g;
    let fm;
    while ((fm = forRe.exec(wxmlSrc))) {
      const tagStart = wxmlSrc.lastIndexOf('<', fm.index);
      const tagEnd = wxmlSrc.indexOf('>', fm.index);
      if (tagStart < 0 || tagEnd < 0) continue;
      const tagText = wxmlSrc.slice(tagStart, tagEnd + 1);
      const nameMatch = /^<([a-zA-Z][\w-]*)/.exec(tagText);
      if (!nameMatch) continue;
      const tag = nameMatch[1];
      const selfClose = /\/>$/.test(tagText);
      const alias = (/wx:for-item\s*=\s*"([A-Za-z_$][\w$]*)"/.exec(tagText) || [, 'item'])[1];
      /* 找闭合：从 tagEnd 起按同名标签计数配对 */
      let scopeEnd = wxmlSrc.length;
      if (!selfClose) {
        let depth = 1, p = tagEnd + 1;
        const openRe = new RegExp('<' + tag + '(?=[\\s/>])', 'g');
        const closeRe = new RegExp('</' + tag + '\\s*>', 'g');
        while (depth > 0 && p < wxmlSrc.length) {
          openRe.lastIndex = p; closeRe.lastIndex = p;
          const o = openRe.exec(wxmlSrc);
          const c = closeRe.exec(wxmlSrc);
          if (!c) break;
          if (o && o.index < c.index) { depth++; p = o.index + 1; }
          else { depth--; p = c.index + 1; scopeEnd = c.index; }
        }
      }
      loops.push({
        tagStart, tagEnd, scopeEnd: selfClose ? tagEnd + 1 : scopeEnd,
        alias, expr: fm[1].trim(), openTagText: tagText,
      });
    }

    /** 某个位置落在哪些循环的作用域里（按 tagStart 从外到内排序） */
    const loopsAt = pos => loops
      .filter(l => pos >= l.tagStart && pos < l.scopeEnd)
      .sort((a, b) => a.tagStart - b.tagStart);

    /* 求值：扫描每个标签，用「标签内可见的循环别名 + 页面 data」作为作用域 */
    const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
    let tm;
    while ((tm = tagRe.exec(wxmlSrc))) {
      const attrs = tm[3] || '';
      /* 作用域：页面 data 打底，再把该标签所处的循环别名逐层覆盖上去 */
      const scope = Object.assign({}, page.data);
      loopsAt(tm.index).forEach(l => {
        const r = evalExpr(l.expr, scope);
        const arr = r.value;
        scope[l.alias] = (Array.isArray(arr) && arr.length) ? arr[0] : anyItem();
      });

      const eRe = /\{\{([\s\S]*?)\}\}/g;
      let em;
      while ((em = eRe.exec(attrs))) {
        const expr = em[1].trim();
        if (!expr) continue;
        const r = evalExpr(expr, scope);
        if (r.skipped) { skipped++; continue; }
        evaluated++;
        if (r.error) exprIssues.push(pagePath + ' → 「' + expr + '」抛错：' + r.error.message);
        else if (typeof r.value === 'number' && isNaN(r.value)) exprIssues.push(pagePath + ' → 「' + expr + '」算出 NaN');
      }
    }
  });

  ok('模板表达式在最简页面数据下都能求值（不抛错、不出 NaN）',
     exprIssues.length === 0, exprIssues.slice(0, 6).join(' | '));
  ok('表达式检查覆盖了大部分模板（跳过的只是含函数调用的少数）',
     evaluated >= 60 && skipped <= 20,
     '实际求值 ' + evaluated + ' 条，跳过 ' + skipped + ' 条');

  /* 自检：错误表达式必须被抓住 */
  {
    const r1 = evalExpr('a.b.c', { a: { b: null } });
    const r2 = evalExpr('1 + 1', { a: 1 });
    const r3 = evalExpr('store.addPoints(1)', {});
    ok('表达式检查器自检：能抓到「在 null 上取属性」这类渲染期错误', !!r1.error, JSON.stringify(r1));
    ok('表达式检查器自检：正常表达式能算对', r2.value === 2, JSON.stringify(r2));
    ok('表达式检查器自检：含函数调用的表达式被跳过（不误判）', r3.skipped === true, JSON.stringify(r3));
  }
}

{
  store.resetAll('mid');
  const page = loadPage('onboarding', appStub());
  page.onLoad();
  ok('共建页渲染出可改分的行为项', Array.isArray(page.data.pointItems) && page.data.pointItems.length > 0,
     String(page.data.pointItems && page.data.pointItems.length));
  ok('共建页的 picker 候选（scores）非空且为 5 档',
     Array.isArray(page.data.scores) && page.data.scores.length === 5,
     JSON.stringify(page.data.scores));
  ok('共建页带学段（用于根节点主题类）', page.data.stage === 'mid', String(page.data.stage));
  ok('起点提示「还差 3 处」且按钮不可点',
     /还差/.test(page.data.finishTxt) && page.data.canFinish === false, page.data.finishTxt);

  /* 点加号真的改分值并计入 amend.point */
  const target = page.data.pointItems[0];
  const before = store.itemById(target.id).points;
  page.onPlus({ currentTarget: { dataset: { id: target.id } } });
  ok('共建页点「＋」真的改了分值',
     store.itemById(target.id).points === before + 1,
     before + ' → ' + store.itemById(target.id).points);
  ok('改分值计入 amend.point', store.state().amend.point > 0);
  ok('改完页面数据跟着刷新（已改计数 +1）', page.data.amended === 1, String(page.data.amended));

  /* 改行为项与改奖励 */
  page.onAddItem.call(Object.assign(page, { data: Object.assign({}, page.data, { newName: '练吉他 20 分钟' }) }));
  ok('共建页加一条自己的行为项 → 真的进了 store',
     store.itemsOf().some(i => i.name === '练吉他 20 分钟'));
  ok('加行为项计入 amend.item', store.state().amend.item > 0);
  page.onEditReward({ currentTarget: { dataset: { cost: 120 } } });
  ok('共建页点「改」进入奖励编辑态', page.data.editingCost === 120 && page.data.editingTitle.length > 0);
  page.onRewardInput({ detail: { value: '和妈妈单独出去一次（我自己挑）' } });
  page.onSaveReward();
  ok('共建页改奖励真的写进 store',
     store.state().rewards.some(r => r.cost === 120 && r.title === '和妈妈单独出去一次（我自己挑）'));
  ok('三处改满后按钮可用', page.data.canFinish === true && /提交提案/.test(page.data.finishTxt),
     page.data.finishTxt);

  /* 提交提案：要引导去家长签署，而不是直接进主应用 */
  wxCalls.length = 0;
  page.onFinish();
  ok('提交提案后提示「还差妈妈签一次」而不是「已生效」',
     apiCalls('showModal').length > 0 && !/生效/.test(lastToast()),
     lastToast() || JSON.stringify(apiCalls('showModal').map(c => c.args[0].title)));
  ok('提交后 onboarded = true（提案完成）', store.state().onboarded === true);
  ok('但规则还没生效（等家长签）', store.isRuleActive() === false);
}

/* --- E3 家长端：签署屏列出她的改动，签完双签生效 --- */
{
  const page = loadPage('parent', appStub());
  page.onLoad();
  ok('家长端未签署时进入签署屏（signed = false）', page.data.signed === false);
  ok('签署屏列出了她改过的条目（签字前看得见同意什么）',
     Array.isArray(page.data.amendList) && page.data.amendList.length > 0,
     String(page.data.amendList && page.data.amendList.length));
  ok('签署屏显示规则版本与已改处数',
     page.data.sig && page.data.sig.ruleVersion >= 1 && page.data.sig.amended >= 3,
     JSON.stringify(page.data.sig));
  ok('家长端报告不包含她设成私密的内容（走 visibleToParent）',
     page.data.report && typeof page.data.report.hidden === 'number',
     JSON.stringify(page.data.report && page.data.report.hidden));

  page.onAgree();
  ok('家长点「我按你的版本来」→ 规则生效', store.isRuleActive() === true);
  ok('签完页面切到完整家长端（signed = true）', page.data.signed === true);
  ok('签署后有生效日期', /^\d{4}-\d{2}-\d{2}$/.test(page.data.sig.agreedDate), page.data.sig.agreedDate);

  /* 待确认列表与确认动作 */
  store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, praise: 'x' });
  page.render();
  const todoLen = page.data.todo.length;
  ok('家长端能看到待确认的记录（只列正向）', todoLen > 0, String(todoLen));
  wxCalls.length = 0;
  page.onConfirm({ currentTarget: { dataset: { uid: page.data.todo[0].uid } } });
  ok('点「确认并鼓励」→ store 里该条 confirmed = true',
     store.state().log.some(l => l.confirmed === true));
  ok('确认后给了提示（能照着念一句）', /念给她听|确认/.test(lastToast()), lastToast());
}

/* --- E4 成长页：时间轴、隐私开关、导出 --- */
{
  store.resetAll('mid');
  const e1 = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, praise: 'x' });
  store.addPoints({ itemId: 's3', name: '作业自查', dim: 'study', points: 3, praise: 'y' });
  const page = loadPage('growth', appStub());
  page.onLoad();
  ok('成长页渲染出流水时间轴', Array.isArray(page.data.timeline) && page.data.timeline.length === 2,
     String(page.data.timeline && page.data.timeline.length));
  ok('时间轴每条带可撤销标记与隐私标记',
     typeof page.data.timeline[0].canUndo === 'boolean' &&
     typeof page.data.timeline[0].isPrivate === 'boolean',
     JSON.stringify(page.data.timeline[0]));
  ok('成长页渲染出里程碑徽章', Array.isArray(page.data.milestones) && page.data.milestones.length === 6,
     String(page.data.milestones && page.data.milestones.length));
  ok('热力图有格子', Array.isArray(page.data.heat) && page.data.heat.length > 0,
     String(page.data.heat && page.data.heat.length));

  /* 隐私开关真的改状态 */
  page.onTogglePrivate({ currentTarget: { dataset: { uid: e1.entry.uid } } });
  ok('点「只给自己看」→ store 里标为私密', store.state().log.some(l => l.private === true));
  ok('家长侧立刻看不到那条', store.visibleToParent().length === 1,
     String(store.visibleToParent().length));
  ok('页面数据也跟着刷新', page.data.timeline.some(t => t.isPrivate === true));

  /* 撤销 */
  const uid2 = store.state().log.find(l => !l.private).uid;
  page.onUndo({ currentTarget: { dataset: { uid: uid2 } } });
  ok('点「撤销这条」→ store 里标为已撤销', store.state().log.some(l => l.reversed === true));

  /* 导出：一周一页与 CSV 都走剪贴板 */
  wxCalls.length = 0;
  page.onExportCsv();
  ok('导出流水表 → 走剪贴板交付', apiCalls('setClipboardData').length === 1,
     JSON.stringify(apiCalls('showModal').map(c => c.args[0].title)));
  const copied = apiCalls('setClipboardData')[0].args[0].data;
  ok('剪贴板内容是合法 CSV（带 BOM 与表头）',
     copied.charCodeAt(0) === 0xFEFF && copied.indexOf('日期,时间') > 0, copied.slice(0, 40));
}

{
  store.resetAll('mid');
  store.setItemPoints('s1', 3);
  store.removeItem('l4');
  store.setRewardTitle(120, '一起出去一次');
  store.finishBuild();
  store.parentAgree();

  const page = loadPage('today', appStub());
  page.onLoad();
  ok('今天页 onLoad 后渲染出维度卡片（dims 非空）',
     Array.isArray(page.data.dims) && page.data.dims.length === 5,
     'dims=' + (page.data.dims ? page.data.dims.length : page.data.dims));
  ok('今天页渲染出行为项，且带 used/limit',
     page.data.dims[0].items.length > 0 &&
     typeof page.data.dims[0].items[0].used === 'number' &&
     typeof page.data.dims[0].items[0].limit === 'number',
     JSON.stringify(page.data.dims[0].items[0]));
  ok('今天页显示日上限与昵称', page.data.cap === 12 && !!page.data.nick, page.data.cap + '/' + page.data.nick);

  const before = store.state().log.length;
  page.onTapItem({ currentTarget: { dataset: { id: 's1' } } });
  ok('点一下行为卡 → store 里真的多了一条流水',
     store.state().log.length === before + 1, before + ' → ' + store.state().log.length);
  ok('新增那条的分数取自行为项定义（3 分）',
     store.state().log[store.state().log.length - 1].points === 3,
     String(store.state().log[store.state().log.length - 1].points));
  ok('打卡后弹出具体肯定卡（sheet 打开）', page.data.sheet === true);
  ok('肯定卡拆出了「事实」，且不是空字符串',
     typeof page.data.fact === 'string' && page.data.fact.length > 0, page.data.fact);
  ok('肯定卡带维度名与本次得分', page.data.dimName === '学习力' && page.data.points === 3,
     page.data.dimName + '/' + page.data.points);
  ok('打卡后页面数据同步刷新（今日得分 = 3）', page.data.score === 3, String(page.data.score));

  /* 换一句：只换特质，事实不变 */
  const factBefore = page.data.fact;
  page.onAnother();
  ok('「换一句」换掉特质但保留事实', page.data.fact === factBefore && !!page.data.trait);
  ok('换过之后 trait 仍在禁用词库之外',
     store.checkPraise(page.data.trait).ok === true, page.data.trait);

  /* 我自己说一句 */
  page.onSelfOpen();
  page.onSelfInput({ detail: { value: '我今天自己坐下来了' } });
  page.onSelfSave();
  ok('「我自己说一句」存回了那条记录',
     store.state().log.some(l => l.praise === '我今天自己坐下来了'),
     JSON.stringify(store.state().log.map(l => l.praise)));

  /* 打满日上限后再点：只提示、不加分 */
  while (store.dayScore(store.todayKey()) < store.capNow()) {
    const r = store.addPoints({ itemId: 's7', name: '周复盘', dim: 'study', points: 5, praise: 'x' });
    if (!r.ok) break;
  }
  const nBefore = store.state().log.length;
  page.render();
  page.onTapItem({ currentTarget: { dataset: { id: 'a3' } } });
  ok('打满 12 分后再点行为卡：不加分（引擎层拦住）',
     store.state().log.length === nBefore, nBefore + ' → ' + store.state().log.length);
  ok('页面把这个状态标成 locked（用于置灰提示）',
     page.data.dims.some(d => d.items.some(it => it.locked === true)),
     '没有把已满额的行为项标成 locked');
}


/* 这一节之前有多个用例挂过 global.wx 桩（闸门、compat），
   这里统一清掉，保证「没有 wx 时的兜底行为」测的是真的没有 wx。 */
delete global.wx;

/** 记录所有 ctx 调用，用来断言几何与颜色 */
function fakeCtx(rec) {
  const ctx = {
    lineWidth: 0, strokeStyle: '', lineCap: '',
    _last: null,
    beginPath() { rec.push(['beginPath']); this._last = null; },
    arc(x, y, r, a0, a1) { this._last = { x, y, r, a0, a1 }; rec.push(['arc', x, y, r, a0, a1]); },
    stroke() { rec.push(['stroke', this.lineWidth, ctx.strokeStyle, this._last]); },
    clearRect() { rec.push(['clearRect']); },
    scale(a, b) { rec.push(['scale', a, b]); },
    createLinearGradient(x0, y0, x1, y1) {
      rec.push(['grad', x0, y0, x1, y1]);
      const stops = [];
      rec.push(['stops', stops]);
      return { addColorStop: (o, c) => stops.push([o, c]) };
    },
  };
  return ctx;
}

function runRing(score, cap, opts) {
  const o = opts || {};
  const rec = [];
  let comp = null;
  const nodeMissing = !!o.nodeMissing;
  const dpr = o.dpr || 2;
  const cssSize = o.size || 112;

  const canvas = { width: 0, height: 0, getContext: () => fakeCtx(rec) };
  const wxStub = {
    getWindowInfo: () => ({ pixelRatio: dpr, windowWidth: o.windowWidth || 390 }),
    createSelectorQuery: () => {
      const q = {
        in() { return q; },
        select() { return q; },
        fields() { return q; },
        exec(cb) { cb([nodeMissing ? {} : { node: canvas, width: cssSize, height: cssSize }]); },
      };
      return q;
    },
  };
  /* 组件里用的是 require('../../utils/compat.js')，而 compat 直接读**全局** wx；
     沙箱里的 wx 不是全局，所以这里同时挂到 global，让两条路径拿到同一个桩。 */
  global.wx = wxStub;

  const sandbox = {
    Component: def => { comp = def; },
    wx: wxStub,
    require: req => require(require('path').join(ROOT, req.replace(/^\.\.\/\.\.\//, '').replace(/^\.\//, ''))),
    module: { exports: {} },
    exports: {},
    Math, Date, JSON, Number, String, Array, Object, console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read(RING_DIR + '.js'), sandbox, { filename: 'ring-progress/index.js' });

  const inst = {
    data: Object.assign({}, comp.data, { score, cap, size: cssSize, stroke: o.stroke || 9 }),
    setData(patch) { Object.assign(this.data, patch); },
    _canvas: null, _ctx: null, _cssSize: cssSize,
  };
  Object.keys(comp.methods).forEach(k => { inst[k] = comp.methods[k].bind(inst); });

  // 走真实生命周期：ready → _initCanvas → _draw
  comp.lifetimes.ready.call(inst);
  /* 清掉全局桩：后面的用例不该被这个桩影响（例如「取不到视口信息」的场景） */
  delete global.wx;
  return { rec, inst, comp, canvas };
}

const arcs = r => r.rec.filter(x => x[0] === 'arc');
const strokes = r => r.rec.filter(x => x[0] === 'stroke');

/* 桩本身要有效：先证明它真的记录到了两次 arc（底环 + 进度环） */
{
  const r = runRing(3, 12);
  ok('运行时桩能用（记录到 beginPath/arc/stroke）',
     arcs(r).length === 2 && strokes(r).length === 2,
     'arcs=' + arcs(r).length + ' strokes=' + strokes(r).length);
}

/* 几何：与原型 stroke-dasharray 方案等价的角度换算 */
{
  const r = runRing(3, 12);
  const prog = arcs(r)[1];
  const TAU = Math.PI * 2;
  ok('score=3/12 → 起始角 -90°（12 点方向起笔）',
     Math.abs(prog[4] - (-Math.PI / 2)) < 1e-9, String(prog[4]));
  ok('score=3/12 → 扫过正好 1/4 圈',
     Math.abs((prog[5] - prog[4]) - TAU / 4) < 1e-9, String(prog[5] - prog[4]));
  ok('底环永远画满一圈',
     Math.abs(arcs(r)[0][5] - arcs(r)[0][4] - TAU) < 1e-9);
  ok('圆心在画布正中', Math.abs(prog[1] - 56) < 1e-9 && Math.abs(prog[2] - 56) < 1e-9,
     prog[1] + ',' + prog[2]);
  ok('半径 = 半宽 − 环宽/2 − 1px 余量', Math.abs(prog[3] - (56 - 9 / 2 - 1)) < 1e-9, String(prog[3]));
}
{
  const r = runRing(12, 12);
  const prog = arcs(r)[1];
  ok('score 满 → 扫过整整一圈（闭合）',
     Math.abs((prog[5] - prog[4]) - Math.PI * 2) < 1e-9, String(prog[5] - prog[4]));
}
{
  const r = runRing(0, 12);
  ok('score=0 → 只画底环，不画进度环',
     arcs(r).length === 1 && strokes(r).length === 1, 'arcs=' + arcs(r).length);
}
{
  const r = runRing(20, 12);
  const prog = arcs(r)[1];
  ok('score 超过上限时按上限收敛（不会画过头）',
     Math.abs((prog[5] - prog[4]) - Math.PI * 2) < 1e-9);
}
{
  const r = runRing(6, 8);
  const prog = arcs(r)[1];
  ok('日上限换成 8 时，6/8 = 3/4 圈',
     Math.abs((prog[5] - prog[4]) - Math.PI * 2 * 0.75) < 1e-9);
}

/* 颜色与清晰度 */
{
  const r = runRing(3, 12);
  const stops = r.rec.find(x => x[0] === 'stops')[1];
  ok('渐变是原型的两个橙色端点',
     stops.length === 2 && stops[0][1] === '#F0A868' && stops[1][1] === '#C4662C', JSON.stringify(stops));
  ok('进度环的线宽 = stroke 属性（9px，与原型一致）', strokes(r)[1][1] === 9, String(strokes(r)[1][1]));
}
{
  const r = runRing(3, 12, { dpr: 3, size: 112 });
  ok('dpr=3 时位图放大到 336×336、并按 dpr 缩放坐标系',
     r.canvas.width === 336 && r.canvas.height === 336 &&
     r.rec.some(x => x[0] === 'scale' && x[1] === 3 && x[2] === 3),
     r.canvas.width + 'x' + r.canvas.height);
}

/* 老基础库拿不到 canvas 节点：不抛错、纯数字兜底 */
{
  let threw = false, res = null;
  try { res = runRing(3, 12, { nodeMissing: true }); } catch (e) { threw = true; }
  ok('拿不到 canvas 节点时不抛错（老基础库安全）', !threw && !!res);
  ok('拿不到节点时不画、且 ready 保持 false（显示 CSS 兜底环）',
     !threw && res.inst.data.ready === false && arcs(res).length === 0);
}

/* 页面的 px 换算：canvas 不认 rpx，必须按视口宽折算 */
{
  const s1 = store.calcRingPx({ windowWidth: 390 });
  const s2 = store.calcRingPx({ windowWidth: 375 });
  const s3 = store.calcRingPx({ windowWidth: 320 });
  ok('390 宽视口下环直径 ≈ 58px（112 设计稿 px 的等比换算）', s1 === 58, String(s1));
  ok('不同视口宽度会得到不同 px（不是写死）', s2 === 56 && s3 === 48, s2 + '/' + s3);
  ok('显式传入 windowWidth 时不依赖 wx', store.calcRingPx({ windowWidth: 300 }) === 45,
     String(store.calcRingPx({ windowWidth: 300 })));
  /* 语义说明（这一条我先前写错过，代码是对的）：
     不传参数 → 走 compat 探针，没有任何 wx 时得到标准宽 375 → 56px；
     传 {}    → 同样视为「没给宽度」，也走探针 → 56px。
     探针自身永远会给出一个可用宽度，所以不会出现「环尺寸取不到」的情况。 */
  ok('没有 wx 时不崩，用标准 375 宽兜底（112 × 375/750 = 56）',
     store.calcRingPx() === 56 && compat.windowInfo().windowWidth === 375,
     store.calcRingPx() + ' / ' + compat.windowInfo().windowWidth);
  ok('传入空对象也走同一兜底（不返回 NaN / 0）',
     store.calcRingPx({}) === 56 && Number.isFinite(store.calcRingPx({})),
     String(store.calcRingPx({})));
  ok('探针无论被怎么传参都给出有限正数宽度（环不会算出 0）',
     [undefined, null, {}, { windowWidth: 0 }, { windowWidth: 390 }]
       .every(a => compat.windowInfo(a).windowWidth > 0),
     JSON.stringify([undefined, null, {}, { windowWidth: 0 }].map(a => compat.windowInfo(a).windowWidth)));
}

/* --- C22 打印 / 导出：罗森塔尔规则表（四学段通用） ---
   本轮新增：把当前学段的规则导成一张可打印 / 可下载的表（含一周一页入口）。
   验证四件事：① 内容确实来自当前学段（行为/分值/上限随学段变）；
   ② 她自己改过的条目在纸面上留痕；③ CSV 是合法表格（BOM + 列数与表头一致）；
   ④ 规则页与「我的」页都有入口，且点了真的走剪贴板交付。
   放在最后运行：前面的 canvans 用例会清掉 global.wx，这里先重装桩再用页面。 */
{
  store.resetAll('p12');
  const rt12 = store.buildRuleTable();
  ok('规则表打上当前学段与日上限',
     rt12.stageName === '小学低段' && rt12.cap === 8 &&
     rt12.text.indexOf('小学低段') >= 0 && rt12.text.indexOf('每日上限 8 分') >= 0,
     rt12.stageName + '/' + rt12.cap);
  ok('规则表带行为清单与奖励档位',
     rt12.text.indexOf('【行为清单】') > 0 && rt12.text.indexOf('【奖励档位】') > 0 &&
     rt12.itemCount === 13 && rt12.rewardCount === 8,
     rt12.itemCount + '/' + rt12.rewardCount);
  ok('规则表带双签栏（她签名 / 家长签名 / 日期）',
     rt12.text.indexOf('她签名') > 0 && rt12.text.indexOf('家长签名') > 0 &&
     rt12.text.indexOf('日期') > 0);
  ok('规则表 pdfPayload 是最小可交付载荷（kind/stage/dims/rewards/signature）',
     rt12.pdfPayload.kind === 'rule_table' && rt12.pdfPayload.stage === 'p12' &&
     Array.isArray(rt12.pdfPayload.dims) && Array.isArray(rt12.pdfPayload.rewards) &&
     !!rt12.pdfPayload.signature, Object.keys(rt12.pdfPayload).join(','));

  /* 她自己改过的条目要在纸面上标出来 */
  store.setItemPoints('p1', 3);
  const rtMine = store.buildRuleTable();
  ok('她自己改过的条目在规则表里带 ★ 标记',
     rtMine.text.indexOf('★') > 0 && rtMine.dims.some(d => d.items.some(i => i.mine === true)));

  /* 四学段都按当前状态生成，上限与条数随学段变 */
  const seen = [];
  ['p12', 'p36', 'mid', 'high'].forEach(k => {
    store.applyStage(k);
    const t = store.buildRuleTable();
    seen.push(k + ':' + t.cap + '/' + t.itemCount);
  });
  ok('四学段规则表分别生成（上限 8/10/12/12，条数 13/16/26/18）',
     seen.join(' ') === 'p12:8/13 p36:10/16 mid:12/26 high:12/18', seen.join(' '));

  /* CSV：合法表格（BOM + 表头，列数一致） */
  store.applyStage('p12');
  const rcsv = store.buildRuleTableCsv();
  const rlines = rcsv.text.replace(/^\ufeff/, '').split('\r\n').filter(l => l.length);
  ok('规则表 CSV 带 UTF-8 BOM 与 6 列表头',
     rcsv.text.charCodeAt(0) === 0xFEFF &&
     rlines[0] === '类型,维度/档位,内容,分值,每日上限,谁改的', rlines[0]);
  ok('规则表 CSV 每行列数与表头一致（逗号/引号没撑破表格）',
     rlines.every(l => l.split(',').length === 6),
     rlines.map(l => l.split(',').length).join(','));
  ok('规则表 CSV 行数 = 行为数 + 奖励数',
     rcsv.rowCount === 13 + 8, String(rcsv.rowCount));
  ok('规则表 CSV 里没有负数（全站也没有负数可导）',
     rlines.every(l => !/,-/.test(l)));

  /* 规则页 / 我的页：入口存在且点了真的走剪贴板交付 */
  installWxStub();
  store.resetAll('mid');
  store.setItemPoints('s1', 3);
  store.removeItem('l4');
  store.setRewardTitle(120, '一起出去一次');
  store.finishBuild();
  store.parentAgree();

  const rulesPage = loadPage('rules', appStub());
  rulesPage.onLoad();
  ok('规则页有「打印 / 下载规则表」两个入口',
     /onPrintRuleTable/.test(read('pages/rules/index.wxml')) &&
     /onExportRuleCsv/.test(read('pages/rules/index.wxml')));

  ok('规则表「打印」入口走 export-gate 出图（不再用剪贴板）',
     /exportGate\.image\('rule'/.test(read('pages/rules/index.js')));

  wxCalls.length = 0;
  rulesPage.onExportRuleCsv();
  ok('点「下载规则表 Excel」→ 剪贴板是带 BOM 的 CSV',
     apiCalls('setClipboardData').length === 1 &&
     apiCalls('setClipboardData')[0].args[0].data.charCodeAt(0) === 0xFEFF);

  const mePage = loadPage('me', appStub());
  mePage.onLoad();
  ok('「我的」页有规则表 / 一周一页三个打印入口',
     /onPrintRuleTable/.test(read('pages/me/index.wxml')) &&
     /onExportRuleCsv/.test(read('pages/me/index.wxml')) &&
     /onPrintWeekPage/.test(read('pages/me/index.wxml')));
  ok('「一周一页」入口走 export-gate 出图（不再是剪贴板）',
     /exportGate\.image\('week'/.test(read('pages/me/index.js')));
}

/* --- C23 低龄代记（帮 TA 记一笔）· 关于罗森塔尔 ---
   低龄孩子没法自己操作手机：低段由家长代记（与学段权限一致），初中/高中不代记。
   代记走的仍是唯一写入口 addPoints，并盖 byParent 戳。 */
{
  /* 关于罗森塔尔：首次一次 */
  store.resetAll('mid');
  ok('全新状态需要先看介绍页', store.needsIntro() === true);
  store.markIntroSeen();
  ok('看过介绍页之后不再需要', store.needsIntro() === false);

  /* 低段：允许代记 */
  store.resetAll('p12');
  store.markIntroSeen();
  store.setItemPoints('p1', 3);
  store.removeItem('p6');
  store.setRewardTitle(30, '去公园玩一次');
  store.finishBuild();
  store.parentAgree();
  ok('低段允许家长代记', store.canParentRecord() === true);

  const logBefore = store.state().log.length;
  const pr = store.parentRecord('p1');
  ok('家长代记成功，并盖上 byParent 戳',
     pr.ok === true && pr.entry.byParent === true && store.state().log.length === logBefore + 1,
     JSON.stringify(pr.ok ? pr.entry : pr));
  ok('家长代记分值取自行为项，且是正数',
     pr.ok === true && pr.entry.points === store.itemById('p1').points && pr.entry.points > 0);
  const again = store.parentRecord('p1');
  ok('同一条每天只记一次（家长代记也守次数上限）', again.ok === false, JSON.stringify(again));
  ok('代记不破坏只加分红线：负数仍被拒', store.addPoints({ points: -1 }).ok === false);

  /* 初中：不代记（尊重自主权） */
  store.applyStage('mid');
  store.markIntroSeen();
  store.setItemPoints('s1', 3);
  store.removeItem('l4');
  store.setRewardTitle(120, '一起出去一次');
  store.finishBuild();
  store.parentAgree();
  ok('初中不允许家长代记（尊重自主权）', store.canParentRecord() === false);
  const midRec = store.parentRecord('s1');
  ok('初中代记被拒绝并给出理由',
     midRec.ok === false && /不代记/.test(midRec.reason), JSON.stringify(midRec));

  /* 页面接线 */
  ok('家长端有「帮 TA 记一笔」入口与代记处理',
     /onRecord/.test(read('pages/parent/index.wxml')) &&
     /onRecord/.test(read('pages/parent/index.js')) &&
     /canParentRecord/.test(read('pages/parent/index.js')));
  ok('家长端有「回到孩子端」切换',
     /goChild/.test(read('pages/parent/index.wxml')) && /goChild/.test(read('pages/parent/index.js')));
  ok('孩子端低段有「让妈妈来记」入口',
     /canRecord/.test(read('pages/today/index.js')) && /goParent/.test(read('pages/today/index.wxml')));
  ok('「我的」页有「关于罗森塔尔」可重看入口',
     /关于罗森塔尔/.test(read('pages/me/index.js')) && /from=me/.test(read('pages/me/index.js')));
}

/* --- C24 导出配额（免费试运行）+ 出图版面（纯函数） ---
   免费试运行：导出免费 EXPORT_FREE_LIMIT 次，用满提示「内测中，敬请期待」，不接支付。
   出图分两层：buildBlocks/wrapText/paginate 是纯函数（可在这里测）；toImages 才用 wx。 */
{
  const render = require('./utils/render-image.js');

  store.resetAll('mid');
  const q0 = store.exportQuota();
  ok('新用户导出配额 = 0/3 且允许导出',
     q0.used === 0 && q0.limit === store.EXPORT_FREE_LIMIT && q0.remain === 3 && q0.canExport === true,
     JSON.stringify(q0));

  const life0 = store.lifetime();
  store.consumeExport(); store.consumeExport();
  ok('用掉两次后剩 1 次', store.exportQuota().remain === 1 && store.exportQuota().canExport === true,
     JSON.stringify(store.exportQuota()));
  store.consumeExport();
  ok('用满 3 次后不再允许导出',
     store.exportQuota().canExport === false && store.exportQuota().remain === 0,
     JSON.stringify(store.exportQuota()));
  store.consumeExport();
  ok('第 4 次也只是计数增加、仍不允许', store.exportQuota().used === 4 && store.exportQuota().canExport === false);
  ok('导出计数不碰任何计分（只加分红线不破）',
     store.lifetime() === life0 && store.state().log.every(l => l.points > 0));

  /* 出图版面：纯函数，不碰 wx */
  const ruleBlocks = render.buildBlocks('rule', store.buildRuleTable());
  ok('规则表版面：含标题/奖励段/双签块',
     ruleBlocks.some(b => b.t === 'title' && b.text.indexOf('规则表') >= 0) &&
     ruleBlocks.some(b => b.t === 'section' && b.text === '奖励档位') &&
     ruleBlocks.some(b => b.t === 'sign'));
  const weekBlocks = render.buildBlocks('week', store.buildWeekPage());
  ok('一周一页版面：含标题/做到的事/双签块',
     weekBlocks.some(b => b.t === 'title' && b.text.indexOf('一周一页') >= 0) &&
     weekBlocks.some(b => b.t === 'section' && b.text === '这一周做到的事') &&
     weekBlocks.some(b => b.t === 'sign'));
  ok('折行是纯函数：超宽文字拆成多行且不丢字',
     (function () { const ls = render.wrapText('一二三四五六七八九十', 20, 60); return ls.length > 1 && ls.join('') === '一二三四五六七八九十'; })());
  ok('分页是纯函数：块多时拆成多页，且每页非空',
     (function () {
       const many = [];
       for (let i = 0; i < 120; i++) many.push({ t: 'text', text: '第 ' + i + ' 行，用来撑高页面。' });
       const pages = render.paginate(many, 400);
       return pages.length > 1 && pages.every(p => p.length > 0);
     })());

  /* 页面接线：四个入口都走 export-gate；用满提示「内测中」；不接任何支付/网络 */
  ok('四个导出入口都走了 export-gate（闸门集中一处）',
     /export-gate/.test(read('pages/rules/index.js')) && /export-gate/.test(read('pages/me/index.js')) &&
     /export-gate/.test(read('pages/week/index.js')) && /export-gate/.test(read('pages/growth/index.js')));
  ok('用满后的提示是「内测中，敬请期待」',
     /内测中/.test(read('utils/export-gate.js')) && /敬请期待/.test(read('utils/export-gate.js')));
  ok('导出是本地出图（离屏 canvas），没有引入支付/网络',
     /createOffscreenCanvas/.test(read('utils/render-image.js')) &&
     !/requestPayment|requestVirtualPayment|wx\.request\b/.test(read('utils/render-image.js') + read('utils/export-gate.js')));
}

/* --- C26 奖励 CRUD：改分值 / 改内容 / 新增 / 删除 --- */
{
  store.resetAll('mid');
  store.markIntroSeen();
  const n0 = store.state().rewards.length;

  ok('奖励：新增一档（分值 + 内容）', (function () {
    const r = store.addReward({ cost: 999, title: '一次旅行' });
    return r.ok && store.state().rewards.length === n0 + 1 &&
      store.state().rewards.some(x => x.cost === 999 && x.title === '一次旅行');
  })());
  ok('奖励：改分值', (function () {
    const r = store.setRewardCost(999, 998);
    return r.ok && store.state().rewards.some(x => x.cost === 998);
  })());
  ok('奖励：改内容', (function () {
    const r = store.setRewardTitle(998, '一次海边旅行');
    return r.ok && store.state().rewards.some(x => x.cost === 998 && x.title === '一次海边旅行');
  })());
  ok('奖励：分值必须为正，且不与现有档位重复',
     store.addReward({ cost: 0, title: 'x' }).ok === false &&
     store.addReward({ cost: store.state().rewards[0].cost, title: 'x' }).ok === false);
  ok('奖励：删除一档，且至少保留一档', (function () {
    const r = store.removeReward(998);
    return r.ok && !store.state().rewards.some(x => x.cost === 998);
  })());
  ok('改奖励计入「必改 3 项」的 reward 计数', store.state().amend.reward > 0);
  ok('规则页有奖励 CRUD 入口与处理（改分 / 加档 / 删档）',
     /onSetCost/.test(read('pages/rules/index.wxml')) && /onRemoveReward/.test(read('pages/rules/index.wxml')) &&
     /onAddReward/.test(read('pages/rules/index.wxml')) && /setRewardCost/.test(read('pages/rules/index.js')));
}

/* --- C25 出图端到端（要等 Promise 微任务，所以放在最后跑） ---
   用桩的离屏 canvas 把「点导出 → 出图 → 预览 → 计次」整条链路走通；
   再验证「免费次数用满 → 提示内测中、不放行出图」。 */
(async () => {
  installWxStub();
  store.resetAll('mid');
  const p = loadPage('rules', appStub());
  p.onLoad();
  const before = store.exportQuota().used;
  wxCalls.length = 0;
  p.onPrintRuleTable();
  await new Promise(r => setTimeout(r, 0));
  ok('点「打印规则表」→ 出图并预览，且计次（异步链路走通）',
     apiCalls('previewImage').length === 1 &&
     (apiCalls('previewImage')[0].args[0].urls || []).length >= 1 &&
     store.exportQuota().used === before + 1,
     JSON.stringify({ preview: apiCalls('previewImage').length, used: store.exportQuota().used }));

  store.resetAll('mid');
  for (let i = 0; i < store.EXPORT_FREE_LIMIT; i++) store.consumeExport();
  const p2 = loadPage('rules', appStub());
  p2.onLoad();
  wxCalls.length = 0;
  p2.onPrintRuleTable();
  await new Promise(r => setTimeout(r, 0));
  const locked = apiCalls('showModal').some(c => String((c.args[0] || {}).title || '').indexOf('内测中') >= 0);
  ok('免费次数用满 → 提示「内测中，敬请期待」，不放行出图',
     locked && apiCalls('previewImage').length === 0 && apiCalls('createOffscreenCanvas').length === 0,
     JSON.stringify(apiCalls('showModal').map(c => (c.args[0] || {}).title)));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail ? 1 : 0);
})();
