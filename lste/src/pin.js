/* ============================================================
   罗森塔尔 · 单文件家庭版 · 家长管理密码（纯本地）
   - 数据只在浏览器 localStorage 里，没有任何网络请求；
   - PIN 是 4–8 位数字，只存 PBKDF2 哈希，不存明文；
   - 首次设置时生成一组离线恢复码（LST-XXXX-XXXX），忘了密码凭它重设；
   - 本文件零 DOM 依赖（只用 localStorage 与 crypto），可在 Node 直接测试。
   ============================================================ */
'use strict';

const PIN_KEY = 'rosenthal-single-pin-v1';          // PIN 元数据（哈希、盐、恢复码哈希）
const META_KEY = 'rosenthal-single-meta-v1';         // 其它本地元数据（上次备份时间等）

/* ---------- localStorage 安全包装（测试环境可换掉全局） ---------- */
function lsGet(k) {
  try {
    if (typeof localStorage !== 'undefined') { const v = localStorage.getItem(k); return v === null ? null : v; }
  } catch (e) { /* 隐私模式下读不到：按未设置处理 */ }
  return null;
}
function lsSet(k, v) {
  try {
    if (typeof localStorage !== 'undefined') { localStorage.setItem(k, v); return true; }
  } catch (e) { /* 存不进去：返回失败，由调用方提示 */ }
  return false;
}

/* ---------- 哈希 ----------
   优先 WebCrypto 的 PBKDF2（file:// 打开时属于安全上下文，可用）。
   没有 subtle 的极老环境退化为迭代混淆哈希：本地家庭数据够用，注释写明，不冒充加密。 */
function subtleOk() {
  return typeof crypto !== 'undefined' && crypto && crypto.subtle &&
         typeof crypto.subtle.importKey === 'function';
}
const enc = s => new TextEncoder().encode(String(s));
function bytesToHex(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += ('0' + u8[i].toString(16)).slice(-2);
  return s;
}
function weakMix(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2246822519) >>> 0;
  }
  for (let r = 0; r < 4; r++) {
    h1 = Math.imul(h1 ^ (h2 >>> 3), 2654435761) >>> 0;
    h2 = Math.imul(h2 ^ (h1 >>> 5), 3266489917) >>> 0;
  }
  return ('0000000' + h1.toString(16)).slice(-8) + ('0000000' + h2.toString(16)).slice(-8);
}
async function derive(secret, saltBytes, iters) {
  if (subtleOk()) {
    const key = await crypto.subtle.importKey('raw', enc(secret), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: iters }, key, 256);
    return bytesToHex(new Uint8Array(bits));
  }
  let h = String(secret) + ':' + bytesToHex(saltBytes);
  const n = Math.max(1, Math.min(Number(iters) || 1000, 2000));
  for (let i = 0; i < n; i++) h = weakMix(h + ':' + i);
  return h;
}
function randHex(nBytes) {
  const a = new Uint8Array(nBytes);
  (typeof crypto !== 'undefined' && crypto.getRandomValues)
    ? crypto.getRandomValues(a)
    : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
  return bytesToHex(a);
}

/* ---------- 恢复码 ---------- */
const REC_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // 去掉 0/O/1/I，手抄不出错
function genRecoveryCode() {
  const g = () => {
    const a = new Uint8Array(4);
    (typeof crypto !== 'undefined' && crypto.getRandomValues)
      ? crypto.getRandomValues(a)
      : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * REC_ALPHABET.length); });
    return Array.from(a, x => REC_ALPHABET[x % REC_ALPHABET.length]).join('');
  };
  return 'LST-' + g() + '-' + g();
}
const normRec = code => String(code || '').trim().toUpperCase().replace(/\s+/g, '');

/* ---------- 元数据 ---------- */
function readMeta() {
  const raw = lsGet(PIN_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function writeMeta(m) { return lsSet(PIN_KEY, JSON.stringify(m)); }

/* ---------- 对外 API ---------- */

/** 当前 PIN 状态：{has:false} 或 {has:true, since}（async：界面层统一按 Promise 用） */
async function pinStatus() {
  const m = readMeta();
  return m && m.hash ? { has: true, since: m.createdAt || 0 } : { has: false };
}

/** 设置 PIN（首次或凭恢复码重设）。返回 {ok, recoveryCode} 或 {ok:false, reason} */
async function setPin(pin) {
  const p = String(pin || '');
  if (!/^\d{4,8}$/.test(p)) return { ok: false, reason: '密码是 4–8 位数字' };
  const salt = randHex(16);
  const iters = 120000;
  const hash = await derive(p, new Uint8Array(salt.match(/../g).map(x => parseInt(x, 16))), iters);
  const recSalt = randHex(16);
  const code = genRecoveryCode();
  const recHash = await derive(normRec(code), new Uint8Array(recSalt.match(/../g).map(x => parseInt(x, 16))), iters);
  const meta = { v: 1, salt, iters, hash, recSalt, recHash, createdAt: Date.now(), changedAt: Date.now() };
  if (!writeMeta(meta)) return { ok: false, reason: '浏览器不允许写入本地存储' };
  return { ok: true, recoveryCode: code };
}

/** 校验 PIN */
async function verifyPin(pin) {
  const m = readMeta();
  if (!m || !m.hash) return false;
  const h = await derive(String(pin || ''), new Uint8Array(m.salt.match(/../g).map(x => parseInt(x, 16))), m.iters);
  return h === m.hash;
}

/** 校验恢复码 */
async function verifyRecovery(code) {
  const m = readMeta();
  if (!m || !m.recHash) return false;
  const h = await derive(normRec(code), new Uint8Array(m.recSalt.match(/../g).map(x => parseInt(x, 16))), m.iters);
  return h === m.recHash;
}

/** 改密码：先验旧 PIN，再换新盐新哈希（恢复码一并换新，随新设置展示一次） */
async function changePin(oldPin, newPin) {
  if (!(await verifyPin(oldPin))) return { ok: false, reason: '现在的密码不对' };
  return setPin(newPin);
}

/* 上次备份时间（提醒家长定期导出备份） */
function metaBackupAt() {
  const raw = lsGet(META_KEY);
  try { const m = JSON.parse(raw || '{}'); return Number(m.backupAt) || 0; } catch (e) { return 0; }
}
function setBackupAt(ts) {
  lsSet(META_KEY, JSON.stringify({ backupAt: Number(ts) || Date.now() }));
}

const RosPin = {
  pinStatus, setPin, verifyPin, verifyRecovery, changePin,
  metaBackupAt, setBackupAt, normRec, genRecoveryCode, derive,
};

/* 浏览器：挂到 window；Node 测试：走 module.exports */
if (typeof module !== 'undefined' && module.exports) module.exports = RosPin;
else (typeof window !== 'undefined' ? window : globalThis).RosPin = RosPin;
