'use strict';

const engine = require('../server/lib/engine');

describe('engine · 服务端规则引擎（复用 templates.js）', () => {
  test('blankState 按学段初始化：p12 = 13 条行为 / 上限 8', () => {
    const S = engine.blankState('p12');
    expect(engine.capOf(S)).toBe(8);
    expect(engine.itemsOf(S).length).toBe(13);
    expect(S.rewards.length).toBe(engine.T.REWARD_BY_STAGE.p12.length);
  });

  test('只加分：非正数一律被拒，且流水无负数', () => {
    const S = engine.blankState('mid');
    expect(engine.addPoints(S, { points: -5 }).ok).toBe(false);
    expect(engine.addPoints(S, { points: 0 }).ok).toBe(false);
    expect(engine.addPoints(S, { points: 1, name: 'x', dim: 'self' }).ok).toBe(true);
    expect(S.log.every(l => l.points > 0)).toBe(true);
  });

  test('日上限随学段在引擎层强制（p12 满 8 分后拒绝）', () => {
    const S = engine.blankState('p12');
    let guard = 0;
    while (engine.dayScore(S, engine.todayKey()) < 8 && guard++ < 50) {
      const it = engine.itemsOf(S).find(i => engine.countOn(S, i.id, engine.todayKey()) < i.limit);
      if (!it) break;
      engine.addPoints(S, { itemId: it.id, name: it.name, dim: it.dim, points: it.points });
    }
    expect(engine.dayScore(S, engine.todayKey())).toBe(8);
    expect(engine.addPoints(S, { points: 1, name: 'y', dim: 'self' }).ok).toBe(false);
  });

  test('周结算不占当日上限（独立入账，只加分）', () => {
    const S = engine.blankState('p12');
    const wk = engine.addWeeklyPoints(S, { points: 25 });
    expect(wk.ok).toBe(true);
    expect(engine.dayScore(S, engine.todayKey())).toBe(0);   // 不进当日得分
    expect(engine.lifetime(S)).toBe(25);
  });

  test('必改 3 项：未满 finishBuild 被拒；改满 + 双签才 active', () => {
    const S = engine.blankState('mid');
    expect(engine.finishBuild(S).ok).toBe(false);
    engine.setItemPoints(S, engine.itemsOf(S)[0].id, 3);
    engine.removeItem(S, engine.itemsOf(S)[1].id);
    engine.setRewardTitle(S, S.rewards[0].cost, '一起出去玩');
    expect(engine.amendedCount(S)).toBe(3);
    expect(engine.finishBuild(S).ok).toBe(true);
    expect(engine.isRuleActive(S)).toBe(false);      // 单方不生效
    expect(engine.parentAgree(S).ok).toBe(true);
    expect(engine.isRuleActive(S)).toBe(true);
  });

  test('兑换：余额不足被拒；够额发券且余额下降、券不可撤回', () => {
    const S = engine.blankState('p12');
    expect(engine.redeem(S, 20, 'x').ok).toBe(false);
    engine.addWeeklyPoints(S, { points: 60 });
    const before = engine.balance(S);
    const out = engine.redeem(S, 40, '免家务券');
    expect(out.ok).toBe(true);
    expect(engine.balance(S)).toBe(before - 40);
    expect(S.coupons.length).toBe(1);
    expect(S.redemptions.length).toBe(1);
  });

  test('隐私：私密条目对家长不可见，分数照常计入', () => {
    const S = engine.blankState('mid');
    const r = engine.addPoints(S, { points: 2, name: 'x', dim: 'self' });
    engine.setPrivate(S, r.entry.uid, true);
    expect(engine.visibleToParent(S).length).toBe(0);
    expect(engine.hiddenCount(S)).toBe(1);
    expect(engine.lifetime(S)).toBe(2);              // 标私密不改分
  });

  test('奖励 CRUD：可增 / 改分 / 改内容 / 删；分值必须正数且不重档', () => {
    const S = engine.blankState('mid');
    const n0 = S.rewards.length;
    expect(engine.addReward(S, { cost: 0, title: 'x' }).ok).toBe(false);
    expect(engine.addReward(S, { cost: 999, title: '一次旅行' }).ok).toBe(true);
    expect(S.rewards.length).toBe(n0 + 1);
    expect(engine.setRewardCost(S, 999, S.rewards[0].cost).ok).toBe(false);   // 撞档
    expect(engine.setRewardCost(S, 999, 998).ok).toBe(true);
    expect(engine.setRewardTitle(S, 998, '一次海边旅行').ok).toBe(true);
    expect(engine.removeReward(S, 998).ok).toBe(true);
    expect(S.rewards.length).toBe(n0);
    expect(S.amend.reward).toBeGreaterThan(0);
  });

  test('周复盘：结算给加成，同周重复被拒', () => {
    const S = engine.blankState('p12');
    const out = engine.weekFinish(S, { challenge: '自己定一个复习清单' });
    expect(out.ok).toBe(true);
    expect(out.week.bonus).toBe(5);                  // 仅挑战 +5
    expect(engine.weekFinish(S, {}).ok).toBe(false); // 幂等
  });
});
