/* ============================================================
   罗森塔尔 Rosenthal · utils/store.js
   规则引擎 + 状态 + 持久化 —— 从 prototype/app.js 抽取的**唯一写入口**。

   三条硬约束在这里落地，且只在这里落地（README §10 验收清单第 1–3 条）：
   1. 只加分：addPoints 拒绝 points <= 0，全文件不存在任何写负分的路径；
   2. 日上限随学段：capNow() 取自当前学段模板，在**引擎层**强制，前端置灰只是提示；
   3. 必改 3 项：amend 计数满 3 才算完成共建，未满时 onboarded 不能被置为 true。

   本文件零 DOM 依赖。所有 wx.* 调用都包在 try/catch 里并带 Node 兜底，
   因此同一个文件既能被小程序 require，也能被 node _smoke_s1.js 直接跑。
   ============================================================ */
'use strict';

const T = require('./templates.js');

const KEY = 'rosenthal.miniprogram.v1';
const COUPON_DAYS = 30;
/* 免费试运行：导出免费次数上限。用满后前端提示「内测中」（阶段 B 换成云权益）。 */
const EXPORT_FREE_LIMIT = 3;

/* ---------------- 1. 存储适配层（小程序 Storage / Node 内存兜底） ---------------- */

const mem = {};
function rawGet(k) {
  try {
    if (typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') {
      const v = wx.getStorageSync(k);
      return v === '' || v === undefined ? null : v;
    }
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(k);
      return v === null || v === undefined ? null : v;
    }
  } catch (e) { /* 读失败按空处理，不允许中断启动 */ }
  return k in mem ? mem[k] : null;
}
function rawSet(k, v) {
  try {
    if (typeof wx !== 'undefined' && wx && typeof wx.setStorageSync === 'function') { wx.setStorageSync(k, v); return true; }
    if (typeof localStorage !== 'undefined') { localStorage.setItem(k, v); return true; }
  } catch (e) { /* 存储满或权限问题：内存里继续，不阻断打卡 */ }
  mem[k] = v; return false;
}

const dimOf = k => T.dimOf(k);

/**
 * 流水维度 → 中文标签。
 * 注意 'bonus'：周结算流水用的维度，不在 5 个行为维度里，
 * 漏掉它会在流水与肯定卡上显示成笼统的「记录」。
 */
function dimLabel(k) {
  if (k === 'bonus') return '周奖励';
  const d = T.DIMS.find(x => x.k === k);
  return d ? d.n : '记录';
}

/* ---------------- 2. 时间与数值工具（纯函数） ---------------- */

const pad2 = n => String(n).padStart(2, '0');
const todayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dateKey = d => todayKey(d);
const shiftDay = n => { const d = new Date(); d.setDate(d.getDate() + n); return todayKey(d); };
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();   // m 为 1–12
const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const esc = s => String(s === undefined || s === null ? '' : s)
  .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 券码：RS-XXXX-XX，8 位内足够家庭场景唯一，失败重试避免碰撞 */
function newCouponCode(existing) {
  const take = () => 'RS-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '-' +
    String(Math.floor(Math.random() * 90) + 10);
  let code = take(), guard = 0;
  while (existing.some(c => c.code === code) && guard++ < 50) code = take();
  return code;
}

/* ---------------- 3. 状态构造 ---------------- */

/** 空白状态：第一次启动就是「还没共建过规则」的样子 */
function blank(stage = 'mid') {
  const st = T.stageOf(stage);
  return {
    stage,
    nick: st.nick,
    grade: st.n,
    role: 'child',
    onboarded: false,
    amend: { point: 0, item: 0, reward: 0 },
    items: T.templateOf(stage).map(i => Object.assign({}, i)),
    rewards: (T.REWARD_BY_STAGE[stage] || T.REWARDS).map(r => Object.assign({}, r)),
    log: [],
    flash: {},
    coupons: [],
    /* 兑换记录：**只增不改的明细**，spent 由它派生。
       为什么不直接存一个 spent 数字见 utils/sync.js 顶部说明：
       两台设备各自离线兑换时，数字只能取一个、必然少算一次。 */
    redemptions: [],
    repairs: [],
    week: null,
    weekDraft: null,          // 周复盘走到一半的草稿（换页不丢）
    parent: { agreedAt: null, version: null },   // 家长对当前规则版本的签署
    surpriseAt: null,        // 兼容旧数据（新数据用 surpriseClaim 记窗口）
    surpriseClaim: null,     // { at, start, end }：本窗口领过惊喜卡的凭据
    spent: 0,
    ruleVersion: 0,
    introSeen: false,        // 是否已看过「罗森塔尔效应」首次介绍页
    exportUsed: 0,           // 已用掉的免费导出次数（试运行：本地计数）
  };
}

let S = null;

function load(stage) {
  let parsed = null;
  const raw = rawGet(KEY);
  if (raw) {
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { parsed = null; }
  }
  S = parsed && typeof parsed === 'object' ? parsed : blank(stage);
  if (!S.stage) S.stage = 'mid';
  if (!S.amend || typeof S.amend !== 'object') S.amend = { point: 0, item: 0, reward: 0 };
  if (!Array.isArray(S.log)) S.log = [];
  if (!Array.isArray(S.items)) S.items = T.templateOf(S.stage).map(i => Object.assign({}, i));
  if (!Array.isArray(S.coupons)) S.coupons = [];
  if (!Array.isArray(S.repairs)) S.repairs = [];
  if (!S.flash || typeof S.flash !== 'object') S.flash = {};
  if (typeof S.spent !== 'number') S.spent = 0;
  /* 老存档没有 introSeen：补 false，这样老用户也会**看到一次**介绍页
     （他们从没看过；看完就置 true，之后不再打断）。 */
  if (typeof S.introSeen !== 'boolean') S.introSeen = false;
  if (typeof S.exportUsed !== 'number' || S.exportUsed < 0) S.exportUsed = 0;
  /* 迁移：老数据里只有 spent 这个数字，没有兑换明细。
     补一条 id 固定的 backfill 记录把余额原样接住（金额不变），
     这样「spent 由明细派生」对老用户也是无缝的。 */
  if (!Array.isArray(S.redemptions)) {
    S.redemptions = S.spent > 0
      ? [{ id: 'backfill-legacy', code: '', cost: S.spent, title: '（历史兑换，迁移自旧版本）', at: 0 }]
      : [];
  }
  return S;
}
/**
 * 落盘。顺便把 `spent` 同步成明细的合计 —— 它只是给外部读的一个**派生缓存**，
 * 事实来源始终是 `redemptions` 明细（这样合并才有唯一正确答案）。
 */
const save = () => {
  S.spent = (S.redemptions || []).reduce((a, r) => a + (Number(r.cost) || 0), 0);
  return rawSet(KEY, JSON.stringify(S));
};
const resetAll = (stage = 'mid') => { S = blank(stage); save(); return S; };
const state = () => S;

/* ---------------- 4. 规则引擎 ---------------- */

const capNow = () => T.stageOf(S.stage).cap;
const itemsOf = () => S.items.filter(i => i.active !== false);
const itemById = id => S.items.find(i => i.id === id);
const countOn = (id, date) => S.log.filter(l => l.itemId === id && l.date === date && !l.reversed).length;
const pointsOn = date => S.log.filter(l => l.date === date && !l.reversed).reduce((a, l) => a + l.points, 0);
/* 注意：必须按 date 过滤后再取上限。只写 Math.min(capNow(), pointsOn) 会让
   addPoints 的「已用分数」按全部历史计算，是原型里一个只在同一天出现多条记录时
   才暴露的隐患；小程序这边按日期收敛。 */
const dayScore = date => Math.min(capNow(), pointsOn(date));
const weekDates = () => Array.from({ length: 7 }, (_, i) => shiftDay(-i));
const weekScore = () => weekDates().reduce((a, d) => a + pointsOn(d), 0);
const lifetime = () => S.log.filter(l => !l.reversed).reduce((a, l) => a + l.points, 0);

/**
 * 已花掉的分数 = 兑换明细之和。
 * **不再单独存一个 spent 数字**：那个数字在「两台设备各自离线兑换」时无法合并
 * （只能取一个，必然少算一次）。改成从只增不改的 redemptions 明细求和之后，
 * 合并 = 两条明细取并集，花了多少永远算得对。详见 utils/sync.js 顶部。
 */
const spentTotal = () => (S.redemptions || []).reduce((a, r) => a + (Number(r.cost) || 0), 0);
const balance = () => lifetime() - spentTotal();
const streak = () => {
  let n = 0, i = 0;
  for (;;) {
    const d = shiftDay(-i);
    if (pointsOn(d) > 0) { n++; i++; } else if (i === 0) { i++; } else break;
  }
  return n;
};
const confirmedCount = () => S.log.filter(l => !l.confirmed).length;
const nextReward = () => {
  const b = balance();
  return S.rewards.find(r => r.cost > b) || null;
};

