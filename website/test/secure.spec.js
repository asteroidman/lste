'use strict';
process.env.BCRYPT_ROUNDS = '4';   // 测试里降低哈希强度，跑得快

const secure = require('../server/lib/secure');

describe('secure · 密码哈希 / 校验 / 生成器', () => {
  test('哈希不可逆、校验通过', async () => {
    const h = await secure.hash('secret1');
    expect(h).not.toContain('secret1');
    expect(await secure.verify('secret1', h)).toBe(true);
    expect(await secure.verify('wrong', h)).toBe(false);
  });

  test('用户名 / 密码 / 昵称 校验', () => {
    expect(secure.validUsername('abc_123')).toBe(true);
    expect(secure.validUsername('ab')).toBe(false);
    expect(secure.validUsername('a b')).toBe(false);
    expect(secure.validPassword('12345')).toBe(false);
    expect(secure.validPassword('123456')).toBe(true);
    expect(secure.validNickname('月亮')).toBe(true);
    expect(secure.validNickname('   ')).toBe(false);
  });

  test('邀请码 6 位，且只用不含混淆字符的字母表', () => {
    const c = secure.inviteCode();
    expect(c).toHaveLength(6);
    for (const ch of c) expect(secure.INVITE_ALPHABET.includes(ch)).toBe(true);
    expect(/[ILO01]/.test(c)).toBe(false);
  });

  test('券码形如 SP-XXXX-XX', () => {
    expect(/^SP-[A-Z0-9]{4}-\d{2}$/.test(secure.couponCode())).toBe(true);
  });
});
