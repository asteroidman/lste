/* ============================================================
   组件测试 · components/ring-progress（得分环）
   —— 用官方 miniprogram-simulate（官方 wcc/wxss 编译器 + jsdom）真实编译
      WXML / WXSS 并渲染。这一层补的是 Node 引擎套件（_smoke_s1.js）的盲区：
      「WXML/WXSS 是否被编译器接受」「数据能否正确绑到模板上」。

   源组件在 ../miniprogram（指向真实工程的目录联接），组件本身零依赖、零 DOM。
   ============================================================ */
'use strict';

const path = require('path');
const simulate = require('miniprogram-simulate');

const CMP = path.join(__dirname, '..', '..', 'miniprogram', 'components', 'ring-progress', 'index');

describe('ring-progress · 得分环（真实编译 + 渲染）', () => {
  let id;

  beforeAll(() => {
    id = simulate.load(CMP);
  });

  /** 挂载一个实例到 document.body（simulate 的 attach 需要一个父节点） */
  const mount = props => {
    const comp = simulate.render(id, props);
    comp.attach(document.body);
    return comp;
  };

  test('按 score / cap 把数字绑进模板', () => {
    const comp = mount({ score: 6, cap: 12, size: 112, stroke: 9 });
    expect(comp.data.score).toBe(6);
    expect(comp.data.cap).toBe(12);

    const html = comp.dom.innerHTML;
    expect(html).toContain('今日已得');
    expect(html).toContain('>6<');   // 环中央的得分
    expect(html).toContain('/12');   // 上限
  });

  test('拿不到 canvas 节点时走 CSS 兜底环（ready=false），不抛错', () => {
    const comp = mount({ score: 3, cap: 12, size: 112, stroke: 9 });
    expect(comp.data.ready).toBe(false);
    expect(comp.dom.innerHTML).toContain('fallback');
    expect(comp.data.borderPx).toBe(9);
  });

  test('render(score, cap) 方法更新环与数字（切学段时页面就是这么调的）', () => {
    const comp = mount({ score: 0, cap: 12, size: 112, stroke: 9 });
    const inst = comp.instance;
    expect(typeof inst.render).toBe('function');

    inst.render(9, 8);   // 例如切到小学低段：上限 8、今天已得 9（会被收敛显示）

    expect(comp.data.score).toBe(9);
    expect(comp.data.cap).toBe(8);
    const html = comp.dom.innerHTML;
    expect(html).toContain('>9<');
    expect(html).toContain('/8');
  });

  test('属性 observer：改 score 会触发内部同步（无 canvas 时也不报错）', () => {
    const comp = mount({ score: 1, cap: 12, size: 112, stroke: 9 });
    comp.setData({ score: 5 });
    expect(comp.data.score).toBe(5);
    expect(comp.dom.innerHTML).toContain('>5<');
  });
});
