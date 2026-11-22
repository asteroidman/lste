/* ============================================================
   website · server/lib/engine.js
   服务端规则引擎：在「家庭工作状态（JSON）」上操作，语义与小程序 store.js 一致。
   复用 ../miniprogram/utils/templates.js（纯数据）——单一真源，不重新设计规则。

   红线（与小程序同义，且只在这里实现）：
   1. 只加分：addPoints 拒绝 points<=0；没有任何写负分的路径；
   2. 日上限随学段：capOf(S)，在**引擎层**强制；
   3. 必改 3 项：amendedCount<3 时 finishBuild 拒绝；
   4. 双签：isRuleActive 需要孩子提案 + 家长签署；
   5. 家长不可删：不存在删除打卡/券的接口；visibleToParent 过滤私密。
   ============================================================ */
'use strict';

const T = require('../../../miniprogram/utils/templates.js');
const { randomId } = require('./secure');

/* ---------- 时间（纯函数） ---------- */
const pad2 = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayKey = (d) => dateKey(d || new Date());
const shiftDay = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return todayKey(d); };
const weekDates = () => Array.from({ length: 7 }, (_, i) => shiftDay(-i));

/* ---------- 状态工厂 ---------- */
function blankState(stage) {
  const st = stage || 'mid';
  const s = T.stageOf(st);
  return {
    stage: st,
    nick: '',
    grade: s.n,
    onboarded: false,
    amend: { point: 0, item: 0, reward: 0 },
    items: T.templateOf(st).map(i => Object.assign({}, i)),
    rewards: (T.REWARD_BY_STAGE[st] || T.REWARDS).map(r => Object.assign({}, r)),
    log: [],
    coupons: [],
    redemptions: [],
    repairs: [],
    week: null,
    weekDraft: null,
    parent: { agreedAt: null, version: null },
    ruleVersion: 0,
    introSeen: false,
    exportUsed: 0,
    exportFreeLimit: 10,        // 免费导出/打印 10 次
    sponsorUnlocked: false,     // 赞助解锁（兑换码核销后为真）
    parentPinHash: null,        // 家长密码（bcrypt 哈希）；设置后进家长端需解锁
  };
}

/* ---------- 派生 ---------- */
const capOf = (S) => T.stageOf(S.stage).cap;
const itemsOf = (S) => (S.items || []).filter(i => i.active !== false);
const itemById = (S, id) => (S.items || []).find(i => i.id === id);
const countOn = (S, id, date) => (S.log || []).filter(l => l.itemId === id && l.date === date && !l.reversed).length;
/* 当日得分只看**打卡流水**：周结算奖励（weekly）不占当日上限 */
const pointsOn = (S, date) => (S.log || []).filter(l => l.date === date && !l.reversed && !l.weekly).reduce((a, l) => a + l.points, 0);
const dayScore = (S, date) => Math.min(capOf(S), pointsOn(S, date));
const weekScore = (S) => weekDates().reduce((a, d) => a + pointsOn(S, d), 0);
const lifetime = (S) => (S.log || []).filter(l => !l.reversed).reduce((a, l) => a + l.points, 0);
const spentTotal = (S) => (S.redemptions || []).reduce((a, r) => a + (Number(r.cost) || 0), 0);
const balance = (S) => lifetime(S) - spentTotal(S);
function streak(S) {
  let n = 0, i = 0;
  for (;;) {
    const d = shiftDay(-i);
    if (pointsOn(S, d) > 0) { n++; i++; } else if (i === 0) { i++; } else break;
  }
  return n;
}
const dimLabel = (k) => (T.DIMS.find(d => d.k === k) || {}).n || '记录';

/* ---------- 文案（与小程序一致的句式与禁用词） ---------- */
function checkPraise(text) {
  const hit = T.BANNED.filter(b => String(text).indexOf(b) >= 0);
  return { ok: hit.length === 0, hit };
}
function praiseOf(it) {
  const line = '我看到你' + (it.p || '做到了这件事') + '，这说明' + (it.t || '你在往前走') + '。';
  return checkPraise(line).ok ? line : '';
}
function splitPraise(line) {
  const t = String(line || '');
  return {
    fact: (t.match(/^我看到你(.*?)，这说明/) || [, ''])[1],
    trait: (t.match(/这说明(.*?)。?$/) || [, ''])[1],
  };
}

