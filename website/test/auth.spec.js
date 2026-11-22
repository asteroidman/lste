'use strict';
process.env.BCRYPT_ROUNDS = '4';

const request = require('supertest');
const createApp = require('../server/app');
const { createMemoryRepo } = require('../server/lib/repo-memory');

/** 每个用例一套独立的内存数据源 */
const newApp = () => createApp({ repo: createMemoryRepo() });

describe('P0 · 账号密码登录 + 家庭', () => {
  test('注册成功 → /api/me 可用；用户名重复被拒', async () => {
    const app = newApp();
    const a = request.agent(app);
    const res = await a.post('/api/auth/register').send({ username: 'parent1', password: 'secret1', nickname: '妈妈' });
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe('parent1');

    const me = await a.get('/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.nickname).toBe('妈妈');

    const dup = await a.post('/api/auth/register').send({ username: 'parent1', password: 'secret1', nickname: 'x' });
    expect(dup.status).toBe(409);
  });

  test('未登录访问 /api/me → 401', async () => {
    const r = await request(newApp()).get('/api/me');
    expect(r.status).toBe(401);
  });

  test('密码错误 → 401；正确 → 200', async () => {
    const app = newApp();
    await request(app).post('/api/auth/register').send({ username: 'user1', password: 'secret1', nickname: 'n' });
    const bad = await request(app).post('/api/auth/login').send({ username: 'user1', password: 'nope' });
    expect(bad.status).toBe(401);
    const ok = await request(app).post('/api/auth/login').send({ username: 'user1', password: 'secret1' });
    expect(ok.status).toBe(200);
  });

  test('注册参数校验：非法用户名 / 短密码 → 400', async () => {
    const app = newApp();
    expect((await request(app).post('/api/auth/register').send({ username: 'ab', password: 'secret1', nickname: 'n' })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ username: 'goodname', password: '123', nickname: 'n' })).status).toBe(400);
  });

  test('建家庭 → 邀请码；另一账号凭码加入；成员角色正确', async () => {
    const app = newApp();
    const a = request.agent(app);
    await a.post('/api/auth/register').send({ username: 'owner', password: 'secret1', nickname: '妈' });
    const r = await a.post('/api/family').send({ name: '我们的家' });
    expect(r.status).toBe(201);
    const code = r.body.family.invite_code;
    expect(code).toHaveLength(6);

    const b = request.agent(app);
    await b.post('/api/auth/register').send({ username: 'kid', password: 'secret1', nickname: '娃' });
    const j = await b.post('/api/family/join').send({ invite_code: code, role: 'child' });
    expect(j.status).toBe(200);
    expect(j.body.role).toBe('child');

    const fam = await b.get('/api/family');
    expect(fam.body.family.id).toBe(r.body.family.id);
    expect(fam.body.members.length).toBe(2);
    expect(fam.body.members.map(m => m.role).sort()).toEqual(['child', 'parent']);
  });

  test('重复建家 → 409；错误邀请码 → 404', async () => {
    const app = newApp();
    const a = request.agent(app);
    await a.post('/api/auth/register').send({ username: 'owner2', password: 'secret1', nickname: 'x' });
    expect((await a.post('/api/family').send({ name: '家' })).status).toBe(201);
    expect((await a.post('/api/family').send({ name: '家2' })).status).toBe(409);

    const b = request.agent(app);
    await b.post('/api/auth/register').send({ username: 'other3', password: 'secret1', nickname: 'x' });
    expect((await b.post('/api/family/join').send({ invite_code: 'ZZZZZZ' })).status).toBe(404);
  });

  test('退出后 /api/me → 401', async () => {
    const app = newApp();
    const a = request.agent(app);
    await a.post('/api/auth/register').send({ username: 'owner4', password: 'secret1', nickname: 'x' });
    expect((await a.get('/api/me')).status).toBe(200);
    await a.post('/api/auth/logout');
    expect((await a.get('/api/me')).status).toBe(401);
  });
});
