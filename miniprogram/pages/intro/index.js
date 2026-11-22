/* ============================================================
   罗森塔尔 · pages/intro/index.js（关于罗森塔尔 · 首次介绍页）

   这一页在**首次冷启动**时先出现一次（讲清楚「期望的力量」），
   看完再按闸门进入共建 / 家长签署 / 今天。
   之后不再自动打断，但可以从「我的 → 关于罗森塔尔」随时重看。

   入口不是 app.json 的第一页（那还是 today），而是由 app.gateOnboarding()
   在 today 的 onLoad 里判断 store.needsIntro() 后 reLaunch 过来的 ——
   这样不改动已有的冷启动闸门与首页约定。
   ============================================================ */
'use strict';

const store = require('../../utils/store.js');
const guard = require('../../utils/guard.js');

Page({
  data: {
    stage: 'mid',
    /** '' = 首次闸门进入；'me' = 从「我的」重看 */
    from: '',
    cta: '开始，我陪她一起',
  },

  onLoad(options) {
    const s = store.state() || {};
    const from = (options && options.from) || '';
    this.setData({
      stage: s.stage || 'mid',
      from: from,
      /* 从「我的」重看时，按钮是「返回」而不是「开始」 */
      cta: from === 'me' ? '返回' : '开始，我陪她一起',
    });
  },

  /**
   * 进入：先记下「已看过」，再按闸门决定去哪。
   * 未双签生效 → 去共建页（孩子没改完）或家长签署页（改完等签）；
   * 已生效 → 直接进今天。
   */
  onEnter() {
    store.markIntroSeen();
    if (this.data.from === 'me') { wx.navigateBack(); return; }
    if (!store.isRuleActive()) {
      wx.reLaunch({ url: guard.gateTarget() });
      return;
    }
    wx.switchTab({ url: '/pages/today/index' });
  },
});
