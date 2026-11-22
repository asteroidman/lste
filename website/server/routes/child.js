/* ============================================================
   website · server/routes/child.js
   孩子端功能：介绍页、今天、打卡（唯一加分入口）、撤销/隐私、成长、兑换、规则共建、周复盘。
   全部走 engine（红线在这里面强制）。每个写操作 load → mutate → save。
   ============================================================ */
'use strict';

const express = require('express');
const engine = require('../lib/engine');
const { requireLogin, requireFamily } = require('../middleware');

/** 导出配额状态（免费 N 次；赞助解锁后不限） */
function quotaOf(S) {
  const limit = S.exportFreeLimit || 10;
  const used = S.exportUsed || 0;
  return { used, limit, remain: Math.max(0, limit - used), unlimited: !!S.sponsorUnlocked, canExport: !!S.sponsorUnlocked || used < limit };
}

module.exports = function childRoutes(repo) {
  const r = express.Router();
  const guard = [requireLogin, requireFamily(repo)];

  /** 读取家庭状态；页面前置校验用 */
  async function load(req, res) {
    const S = await repo.getState(req.familyId);
    if (!S) { res.status(400).json({ error: '家庭规则还没初始化' }); return null; }
    return S;
  }
  const save = (familyId, S) => repo.saveState(familyId, S);

  /* ---------------- 介绍页 ---------------- */
  r.get('/intro', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    res.json({ seen: !!S.introSeen, stage: S.stage, nick: S.nick });
  });
  r.post('/intro/seen', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    S.introSeen = true; await save(req.familyId, S);
    res.json({ ok: true });
  });

  /* ---------------- 今天 ---------------- */
  r.get('/today', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    res.json(Object.assign({ introSeen: !!S.introSeen, active: engine.isRuleActive(S), sig: engine.ruleSignature(S) }, engine.todayView(S)));
  });

  /* ---------------- 打卡：唯一加分入口 ---------------- */
  r.post('/checkin', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const it = engine.itemById(S, String((req.body && req.body.itemId) || ''));
    if (!it || it.active === false) return res.status(404).json({ error: '没找到这条行为' });
    const today = engine.todayKey();
    if (engine.countOn(S, it.id, today) >= it.limit) return res.status(409).json({ error: '今天这项已经记过啦，明天再来' });
    const out = engine.addPoints(S, { itemId: it.id, name: it.name, dim: it.dim, points: it.points, praise: engine.praiseOf(it) });
    if (!out.ok) return res.status(409).json({ error: out.reason });
    await save(req.familyId, S);
    const parts = engine.splitPraise(out.entry.praise);
    res.status(201).json({
      entry: out.entry, fact: parts.fact, trait: parts.trait,
      dim: engine.dimLabel(it.dim), score: engine.dayScore(S, today), cap: engine.capOf(S),
    });
  });

  r.post('/undo', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const out = engine.undo(S, String((req.body && req.body.uid) || ''));
    if (!out.ok) return res.status(409).json({ error: out.reason });
    await save(req.familyId, S);
    res.json({ ok: true });
  });

  r.post('/entry/private', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const out = engine.setPrivate(S, String((req.body && req.body.uid) || ''), req.body && req.body.private);
    if (!out.ok) return res.status(404).json({ error: out.reason });
    await save(req.familyId, S);
    res.json({ ok: true, private: out.entry.private });
  });

  /* ---------------- 成长 ---------------- */
  r.get('/growth', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    res.json(engine.growthView(S));
  });

  /* ---------------- 兑换 / 券 ---------------- */
  r.get('/rewards', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    res.json({ rewards: S.rewards, balance: engine.balance(S), lifetime: engine.lifetime(S), coupons: S.coupons });
  });
  r.post('/redeem', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const cost = Number(req.body && req.body.cost);
    const rw = (S.rewards || []).find(x => x.cost === cost);
    if (!rw) return res.status(404).json({ error: '没找到这档奖励' });
    const out = engine.redeem(S, cost, rw.title);
    if (!out.ok) return res.status(409).json({ error: out.reason });
    await save(req.familyId, S);
    res.status(201).json({ coupon: out.coupon });
  });
  r.post('/coupon/use', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const out = engine.useCoupon(S, String((req.body && req.body.code) || ''));
    if (!out.ok) return res.status(404).json({ error: out.reason });
    await save(req.familyId, S);
    res.json({ ok: true, coupon: out.coupon });
  });

  /* ---------------- 规则共建（必改 3 项）+ 奖励 CRUD ---------------- */
  r.get('/rules', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    res.json({
      sig: engine.ruleSignature(S), amended: engine.amendedCount(S), canFinish: engine.canFinishBuild(S),
      items: S.items, rewards: S.rewards, amend: S.amend,
    });
  });
  r.post('/rules/item/points', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const out = engine.setItemPoints(S, String(req.body && req.body.id), Number(req.body && req.body.points));
    if (!out.ok) return res.status(400).json({ error: out.reason });
    await save(req.familyId, S); res.json({ ok: true, item: out.item, amended: engine.amendedCount(S) });
  });
  r.post('/rules/item', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const b = req.body || {};
    const out = engine.addItem(S, { name: String(b.name || '').trim(), dim: b.dim || 'self', points: Number(b.points) || 1, limit: 1, p: b.name, t: '这是你自己加进来的一条' });
    if (!out.ok) return res.status(400).json({ error: out.reason });
    await save(req.familyId, S); res.status(201).json({ ok: true, item: out.item, amended: engine.amendedCount(S) });
  });
  r.post('/rules/item/remove', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const out = engine.removeItem(S, String(req.body && req.body.id));
    if (!out.ok) return res.status(404).json({ error: out.reason });
    await save(req.familyId, S); res.json({ ok: true, amended: engine.amendedCount(S) });
  });
  r.post('/rules/reward/title', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const out = engine.setRewardTitle(S, Number(req.body && req.body.cost), req.body && req.body.title);
    if (!out.ok) return res.status(400).json({ error: out.reason });
    await save(req.familyId, S); res.json({ ok: true, reward: out.reward, amended: engine.amendedCount(S) });
  });
  r.post('/rules/reward/cost', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const out = engine.setRewardCost(S, Number(req.body && req.body.cost), Number(req.body && req.body.newCost));
    if (!out.ok) return res.status(400).json({ error: out.reason });
    await save(req.familyId, S); res.json({ ok: true, reward: out.reward, amended: engine.amendedCount(S) });
  });
  r.post('/rules/reward', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const b = req.body || {};
    const out = engine.addReward(S, { cost: Number(b.cost), tier: b.tier, title: b.title, desc: b.desc });
    if (!out.ok) return res.status(400).json({ error: out.reason });
    await save(req.familyId, S); res.status(201).json({ ok: true, reward: out.reward, amended: engine.amendedCount(S) });
  });
  r.post('/rules/reward/remove', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const out = engine.removeReward(S, Number(req.body && req.body.cost));
    if (!out.ok) return res.status(400).json({ error: out.reason });
    await save(req.familyId, S); res.json({ ok: true, amended: engine.amendedCount(S) });
  });
  r.post('/rules/finish', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const out = engine.finishBuild(S);
    if (!out.ok) return res.status(400).json({ error: out.reason });
    await save(req.familyId, S);
    res.json({ ok: true, ruleVersion: out.ruleVersion, pendingParent: true });
  });

  /* ---------------- 周复盘 ---------------- */
  r.get('/week', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    res.json({ week: S.week, weekScore: engine.weekScore(S), streak: engine.streak(S), bonus: engine.weekBonus(S, S.weekDraft && S.weekDraft.challenge) });
  });
  r.post('/week/finish', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const out = engine.weekFinish(S, req.body || {});
    if (!out.ok) return res.status(409).json({ error: out.reason });
    await save(req.familyId, S);
    res.json({ ok: true, week: out.week });
  });

  /* ---------------- 导出配额（免费 10 次）+ 赞助 ---------------- */
  r.get('/export/quota', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    res.json(quotaOf(S));
  });

  /** 记一次导出：免费额度内计数；用满后要求赞助 */
  r.post('/export/consume', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    if (S.sponsorUnlocked) return res.json({ ok: true, unlimited: true, quota: quotaOf(S) });
    const limit = S.exportFreeLimit || 10;
    const used = S.exportUsed || 0;
    if (used >= limit) {
      return res.status(403).json({ error: '免费导出次数用完了，赞助后可继续', needSponsor: true, quota: quotaOf(S) });
    }
    S.exportUsed = used + 1;
    await save(req.familyId, S);
    res.json({ ok: true, quota: quotaOf(S) });
  });

  r.get('/sponsor/info', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    res.json({
      qr: process.env.SPONSOR_QR || '/assets/pay.svg',
      note: '扫码赞助后，把备注里的兑换码填进来，即可解锁导出 / 打印。',
      unlocked: !!S.sponsorUnlocked,
      quota: quotaOf(S),
    });
  });

  /** 核销赞助兑换码 → 解锁导出 */
  r.post('/sponsor/redeem', ...guard, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    const code = String((req.body && req.body.code) || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: '请输入兑换码' });
    const rc = await repo.getRedeemCode(code);
    if (!rc || rc.used) return res.status(404).json({ error: '兑换码无效或已经用过' });
    const ok = await repo.markRedeemCodeUsed(code, req.familyId, req.userId);
    if (!ok) return res.status(409).json({ error: '兑换码已经被使用' });
    S.sponsorUnlocked = true;
    await save(req.familyId, S);
    res.json({ ok: true, unlocked: true });
  });

  return r;
};
