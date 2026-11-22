/* ============================================================
   出图版面测试 · utils/render-image.js（纯函数部分）
   —— 画布绘制依赖 wx，不能在 Node 里跑；这里只钉住**版面构造**：
      规则表/一周一页会生成哪些块、折行不丢字、分页每页非空。
   ============================================================ */
'use strict';

const store = require('../../miniprogram/utils/store.js');
const render = require('../../miniprogram/utils/render-image.js');

describe('render-image · 出图版面（纯函数）', () => {
  beforeEach(() => { store.load(); store.resetAll('mid'); });

  test('规则表版面：含标题 / 奖励段 / 双签块', () => {
    const blocks = render.buildBlocks('rule', store.buildRuleTable());
    expect(blocks.some(b => b.t === 'title' && b.text.indexOf('规则表') >= 0)).toBe(true);
    expect(blocks.some(b => b.t === 'section' && b.text === '奖励档位')).toBe(true);
    expect(blocks.some(b => b.t === 'sign')).toBe(true);
  });

  test('一周一页版面：含标题 / 做到的事 / 双签块', () => {
    const blocks = render.buildBlocks('week', store.buildWeekPage());
    expect(blocks.some(b => b.t === 'title' && b.text.indexOf('一周一页') >= 0)).toBe(true);
    expect(blocks.some(b => b.t === 'section' && b.text === '这一周做到的事')).toBe(true);
    expect(blocks.some(b => b.t === 'sign')).toBe(true);
  });

  test('折行是纯函数：超宽文字拆成多行且不丢字', () => {
    const lines = render.wrapText('一二三四五六七八九十', 20, 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('一二三四五六七八九十');
  });

  test('分页是纯函数：块多时拆成多页，且每页非空', () => {
    const many = [];
    for (let i = 0; i < 120; i++) many.push({ t: 'text', text: '第 ' + i + ' 行，用来撑高页面。' });
    const pages = render.paginate(many, 400);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every(p => p.length > 0)).toBe(true);
  });
});
