/* ============================================================
   引擎测试 · utils/store.js（规则引擎）
   —— 直接 require 真实 store（经目录联接指向 ../miniprogram）。
   这是「在 Jest 里怎么测纯逻辑」的样板；全量引擎断言在
   miniprogram/_smoke_s1.js（npm run test:engine），这里只做一层与
   测试框架集成的示范 + 与 simulator 层的衔接。
   ============================================================ */
'use strict';

const store = require('../../miniprogram/utils/store.js');

describe('store · 三条硬约束（在 Jest 里直连真实引擎）', () => {
  beforeEach(() => {
    store.load();
    store.resetAll('mid');
  });

  test('只加分：非正数一律被拒，且理由固定', () => {
    const neg = store.addPoints({ itemId: 's1', name: '试图扣分', dim: 'study', points: -5 });
    expect(neg.ok).toBe(false);
    expect(neg.reason).toBe('系统里没有扣分');

    const zero = store.addPoints({ itemId: 's1', name: '零分', dim: 'study', points: 0 });
    expect(zero.ok).toBe(false);

    /* 全站不存在写负分的路径：流水里没有负数 */
    expect(store.state().log.every(l => l.points > 0)).toBe(true);
  });

  test('日上限随学段：8 / 10 / 12 / 12，且在引擎层强制', () => {
    const caps = store.STAGES.map(s => s.cap);
    expect(caps).toEqual([8, 10, 12, 12]);

    store.resetAll('p12');
    expect(store.capNow()).toBe(8);
    let guard = 0;
    while (store.dayScore(store.todayKey()) < 8 && guard++ < 50) {
      const r = store.addPoints({ itemId: 'p1', name: 'x', dim: 'study', points: 1 });
      if (!r.ok) break;
    }
    expect(store.dayScore(store.todayKey())).toBe(8);
    expect(store.addPoints({ itemId: 'p1', name: 'y', dim: 'study', points: 1 }).ok).toBe(false);
  });

  test('必改 3 项：未改满时 finishBuild 被拒，改满并由家长签署后才生效', () => {
    expect(store.canFinishBuild()).toBe(false);
    expect(store.finishBuild().ok).toBe(false);

    store.setItemPoints('s1', 3);              // 改分值
    store.removeItem('l4');                     // 改行为项
    store.setRewardTitle(120, '一起出去一次');  // 改奖励
    expect(store.amendedCount()).toBe(3);

    expect(store.finishBuild().ok).toBe(true);
    /* 孩子单方完成只是提案：还没生效 */
    expect(store.isRuleActive()).toBe(false);
    store.parentAgree();
    expect(store.isRuleActive()).toBe(true);
  });

  test('规则表导出（本轮新增）：带当前学段、日上限与双签栏', () => {
    store.resetAll('p12');
    const t = store.buildRuleTable();
    expect(t.stageName).toBe('小学低段');
    expect(t.cap).toBe(8);
    expect(t.itemCount).toBe(13);
    expect(t.rewardCount).toBe(8);
    expect(t.text).toContain('每日上限 8 分');
    expect(t.text).toContain('她签名');
    expect(t.pdfPayload.kind).toBe('rule_table');

    const csv = store.buildRuleTableCsv();
    expect(csv.text.charCodeAt(0)).toBe(0xFEFF);   // UTF-8 BOM
  });
});

describe('store · 关于罗森塔尔 + 低龄代记（本轮新增）', () => {
  beforeEach(() => { store.load(); store.resetAll('mid'); });

  test('首次介绍页：全新状态需要先看，看过之后不再需要', () => {
    expect(store.needsIntro()).toBe(true);
    store.markIntroSeen();
    expect(store.needsIntro()).toBe(false);
  });

  test('低龄代记：低段允许并盖 byParent 戳，初中拒绝（尊重自主权）', () => {
    store.resetAll('p36');
    store.markIntroSeen();
    expect(store.canParentRecord()).toBe(true);

    const r = store.parentRecord('q1');
    expect(r.ok).toBe(true);
    expect(r.entry.byParent).toBe(true);
    expect(store.parentRecord('q1').ok).toBe(false);   // 单条每天一次

    store.applyStage('mid');
    expect(store.canParentRecord()).toBe(false);
    expect(store.parentRecord('s1').ok).toBe(false);
  });
});