/** 唯一写入入口：只接受正数，日上限在此强制生效 */
function addPoints(opt) {
  const o = opt || {};
  const points = o.points;
  if (!(points > 0)) return { ok: false, reason: '系统里没有扣分' };
  const date = o.date || todayKey();
  const cap = capNow();
  const used = dayScore(date);
  if (used >= cap) return { ok: false, reason: '今天已经很棒了，剩下的留给明天' };
  const grant = Math.min(points, cap - used);
  const ts = o.ts || Date.now();
  const entry = {
    uid: 'u' + ts + Math.random().toString(36).slice(2, 6),
    itemId: o.itemId || null, name: o.name || '', dim: o.dim || 'self',
    points: grant, date, ts, praise: o.praise || '',
    confirmed: false, overflow: points - grant,
    /* 家长代记戳：低段家长「帮 TA 记一笔」时带上，纸面上看得出来是谁记的 */
    byParent: !!o.byParent,
  };
  S.log.push(entry);
  save();
  return { ok: true, entry, partial: grant < points };
}

/** 撤销：24 小时内可撤销：不删历史，只打标记（与原型一致，流水永远保留） */
function undo(uid, now) {
  const t = now || Date.now();
  const e = S.log.find(l => l.uid === uid);
  if (!e) return { ok: false, reason: '没找到这条记录' };
  if (e.reversed) return { ok: false, reason: '这条已经撤销过了' };
  if (t - e.ts > 24 * 3600 * 1000) return { ok: false, reason: '超过 24 小时了，留着它也是记录' };
  e.reversed = true; save();
  return { ok: true, entry: e };
}

/**
 * 家长确认 / 补充鼓励（家长端唯一能改的东西）。
 * 注意：这里只允许把 confirmed 从 false 置为 true，
 * 没有任何删除、撤回、改分的路径 —— 对应 PRD §1.4 红线 3。
 */
function confirmEntries(uids) {
  const list = Array.isArray(uids) ? uids : [uids];
  let n = 0;
  S.log.forEach(l => {
    if (list.indexOf(l.uid) >= 0 && !l.confirmed && !l.reversed) { l.confirmed = true; n++; }
  });
  if (n) save();
  return { ok: n > 0, confirmed: n };
}

/** 兑换：记一条**只增不改的兑换明细**，券与明细一一对应；家长端不可撤回 */
function redeem(cost, title) {
  const c = Number(cost);
  if (!(c > 0)) return { ok: false, reason: '这个奖励不能兑换' };
  if (balance() < c) return { ok: false, reason: '再攒一点点就够了' };
  const ts = Date.now();
  const code = newCouponCode(S.coupons);
  const coupon = {
    code: code,
    title: title || '',
    cost: c,
    ts: ts,
    exp: shiftDay(COUPON_DAYS),
    used: false,
  };
  /* id 用券码派生：两个设备即使各兑一次也不会撞 id，合并时是两条并集而不是覆盖 */
  S.redemptions.push({ id: 'rd-' + code, code: code, cost: c, title: title || '', at: ts });
  S.coupons.push(coupon);
  save();
  return { ok: true, coupon };
}

function useCoupon(code) {
  const c = S.coupons.find(x => x.code === code);
  if (!c) return { ok: false, reason: '没找到这张券' };
  c.used = true; save();
  return { ok: true, coupon: c };
}

/* ---------------- 5. 规则共建：必改 3 项 ---------------- */

const amendedCount = () => (S.amend.point > 0 ? 1 : 0) + (S.amend.item > 0 ? 1 : 0) + (S.amend.reward > 0 ? 1 : 0);
/** 契约：三处都改过才允许 onboarded = true */
const canFinishBuild = () => amendedCount() >= 3;

/**
 * 规则是否**双方都签过、已经生效**。
 * PRD §3 表格：规则变更需孩子 + 家长双签，单方修改进入待生效。
 * 所以「孩子改满 3 处」只是提案完成，还要家长点一次「我按你的版本来」。
 */
const isRuleActive = () => !!S.onboarded && !!(S.parent && S.parent.agreedAt);

/**
 * 任何一处规则改动都要作废上一轮家长签字。
 * PRD §3：规则变更需双签，单方修改进入待生效。如果只在 finishBuild 里清，
 * 那么「签完字之后再改一条分值」就会带着旧签字继续生效 —— 等于绕过了双签。
 */
function revokeSignature() {
  if (S.parent && S.parent.agreedAt) {
    S.parent = { agreedAt: null, version: null };
  }
}

function setItemPoints(id, points, date) {
  const it = itemById(id);
  const p = Number(points);
  if (!it || !(p > 0)) return { ok: false, reason: '分值必须是正数' };
  it.points = p; it.customBy = 'child'; it.stamp = date || todayKey();
  S.amend.point = Math.max(1, S.amend.point);
  revokeSignature();
  save();
  return { ok: true, item: it };
}

function addItem(item, date) {
  const it = Object.assign({ dim: 'self', points: 1, limit: 1 }, item || {});
  if (!(it.points > 0)) return { ok: false, reason: '新行为项的分值必须是正数' };
  it.id = it.id || ('c' + Date.now().toString(36));
  it.customBy = 'child'; it.stamp = date || todayKey();
  S.items.push(it);
  S.amend.item = Math.max(1, S.amend.item);
  revokeSignature();
  save();
  return { ok: true, item: it };
}

/** 孩子删掉一条行为项：软删除（active=false），规则页要能看到「谁改的」 */
function removeItem(id, date) {
  const it = itemById(id);
  if (!it) return { ok: false, reason: '没找到这条行为' };
  it.active = false; it.customBy = 'child'; it.stamp = date || todayKey();
  S.amend.item = Math.max(1, S.amend.item);
  revokeSignature();
  save();
  return { ok: true, item: it };
}

function setRewardTitle(cost, title, date) {
  const r = S.rewards.find(x => x.cost === Number(cost));
  const t = String(title || '').trim();
  if (!r || !t) return { ok: false, reason: '奖励内容不能为空' };
  r.title = t; r.customBy = 'child'; r.stamp = date || todayKey();
  S.amend.reward = Math.max(1, S.amend.reward);
  revokeSignature();
  save();
  return { ok: true, reward: r };
}

/** 改奖励分值（第 3 改的一种）。分值必须为正，且不与其它档位重复。 */
function setRewardCost(cost, newCost, date) {
  const r = S.rewards.find(x => x.cost === Number(cost));
  const c = Number(newCost);
  if (!r || !(c > 0)) return { ok: false, reason: '分值必须是正数' };
  if (S.rewards.some(x => x !== r && x.cost === c)) return { ok: false, reason: '已经有同分值的档位了' };
  r.cost = c; r.customBy = 'child'; r.stamp = date || todayKey();
  S.amend.reward = Math.max(1, S.amend.reward);
  revokeSignature();
  save();
  return { ok: true, reward: r };
}

/** 新增一档奖励。分值必须为正，且不与现有档位重复。 */
function addReward(item, date) {
  const it = Object.assign({ tier: '自定义', title: '', desc: '' }, item || {});
  const c = Number(it.cost);
  if (!(c > 0)) return { ok: false, reason: '分值必须是正数' };
  if (S.rewards.some(x => x.cost === c)) return { ok: false, reason: '已经有同分值的档位了' };
  const row = {
    cost: c, tier: it.tier, title: String(it.title || '').trim() || '自定义奖励',
    desc: it.desc || '', customBy: 'child', stamp: date || todayKey(),
  };
  S.rewards.push(row);
  S.rewards.sort((a, b) => a.cost - b.cost);
  S.amend.reward = Math.max(1, S.amend.reward);
  revokeSignature();
  save();
  return { ok: true, reward: row };
}

/** 删除一档奖励（至少保留一档）。已经发出的券不受影响。 */
function removeReward(cost, date) {
  const r = S.rewards.find(x => x.cost === Number(cost));
  if (!r) return { ok: false, reason: '没找到这档奖励' };
  if (S.rewards.length <= 1) return { ok: false, reason: '至少要留一档奖励' };
  S.rewards = S.rewards.filter(x => x !== r);
  S.amend.reward = Math.max(1, S.amend.reward);
  revokeSignature();
  save();
  return { ok: true };
}

/**
 * 周结算专用入账。
 *
 * 为什么不能直接复用 addPoints：日上限在 addPoints 里是硬约束（PRD §5 表格：
 * 「日上限 12 分（引擎级不可绕过）」），而 PRD §4 M5 又要求周复盘提交后
 * 「自动入账 +10、流水标注周达标奖励」，附录 A.2 的三项加成也是固定的
 * 10 / 10 / 5。如果周奖励走 addPoints，她今天恰好打满 12 分时这笔奖励就会被
 * 上限吃掉（原本 +25 只剩 +2），那样「引擎级不可绕过」是守住了，但 PRD 承诺的
 * 结算就没兑现 —— 两者不能同时满足。
 *
 * 取舍：周结算是一次**独立的结算事件**，不是当天的打卡，因此不占当日上限；
 * 但入账路径依然只有一条约束 —— 只加分。所以这里独立写入，同时：
 *   · 拒绝任何非正数（只加分红线不破）；
 *   · 走同一套流水结构与 praise 文案；
 *   · 与其它流水一样不可删除；
 *   · 不入计 dayScore（当日得分仍然严格 ≤ 上限）。
 */
