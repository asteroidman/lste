/* ============================================================
   website · server/app.js
   组装 Express 应用（可注入 repo / sessionStore，便于测试）。
   ============================================================ */
'use strict';

const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const config = require('./config');
const { requireLogin } = require('./middleware');

/**
 * @param {{ repo: object, sessionStore?: object }} deps
 */
module.exports = function createApp({ repo, sessionStore } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.use(session({
    name: 'rs_session',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,                       // 不传则用内存 store（仅开发/测试）
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,             // HTTPS 时设 COOKIE_SECURE=true
      maxAge: 30 * 24 * 3600 * 1000,
    },
  }));

  const api = express.Router();
  api.get('/health', (req, res) => res.json({ ok: true }));
  api.use('/auth', require('./routes/auth')(repo));
  api.use('/family', require('./routes/family')(repo));
  api.use('/parent', require('./routes/parent')(repo));
  api.get('/me', requireLogin, async (req, res) => {
    const u = await repo.getUser(req.userId);
    if (!u) return res.status(401).json({ error: '登录已失效' });
    const m = await repo.getMembership(req.userId);
    let stage = null;
    if (m) {
      const S = await repo.getState(m.familyId || m.family_id);
      stage = S ? S.stage : null;
    }
    res.json({
      user: { id: u.id, username: u.username, nickname: u.nickname },
      family: m ? { id: m.familyId || m.family_id, role: m.role } : null,
      stage,
    });
  });
  api.use('/', require('./routes/child')(repo));
  app.use('/api', api);

  // 前端静态资源
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // 兜底：API 之外的未命中 → 交给前端路由（这里简单返回首页）
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

  // 统一错误处理
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[rosenthal] error:', err && err.message);
    res.status(500).json({ error: '服务器开小差了，稍后再试' });
  });

  return app;
};
