/* ============================================================
   website · server/lib/repo-memory.js
   内存数据源：本地开发 / 自动测试用。接口与 repo-mysql 完全一致。
   （进程重启即清空；生产请配 MySQL。）
   ============================================================ */
'use strict';

const { randomId } = require('./secure');

function createMemoryRepo() {
  const users = new Map();       // id -> user
  const byUsername = new Map();  // username -> id
  const families = new Map();    // id -> family
  const members = [];            // { familyId, userId, role, joined_at }
  const states = new Map();      // familyId -> 家庭工作状态（JSON）
  const redeemCodes = new Map(); // code -> { code, used, familyId, usedAt }
  String(process.env.SEED_REDEEM_CODES || '')
    .split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
    .forEach(c => redeemCodes.set(c, { code: c, used: false, familyId: null, usedAt: null }));

  return {
    async findUserByUsername(username) {
      const id = byUsername.get(username);
      return id ? users.get(id) : null;
    },
    async getUser(id) { return users.get(id) || null; },
    async createUser({ username, passwordHash, nickname }) {
      const id = randomId('u');
      const u = { id, username, password_hash: passwordHash, nickname, openid: null, unionid: null, created_at: Date.now() };
      users.set(id, u);
      byUsername.set(username, id);
      return u;
    },
    async createFamily({ ownerUserId, name, inviteCode }) {
      const id = randomId('f');
      const fam = { id, owner_user_id: ownerUserId, name, invite_code: inviteCode, created_at: Date.now() };
      families.set(id, fam);
      return fam;
    },
    async getFamily(id) { return families.get(id) || null; },
    async findFamilyByInvite(code) {
      for (const f of families.values()) if (f.invite_code === code) return f;
      return null;
    },
    async addMember({ familyId, userId, role }) {
      if (members.some(m => m.familyId === familyId && m.userId === userId)) return null;
      const m = { familyId, userId, role, joined_at: Date.now() };
      members.push(m);
      return m;
    },
    async getMembership(userId) {
      return members.find(m => m.userId === userId) || null;
    },
    async listMembers(familyId) {
      return members
        .filter(m => m.familyId === familyId)
        .map(m => ({ familyId: m.familyId, userId: m.userId, role: m.role, user: users.get(m.userId) || null }));
    },

    /* 家庭工作状态（镜像小程序 state） */
    async getState(familyId) {
      const raw = states.get(familyId);
      return raw ? JSON.parse(raw) : null;
    },
    async saveState(familyId, obj) {
      states.set(familyId, JSON.stringify(obj));
      return true;
    },

    /* 赞助兑换码 */
    async getRedeemCode(code) {
      return redeemCodes.get(String(code || '').toUpperCase()) || null;
    },
    async markRedeemCodeUsed(code, familyId, userId) {
      const c = redeemCodes.get(String(code || '').toUpperCase());
      if (!c || c.used) return false;
      c.used = true; c.familyId = familyId || null; c.usedBy = userId || null; c.usedAt = Date.now();
      return true;
    },
  };
}

module.exports = { createMemoryRepo };
