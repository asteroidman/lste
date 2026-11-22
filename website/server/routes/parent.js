/* ============================================================
   website · server/routes/parent.js
   家长端：家长密码（PIN）闸门 + 待确认/确认/双签/只读概览。
   · 首次进入家长端要先设置家长密码；
   · 之后每次切换到家长端，需要输入一次密码解锁（本会话内有效，可主动锁定）；
   · 家长**没有删除能力**——这里不提供任何删除接口。
   ============================================================ */
'use strict';

const express = require('express');
const engine = require('../lib/engine');
const secure = require('../lib/secure');
const { requireLogin, requireFamily } = require('../middleware');

const validPin = (pin) => /^\d{4,8}$/.test(String(pin || ''));

module.exports = function parentRoutes(repo) {
  const r = express.Router();
  const guard = [requireLogin, requireFamily(repo)];
  const requireParent = (req, res, next) =>
    (req.role === 'parent' ? next() : res.status(403).json({ error: '只有家长能操作' }));

  async function load(req, res) {
    const S = await repo.getState(req.familyId);
    if (!S) { res.status(400).json({ error: '家庭规则还没初始化' }); return null; }
    return S;
  }

  /** 受保护端点：已设 PIN 且本会话未解锁 → 403 提示需要密码 */
  async function pinCheck(req, res, next) {
    const S = await load(req, res); if (!S) return;
    if (S.parentPinHash && req.session.parentUnlocked !== true) {
      return res.status(403).json({ error: '需要家长密码', needPin: true });
    }
    req.S = S;
    next();
  }

  /* ---------------- 家长密码 ---------------- */

  r.get('/status', ...guard, requireParent, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    res.json({ hasPin: !!S.parentPinHash, unlocked: req.session.parentUnlocked === true });
  });

  /** 首次设置家长密码；已设置时须先解锁才能改 */
  r.post('/pin', ...guard, requireParent, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    if (S.parentPinHash && req.session.parentUnlocked !== true) {
      return res.status(403).json({ error: '需要家长密码', needPin: true });
    }
    const pin = String((req.body && req.body.pin) || '');
    if (!validPin(pin)) return res.status(400).json({ error: '密码为 4–8 位数字' });
    S.parentPinHash = await secure.hash(pin);
    await repo.saveState(req.familyId, S);
    req.session.parentUnlocked = true;
    res.json({ ok: true, hasPin: true });
  });

  r.post('/unlock', ...guard, requireParent, async (req, res) => {
    const S = await load(req, res); if (!S) return;
    if (!S.parentPinHash) return res.status(400).json({ error: '还没有设置家长密码' });
    const ok = await secure.verify(String((req.body && req.body.pin) || ''), S.parentPinHash);
    if (!ok) return res.status(401).json({ error: '密码不对' });
    req.session.parentUnlocked = true;
    res.json({ ok: true, unlocked: true });
  });

  r.post('/lock', ...guard, requireParent, (req, res) => {
    req.session.parentUnlocked = false;
    res.json({ ok: true, unlocked: false });
  });

  /* ---------------- 以下都需要已解锁 ---------------- */

  r.get('/pending', ...guard, requireParent, pinCheck, async (req, res) => {
    const S = req.S;
    res.json({ pending: engine.parentPending(S), sig: engine.ruleSignature(S), hidden: engine.hiddenCount(S) });
  });

  /** 确认 + 一句具体鼓励。没有删除、没有改分。 */
  r.post('/confirm', ...guard, requireParent, pinCheck, async (req, res) => {
    const S = req.S;
    let uids = (req.body && (req.body.uids || req.body.uid)) || [];
    if (req.body && req.body.all) uids = engine.parentPending(S).map(p => p.uid);
    if (!uids || !uids.length) return res.status(400).json({ error: '没有可确认的记录' });
    const out = engine.confirmEntries(S, uids);
    if (!out.ok) return res.status(409).json({ error: '这些已经确认过了' });
    await repo.saveState(req.familyId, S);
    res.json({ ok: true, confirmed: out.confirmed });
  });

  /** 双签：家长签署「我按你的版本来」 */
  r.post('/agree', ...guard, requireParent, pinCheck, async (req, res) => {
    const S = req.S;
    const out = engine.parentAgree(S);
    if (!out.ok) return res.status(409).json({ error: out.reason });
    await repo.saveState(req.familyId, S);
    res.json({ ok: true, version: out.version, agreedDate: out.agreedDate });
  });

  /** 只读概览：只统计「做到了什么」，不含私密内容 */
  r.get('/overview', ...guard, requireParent, pinCheck, async (req, res) => {
    const S = req.S;
    const seen = engine.visibleToParent(S);
    const byDim = {};
    seen.filter(l => !l.reversed).forEach(l => { byDim[l.dim] = (byDim[l.dim] || 0) + l.points; });
    res.json({
      sig: engine.ruleSignature(S),
      streak: engine.streak(S), weekScore: engine.weekScore(S), lifetime: engine.lifetime(S),
      dims: engine.T.DIMS.map(d => ({ n: d.n, v: byDim[d.k] || 0 })),
      hidden: engine.hiddenCount(S),
      couponCount: (S.coupons || []).filter(c => !c.used).length,
    });
  });

  return r;
};
