'use strict';
process.env.BCRYPT_ROUNDS = '4';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const createApp = require('../server/app');
const { createMemoryRepo } = require('../server/lib/repo-memory');

const newApp = () => createApp({ repo: createMemoryRepo() });

/** 注册一个家长账号并建家（返回 agent，创建者即家长） */
async function setup(stage) {
  const app = newApp();
  const a = request.agent(app);
  await a.post('/api/auth/register').send({ username: 'parent', password: 'secret1', nickname: '妈妈' });
  const f = await a.post('/api/family').send({ name: '我们的家', stage: stage || 'p12' });
  return { app, a, family: f.body.family };
}

describe('P1 · 核心 API（含红线）', () => {
  test('建家按学段初始化：p12 有 13 条行为、上限 8', async () => {
    const { a } = await setup('p12');
    const t = await a.get('/api/today');
    expect(t.status).toBe(200);
    expect(t.body.cap).toBe(8);
    expect(t.body.dims.reduce((n, d) => n + d.items.length, 0)).toBe(13);
  });

  test('打卡：加分 + 产生「我看到你…这说明…」肯定卡；单条超次数被拒', async () => {
    const { a } = await setup('p12');
    const t = await a.get('/api/today');
    const item = t.body.dims.flatMap(d => d.items).find(i => i.limit === 1);
    const c1 = await a.post('/api/checkin').send({ itemId: item.id });
    expect(c1.status).toBe(201);
    expect(c1.body.entry.points).toBe(item.points);
    expect(c1.body.fact).toBeTruthy();
    expect(c1.body.trait).toBeTruthy();
    const c2 = await a.post('/api/checkin').send({ itemId: item.id });
    expect(c2.status).toBe(409);
  });

  test('日上限：p12 打满 8 分后继续打卡被拒', async () => {
    const { a } = await setup('p12');
    let guard = 0;
    for (;;) {
      const t = await a.get('/api/today');
      if (t.body.score >= t.body.cap) break;
      const item = t.body.dims.flatMap(d => d.items).find(i => !i.maxed);
      if (!item || guard++ > 50) break;
      const r = await a.post('/api/checkin').send({ itemId: item.id });
      if (r.status !== 201) break;
    }
    const fin = await a.get('/api/today');
    expect(fin.body.score).toBe(8);
    const anyItem = fin.body.dims.flatMap(d => d.items).find(i => !i.maxed);
    if (anyItem) expect((await a.post('/api/checkin').send({ itemId: anyItem.id })).status).toBe(409);
  });

  test('必改 3 项 + 双签：未满被拒 → 改满提交 → 家长签署后 active', async () => {
    const { a } = await setup('mid');
    expect((await a.post('/api/rules/finish')).status).toBe(400);

    const rules = (await a.get('/api/rules')).body;
    const keep = rules.items.filter(i => i.active !== false);
    await a.post('/api/rules/item/points').send({ id: keep[0].id, points: keep[0].points + 1 });
    await a.post('/api/rules/item/remove').send({ id: keep[1].id });
    await a.post('/api/rules/reward/title').send({ cost: rules.rewards[0].cost, title: '一起出去玩' });

    expect((await a.post('/api/rules/finish')).status).toBe(200);
    expect((await a.get('/api/today')).body.active).toBe(false);    // 单方不生效
    expect((await a.post('/api/parent/agree')).status).toBe(200);
    expect((await a.get('/api/today')).body.active).toBe(true);
  });

  test('家长待确认：私密条目对家长隐藏；确认后消失', async () => {
    const { a } = await setup('p12');
    const t = await a.get('/api/today');
    const item = t.body.dims.flatMap(d => d.items).find(i => i.limit === 1);
    const c = await a.post('/api/checkin').send({ itemId: item.id });
    const uid = c.body.entry.uid;

    expect((await a.get('/api/parent/pending')).body.pending.length).toBe(1);

    await a.post('/api/entry/private').send({ uid, private: true });
    let p = await a.get('/api/parent/pending');
    expect(p.body.pending.length).toBe(0);
    expect(p.body.hidden).toBe(1);

    await a.post('/api/entry/private').send({ uid, private: false });
    expect((await a.get('/api/parent/pending')).body.pending.length).toBe(1);

    expect((await a.post('/api/parent/confirm').send({ uids: [uid] })).status).toBe(200);
    expect((await a.get('/api/parent/pending')).body.pending.length).toBe(0);
  });

  test('成长：流水里有打卡记录与累计', async () => {
    const { a } = await setup('mid');
    const t = await a.get('/api/today');
    const item = t.body.dims.flatMap(d => d.items)[0];
    await a.post('/api/checkin').send({ itemId: item.id });
    const g = await a.get('/api/growth');
    expect(g.status).toBe(200);
    expect(g.body.timeline.length).toBe(1);
    expect(g.body.lifetime).toBe(item.points);
  });

  test('兑换：余额不足被拒（红线：只能靠挣分兑换）', async () => {
    const { a } = await setup('p12');
    const rw = (await a.get('/api/rewards')).body.rewards[0];
    const r = await a.post('/api/redeem').send({ cost: rw.cost });
    expect(r.status).toBe(409);
  });

  test('周复盘：结算给加成、同周重复被拒', async () => {
    const { a } = await setup('p12');
    const ok = await a.post('/api/week/finish').send({ challenge: '自己定一个复习清单' });
    expect(ok.status).toBe(200);
    expect(ok.body.week.bonus).toBe(5);
    expect((await a.post('/api/week/finish').send({})).status).toBe(409);
  });

  test('奖励 CRUD：新增 / 改分 / 改内容 / 删除；重档被拒', async () => {
    const { a } = await setup('p12');
    expect((await a.post('/api/rules/reward').send({ cost: 500, tier: '自定义', title: '一次旅行' })).status).toBe(201);
    expect((await a.post('/api/rules/reward/cost').send({ cost: 500, newCost: 520 })).status).toBe(200);
    expect((await a.post('/api/rules/reward/title').send({ cost: 520, title: '一次海边旅行' })).status).toBe(200);
    expect((await a.post('/api/rules/reward/remove').send({ cost: 520 })).status).toBe(200);

    const rw = (await a.get('/api/rewards')).body.rewards[0];
    expect((await a.post('/api/rules/reward').send({ cost: rw.cost, title: 'x' })).status).toBe(400);
  });

  test('红线：引擎与家长路由都没有「删除打卡」的接口', () => {
    const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    expect(/removeCheckIn|deleteCheckIn|deleteLog/.test(read('server/lib/engine.js'))).toBe(false);
    expect(/\.delete\(/.test(read('server/routes/parent.js'))).toBe(false);
  });
});