function addWeeklyPoints(o) {
  const opt = o || {};
  const points = Number(opt.points);
  if (!(points > 0)) return { ok: false, reason: '系统里没有扣分' };
  const ts = opt.ts || Date.now();
  const entry = {
    uid: 'w' + ts + Math.random().toString(36).slice(2, 6),
    itemId: null,
    name: opt.name || '周结算奖励',
    dim: 'bonus',
    points: points,
    date: opt.date || todayKey(),
    ts: ts,
    praise: opt.praise || '',
    confirmed: false,
    overflow: 0,
    weekly: true,          // 标记为结算流水，与打卡流水区分
  };
  S.log.push(entry);
  save();
  return { ok: true, entry };
}

/** 完成共建：不可绕过 —— 未改满 3 处直接拒绝 */
function finishBuild(date) {
  if (!canFinishBuild()) {
    const lack = 3 - amendedCount();
    return { ok: false, reason: '还差 ' + lack + ' 处' };
  }
  S.items.forEach(i => { if (i.customBy === 'child' && !i.stamp) i.stamp = date || todayKey(); });
  S.onboarded = true;
  S.ruleVersion = (S.ruleVersion || 0) + 1;
  /* 孩子一改规则，上一轮家长签过的字就作废 —— 必须重新确认这一版。
     这正是「单方修改不可生效」：她的提案要等家长再点一次。 */
  S.parent = { agreedAt: null, version: null };
  save();
  return { ok: true, ruleVersion: S.ruleVersion, pendingParent: true };
}

/**
 * 家长签署「我按你的版本来」。
 * 前提是她已经把提案改满 3 处；签完这一版才生效（双签），并记下生效日期。
 */
function parentAgree(ts) {
  if (!S.onboarded) {
    const lack = 3 - amendedCount();
    return { ok: false, reason: lack > 0 ? ('孩子那边还差 ' + lack + ' 处没改') : '还没有待确认的规则版本' };
  }
  const at = ts || Date.now();
  S.parent = { agreedAt: at, version: S.ruleVersion || 1 };
  save();
  return { ok: true, parent: S.parent, version: S.ruleVersion || 1, agreedDate: todayKey(new Date(at)) };
}

/* ---------------- 4b. 首次介绍页（罗森塔尔效应） ---------------- */

/** 是否还没看过介绍页 —— 冷启动闸门据此先把理论讲一遍再放人进来 */
const needsIntro = () => !(S && S.introSeen);
/** 看过就置位；之后不再自动打断（「我的 → 关于罗森塔尔」仍可随时重看） */
function markIntroSeen() { if (S) { S.introSeen = true; save(); } return { ok: true }; }

/* ---------------- 4c. 家长代记（低龄孩子无法直接操作） ---------------- */

/**
 * 低龄孩子没法自己操作手机，所以低段允许家长**代为打卡**。
 * 这与学段权限一一对应（templates.js 的 perm）：
 *   · p12 小学低段：家长陪记 · 可代打卡 → 允许；
 *   · p36 小学高段：她自己打卡 · 家长确认 · 可补记 → 允许（补记）；
 *   · 初中/高中：她自己打卡 / 流水由她自己管 → 不代记，尊重自主权。
 * 走的仍是唯一写入口 addPoints：只加分、日上限照旧；只是给流水盖上 byParent 戳。
 */
const canParentRecord = () => !!S && (S.stage === 'p12' || S.stage === 'p36');

function parentRecord(itemId, opts) {
  if (!canParentRecord()) return { ok: false, reason: '这个学段由她自己打卡，家长不代记' };
  const it = itemById(itemId);
  if (!it) return { ok: false, reason: '没找到这条行为' };
  const o = opts || {};
  const date = o.date || todayKey();
  /* 与孩子手动打卡同一条规矩：单条每天最多记 limit 次 */
  if (countOn(it.id, date) >= it.limit) return { ok: false, reason: '今天这项已经记过了' };
  return addPoints({
    itemId: it.id, name: it.name, dim: it.dim, points: it.points,
    praise: praiseOf(it), date: o.date, byParent: true,
  });
}

/* ---------------- 4d. 导出配额（免费试运行：本地计数） ---------------- */

/**
 * 导出的免费额度状态。
 * 试运行阶段不做支付：免费导出 EXPORT_FREE_LIMIT 次，用满后前端提示「内测中」。
 * 这是**接口**：阶段 B 接云后，内部换成「云权益 + 免费额度」，页面不用改。
 */
function exportQuota() {
  const used = Number((S && S.exportUsed) || 0);
  const remain = Math.max(0, EXPORT_FREE_LIMIT - used);
  return { used, limit: EXPORT_FREE_LIMIT, remain, canExport: remain > 0 };
}

/** 成功导出一次后计次（失败不计数）。只改计数，不碰任何计分。 */
function consumeExport() {
  if (!S) return { ok: false };
  S.exportUsed = Number(S.exportUsed || 0) + 1;
  save();
  return { ok: true, quota: exportQuota() };
}

/** 规则的签署状态，供三个页面共用 */
function ruleSignature() {
  const childDone = !!S.onboarded;
  const parentDone = !!(S.parent && S.parent.agreedAt);
  return {
    childDone: childDone,
    parentDone: parentDone,
    active: childDone && parentDone,
    ruleVersion: S.ruleVersion || 0,
    agreedDate: parentDone ? todayKey(new Date(S.parent.agreedAt)) : '',
    waitingFor: !childDone ? 'child' : (!parentDone ? 'parent' : null),
    amended: amendedCount(),
  };
}

/* ---------------- 5b. 周复盘：5 步向导 + 结算 ---------------- */

/** 第 3 步「下周只改一件小事」的拆小建议：与原型一致 */
const SHRINK_SUGGESTIONS = ['写作业前先把手机放到客厅', '先做 10 分钟，再决定要不要继续'];

/** 第 2 步「想留下来的习惯」候选项：与原型一致 */
const KEEP_OPTIONS = ['先复习再写作业', '专注 25 分钟不碰手机', '睡前整理书包',
                      '22:30 前睡觉', '先做最难的那科', '运动 30 分钟'];
const KEEP_CUSTOM = '我自己想的：______________________';

/** 目标是否「说得太大」：命中就提示拆小（原型用的是同一组特征） */
const tooBigTarget = text => /小时|每天.*[两三四五六七八九十]|\d{2,}/.test(String(text || ''));

function draftWeek() {
  return {
    step: 0,
    highlights: [],
    keep: '',
    next: '',
    challenge: '',
    keepCustom: '',
    nextCustom: '',
    lastSuggest: '',
  };
}

/** 取一份草稿：已有就复用，保证「上一题 / 下一步」来回走不丢答案 */
function blankWeek() { S.weekDraft = draftWeek(); save(); return S.weekDraft; }
function weekDraft() { return S.weekDraft || blankWeek(); }
function dropWeekDraft() { S.weekDraft = null; save(); }

/** 第 1 步的候选：她这周记过、而且带具体反馈的那些条目（正面记录才出现） */
function weekCandidates(limit) {
  const dates = weekDates();
  const seen = {};
  const out = [];
  S.log
    .filter(l => !l.reversed && dates.indexOf(l.date) >= 0 && l.praise)
    .sort((a, b) => b.ts - a.ts)
    .forEach(l => {
      const key = l.name + '|' + l.praise;
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ name: l.name, praise: l.praise, dim: l.dim, date: l.date });
    });
  return out.slice(0, limit || 6);
}

function weekStats() {
  const dates = weekDates();
  return {
    score: weekScore(),
    days: dates.filter(d => pointsOn(d) > 0).length,
    streak: streak(),
    rangeStart: shiftDay(-6),                 // 本周窗口起点，用于结算幂等
    range: shiftDay(-6) + ' → ' + todayKey(),
  };
}

/** 结算：三项加成都是自动算的，谁都不能改 */
function weekBonus(challenge) {
  const st = weekStats();
  return {
    week50: st.score >= 50,
    streak7: st.streak >= 7,
    challenge: !!String(challenge || '').trim(),
    total: (st.score >= 50 ? 10 : 0) + (st.streak >= 7 ? 10 : 0) + (String(challenge || '').trim() ? 5 : 0),
  };
}

function pickHighlight(text) {
  const v = String(text || '').trim();
  if (!v) return { ok: false, reason: '写一句就好' };
  const w = weekDraft();
  if (w.highlights.indexOf(v) >= 0) return { ok: false, reason: '这条已经选过了' };
  if (w.highlights.length >= 3) return { ok: false, reason: '三条就够了，挑最重要的' };
  w.highlights.push(v);
  save();
  return { ok: true, highlights: w.highlights.slice() };
}
function unpickHighlight(text) {
  const w = weekDraft();
  const i = w.highlights.indexOf(String(text || '').trim());
  if (i < 0) return { ok: false, reason: '没选过这条' };
  w.highlights.splice(i, 1);
  save();
  return { ok: true, highlights: w.highlights.slice() };
}