/* ---------- 唯一写入口：只加分 + 日上限强制 ---------- */
function addPoints(S, o) {
  const opt = o || {};
  const points = Number(opt.points);
  if (!(points > 0)) return { ok: false, reason: '系统里没有扣分' };
  const date = opt.date || todayKey();
  const cap = capOf(S);
  const used = dayScore(S, date);
  if (used >= cap) return { ok: false, reason: '今天已经很棒了，剩下的留给明天' };
  const grant = Math.min(points, cap - used);
  const ts = opt.ts || Date.now();
  const entry = {
    uid: randomId('l'), itemId: opt.itemId || null, name: opt.name || '', dim: opt.dim || 'self',
    points: grant, date, ts, praise: opt.praise || '', confirmed: false,
    overflow: points - grant, byParent: !!opt.byParent, reversed: false, private: false,
  };
  S.log.push(entry);
  return { ok: true, entry, partial: grant < points };
}

/** 周结算：独立入账，不占当日上限，但一样只加分 */
function addWeeklyPoints(S, o) {
  const opt = o || {};
  const points = Number(opt.points);
  if (!(points > 0)) return { ok: false, reason: '系统里没有扣分' };
  const ts = opt.ts || Date.now();
  const entry = {
    uid: randomId('w'), itemId: null, name: opt.name || '周结算奖励', dim: 'bonus',
    points, date: opt.date || todayKey(), ts, praise: opt.praise || '',
    confirmed: false, overflow: 0, weekly: true, reversed: false, private: false,
  };
  S.log.push(entry);
  return { ok: true, entry };
}

function undo(S, uid, now) {
  const t = now || Date.now();
  const e = (S.log || []).find(l => l.uid === uid);
  if (!e) return { ok: false, reason: '没找到这条记录' };
  if (e.reversed) return { ok: false, reason: '这条已经撤销过了' };
  if (t - e.ts > 24 * 3600 * 1000) return { ok: false, reason: '超过 24 小时了，留着它也是记录' };
  e.reversed = true;
  return { ok: true, entry: e };
}

function setPrivate(S, uid, flag) {
  const e = (S.log || []).find(l => l.uid === uid);
  if (!e) return { ok: false, reason: '没找到这条记录' };
  e.private = (flag === undefined) ? !e.private : !!flag;
  return { ok: true, entry: e };
}

/* ---------- 兑换（券不可撤回） ---------- */
function redeem(S, cost, title) {
  const c = Number(cost);
  if (!(c > 0)) return { ok: false, reason: '这个奖励不能兑换' };
  if (balance(S) < c) return { ok: false, reason: '再攒一点点就够了' };
  const ts = Date.now();
  const code = 'RS-' + randomId('').slice(-4).toUpperCase() + '-' + String((S.coupons || []).length + 1).padStart(2, '0');
  const coupon = { code, title: title || '', cost: c, ts, exp: shiftDay(30), used: false };
  S.redemptions.push({ id: 'rd-' + code, code, cost: c, title: title || '', at: ts });
  S.coupons.push(coupon);
  return { ok: true, coupon };
}
function useCoupon(S, code) {
  const c = (S.coupons || []).find(x => x.code === code);
  if (!c) return { ok: false, reason: '没找到这张券' };
  c.used = true;
  return { ok: true, coupon: c };
}

/* ---------- 共建（必改 3 项）与双签 ---------- */
const amendedCount = (S) => ['point', 'item', 'reward'].filter(k => S.amend[k] > 0).length;
const canFinishBuild = (S) => amendedCount(S) >= 3;
function revokeSign(S) { if (S.parent && S.parent.agreedAt) S.parent = { agreedAt: null, version: null }; }

