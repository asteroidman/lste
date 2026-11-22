/* ============================================================
   website · server/lib/secure.js
   密码哈希、ID/邀请码生成、输入校验。纯函数为主，便于单测。
   用 bcryptjs（纯 JS），避免宝塔上编译原生模块。
   ============================================================ */
'use strict';

const bcrypt = require('bcryptjs');
const config = require('../config');

/** 哈希密码（异步） */
const hash = (plain) => bcrypt.hash(String(plain), config.bcryptRounds);

/** 校验密码：compare 用常量时间 */
const verify = (plain, hashed) => bcrypt.compare(String(plain), String(hashed || ''));

/** 生成短 ID：前缀 + 时间基 36 + 随机 */
const randomId = (prefix) => String(prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* 邀请码字母表：去掉 I/L/O/0/1 等易混字符 */
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function inviteCode(len) {
  const n = len || 6;
  let s = '';
  for (let i = 0; i < n; i++) s += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  return s;
}

/** 券码：SP-XXXX-XX */
function couponCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  return 'SP-' + s + '-' + String(Math.floor(Math.random() * 90) + 10);
}

const validUsername = (u) => /^[A-Za-z0-9_]{3,20}$/.test(String(u || ''));
const validPassword = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 64;
function validNickname(n) {
  const t = String(n || '').trim();
  return t.length >= 1 && t.length <= 20;
}

module.exports = {
  hash, verify, randomId, inviteCode, couponCode,
  validUsername, validPassword, validNickname,
  INVITE_ALPHABET,
};