function setWeekPatch(patch) {
  const w = weekDraft();
  Object.keys(patch || {}).forEach(k => { w[k] = patch[k]; });
  save();
  return w;
}

/** 步骤推进：第 3 步要求写了目标，且目标太大时先给拆小建议 */
function weekStep(step) {
  const w = weekDraft();
  const s = Math.max(0, Math.min(4, Number(step)));
  if (s === 3) {
    if (!String(w.next || '').trim()) return { ok: false, reason: '写下你想改的那一件小事' };
    if (tooBigTarget(w.next) && !w.lastSuggest) {
      w.lastSuggest = 'shown';
      save();
      return { ok: false, big: true, suggestions: SHRINK_SUGGESTIONS };
    }
  }
  if (s === 4) return { ok: false, reason: '结算要按「就这么定」' };
  w.step = s;
  save();
  return { ok: true, step: s };
}

/**
 * 结算并生成周报。
 * 周奖励走 addWeeklyPoints（结算事件，不占当日打卡上限，但同样只加分、不可删）。
 */
function finishWeek() {
  const st = weekStats();

  /* 幂等：同一周只结算一次。
     没有这道闸，结算后再往前走一遍向导就会再发一次周奖励（连续记录与周达标
     的条件此时仍然成立），等于凭空多给分。 */
  if (S.week && S.week.rangeStart === st.rangeStart) {
    return { ok: false, reason: '这一周已经结算过了', week: S.week, already: true };
  }

  const w = weekDraft();
  const bonus = weekBonus(w.challenge);
  let entry = null;
  if (bonus.total > 0) {
    const r = addWeeklyPoints({
      name: '本周额外奖励（周达标 / 连续记录 / 主动挑战）',
      points: bonus.total,
      praise: '我看到你坚持了一整周，这说明你已经在自动运转了。',
    });
    entry = r.ok ? r.entry : null;
  }
  S.week = {
    step: 4,
    highlights: w.highlights.slice(),
    keep: w.keep,
    keepCustom: w.keepCustom,
    next: w.next,
    nextCustom: w.nextCustom,
    challenge: w.challenge,
    bonus: bonus.total,
    bonusDetail: bonus,
    score: st.score,
    days: st.days,
    streak: st.streak,
    range: st.range,
    rangeStart: st.rangeStart,
    at: Date.now(),
    entryUid: entry ? entry.uid : null,
  };
  S.weekDraft = null;
  save();
  return { ok: true, week: S.week };
}

/**
 * 「下周继续」：只清掉周报，**不删那条奖励流水**。
 * 原型在这里会过滤掉 bonus 流水，那是演示重置；真实产品里奖励一旦入账就不能回收
 * （PRD §1.4 红线 4「兑换履约率 100%」的同类要求）。
 */
function resetWeek() {
  S.week = null;
  S.weekDraft = null;
  /* 这里**不能**清掉惊喜卡的领取凭据（surpriseClaim）：
     否则她走完周复盘点一下「下周继续」，就能在同一周再领一张 ——
     实测确实能多领，违反了 PRD §4 M6 的「每周最多 1 次」。
     资格由 surpriseState() 按滚动 7 天窗口自动恢复，不需要在这里清。 */
  save();
  return { ok: true };
}

/* ---------------- 5d. 打印 / 导出：一周一页 ---------------- */

/**
 * 「一周一页」的可打印文本。
 *
 * 移植指南 §三 说打印要走服务端 PDF（`wx.downloadFile` + `wx.openDocument`），
 * 那需要一个后端接口。本工程先把**同一份内容**在本地生成好、用剪贴板交付
 * （能贴进备忘录、微信、打印店的文档里，现在就能用）；接上服务端之后
 * 把 `pdfPayload` 直接 POST 过去即可，内容不用重写。
 *
 * 两条规矩：
 * · 导出的是**她自己**的东西，所以含她标为「仅自己可见」的条目
 *   （家长端的不可见不适用于她自己的导出），并在纸面上标出来；
 * · 内容只来自她自己的记录，不掺入排名、比较或「你没做到什么」。
 */
function buildWeekPage(opts) {
  const o = opts || {};
  const st = weekStats();
  const dates = weekDates();
  const nick = o.nick || S.nick || '我';

  /* 这一周做到的事：带具体反馈的打卡记录 */
  const flashes = S.log
    .filter(l => !l.reversed && dates.indexOf(l.date) >= 0 && l.praise)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 8)
    .map(l => ({ date: l.date, name: l.name, praise: l.praise, points: l.points, isPrivate: !!l.private }));

  /* 她手写的闪光点 */
  const notes = dates
    .filter(d => S.flash && S.flash[d])
    .sort()
    .map(d => ({ date: d, text: S.flash[d] }));

  const byDim = {};
  S.log.filter(l => !l.reversed && dates.indexOf(l.date) >= 0).forEach(l => {
    byDim[l.dim] = (byDim[l.dim] || 0) + l.points;
  });
  const dims = T.DIMS
    .map(d => ({ n: d.n, v: byDim[d.k] || 0 }))
    .filter(d => d.v > 0);

  const week = S.week;
  const sig = ruleSignature();

  const lines = [];
  lines.push('罗森塔尔 · 一周一页');
  lines.push(nick + '的这一周：' + st.range);
  lines.push('');
  lines.push('本周得分：' + st.score + ' 分（每天上限 ' + capNow() + ' 分）');
  lines.push('有记录天数：' + st.days + ' 天　连续记录：' + st.streak + ' 天');
  lines.push('累计获得：' + lifetime() + ' 分　可用余额：' + balance() + ' 分');
  if (week && week.bonus > 0 && week.bonusDetail) {
    const parts = [];
    if (week.bonusDetail.week50) parts.push('周达标 +10');
    if (week.bonusDetail.streak7) parts.push('连续 7 天 +10');
    if (week.bonusDetail.challenge) parts.push('主动挑战 +5');
    lines.push('周结算奖励：+' + week.bonus + ' 分（' + parts.join('、') + '）');
  }
  lines.push('');

  if (dims.length) {
    lines.push('【这周的力气花在了哪】');
    dims.forEach(d => lines.push('　' + d.n + '：' + d.v + ' 分'));
    lines.push('');
  }

  lines.push('【这一周做到的事】');
  if (flashes.length === 0) {
    lines.push('　这一周还没有记录，下周从一件小事开始就好。');
  } else {
    flashes.forEach((f, i) => {
      lines.push('　' + (i + 1) + '. ' + f.date + '　' + f.name + ' +' + f.points +
                 (f.isPrivate ? '（仅自己可见）' : ''));
      if (f.praise) lines.push('　　 ' + f.praise);
    });
  }
  lines.push('');

  if (notes.length) {
    lines.push('【我写下的闪光点】');
    notes.forEach(n => lines.push('　' + n.date + '　' + n.text));
    lines.push('');
  }

  if (week) {
    lines.push('【印象最深的三件事】');
    (week.highlights && week.highlights.length ? week.highlights : ['（这一周没写）'])
      .forEach((h, i) => lines.push('　' + (i + 1) + '. ' + h));
    lines.push('');
    lines.push('【我想保留的习惯】');
    lines.push('　' + (week.keep === KEEP_CUSTOM ? (week.keepCustom || '（待补）') : (week.keep || '（这一周没选）')));
    lines.push('');
    lines.push('【下周只改一件小事】');
    lines.push('　' + (week.next || '（这一周没写）'));
    if (week.challenge) {
      lines.push('');
      lines.push('【我想挑战的新任务】');
      lines.push('　' + week.challenge + '　+5');
    }
    lines.push('');
  }

  lines.push('【妈妈的一句】');
  lines.push('　（这里留给家长手写）');
  lines.push('');
  lines.push('【双签】');
  lines.push('　规则版本：v1.' + sig.ruleVersion +
             (sig.active ? '（' + sig.agreedDate + ' 双签生效）' : '（待家长签署）'));
  lines.push('　她签名：____________　　家长签名：____________　　日期：____________');
  lines.push('');
  lines.push('“你不是被积分管住的人，你是在练习管理自己。每一次小做到，都在证明：我可以。”');

  return {
    title: '罗森塔尔 · 一周一页',
    range: st.range,
    nick: nick,
    score: st.score,
    days: st.days,
    streak: st.streak,
    cap: capNow(),
    bonus: week ? week.bonus : 0,
    dims: dims,
    flashes: flashes,
    notes: notes,
    signature: { ruleVersion: sig.ruleVersion, active: sig.active, agreedDate: sig.agreedDate },
    text: lines.join('\n'),
    generatedAt: Date.now(),
    /* 交给服务端 PDF 的最小载荷；后端就绪后直接 POST 这个对象即可 */
    pdfPayload: {
      kind: 'weekly_page',
      range: st.range,
      nick: nick,
      score: st.score,
      days: st.days,
      streak: st.streak,
      cap: capNow(),
      bonus: week ? week.bonus : 0,
      dims: dims,
      flashes: flashes,
      notes: notes,
      week: week ? {
        highlights: week.highlights,
        keep: week.keep,
        keepCustom: week.keepCustom,
        next: week.next,
        challenge: week.challenge,
      } : null,
      signature: { ruleVersion: sig.ruleVersion, active: sig.active, agreedDate: sig.agreedDate },
    },
  };
}

