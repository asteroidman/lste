/* ============================================================
   website · server/routes/family.js
   家庭：创建（生成邀请码，创建者=家长）、凭邀请码加入、查看成员。
   一个账号只属于一个家庭（P0 够用；后续可扩展多家庭）。
   ============================================================ */
'use strict';

const express = require('express');
const secure = require('../lib/secure');
const engine = require('../lib/engine');
const { requireLogin } = require('../middleware');

module.exports = function familyRoutes(repo) {
  const r = express.Router();

  r.get('/', requireLogin, async (req, res) => {
    const m = await repo.getMembership(req.userId);
    if (!m) return res.json({ family: null, role: null, members: [] });
    const fam = await repo.getFamily(m.familyId);
    const members = await repo.listMembers(fam.id);
    res.json({
      family: { id: fam.id, name: fam.name, invite_code: fam.invite_code, owner_user_id: fam.owner_user_id },
      role: m.role,
      members: members.map(x => ({ role: x.role, nickname: x.user ? x.user.nickname : '' })),
    });
  });

  r.post('/', requireLogin, async (req, res) => {
    if (await repo.getMembership(req.userId)) return res.status(409).json({ error: '你已经在一个家庭里了' });
    const name = String((req.body && req.body.name) || '').trim().slice(0, 20) || '我们的家';
    const stage = ['p12', 'p36', 'mid', 'high'].indexOf((req.body && req.body.stage) || '') >= 0 ? req.body.stage : 'mid';

    let code = secure.inviteCode();
    let guard = 0;
    while ((await repo.findFamilyByInvite(code)) && guard++ < 10) code = secure.inviteCode();

    const fam = await repo.createFamily({ ownerUserId: req.userId, name, inviteCode: code });
    await repo.addMember({ familyId: fam.id, userId: req.userId, role: 'parent' });

    // 按学段初始化家庭工作状态（行为项 / 奖励来自 templates.js，单一真源）
    const state = engine.blankState(stage);
    const me = await repo.getUser(req.userId);
    state.nick = (me && me.nickname) || '';
    await repo.saveState(fam.id, state);

    res.status(201).json({ family: { id: fam.id, name: fam.name, invite_code: fam.invite_code }, role: 'parent', stage });
  });

  r.post('/join', requireLogin, async (req, res) => {
    if (await repo.getMembership(req.userId)) return res.status(409).json({ error: '你已经在一个家庭里了' });
    const code = String((req.body && req.body.invite_code) || '').trim().toUpperCase();
    const fam = await repo.findFamilyByInvite(code);
    if (!fam) return res.status(404).json({ error: '邀请码不对' });
    const role = (req.body && req.body.role) === 'child' ? 'child' : 'member';
    await repo.addMember({ familyId: fam.id, userId: req.userId, role });
    res.json({ family: { id: fam.id, name: fam.name }, role });
  });

  return r;
};