function setItemPoints(S, id, points) {
  const it = itemById(S, id);
  const p = Number(points);
  if (!it || !(p > 0)) return { ok: false, reason: '分值必须是正数' };
  it.points = p; it.customBy = 'child'; it.stamp = todayKey();
  S.amend.point = Math.max(1, S.amend.point); revokeSign(S);
  return { ok: true, item: it };
}
function addItem(S, item) {
  const it = Object.assign({ dim: 'self', points: 1, limit: 1 }, item || {});
  if (!(it.points > 0)) return { ok: false, reason: '新行为项的分值必须是正数' };
  it.id = it.id || randomId('c'); it.customBy = 'child'; it.stamp = todayKey();
  S.items.push(it); S.amend.item = Math.max(1, S.amend.item); revokeSign(S);
  return { ok: true, item: it };
}
function removeItem(S, id) {
  const it = itemById(S, id);
  if (!it) return { ok: false, reason: '没找到这条行为' };
  it.active = false; it.customBy = 'child'; it.stamp = todayKey();
  S.amend.item = Math.max(1, S.amend.item); revokeSign(S);
  return { ok: true, item: it };
}
function setRewardTitle(S, cost, title) {
  const r = (S.rewards || []).find(x => x.cost === Number(cost));
  const t = String(title || '').trim();
  if (!r || !t) return { ok: false, reason: '奖励内容不能为空' };
  r.title = t; r.customBy = 'child'; r.stamp = todayKey();
  S.amend.reward = Math.max(1, S.amend.reward); revokeSign(S);
  return { ok: true, reward: r };
}
function setRewardCost(S, cost, newCost) {
  const r = (S.rewards || []).find(x => x.cost === Number(cost));
  const c = Number(newCost);
  if (!r || !(c > 0)) return { ok: false, reason: '分值必须是正数' };
  if (S.rewards.some(x => x !== r && x.cost === c)) return { ok: false, reason: '已经有同分值的档位了' };
  r.cost = c; r.customBy = 'child'; r.stamp = todayKey();
  S.amend.reward = Math.max(1, S.amend.reward); revokeSign(S);
  return { ok: true, reward: r };
}
function addReward(S, r) {
  const item = Object.assign({ cost: 0, tier: '自定义', title: '', desc: '' }, r || {});
  if (!(Number(item.cost) > 0)) return { ok: false, reason: '分值必须是正数' };
  if (S.rewards.some(x => x.cost === Number(item.cost))) return { ok: false, reason: '已经有同分值的档位了' };
  const row = { cost: Number(item.cost), tier: item.tier, title: String(item.title || '').trim() || '自定义奖励', desc: item.desc || '', customBy: 'child', stamp: todayKey() };
  S.rewards.push(row); S.rewards.sort((a, b) => a.cost - b.cost);
  S.amend.reward = Math.max(1, S.amend.reward); revokeSign(S);
  return { ok: true, reward: row };
}
function removeReward(S, cost) {
  const r = (S.rewards || []).find(x => x.cost === Number(cost));
  if (!r) return { ok: false, reason: '没找到这档奖励' };
  if (S.rewards.length <= 1) return { ok: false, reason: '至少要留一档奖励' };
  S.rewards = S.rewards.filter(x => x !== r);
  S.amend.reward = Math.max(1, S.amend.reward); revokeSign(S);
  return { ok: true };
}
function finishBuild(S) {
  if (!canFinishBuild(S)) return { ok: false, reason: '还差 ' + (3 - amendedCount(S)) + ' 处' };
  (S.items || []).forEach(i => { if (i.customBy === 'child' && !i.stamp) i.stamp = todayKey(); });
  S.onboarded = true;
  S.ruleVersion = (S.ruleVersion || 0) + 1;
  revokeSign(S);
  return { ok: true, ruleVersion: S.ruleVersion, pendingParent: true };
}
function parentAgree(S, ts) {
  if (!S.onboarded) return { ok: false, reason: '还没有待确认的规则版本' };
  const at = ts || Date.now();
  S.parent = { agreedAt: at, version: S.ruleVersion || 1 };
  return { ok: true, version: S.ruleVersion || 1, agreedDate: todayKey(new Date(at)) };
}
const isRuleActive = (S) => !!S.onboarded && !!(S.parent && S.parent.agreedAt);
function ruleSignature(S) {
  const childDone = !!S.onboarded;
  const parentDone = !!(S.parent && S.parent.agreedAt);
  return {
    childDone, parentDone, active: childDone && parentDone,
    ruleVersion: S.ruleVersion || 0,
    agreedDate: parentDone ? todayKey(new Date(S.parent.agreedAt)) : '',
    amended: amendedCount(S),
  };
}