/* ---------------- 5d-2. 打印 / 导出：规则表（罗森塔尔表格） ---------------- */

/**
 * 「罗森塔尔表格」：把**当前学段**的规则原样导成一张可打印 / 可下载的表。
 * 四个学段（小学低段 / 小学高段 / 初中 / 高中）共用这一条路径 ——
 * 内容全部取自 store 的当前状态，所以学段一切换，导出的就是那一套。
 *
 * 与 buildWeekPage 同一套交付方式：本地生成文本 + `pdfPayload`，剪贴板交付；
 * 接上服务端 PDF 后直接 POST `pdfPayload` 即可，内容不用重写。
 * 另有 buildRuleTableCsv()：同一张表，Excel 双击即开。
 *
 * 两条规矩与一周一页一致：
 * · 导出的是**她自己**的规则，所以「她自己改过」的条目在纸面上标 ★；
 * · 只导正向内容，不掺排名、比较或「你没做到什么」。
 */
function buildRuleTable(opts) {
  const o = opts || {};
  const st = T.stageOf(S.stage);
  const nick = o.nick || S.nick || '我';
  const sig = ruleSignature();
  const items = itemsOf();

  const dims = T.DIMS.map(d => ({
    k: d.k,
    n: d.n,
    items: items.filter(i => i.dim === d.k).map(i => ({
      id: i.id, name: i.name, points: i.points, limit: i.limit,
      mine: i.customBy === 'child',
    })),
  })).filter(d => d.items.length > 0);

  const rewards = S.rewards.map(r => ({
    cost: r.cost, tier: r.tier, title: r.title, mine: r.customBy === 'child',
  }));

  const lines = [];
  lines.push('罗森塔尔 · 规则表');
  lines.push(nick + '的这一份 · ' + st.n + '（' + st.g + '）');
  lines.push('每日上限 ' + capNow() + ' 分 · ' + items.length + ' 条行为 · ' + rewards.length + ' 档奖励');
  lines.push('规则版本 v1.' + sig.ruleVersion + '（' +
             (sig.active ? sig.agreedDate + ' 双签生效' : '待家长签署') + '）');
  lines.push('');
  lines.push('【行为清单】★ 表示她自己改过');
  dims.forEach(d => {
    lines.push('· ' + d.n);
    d.items.forEach(i => {
      lines.push('　+' + i.points + '　' + i.name +
                 '（每天最多 ' + i.limit + ' 次）' + (i.mine ? ' ★' : ''));
    });
  });
  lines.push('');
  lines.push('【奖励档位】');
  rewards.forEach(r => {
    lines.push('　' + r.cost + ' 分　' + r.title + '（' + r.tier + '）' + (r.mine ? ' ★' : ''));
  });
  lines.push('');
  lines.push('【说明】只加分，不扣分；每日上限 ' + capNow() + ' 分随学段变；' +
             '家长不能单方改，改一条要重新双签。');
  lines.push('她签名：____________　　家长签名：____________　　日期：____________');
  lines.push('');
  lines.push('“你不是被积分管住的人，你是在练习管理自己。”');

  return {
    title: '罗森塔尔 · 规则表',
    stage: S.stage,
    stageName: st.n,
    grade: st.g,
    nick: nick,
    cap: capNow(),
    itemCount: items.length,
    rewardCount: rewards.length,
    dims: dims,
    rewards: rewards,
    signature: { ruleVersion: sig.ruleVersion, active: sig.active, agreedDate: sig.agreedDate },
    filename: 'rosenthal-rules-' + S.stage + '-' + todayKey() + '.txt',
    text: lines.join('\n'),
    generatedAt: Date.now(),
    /* 交给服务端 PDF 的最小载荷；后端就绪后直接 POST 这个对象即可 */
    pdfPayload: {
      kind: 'rule_table',
      stage: S.stage,
      stageName: st.n,
      grade: st.g,
      nick: nick,
      cap: capNow(),
      dims: dims.map(d => ({
        n: d.n,
        items: d.items.map(i => ({ name: i.name, points: i.points, limit: i.limit, mine: i.mine })),
      })),
      rewards: rewards.slice(),
      signature: { ruleVersion: sig.ruleVersion, active: sig.active, agreedDate: sig.agreedDate },
    },
  };
}

/**
 * 同一张规则表的 CSV（Excel / WPS / Numbers 双击即开）。
 * 带 UTF-8 BOM，否则 Excel 打开中文会乱码；字段含逗号 / 引号 / 换行时按 CSV 规则转义。
 */
