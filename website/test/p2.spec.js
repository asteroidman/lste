'use strict';
process.env.BCRYPT_ROUNDS = '4';
process.env.SEED_REDEEM_CODES = 'SPONSOR-OK,SPONSOR-TWO';

const request = require('supertest');
const createApp = require('../server/app');
const { createMemoryRepo } = require('../server/lib/repo-memory');

const newApp = () => createApp({ repo: createMemoryRepo() });

async function setup(stage) {
  const app = newApp();
  const a = request.agent(app);
  await a.post('/api/auth/register').send({ username: 'parent', password: 'secret1', nickname: '妈妈' });
  await a.post('/api/family').send({ name: '我们的家', stage: stage || 'p12' });
  return { app, a };
}

describe('P2 · 家长密码闸门', () => {
  test('未设密码时家长端可用；设密码后需解锁', async () => {
    const { a } = await setup();
    expect((await a.get('/api/parent/status')).body).toEqual({ hasPin: false, unlocked: false });
    expect((await a.get('/api/parent/pending')).status).toBe(200);

    expect((await a.post('/api/parent/pin').send({ pin: '1234' })).status).toBe(200);
    await a.post('/api/parent/lock');

    const gated = await a.get('/api/parent/pending');
    expect(gated.status).toBe(403);
    expect(gated.body.needPin).toBe(true);

    expect((await a.post('/api/parent/unlock').send({ pin: '0000' })).status).toBe(401);
    expect((await a.post('/api/parent/unlock').send({ pin: '1234' })).status).toBe(200);
    expect((await a.get('/api/parent/pending')).status).toBe(200);

    await a.post('/api/parent/lock');
    expect((await a.get('/api/parent/pending')).status).toBe(403);
  });

  test('密码格式校验：非 4–8 位数字被拒', async () => {
    const { a } = await setup();
    expect((await a.post('/api/parent/pin').send({ pin: '12' })).status).toBe(400);
    expect((await a.post('/api/parent/pin').send({ pin: 'abcd' })).status).toBe(400);
  });

  test('改密码：解锁状态下可改；未解锁被拒', async () => {
    const { a } = await setup();
    await a.post('/api/parent/pin').send({ pin: '1234' });
    expect((await a.post('/api/parent/pin').send({ pin: '5678' })).status).toBe(200);   // 仍解锁
    await a.post('/api/parent/lock');
    expect((await a.post('/api/parent/pin').send({ pin: '9999' })).status).toBe(403);
    expect((await a.post('/api/parent/unlock').send({ pin: '5678' })).status).toBe(200);
  });
});

describe('P2 · 导出免费 10 次 + 赞助（收款码 + 兑换码）', () => {
  test('免费 10 次：第 11 次要求赞助', async () => {
    const { a } = await setup();
    const q0 = (await a.get('/api/export/quota')).body;
    expect(q0.limit).toBe(10);
    expect(q0.remain).toBe(10);

    for (let i = 0; i < 10; i++) expect((await a.post('/api/export/consume')).status).toBe(200);
    const q = (await a.get('/api/export/quota')).body;
    expect(q.remain).toBe(0);
    expect(q.canExport).toBe(false);

    const over = await a.post('/api/export/consume');
    expect(over.status).toBe(403);
    expect(over.body.needSponsor).toBe(true);
  });

  test('兑换码核销后解锁；导出不再计数；同码不可复用', async () => {
    const { a } = await setup();
    for (let i = 0; i < 10; i++) await a.post('/api/export/consume');
    expect((await a.post('/api/export/consume')).status).toBe(403);

    expect((await a.post('/api/sponsor/redeem').send({ code: 'WRONG' })).status).toBe(404);
    const r = await a.post('/api/sponsor/redeem').send({ code: 'sponsor-ok' });   // 大小写不敏感
    expect(r.status).toBe(200);
    expect(r.body.unlocked).toBe(true);

    const c = await a.post('/api/export/consume');
    expect(c.status).toBe(200);
    expect(c.body.unlimited).toBe(true);

    expect((await a.post('/api/sponsor/redeem').send({ code: 'SPONSOR-OK' })).status).toBe(404);  // 已用过
  });

  test('赞助信息可读（收款码 / 状态）', async () => {
    const { a } = await setup();
    const info = (await a.get('/api/sponsor/info')).body;
    expect(info.qr).toContain('/assets/');
    expect(info.unlocked).toBe(false);
    expect(info.quota.limit).toBe(10);
  });
});
