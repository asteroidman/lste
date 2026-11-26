/* ============================================================
   罗森塔尔 · 单文件家庭版 · 回归
   运行：node lste/_smoke.mjs
   覆盖：构建产物（无外链/无占位符）、引擎用例（加分上限/撤销/兑换/
   奖励CRUD/周结算/导出恢复）、家长密码（PIN/恢复码/改密）、
   打印版面、红线词、UI 接线。
   ============================================================ */
'use strict';

import { createRequire } from 'node:module';
import { build } from './build.mjs';

const require2 = createRequire(import.meta.url);
let pass = 0, fail = 0;
const failures = [];
function ok(cond, name) {
  if (cond) { pass++; } else { fail++; failures.push(name); console.error('  ✗ ' + name); }
}
function eq(a, b, name) { ok(a === b, name + '（got ' + JSON.stringify(a) + '）'); }

/* localStorage 垫片（引擎与 pin 都走它） */
const mem = {};
globalThis.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
};

/* ============ A. 构建产物 ============ */
console.log('A. 构建产物');
const html = build();
ok(html.includes('罗森塔尔 · 家庭版'), 'A1 标题存在');
ok(html.includes('id="print-root"'), 'A2 打印容器存在');
ok(html.includes('__req("./store.js")'), 'A3 引擎已内联');
ok(!/<script\s+src=/i.test(html), 'A4 无外部脚本');
ok(!/https?:\/\//.test(html), 'A5 无任何外链');
ok(!/\b(fetch\(|XMLHttpRequest|sendBeacon|importScripts)/.test(html), 'A6 无网络调用');
eq((html.match(/<\/script>/gi) || []).length, 1, 'A7 script 闭合标签恰好 1 个');
ok(!html.includes('/*__CSS__*/') && !html.includes('/*__LIB__*/') && !html.includes('/*__APP__*/'), 'A8 占位符已全部替换');

/* ============ B. 引擎用例（与小程序同一份 store.js） ============ */
console.log('B. 引擎用例');
const St = require2('../miniprogram/utils/store.js');
St.load('mid');
let s = St.state();
eq(s.onboarded, false, 'B1 初始未生效');

/* 单文件版「跳过共建」的启动逻辑（与 app.js familyStart 一致） */
s.onboarded = true;
s.ruleVersion = (s.ruleVersion || 0) + 1;
s.parent = { agreedAt: Date.now(), version: s.ruleVersion };
s.introSeen = true;
St.save();
eq(St.ruleSignature().active, true, 'B2 默认规则直接生效');

/* 打卡与日上限：mid 上限 12 */
const s2 = St.itemById('s2');
let r = St.addPoints({ itemId: s2.id, name: s2.name, dim: s2.dim, points: s2.points, praise: St.praiseOf(s2) });
eq(r.ok, true, 'B3 打卡成功');
r = St.addPoints({ points: 15, name: '临时', dim: 'study' });
eq(r.ok && r.partial && r.entry.points === 10 && r.entry.overflow === 5, true, 'B4 日上限截断（grant 10 / overflow 5）');
r = St.addPoints({ points: 1, name: '临时', dim: 'study' });
eq(r.ok, false, 'B5 满了拒绝');
eq(St.dayScore(St.todayKey()), 12, 'B6 当日封顶 12');
eq(St.countOn('s2', St.todayKey()), 1, 'B7 s2 计数 1（UI 在 limit 次时置灰）');

/* 撤销 */
const firstUid = s.log[0].uid;
r = St.undo(firstUid);
eq(r.ok, true, 'B8 24 小时内可撤销');
r = St.undo(firstUid);
eq(r.ok, false, 'B9 重复撤销拒绝');
const lifetimeAfterUndo = St.lifetime();
eq(lifetimeAfterUndo, 10, 'B10 撤销后累计 10');

/* 兑换 */
r = St.redeem(100, '大奖');
eq(r.ok, false, 'B11 余额不足拒绝');
r = St.redeem(5, '看 30 分钟动画片');
eq(r.ok && r.coupon.code.startsWith('RS-'), true, 'B12 兑换发券');
eq(St.balance(), lifetimeAfterUndo - 5, 'B13 余额扣减');
r = St.useCoupon(r.coupon.code);
eq(r.ok && r.coupon.used, true, 'B14 用券');

/* 奖励 CRUD */
r = St.addReward({ cost: 7, title: '周末多看一集' });
eq(r.ok, true, 'B15 加一档');
r = St.addReward({ cost: 7, title: '重复分值' });
eq(r.ok, false, 'B16 同分值拒绝');
r = St.setRewardCost(7, 9);
eq(r.ok, true, 'B17 改分值');
r = St.setRewardCost(9, St.state().rewards.find(x => x.cost !== 9).cost);
eq(r.ok, false, 'B18 改成已有分值拒绝');
r = St.setRewardTitle(9, '改成新内容');
eq(r.ok, true, 'B19 改内容');
while (St.state().rewards.length > 1) St.removeReward(St.state().rewards[0].cost);
r = St.removeReward(St.state().rewards[0].cost);
eq(r.ok, false, 'B20 至少留一档');
St.addReward({ cost: 3, title: '恢复一档' });

/* 行为项移除（软移除，active=false） */
const it0 = St.itemsOf()[0];
r = St.removeItem(it0.id);
eq(r.ok && St.itemsOf().some(i => i.id === it0.id) === false, true, 'B21 移除后不再出现');

/* 周复盘 */
St.setWeekPatch({ next: '先把作业收拾好再玩', challenge: '每天跳绳一百个' });
r = St.weekStep(3);
eq(r.ok, true, 'B22 周目标通过');
r = St.finishWeek();
eq(r.ok && r.week.bonus >= 5, true, 'B23 周结算（至少主动挑战 +5）');
r = St.finishWeek();
eq(r.ok, false, 'B24 同周幂等');
const page = St.buildWeekPage({});
ok(page.text.includes('一周一页'), 'B25 一周一页文本');
ok(page.pdfPayload.week && page.pdfPayload.week.next === '先把作业收拾好再玩', 'B26 周目标入页');

/* 导出 / 恢复 */
const csv = St.buildRuleTableCsv({});
ok(csv.rowCount > 0 && csv.text.charCodeAt(0) === 0xfeff, 'B27 规则表 CSV');
const led = St.buildLedgerCsv({ includeReversed: true });
ok(led.rowCount > 0, 'B28 打卡记录 CSV');
const backup = { app: 'rosenthal-single', schema: 1, state: JSON.parse(JSON.stringify(St.state())) };
const lifetimeBefore = St.lifetime();
St.wipeAll();
eq(St.state().log.length, 0, 'B29 清空');
r = St.replaceState(backup.state);
eq(r.ok && St.lifetime(), lifetimeBefore, 'B30 备份恢复');

/* 家长代记权限（用昨天，避开今天的日上限） */
eq(St.canParentRecord(), false, 'B31 初中不代记');
St.applyStage('p12');
s = St.state();
s.onboarded = true; s.ruleVersion = (s.ruleVersion || 0) + 1;
s.parent = { agreedAt: Date.now(), version: s.ruleVersion }; St.save();
const p1 = St.itemsOf()[0];
r = St.parentRecord(p1.id, { date: St.shiftDay(-1) });
eq(r.ok && r.entry.byParent, true, 'B32 低段可代记');
St.load('mid');

/* ============ C. 家长密码 ============ */
console.log('C. 家长密码');
const Pin = require2('./src/pin.js');
let ps = await Pin.pinStatus();
eq(ps.has, false, 'C1 初始未设置');
r = await Pin.setPin('123');
eq(r.ok, false, 'C2 三位数拒绝');
r = await Pin.setPin('123456789');
eq(r.ok, false, 'C3 九位数拒绝');
r = await Pin.setPin('1357');
const firstCode = r.ok ? r.recoveryCode : '';
ok(r.ok && /^LST-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(firstCode), 'C4 设置成功 + 恢复码格式');
eq((await Pin.pinStatus()).has, true, 'C5 状态已设置');
eq(await Pin.verifyPin('1357'), true, 'C6 正确密码通过');
eq(await Pin.verifyPin('2468'), false, 'C7 错误密码拒绝');
eq(await Pin.verifyRecovery(firstCode), true, 'C8 恢复码通过');
eq(await Pin.verifyRecovery('LST-ZZZZ-ZZZZ'), false, 'C9 乱填恢复码拒绝');
r = await Pin.changePin('0000', '2468');
eq(r.ok, false, 'C10 旧密码错拒绝');
r = await Pin.changePin('1357', '2468');
ok(r.ok && /^LST-/.test(r.recoveryCode), 'C11 改密成功 + 新恢复码');
eq(await Pin.verifyPin('2468'), true, 'C12 新密码通过');
eq(await Pin.verifyPin('1357'), false, 'C13 旧密码失效');
eq(await Pin.verifyRecovery(firstCode), false, 'C14 旧恢复码失效');
eq(await Pin.verifyRecovery(r.recoveryCode), true, 'C15 新恢复码可用');

/* ============ D. 打印版面 ============ */
console.log('D. 打印版面');
const Pr = require2('./src/print.js');
const tHtml = Pr.todayHtml({
  nick: '月亮', stageName: '初中', date: St.todayKey(), score: 8, cap: 12,
  rows: [{ name: '阅读 30 分钟', points: 2, count: 1, limit: 2 }],
  entries: [{ time: '19:20', name: '阅读 30 分钟', points: 2, praise: '我看到你连续读了 30 分钟' }],
  flash: '今天自己主动练琴了', ruleVersion: 1,
});
ok(tHtml.includes('月亮') && tHtml.includes('今日 <b>8</b>'), 'D1 今日卡内容');
ok(tHtml.includes('我看到你连续读了 30 分钟'), 'D2 具体反馈入卡');
const page2 = St.buildWeekPage({});
page2.lifetime = St.lifetime(); page2.balance = St.balance();
if (!page2.pdfPayload.week) page2.pdfPayload.week = { highlights: [], keep: '', keepCustom: '', next: '先把作业收拾好再玩', challenge: '' };
page2.pdfPayload.week.keepDisplay = '（待补）';
const wHtml = Pr.weekHtml(page2);
ok(wHtml.includes('一周一页') && wHtml.includes('可用'), 'D3 一周一页内容');
ok(wHtml.includes('她签名'), 'D4 双签行存在');

/* ============ E. 红线词 ============ */
console.log('E. 红线词');
const fs = await import('node:fs');
const BANNED = ['扣分', '删除', '排名', '比较', '负分', '监视', '查岗', '撤回'];
const srcFiles = ['src/app.js', 'src/print.js', 'src/pin.js', 'src/style.css', 'src/shell.html'];
let redlineClean = true;
for (const f of srcFiles) {
  const txt = fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8');
  const hit = BANNED.filter(b => txt.includes(b));
  if (hit.length) { redlineClean = false; console.error('  ✗ ' + f + ' 含红线词：' + hit.join('、')); }
}
ok(redlineClean, 'E1 界面源码无红线词（引擎内联件沿用小程序声明）');

/* ============ F. UI 接线（字符串级） ============ */
console.log('F. UI 接线');
const appSrc = fs.readFileSync(new URL('./src/app.js', import.meta.url), 'utf8');
for (const m of ['data-act="checkin"', 'guarded(', 'print-today', 'print-week', 'export-backup',
                 'import-backup', 'requirePin', 'verifyRecovery', 'familyStart', 'autoAgree']) {
  ok(appSrc.includes(m), 'F ' + m);
}

/* 手机排版防回归：奖励名称不能被 4 个按钮挤成竖排单字，底栏不能盖住最后一块内容。
   这两条曾在真机上出问题，故对 CSS 规则做静态断言。 */
const cssSrc = fs.readFileSync(new URL('./src/style.css', import.meta.url), 'utf8');
ok(/\.row\s*\{[^}]*flex-wrap:\s*wrap/.test(cssSrc), 'F-layout1 行布局允许换行');
ok(/\.rowmain\s*\{[^}]*min-width:\s*170px/.test(cssSrc), 'F-layout2 名称列有最小宽度');
ok(/\.tabbar\s*\{[^}]*position:\s*sticky/.test(cssSrc), 'F-layout3 底栏 sticky 不遮挡内容');

/* ============ G. 真实 DOM 交互（jsdom 跑构建产物，点击链路全通） ============ */
console.log('G. 真实 DOM 交互');
{
  /* 本地开发：jsdom 来自 lste-wx（jest-environment-jsdom 的传递依赖）；
     CI 全新 clone：来自 mobile 的 devDependencies。两处都不在时给明确提示。 */
  let jsdomModule = null;
  for (const pkg of ['../lste-wx/package.json', '../mobile/package.json']) {
    try {
      jsdomModule = createRequire(new URL(pkg, import.meta.url))('jsdom');
      if (jsdomModule && jsdomModule.JSDOM) break;
    } catch (e) { /* 试下一个位置 */ }
  }
  if (!jsdomModule) throw new Error('jsdom 不可用：请先 npm i --prefix mobile（或 npm i --prefix lste-wx）');
  const { JSDOM, VirtualConsole } = jsdomModule;
  const vcErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => vcErrors.push(String((e && e.message) || e)));
  vc.on('error', (...a) => vcErrors.push(a.join(' ')));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://rosenthal.test/',
    virtualConsole: vc, pretendToBeVisual: true,
  });
  const doc = dom.window.document;
  const wait = (ms = 30) => new Promise(r2 => setTimeout(r2, ms));
  const clickIt = el => { if (!el) throw new Error('找不到待点击元素'); el.click(); };
  const rootTxt = () => doc.getElementById('root').textContent;
  const modalTxt = () => (doc.getElementById('modal-root') || { textContent: '' }).textContent;

  ok(rootTxt().includes('学段'), 'G1 首屏是学段选择');
  clickIt(doc.querySelector('[data-act="stage-pick"]'));
  await wait();
  ok(!!doc.querySelector('#nick-in'), 'G2 点学段弹出昵称框');
  doc.querySelector('.modal').click();
  ok(!!doc.querySelector('#nick-in'), 'G3 模态框内部点击不关闭');
  doc.getElementById('nick-in').value = '小满';
  clickIt(doc.querySelector('[data-act="family-start"]'));
  await wait();
  ok(rootTxt().includes('记一笔') && rootTxt().includes('小满'), 'G4 开始使用进入今日页');
  clickIt(doc.querySelector('[data-act="checkin"]'));
  await wait();
  ok(rootTxt().includes('已记 1/'), 'G5 打卡生效（计数出现）');
  clickIt(doc.querySelector('[data-tab="rules"]'));
  await wait();
  ok(rootTxt().includes('改分值'), 'G6 规则页渲染');
  doc.querySelector('[data-act="item-cost"]').click();
  await wait();
  doc.getElementById('pts-in').value = '3';
  clickIt(doc.querySelector('[data-act="item-cost-go"]'));
  await wait(80);
  ok(modalTxt().includes('设置家长密码'), 'G7 修改触发首次设 PIN');
  doc.getElementById('pin-in').value = '1357';
  doc.getElementById('pin-in2').value = '1357';
  clickIt(doc.querySelector('[data-act="pin-go"]'));
  await wait(150);
  ok(modalTxt().includes('恢复码'), 'G8 显示恢复码');
  clickIt(doc.querySelector('[data-act="rec-ack"]'));
  await wait(100);
  ok(rootTxt().includes('+3 分'), 'G9 PIN 后改动生效（2→3 分）');
  doc.querySelector('[data-act="item-cost"]').click();
  await wait();
  doc.getElementById('pts-in').value = '2';
  clickIt(doc.querySelector('[data-act="item-cost-go"]'));
  await wait(80);
  ok(!!doc.querySelector('#pin-in') && modalTxt().includes('家长密码'), 'G10 已设 PIN 后弹验证框');
  doc.querySelector('.mask').click();
  ok(!doc.querySelector('#pin-in'), 'G11 点遮罩关闭');
  eq(vcErrors.length, 0, 'G12 无脚本错误' + (vcErrors.length ? '（' + vcErrors[0] + '）' : ''));
  dom.window.close();
}

/* ============ 汇总 ============ */
console.log('');
if (fail === 0) {
  console.log('结果：' + pass + ' 通过 / 0 失败');
  process.exit(0);
} else {
  console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
  failures.forEach(f => console.log('  失败：' + f));
  process.exit(1);
}