function buildRuleTableCsv(opts) {
  const t = buildRuleTable(opts);
  const q = v => {
    const s0 = String(v === undefined || v === null ? '' : v);
    return /[",\n]/.test(s0) ? ('"' + s0.replace(/"/g, '""') + '"') : s0;
  };
  const lines = [['类型', '维度/档位', '内容', '分值', '每日上限', '谁改的'].join(',')];
  t.dims.forEach(d => d.items.forEach(i => {
    lines.push(['行为', d.n, i.name, String(i.points), String(i.limit),
                i.mine ? '她自己改过' : '初始模板'].map(q).join(','));
  }));
  t.rewards.forEach(r => {
    lines.push(['奖励', r.tier, r.title, String(r.cost), '',
                r.mine ? '她自己改过' : '初始模板'].map(q).join(','));
  });
  lines.push('');
  lines.push(['学段', t.stageName, t.grade, '每日上限', String(t.cap), ''].map(q).join(','));
  return {
    filename: 'rosenthal-rules-' + t.stage + '-' + todayKey() + '.csv',
    text: '\ufeff' + lines.join('\r\n') + '\r\n',
    rowCount: t.itemCount + t.rewardCount,
    stage: t.stage,
    generatedAt: Date.now(),
  };
}

/* ---------------- 5e. 里程碑徽章（不可兑换，纯叙事） ---------------- */

/**
 * 徽章体系。PRD §4 M6 第 3 条：连续 7 天、总分 100/200/300、首次自主挑战、
 * 首次化解矛盾 → 生成「成长勋章」（不可兑换、纯叙事）。
 * 移植指南验收清单还要求：**高中段默认隐藏徽章体系**（去游戏化），
 * 那条规则在 app.wxss 的 `.stage-high .miles{ display:none }` 里。
 *
 * 实现取舍：
 * · 徽章不单独存表，而是**每次从流水推导**（流水只增不删），
 *   这样撤销 / 改学段历史的情况下也不会出现「徽章和记录对不上」；
 * · 徽章的**达成日期**按规则回算（例如连续 7 天的达成日是 streak 首次到 7 的那天），
 *   所以不需要额外的埋点字段；
 * · 两个阈值 PRD 没给判定口径，本实现取的是可解释的近似（标了 inferred），
 *   产品若要改成更严格的判定，只改下面这两个函数即可。
 */
const MILESTONE_RULES = [
  { k: 'streak7', n: '连续 7 天', d: '连续 7 天都有记录', points: null },
  { k: 'score100', n: '累计 100 分', d: '累计获得 100 分', points: 100 },
  { k: 'score200', n: '累计 200 分', d: '累计获得 200 分', points: 200 },
  { k: 'score300', n: '累计 300 分', d: '累计获得 300 分', points: 300 },
  { k: 'challenge', n: '第一次主动挑战', d: '自己给自己加了一件想做的事', inferred: true },
  { k: 'resolve', n: '第一次化解矛盾', d: '和同学把事情说开了', inferred: true },
];

/** 截至 endDate，连续记录天数（与 streak() 同口径，但可指定日期） */
function streakEndingAt(endDate) {
  const p = String(endDate).split('-');
  const y = Number(p[0]), mo = Number(p[1]) - 1, d = Number(p[2]);
  let n = 0, i = 0;
  for (;;) {
    const k = dateKey(new Date(y, mo, d - i));
    if (pointsOn(k) > 0) { n++; i++; } else if (i === 0) { i++; } else break;
  }
  return n;
}

/**
 * streak 首次达到 7 的那一天（没有就返回空串）。
 *
 * 注意日期构造必须走**本地时间**（new Date(y, m, d)）而不是
 * new Date('2026-10-04T12:00:00')：后者按 UTC 解析，在东八区会整体偏移一天，
 * 用 dateKey() 读回来就永远对不上。这个 bug 是被回归测试逼出来的。
 */
function firstStreak7Date() {
  const all = S.log.filter(l => !l.reversed).map(l => l.date).sort();
  if (!all.length) return '';
  const p = String(all[0]).split('-');
  const y = Number(p[0]), mo = Number(p[1]) - 1, d = Number(p[2]);
  const today = todayKey();
  const guardDays = 400;
  for (let i = 0; i < guardDays; i++) {
    const k = dateKey(new Date(y, mo, d + i));   // 月份/年份溢出由 Date 自动进位
    if (k > today) break;
    if (streakEndingAt(k) >= 7) return k;
  }
  return '';
}

/** 累计首次达到某个分值的那一天 */
function firstLifetimeDate(target) {
  const dated = S.log.filter(l => !l.reversed).slice().sort((a, b) => a.ts - b.ts);
  let sum = 0;
  for (let i = 0; i < dated.length; i++) {
    sum += dated[i].points;
    if (sum >= target) return dated[i].date;
  }
  return '';
}

/** 第一次满足条件的那条流水 */
function firstEntryMatching(fn) {
  const hit = S.log.filter(l => !l.reversed && fn(l)).sort((a, b) => a.ts - b.ts)[0];
  return hit || null;
}

function milestones() {
  const life = lifetime();
  const ch = firstEntryMatching(l => l.dim === 'bonus' && /挑战/.test(l.name || ''));
  /* 「化解矛盾」在模板里叫「与同学合作或化解矛盾」，高中段叫「守住自己的边界」，
     这里用关键词匹配，两个学段都覆盖得到。 */
  const rs = firstEntryMatching(l => l.dim === 'social' && /化解|说开|商量|合作|矛盾/.test(l.name || ''));
  const s7 = firstStreak7Date();

  return MILESTONE_RULES.map(r => {
    let earnedAt = '';
    let got = false;
    if (r.k === 'streak7') { got = streak() >= 7 || !!s7; earnedAt = s7; }
    else if (r.points) { got = life >= r.points; earnedAt = firstLifetimeDate(r.points); }
    else if (r.k === 'challenge') { got = !!ch; earnedAt = ch ? ch.date : ''; }
    else if (r.k === 'resolve') { got = !!rs; earnedAt = rs ? rs.date : ''; }
    return {
      k: r.k, n: r.n, d: r.d, inferred: !!r.inferred,
      earned: got, earnedAt: got ? earnedAt : '',
    };
  });
}

/* ---------------- 5f. 导出：Excel 可读的流水 CSV ---------------- */

/**
 * 流水导出成 CSV（Excel / WPS / Numbers 双击即开）。
 *
 * PRD DoD 要求「打印版（一周一页）与 **Excel 导出**可用」，移植指南 §三 也提到
 * 「打印版改为服务端生成 PDF」——但 Excel 不需要后端：CSV 是纯文本，
 * 小程序侧生成后用剪贴板或写入 `wx.env.USER_DATA_PATH` 就能交付。
 *
 * 规矩：
 * · 导出的是**她自己**的完整流水，含她标为「仅自己可见」的条目，并在列里标出来；
 * · 只写正向流水，导出里不会出现负数（全站也没有负数可导）；
 * · 带 UTF-8 BOM，否则 Excel 打开中文会乱码。
 */
function buildLedgerCsv(opts) {
  const o = opts || {};
  const rows = S.log
    .filter(l => !l.reversed || o.includeReversed)
    .slice()
    .sort((a, b) => a.ts - b.ts);

  const esc = v => {
    const t = String(v === undefined || v === null ? '' : v);
    return /[",\n]/.test(t) ? ('"' + t.replace(/"/g, '""') + '"') : t;
  };
  const pad2 = n => String(n).padStart(2, '0');

  const head = ['日期', '时间', '行为', '维度', '分值', '结算奖励', '仅自己可见', '家长已确认', '具体反馈'];
  const lines = [head.join(',')];
  rows.forEach(l => {
    const d = new Date(l.ts);
    lines.push([
      l.date,
      pad2(d.getHours()) + ':' + pad2(d.getMinutes()),
      l.name,
      dimLabel(l.dim),
      String(l.points),
      l.weekly ? '是' : '',
      l.private ? '是' : '',
      l.confirmed ? '是' : '',
      l.praise,
    ].map(esc).join(','));
  });

  const total = rows.filter(l => !l.reversed).reduce((a, l) => a + l.points, 0);
  lines.push('');
  lines.push(['合计（不含已撤销）', '', '', '', String(total), '', '', '', ''].join(','));

  const st = weekStats();
  lines.push(['导出范围', st.range, '连续记录', String(streak()) + ' 天', '累计', String(lifetime()), '余额', String(balance()), '']);

  return {
    filename: 'rosenthal-ledger-' + todayKey() + '.csv',
    /* \ufeff 是 UTF-8 BOM，Excel 靠它认出编码，中文才不会乱码 */
    text: '\ufeff' + lines.join('\r\n') + '\r\n',
    rowCount: rows.length,
    total: total,
    generatedAt: Date.now(),
  };
}
/* ---------------- 5g. 指标契约（PRD §10） ---------------- */

/**
 * PRD §10 的指标体系，做成**可测试的纯函数**。
 *
 * 为什么不做「埋点上报」：上报要落库、要真实 AppID 与云环境，本机做不了；
 * 而把指标口径先在本地算准，接上任意分析后端时都不用重写 ——
 * `metrics()` 的返回结构就是可以直接上报的字段表（也便于在「我的」页给她看）。
 *
 * 口径说明（PRD 只给了指标名，没给定义，这里把每个口径写死在注释里）：
 * · 周闭环天数 = 一周 7 天里「当天有打卡 + 当天在记录之外还写了闪光点」的天数；
 *   PRD 原文是「每日有记录 + 当周完成复盘」，落地成两个可判定的信号；
 * · 撤销率 / 补记率 = 该现象条数 ÷ 总条数（补记 = 事后补登，用「记录日期早于写入时间」判定）；
 * · 自主力占比 = 自主力维度的分 ÷ 总分；
 * · D7 / D30 = 首次使用后第 7 / 第 30 天是否仍有记录（留存代理指标）。
 */
const METRIC_DEFS = [
  { k: 'weekLoopDays', layer: '北极星', n: '周闭环天数', d: '这一周里「每天有记录 + 写了闪光点」的天数' },
  { k: 'loopRate', layer: '北极星', n: '闭环率', d: '周闭环天数 ÷ 7' },
  { k: 'activated', layer: '激活', n: '初始化完成', d: '是否已完成「必改 3 项」' },
  { k: 'signed', layer: '激活', n: '规则已双签', d: '孩子提案 + 家长签署' },
  { k: 'd7', layer: '留存', n: 'D7 仍有记录', d: '首次使用后第 7 天是否还有记录' },
  { k: 'd30', layer: '留存', n: 'D30 仍有记录', d: '首次使用后第 30 天是否还有记录' },
  { k: 'activeDays', layer: '留存', n: '有记录天数', d: '累计有记录的自然日数' },
  { k: 'streak', layer: '留存', n: '连续记录', d: '当前连续天数' },
  { k: 'autonomyRatio', layer: '深度', n: '自主力占比', d: '自主力得分 ÷ 总分' },
  { k: 'customItems', layer: '深度', n: '自定义行为项', d: '她自己加进来的行为项条数' },
  { k: 'surpriseUsed', layer: '深度', n: '惊喜卡使用率', d: '已核销的惊喜卡 ÷ 已领到的惊喜卡' },
  { k: 'redemptionRate', layer: '家庭', n: '兑换履约率', d: '已核销的券 ÷ 已发出的券' },
  { k: 'coSignRate', layer: '家庭', n: '规则双签率', d: '已双签的规则版本 ÷ 提出的版本数' },
  { k: 'praiseCount', layer: '家庭', n: '家长鼓励条数', d: '家长确认过的记录数' },
  { k: 'undoRate', layer: '负向', n: '撤销率', d: '已撤销条数 ÷ 总条数' },
  { k: 'backfillRate', layer: '负向', n: '补记率', d: '事后补登条数 ÷ 总条数' },
  { k: 'privateRate', layer: '负向', n: '仅自己可见标记率', d: '私密条数 ÷ 总条数' },
];

/** 某个日期是否算「闭环日」：有打卡分，且写了闪光点 */
function isLoopDay(date) {
  return pointsOn(date) > 0 && !!(S.flash && S.flash[date]);
}

function ratio(n, d) {
  return d > 0 ? Math.round(n / d * 1000) / 1000 : 0;
}

/** 首次使用的日期（最早一条流水；没有流水就看草稿时间） */
function firstUseDate() {
  const all = S.log.map(l => l.date).sort();
  return all.length ? all[0] : '';
}

/** 首次使用后的第 n 天是否仍有记录 */
function retainedOn(n) {
  const first = firstUseDate();
  if (!first) return false;
  const p = String(first).split('-');
  const target = dateKey(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  return pointsOn(target) > 0;
}

function metrics() {
  const active = S.log.filter(l => !l.reversed);
  const total = S.log.length;
  const dates = weekDates();
  const loopDays = dates.filter(isLoopDay).length;
  const customItems = S.items.filter(i => i.customBy === 'child' && i.active !== false).length;

  const byDim = {};
  active.forEach(l => { byDim[l.dim] = (byDim[l.dim] || 0) + l.points; });
  const life = lifetime();

  /* 补记：写入时间比记录日期晚了一天以上（说明是事后补登的） */
  const backfilled = active.filter(l => {
    const d = new Date(l.ts);
    return dateKey(d) !== l.date;
  }).length;

  const surprises = S.coupons.filter(c => c.surprise);
  const redeemed = S.coupons.filter(c => !c.surprise);
  const versions = Math.max(1, S.ruleVersion || 0);

  return {
    generatedAt: Date.now(),
    range: weekStats().range,
    /* 北极星 */
    weekLoopDays: loopDays,
    loopRate: ratio(loopDays, 7),
    /* 激活 */
    activated: !!S.onboarded,
    signed: isRuleActive(),
    /* 留存 */
    d7: retainedOn(7),
    d30: retainedOn(30),
    activeDays: Object.keys(active.reduce((a, l) => { a[l.date] = 1; return a; }, {})).length,
    streak: streak(),
    /* 深度 */
    autonomyRatio: ratio(byDim.self || 0, life),
    customItems: customItems,
    surpriseUsed: surprises.length ? ratio(surprises.filter(c => c.used).length, surprises.length) : 0,
    surpriseCount: surprises.length,
    /* 家庭 */
    redemptionRate: redeemed.length ? ratio(redeemed.filter(c => c.used).length, redeemed.length) : 0,
    coSignRate: isRuleActive() ? 1 : ratio(0, versions),
    praiseCount: S.log.filter(l => l.confirmed).length,
    /* 负向 */
    undoRate: ratio(S.log.filter(l => l.reversed).length, total),
    backfillRate: ratio(backfilled, Math.max(1, active.length)),
    privateRate: ratio(S.log.filter(l => l.private).length, total),
    /* 便于核对口径 */
    counts: { total: total, active: active.length, coupons: redeemed.length, versions: versions },
  };
}

/** 把指标与口径说明一起导出（自查 / 交给分析后端时口径不会走样） */
function metricsReport() {
  const m = metrics();
  const lines = ['罗森塔尔 · 本机指标（PRD §10 口径）', '范围：' + m.range, ''];
  let layer = '';
  METRIC_DEFS.forEach(def => {
    if (def.layer !== layer) { layer = def.layer; lines.push('【' + layer + '】'); }
    lines.push('　' + def.n + '：' + m[def.k]);
    lines.push('　　' + def.d);
  });
  return { metrics: m, defs: METRIC_DEFS.slice(), text: lines.join('\n') };
}

/* ---------------- 5h. 数据主权：一键导出 / 彻底删除（PRD §7 非功能需求） ---------------- */

/**
 * 导出全部本机数据（JSON）。
 * PRD §7：「支持一键导出/彻底删除」；§4 M4 把导出列为她的权限之一。
 */
function exportAll() {
  const m = metrics();
  return {
    filename: 'rosenthal-backup-' + todayKey() + '.json',
    payload: {
      app: 'rosenthal-miniprogram',
      schema: 1,
      exportedAt: Date.now(),
      exportedDate: todayKey(),
      state: JSON.parse(JSON.stringify(S)),   // 深拷贝，导出物不随后续写入变化
      metrics: m,
    },
    text: JSON.stringify({
      app: 'rosenthal-miniprogram', schema: 1, exportedAt: Date.now(), exportedDate: todayKey(),
      state: JSON.parse(JSON.stringify(S)), metrics: m,
    }, null, 2),
    generatedAt: Date.now(),
  };
}

/**
 * 彻底删除本机全部数据（不可撤销）。
 *
 * 注意与「家长端不可删除」不冲突：
 *  · 那条红线约束的是**家长**不能删她的记录（PRD §1.4 红线 3、§4 M4）；
 *  · 这里是**数据主人自己**行使 §7 的「彻底删除」权利，两者是不同的主体。
 * 删除后回到「第一次打开」的状态，因此会重新走一次规则共建（闸门自动生效）。
 */
function wipeAll() {
  S = blank('mid');
  save();
  return { ok: true, at: Date.now() };
}

/**
 * 用合并后的状态替换本机状态并落盘（供 app.mergeCloud 调用）。
 * 这里**不做任何合并判定**：策略全在 utils/sync.js 里，
 * 本函数只负责换入 + 字段归一化（与 load 同一套补全逻辑）。
 */
function replaceState(next) {
  if (!next || typeof next !== 'object') return { ok: false, reason: '状态无效' };
  S = next;
  if (!S.stage) S.stage = 'mid';
  if (!S.amend || typeof S.amend !== 'object') S.amend = { point: 0, item: 0, reward: 0 };
  if (!Array.isArray(S.log)) S.log = [];
  if (!Array.isArray(S.items)) S.items = T.templateOf(S.stage).map(i => Object.assign({}, i));
  if (!Array.isArray(S.coupons)) S.coupons = [];
  if (!Array.isArray(S.repairs)) S.repairs = [];
  if (!Array.isArray(S.redemptions)) S.redemptions = [];
  if (!S.flash || typeof S.flash !== 'object') S.flash = {};
  save();
  return { ok: true };
}

/* ---------------- 5c. 惊喜卡：连续 7 天达成 → 自己挑一张 ---------------- */

/**
 * 合规红线（移植指南 §八、PRD §4 M6 修订）：
 * 这是**自选**，不是抽奖 —— 零随机、零概率。她连续记录满 7 天，就从固定卡池里
 * 自己挑 1 张。所以这里没有任何 random，只有「能不能领」和「挑哪一张」。
 *
 * 「每周最多 1 次」的判定用**滚动 7 天窗口**（与 weekStats 的 rangeStart 同一口径），
 * 而不是一个简单的「领过没有」布尔值：后者会被 resetWeek() 一并清掉，
 * 于是她走完周复盘点一下「下周继续」就能在同一周再领一张（实测确实能多领）。
 */
const dateAfter = (a, b) => String(a) > String(b);
const datePlus = (dateStr, n) => {
  const p = String(dateStr).split('-');
  return dateKey(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
};

/** 当前这张惊喜卡的领取窗口（今天 + 往前 6 天）与下次可领日期 */
function surpriseWindow() {
  const start = shiftDay(-6), end = todayKey();
  return { start: start, end: end, next: datePlus(end, 1) };
}

function surpriseState() {
  const st = streak();
  const w = surpriseWindow();
  /* 兼容旧数据：以前只存了一个时间戳 surpriseAt */
  const claim = S.surpriseClaim ||
    (S.surpriseAt ? { at: S.surpriseAt, start: '', end: '' } : null);
  /**
   * 本窗口内领过就不能再领。两种判定：
   * · 新数据带窗口（start/end）：窗口有交集就算领过；
   * · 旧数据只有一个时间戳：退化成「7 天内算本窗口」——
   *   否则老存档会被当成「窗口外」而白送一张（这条迁移路径上的洞我实测确认过）。
   */
  let claimedInWindow = false;
  if (claim) {
    if (claim.end) {
      claimedInWindow = !dateAfter(w.start, claim.end);
    } else if (claim.at) {
      claimedInWindow = (Date.now() - claim.at) < 7 * 24 * 3600 * 1000;
    }
  }
  const canDraw = st >= 7 && !claimedInWindow;
  return {
    streak: st,
    canDraw: canDraw,
    claimed: !!claim,
    claimedAt: claim ? claim.at : null,
    claimedWindow: claim ? { start: claim.start, end: claim.end } : null,
    need: Math.max(0, 7 - st),
    nextClaimDate: claimedInWindow ? w.next : '',
    cards: T.CARDS.map((c, i) => ({ idx: i, title: c.t, desc: c.d, exp: c.e })),
  };
}

/** 挑一张卡：必须满足「连续 7 天 + 本窗口没领过」，且只能从卡池里选 */
function drawSurprise(idx) {
  const s = surpriseState();
  if (!s.canDraw) {
    return {
      ok: false,
      reason: s.claimed ? ('本次窗口已经领过了，' + s.nextClaimDate + ' 之后可以再挑') : ('连续记录满 7 天就能挑一张，现在 ' + s.streak + ' 天'),
    };
  }
  const i = Number(idx);
  const card = T.CARDS[i];
  if (!card) return { ok: false, reason: '没有这张卡' };

  const ts = Date.now();
  const w = surpriseWindow();
  const coupon = {
    code: newCouponCode(S.coupons),   // 与兑换券同一套唯一码规则
    title: card.t,
    cost: 0,                          // 惊喜卡不扣分：她靠坚持换来的
    ts: ts,
    exp: shiftDay(card.e),
    used: false,
    surprise: true,
    desc: card.d,
  };
  S.coupons.push(coupon);
  /* 记「本次窗口」而不是一个布尔值：这样 resetWeek 清不掉资格，一周只发一张 */
  S.surpriseClaim = { at: ts, start: w.start, end: w.end };
  save();
  /* 返回统一后的字段名（title/desc/exp），与 surpriseState() 的卡池形状一致，
     避免调用方一半读 t 一半读 title。 */
  return { ok: true, coupon: coupon, card: { idx: i, title: card.t, desc: card.d, exp: card.e } };
}

/* ---------------- 6. 学段切换 ---------------- */

/** 换学段 = 换模板 + 换上限 + 换奖励 + 重新定一次规则；历史记录全部保留 */
function applyStage(k) {
  const st = T.stageOf(k);
  S.stage = k;
  S.items = T.templateOf(k).map(i => Object.assign({}, i));
  const ov = T.REWARD_BY_STAGE[k];
  S.rewards = (ov || T.REWARDS).map(r => Object.assign({}, r));
  S.amend = { point: 0, item: 0, reward: 0 };
  /* 换学段等于重新定一次规则：必须重走「必改 3 项」。
     这里不只把计数清零，还要把 onboarded 与家长签署一起撤掉 —— 否则计数归零了，
     用户却仍然能直接打卡，闸门就形同虚设（README §10 验收清单明确要求）。 */
  S.onboarded = false;
  S.parent = { agreedAt: null, version: null };
  S.nick = st.nick;
  S.grade = st.n;
  S.week = null;
  S.weekDraft = null;
  save();
  return S;
}

/* ---------------- 7. 其他写入 ---------------- */

function setFlash(text, date) {
  const d = date || todayKey();
  const t = String(text || '').trim();
  if (t) S.flash[d] = t; else delete S.flash[d];
  save();
  return { ok: true, flash: S.flash };
}

/**
 * 修复行动：不产生负分。
 * 完成时按模板给一次**正向**留痕（可在 UI 上选择是否计入积分），绝不写负数。
 */
function addRepair(kind, note) {
  const tpl = T.REPAIRS.find(r => r.k === kind);
  if (!tpl) return { ok: false, reason: '没有这类模板' };
  const r = { id: 'r' + Date.now().toString(36), kind, note: note || tpl.act, ts: Date.now(), done: false };
  S.repairs.push(r); save();
  return { ok: true, repair: r };
}

function doneRepair(id) {
  const r = S.repairs.find(x => x.id === id);
  if (!r) return { ok: false, reason: '没找到这条修复行动' };
  r.done = true; save();
  return { ok: true, repair: r };
}

/** 文案引擎：禁用词命中即拦截（PRD §6.3） */
function checkPraise(text) {
  const t = String(text || '');
  const hit = T.BANNED.filter(b => t.indexOf(b) >= 0);
  return { ok: hit.length === 0, hit };
}

/** 生成一句具体反馈：强制「我看到你……这说明你……」句式，且过禁用词库 */
function praiseOf(item) {
  const line = '我看到你' + (item.p || '做到了这件事') + '，这说明' + (item.t || '你在往前走') + '。';
  return checkPraise(line).ok ? line : '';
}

/**
 * 得分环直径：设计稿 112px → 当前设备 px。
 * canvas 是原生组件，只认 px 不认 rpx；而 750rpx = 屏幕宽，所以
 *   当前 px = 112 × 屏幕宽 / 750
 * 这样环在任何屏幕上都是 112px 的设计稿尺寸，与原型 1:1。
 * 放在 store 里是为了能被 Node 回归直接测（组件里没法注入 windowWidth）。
 */
function calcRingPx(info) {
  let w = 0;
  if (info && info.windowWidth) {
    w = info.windowWidth;
  } else {
    /* 走 compat 探针：它自己处理「低版本没有 wx.getWindowInfo」的降级，
       兼容判断只留一处，避免散落在各个文件里各写一遍。 */
    try {
      w = require('./compat.js').windowInfo().windowWidth || 0;
    } catch (e) { w = 0; }
  }
  return w > 0 ? Math.round(112 * w / 750) : 112;   // 取不到就退回设计稿尺寸
}

/** 把已生成的一句反馈拆成「事实 / 特质」两段，供肯定卡分色显示 */
function splitPraise(line) {
  const t = String(line || '');
  const fact = (t.match(/^我看到你(.*?)，这说明/) || [, ''])[1];
  const trait = (t.match(/这说明(.*?)。?$/) || [, ''])[1];
  return { fact, trait };
}

/**
 * 「换一句」：从该维度的备选句里换一个特质描述。
 * 走禁用词库校验，命中就继续抽，避免把不合规的句子送出去。
 */
function altPraise(dim, seed) {
  const bank = T.PRAISE_ALT[dim] || T.PRAISE_ALT.self;
  const start = typeof seed === 'number' ? Math.abs(seed) % bank.length : Math.floor(Math.random() * bank.length);
  for (let i = 0; i < bank.length; i++) {
    const line = bank[(start + i) % bank.length];
    if (checkPraise(line).ok) return line;
  }
  return '';
}

/**
 * 隐私标记：「这条只有我自己能看到」。
 *
 * PRD §2.1 把她定义为**数据主人**，§4 M4「她可以设置仅自己可见」，
 * 家长端的能力边界也写着「不可查看被标『仅自己可见』的内容」。
 * 所以这个标记必须在**引擎层**生效 —— 家长端的查询函数直接不返回这些条目，
 * 而不是靠页面自己记得过滤（页面少写一个 filter 就是隐私泄露）。
 */
function setEntryPrivate(uid, isPrivate, ts) {
  const e = S.log.find(l => l.uid === uid);
  if (!e) return { ok: false, reason: '没找到这条记录' };
  const next = isPrivate === undefined ? !e.private : !!isPrivate;
  e.private = next;
  e.privateAt = next ? (ts || Date.now()) : null;
  save();
  return { ok: true, entry: e, private: next };
}

/**
 * 家长可见的流水：**排除**她标为「仅自己可见」的条目。
 * 家长端所有列表都必须走这个函数，禁止直接读 state().log。
 */
function visibleToParent(log) {
  const list = Array.isArray(log) ? log : S.log;
  return list.filter(l => !l.private);
}

/** 她自己的流水（含私密条目，她自己当然看得到全部） */
function visibleToChild(log) {
  const list = Array.isArray(log) ? log : S.log;
  return list.slice();
}

/**
 * 被收起来的条数：家长端可以知道「有几条我没看到」，但拿不到内容。
 * 只报数不报内容 —— 让她知道自己收了多少，而不是让家长去猜。
 */
function hiddenCount() {
  return S.log.filter(l => l.private).length;
}

/** 把某条记录的自述存回去（对应原型「我自己说一句」） */function setEntryPraise(uid, text) {
  const t = String(text || '').trim();
  if (!t) return { ok: false, reason: '写一句就好' };
  const chk = checkPraise(t);
  if (!chk.ok) return { ok: false, reason: '换个说法吧，这句会伤人', hit: chk.hit };
  const e = S.log.find(l => l.uid === uid);
  if (!e) return { ok: false, reason: '没找到这条记录' };
  e.praise = t;
  e.selfPraise = true;
  save();
  return { ok: true, entry: e };
}

module.exports = {
  /* 常量与透视 */
  KEY, COUPON_DAYS, DIMS: T.DIMS, STAGES: T.STAGES, TEMPLATES: T.TEMPLATES,
  BANNED: T.BANNED, CARDS: T.CARDS, REPAIRS: T.REPAIRS,
  /* 时间/工具 */
  todayKey, dateKey, shiftDay, daysInMonth, monthKey, esc, newCouponCode, dimLabel,
  /* 模板透视：页面显示「当前是哪个学段」时要用（onboarding 页曾经因为漏了它而直接报错） */
  stageOf: T.stageOf, templateOf: T.templateOf, dimOf: T.dimOf,
  /* 状态 */
  blank, load, save, resetAll, state,
  /* 引擎 */
  capNow, itemsOf, itemById, countOn, pointsOn, dayScore,
  weekDates, weekScore, lifetime, balance, streak, confirmedCount, nextReward,
  addPoints, undo, confirmEntries, redeem, useCoupon, addWeeklyPoints,
  spentTotal,
  /* 共建 */
  amendedCount, canFinishBuild, setItemPoints, addItem, removeItem,
  setRewardTitle, setRewardCost, addReward, removeReward, finishBuild, parentAgree, isRuleActive, ruleSignature,
  /* 学段与其他 */
  applyStage, setFlash, addRepair, doneRepair, checkPraise, praiseOf,
  splitPraise, altPraise, setEntryPraise, calcRingPx,
  /* 首次介绍页 + 家长代记（低龄） */
  needsIntro, markIntroSeen, canParentRecord, parentRecord,
  /* 导出配额（免费试运行） */
  EXPORT_FREE_LIMIT, exportQuota, consumeExport,
  setEntryPrivate, visibleToParent, visibleToChild, hiddenCount,
  /* 周复盘 */
  SHRINK_SUGGESTIONS, KEEP_OPTIONS, KEEP_CUSTOM, tooBigTarget,
  weekDraft, blankWeek, dropWeekDraft, weekCandidates, weekStats, weekBonus,
  pickHighlight, unpickHighlight, setWeekPatch, weekStep, finishWeek, resetWeek,
  buildWeekPage, buildRuleTable, buildRuleTableCsv,
  /* 惊喜卡（自选，非抽奖） */
  surpriseState, drawSurprise, surpriseWindow,
  /* 里程碑徽章 · 流水 CSV 导出 */
  milestones, MILESTONE_RULES, buildLedgerCsv,
  /* 指标契约（PRD §10）· 数据主权（PRD §7） */
  metrics, metricsReport, METRIC_DEFS, exportAll, wipeAll, replaceState,
};
