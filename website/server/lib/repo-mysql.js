/* ============================================================
   website · server/lib/repo-mysql.js
   MySQL 数据源（生产）。接口与 repo-memory 完全一致，便于互换。
   ============================================================ */
'use strict';

const mysql = require('mysql2/promise');
const { randomId } = require('./secure');

function createMysqlRepo(dbConfig) {
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
  });

  async function getUser(id) {
    const [rows] = await pool.execute('SELECT * FROM `user` WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  return {
    pool,
    async findUserByUsername(username) {
      const [rows] = await pool.execute('SELECT * FROM `user` WHERE username = ? LIMIT 1', [username]);
      return rows[0] || null;
    },
    getUser,
    async createUser({ username, passwordHash, nickname }) {
      const id = randomId('u');
      await pool.execute(
        'INSERT INTO `user` (id, username, password_hash, nickname, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, username, passwordHash, nickname, Date.now()]
      );
      return getUser(id);
    },
    async createFamily({ ownerUserId, name, inviteCode }) {
      const id = randomId('f');
      await pool.execute(
        'INSERT INTO family (id, owner_user_id, name, invite_code, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, ownerUserId, name, inviteCode, Date.now()]
      );
      return this.getFamily(id);
    },
    async getFamily(id) {
      const [rows] = await pool.execute('SELECT * FROM family WHERE id = ? LIMIT 1', [id]);
      return rows[0] || null;
    },
    async findFamilyByInvite(code) {
      const [rows] = await pool.execute('SELECT * FROM family WHERE invite_code = ? LIMIT 1', [code]);
      return rows[0] || null;
    },
    async addMember({ familyId, userId, role }) {
      const [dup] = await pool.execute(
        'SELECT 1 FROM family_member WHERE family_id = ? AND user_id = ? LIMIT 1', [familyId, userId]
      );
      if (dup.length) return null;
      await pool.execute(
        'INSERT INTO family_member (family_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)',
        [familyId, userId, role, Date.now()]
      );
      return { familyId, userId, role };
    },
    async getMembership(userId) {
      const [rows] = await pool.execute(
        'SELECT family_id AS familyId, user_id AS userId, role FROM family_member WHERE user_id = ? ORDER BY joined_at ASC LIMIT 1',
        [userId]
      );
      return rows[0] || null;
    },
    async listMembers(familyId) {
      const [rows] = await pool.execute(
        'SELECT fm.family_id AS familyId, fm.user_id AS userId, fm.role, u.id, u.nickname ' +
        'FROM family_member fm LEFT JOIN `user` u ON u.id = fm.user_id WHERE fm.family_id = ?',
        [familyId]
      );
      return rows.map(r => ({
        familyId: r.familyId, userId: r.userId, role: r.role,
        user: r.id ? { id: r.id, nickname: r.nickname } : null,
      }));
    },
    async getState(familyId) {
      const [rows] = await pool.execute('SELECT json FROM family_state WHERE family_id = ? LIMIT 1', [familyId]);
      if (!rows.length) return null;
      try { return JSON.parse(rows[0].json); } catch (e) { return null; }
    },
    async saveState(familyId, obj) {
      await pool.execute(
        'INSERT INTO family_state (family_id, json, updated_at) VALUES (?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE json = VALUES(json), updated_at = VALUES(updated_at)',
        [familyId, JSON.stringify(obj), Date.now()]
      );
      return true;
    },

    /* 赞助兑换码 */
    async getRedeemCode(code) {
      const [rows] = await pool.execute(
        'SELECT code, used, family_id AS familyId, used_at AS usedAt FROM redeem_code WHERE code = ? LIMIT 1',
        [String(code || '').toUpperCase()]
      );
      if (!rows.length) return null;
      return { code: rows[0].code, used: !!rows[0].used, familyId: rows[0].familyId, usedAt: rows[0].usedAt };
    },
    async markRedeemCodeUsed(code, familyId, userId) {
      const [res] = await pool.execute(
        'UPDATE redeem_code SET used = 1, used_by = ?, used_at = ? WHERE code = ? AND used = 0',
        [userId || null, Date.now(), String(code || '').toUpperCase()]
      );
      return res.affectedRows > 0;
    },
  };
}

module.exports = { createMysqlRepo };
