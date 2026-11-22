/* ============================================================
   罗森塔尔 Rosenthal · cloud/adapter.js
   云数据库适配器：把本地状态与云集合对上号。

   设计原则（PRD §9「本地优先 + 可选云同步」）：
   · **本地是事实来源**，云是可选的共享通道；没配云环境时一切照旧在本地跑；
   · 适配器只做「结构映射 + 调用 authz 预检」，不自己发明权限；
   · 没有 `wx.cloud` 时自动降级为 `available: false`，调用方据此显示「未连接云环境」。

   真实接入需要的三样东西（本机都没有）：
   1. 真实小程序 AppID 与云开发环境 ID；
   2. 在控制台按 cloud/database.rules.json 配好安全规则；
   3. 建好 cloud/schema.js 里声明的 13 个集合。
   ============================================================ */
'use strict';

const { COLLECTIONS, COLLECTION_NAMES } = require('./schema.js');
const authz = require('./authz.js');

/** 云环境是否可用（本机 Node 里永远是 false，走本地兜底） */
function available() {
  return typeof wx !== 'undefined' && !!wx && !!wx.cloud && typeof wx.cloud.database === 'function';
}

function envInfo() {
  if (!available()) {
    return { available: false, reason: '未检测到 wx.cloud：需要用真实 AppID 在开发者工具里开通云开发' };
  }
  let env = '';
  try {
    const db = wx.cloud.database();
    env = (db && db.config && db.config.env) || '';
  } catch (e) { env = ''; }
  return { available: true, env: env };
}

/**
 * 把本地 check_in 形状的流水映射成云集合文档。
 * 本地是 `{ uid, date, points, private, weekly }`，云侧按 PRD §8 用
 * `is_private` / `is_backfill` 等字段名 —— 这层映射就是适配器的价值所在，
 * 避免两套命名在代码里到处混用。
 */
function toCheckIn(entry, ctx) {
  const c = ctx || {};
  return {
    user_id: c.userId || '',
    family_id: c.familyId || '',
    item_id: entry.itemId || '',
    date: entry.date,
    points: entry.points,
    note: entry.name || '',
    evidence: '',
    is_backfill: !!c.isBackfill,
    is_private: !!entry.private,
    created_at: entry.ts,
  };
}

function toLedger(entry, ctx) {
  const c = ctx || {};
  return {
    user_id: c.userId || '',
    family_id: c.familyId || '',
    delta: entry.points,
    reason: entry.name || '',
    ref_type: entry.weekly ? 'weekly_bonus' : 'check_in',
    ref_id: entry.itemId || entry.uid,
    created_at: entry.ts,
    reversed_by: entry.reversed ? (c.reversedBy || '') : '',
  };
}

function toRedemption(coupon, ctx) {
  const c = ctx || {};
  return {
    user_id: c.userId || '',
    family_id: c.familyId || '',
    reward_id: c.rewardId || '',
    cost: coupon.cost,
    status: coupon.used ? 'used' : 'issued',
    coupon_code: coupon.code,
    expires_at: coupon.exp,
    provided_at: coupon.used ? (c.providedAt || Date.now()) : null,
  };
}

/** 本地 rule_version 的形状（对应 PRD §8 与 store.ruleSignature） */
function toRuleVersion(sig, ctx) {
  const c = ctx || {};
  return {
    family_id: c.familyId || '',
    version: sig.ruleVersion,
    snapshot_json: c.snapshot || {},
    changes: c.changes || [],
    signed_by_child_at: sig.childDone ? (c.childSignedAt || null) : null,
    signed_by_parent_at: sig.parentDone ? (c.parentSignedAt || null) : null,
    /* 生效时间只在双签齐了之后才写 —— 与 authz 的 effectiveNeedsBothSigns 一致 */
    effective_at: sig.active ? (c.effectiveAt || Date.now()) : null,
  };
}

/**
 * 写入前的本地预检：用 authz 判一次，避免「本地写成功、云上被拒」的不一致。
 * @returns {{allow:boolean, reason?:string, doc?:object}}
 */
function prepareWrite(actor, collection, action, doc, ctx) {
  const verdict = authz.can(actor, collection, action, doc, ctx);
  if (!verdict.allow) return verdict;
  return { allow: true, doc: doc, collection: collection, action: action };
}

/** 按集合自动选择映射函数（同步时用它决定怎么转换） */
function mapLocal(collection, record, ctx) {
  if (collection === 'check_in') return toCheckIn(record, ctx);
  if (collection === 'point_ledger') return toLedger(record, ctx);
  if (collection === 'redemption') return toRedemption(record, ctx);
  if (collection === 'rule_version') return toRuleVersion(record, ctx);
  return Object.assign({}, record);
}

module.exports = {
  available, envInfo,
  toCheckIn, toLedger, toRedemption, toRuleVersion,
  prepareWrite, mapLocal,
  COLLECTION_NAMES, COLLECTIONS,
};
