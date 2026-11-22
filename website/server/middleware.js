/* ============================================================
   website · server/middleware.js
   登录闸门 + 极简内存限流（登录/注册防爆破）。
   ============================================================ */
'use strict';

/** 要求已登录：把 userId 挂到 req，未登录返回 401 */
function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: '请先登录' });
  req.userId = req.session.userId;
  next();
}

/** 极简滑动窗口限流（单进程内存；多进程/多机请换 Redis 方案） */
function rateLimit({ windowMs = 60000, max = 30 } = {}) {
  const hits = new Map();   // key -> number[]
  return function (req, res, next) {
    const now = Date.now();
    const key = (req.ip || 'ip') + ' ' + req.method + ' ' + req.baseUrl + req.path;
    const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    if (arr.length > max) return res.status(429).json({ error: '请求太频繁，稍后再试' });
    next();
  };
}

/** 要求已加入家庭：把 familyId/role 挂到 req */
function requireFamily(repo) {
  return async function (req, res, next) {
    try {
      const m = await repo.getMembership(req.userId);
      if (!m) return res.status(400).json({ error: '还没有加入家庭' });
      req.familyId = m.familyId || m.family_id;
      req.role = m.role;
      next();
    } catch (e) { next(e); }
  };
}

module.exports = { requireLogin, requireFamily, rateLimit };
