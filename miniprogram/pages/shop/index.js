/* ============================================================
   罗森塔尔 · pages/shop/index.js（兑换）
   对应原型 renderShop()。两条红线在这一页可见：
   · 券一生成，家长端就没有删除能力（store 不提供删除券的方法）；
   · 兑换只走 spent 记账，不删任何历史流水，所以「累计获得」永远不会因兑换变少。
   ============================================================ */
'use strict';

const store = require('../../utils/store.js');
const guard = require('../../utils/guard.js');

const app = getApp();

Page({
  data: {
    stage: 'mid',
    balance: 0,
    lifetime: 0,
    nextTxt: '—',
    nextPct: 0,
    rewards: [],
    coupons: [],
    couponHint: '还没有券。攒够了就去兑换，生成后家长不能撤销。',
  },

  onLoad() { this.render(); },
  onShow() {
    if (guard.requireOnboarded()) return;   // 未完成「必改 3 项」前不放行
    this.render();
  },

  render() {
    const s = store.state();
    if (!s) return;
    const bal = store.balance();
    const next = store.nextReward();

    const rewards = s.rewards.map((r, i) => ({
      idx: i,
      cost: r.cost,
      tier: r.tier,
      title: r.title,
      desc: r.desc,
      enough: bal >= r.cost,
      lack: Math.max(0, r.cost - bal),
      customBy: r.customBy === 'child',
    }));

    // 券：未使用在前，已用/过期的沉到下面
    const today = store.todayKey();
    const coupons = s.coupons.map(c => {
      const expired = !c.used && String(c.exp) < today;
      return {
        code: c.code,
        title: c.title,
        cost: c.cost,
        exp: c.exp,
        used: !!c.used,
        expired,
        state: c.used ? '已使用' : expired ? '已过期' : '可用',
        cls: c.used ? 'coupon--used' : expired ? 'coupon--exp' : '',
      };
    }).sort((a, b) => (a.used || a.expired ? 1 : 0) - (b.used || b.expired ? 1 : 0));

    const stats = app.globalData.bump();
    this.setData({
      stage: s.stage,
      onboarded: !!s.onboarded,   // 闸门：未共建完不渲染页面
      balance: bal,
      lifetime: stats.lifetime,
      nextTxt: next ? ('还差 ' + (next.cost - bal) + ' 分到「' + next.title + '」') : '所有档位都能兑了',
      nextPct: next ? Math.min(100, Math.round(bal / next.cost * 100)) : 100,
      rewards,
      coupons,
      couponHint: coupons.length ? '' : this.data.couponHint,
    });
  },

  onRedeem(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const r = store.state().rewards[idx];
    if (!r) return;

    const res = store.redeem(r.cost, r.title);
    if (!res.ok) { wx.showToast({ title: res.reason, icon: 'none' }); return; }
    wx.showModal({
      title: '券已生成',
      content: res.coupon.code + '\n' + r.title + '\n有效期到 ' + res.coupon.exp +
               '。这张券家长端不能删除、也不能撤回。',
      showCancel: false,
      confirmText: '知道了',
    });
    this.render();
  },

  onUseCoupon(e) {
    const code = e.currentTarget.dataset.code;
    wx.showModal({
      title: '标记为已使用？',
      content: '核销后这张券就归档了，记录仍会保留。',
      success: res => {
        if (!res.confirm) return;
        const r = store.useCoupon(code);
        wx.showToast({ title: r.ok ? '已核销' : r.reason, icon: 'none' });
        this.render();
      },
    });
  },
});