/* ---------- 家长视角：只读正向、私密不返回 ---------- */
const visibleToParent = (S) => (S.log || []).filter(l => !l.private);
const hiddenCount = (S) => (S.log || []).filter(l => l.private && !l.reversed).length;
function confirmEntries(S, uids) {
  const list = Array.isArray(uids) ? uids : [uids];
  let n = 0;
  (S.log || []).forEach(l => { if (list.indexOf(l.uid) >= 0 && !l.confirmed && !l.reversed) { l.confirmed = true; n++; } });
  return { ok: n > 0, confirmed: n };
}

/* ---------- 周复盘 ---------- */
function weekBonus(S, challenge) {
  return {
    week50: weekScore(S) >= 50,
    streak7: streak(S) >= 7,
    challenge: !!challenge,
    total: (weekScore(S) >= 50 ? 10 : 0) + (streak(S) >= 7 ? 10 : 0) + (challenge ? 5 : 0),
  };
}
function weekFinish(S, patch) {
  const p = patch || {};
  const rangeStart = shiftDay(-6);
  if (S.week && S.week.rangeStart === rangeStart) return { ok: false, reason: '这一周已经结算过了' };
  const bonus = weekBonus(S, p.challenge);
  if (bonus.total > 0) addWeeklyPoints(S, { points: bonus.total, praise: '我看到你坚持了一整周，这说明你已经在自动运转了。' });
  S.week = {
    range: rangeStart + ' → ' + todayKey(), rangeStart,
    highlights: Array.isArray(p.highlights) ? p.highlights.slice(0, 3) : [],
    keep: p.keep || '', next: p.next || '', challenge: p.challenge || '',
    bonus: bonus.total, bonusDetail: { week50: bonus.week50, streak7: bonus.streak7, challenge: bonus.challenge },
    score: weekScore(S), days: weekDates().filter(d => pointsOn(S, d) > 0).length, streak: streak(S),
    at: Date.now(),
  };
  return { ok: true, week: S.week };
}

/* ---------- 视图数据 ---------- */
function todayView(S) {
  const date = todayKey();
  const cap = capOf(S);
  const score = dayScore(S, date);
  const dims = T.DIMS.map(d => ({
    k: d.k, n: d.n,
    items: itemsOf(S).filter(i => i.dim === d.k).map(i => {
      const used = countOn(S, i.id, date);
      return { id: i.id, name: i.name, points: i.points, limit: i.limit, used, maxed: used >= i.limit };
    }),
  })).filter(d => d.items.length);
  return { stage: S.stage, cap, score, remain: Math.max(0, cap - score), dims, streak: streak(S), weekScore: weekScore(S), lifetime: lifetime(S) };
}
function growthView(S) {
  const list = (S.log || []).filter(l => !l.reversed).sort((a, b) => b.ts - a.ts).slice(0, 50)
    .map(l => ({ uid: l.uid, name: l.name, dim: dimLabel(l.dim), points: l.points, date: l.date, private: !!l.private, byParent: !!l.byParent, canUndo: Date.now() - l.ts < 864e5 }));
  const byDim = {};
  (S.log || []).filter(l => !l.reversed).forEach(l => { byDim[l.dim] = (byDim[l.dim] || 0) + l.points; });
  return {
    lifetime: lifetime(S), balance: balance(S), spent: spentTotal(S), streak: streak(S),
    weekScore: weekScore(S),
    dims: T.DIMS.map(d => ({ k: d.k, n: d.n, v: byDim[d.k] || 0 })),
    timeline: list,
  };
}
function parentPending(S) {
  return visibleToParent(S).filter(l => !l.confirmed && !l.reversed).sort((a, b) => b.ts - a.ts)
    .map(l => ({ uid: l.uid, name: l.name, points: l.points, date: l.date, dim: dimLabel(l.dim), praise: l.praise, byParent: !!l.byParent }));
}

module.exports = {
  T, blankState,
  todayKey, dateKey, shiftDay, weekDates,
  capOf, itemsOf, itemById, countOn, pointsOn, dayScore, weekScore, lifetime, spentTotal, balance, streak, dimLabel,
  praiseOf, checkPraise, splitPraise,
  addPoints, addWeeklyPoints, undo, setPrivate,
  redeem, useCoupon,
  amendedCount, canFinishBuild, setItemPoints, addItem, removeItem, setRewardTitle, setRewardCost, addReward, removeReward,
  finishBuild, parentAgree, isRuleActive, ruleSignature,
  visibleToParent, hiddenCount, confirmEntries,
  weekBonus, weekFinish,
  todayView, growthView, parentPending,
};
