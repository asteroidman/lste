/* ============================================================
   website · server/routes/auth.js
   账号密码 注册 / 登录 / 退出。P5 再叠加微信扫码登录（openid）。
   ============================================================ */
'use strict';

const express = require('express');
const secure = require('../lib/secure');
const { rateLimit } = require('../middleware');

const publicUser = (u) => ({ id: u.id, username: u.username, nickname: u.nickname });

module.exports = function authRoutes(repo) {
  const r = express.Router();

  r.post('/register', rateLimit({ windowMs: 60000, max: 20 }), async (req, res) => {
    const { username, password, nickname } = req.body || {};
    if (!secure.validUsername(username)) return res.status(400).json({ error: '用户名需 3–20 位字母/数字/下划线' });
    if (!secure.validPassword(password)) return res.status(400).json({ error: '密码至少 6 位' });
    if (!secure.validNickname(nickname)) return res.status(400).json({ error: '昵称 1–20 字' });
    if (await repo.findUserByUsername(username)) return res.status(409).json({ error: '用户名已被占用' });

    const passwordHash = await secure.hash(password);
    const user = await repo.createUser({ username, passwordHash, nickname: String(nickname).trim() });
    req.session.userId = user.id;
    res.status(201).json({ user: publicUser(user) });
  });

  r.post('/login', rateLimit({ windowMs: 60000, max: 20 }), async (req, res) => {
    const { username, password } = req.body || {};
    const user = await repo.findUserByUsername(String(username || '').trim());
    const ok = user && (await secure.verify(password, user.password_hash));
    if (!ok) return res.status(401).json({ error: '用户名或密码不对' });
    req.session.userId = user.id;
    res.json({ user: publicUser(user) });
  });

  r.post('/logout', (req, res) => {
    if (!req.session) return res.json({ ok: true });
    req.session.destroy(() => res.json({ ok: true }));
  });

  return r;
};
