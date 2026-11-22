/* ============================================================
   罗森塔尔 · pages/today/index.js（今天）
   对应原型 renderToday() + renderNav() + praiseSheet()。

   移植要点（README §三）：原型用 innerHTML 拼字符串，小程序不支持；
   这里全部改成「算好数据 → setData → WXML wx:for 渲染」。
   计分一律走 store.addPoints（唯一写入口），本文件不直接改 log。

   得分环已换成 Canvas 2D 组件（移植指南 §四方案 1），环的绘制全在
   components/ring-progress 里，本页只负责在数据变化后通知它重绘。
   ============================================================ */
'use strict';

const store = require('../../utils/store.js');
const guard = require('../../utils/guard.js');

const app = getApp();

/** 各学段的「超额提示」文案：只被看见，不被扣分 */
const BOOST = {
  p12:  '今天做到一件就很棒，剩下的留给明天。',
  p36:  '今天不用全做完，剩下的留给明天。',
  mid:  '今天已经很棒了，剩下的留给明天。',
  high: '今天只要有一件事是往前走的，就够了。',
};

Page({
  data: {
    stage: 'mid',
    nick: '',
    cap: 12,
    score: 0,
    remain: 0,
    dims: [],                       // [{ k, n, cls, cap, items:[…] }]
    boostText: '',
    itemCount: 0,
    ruleHint: '',
    flashText: '',
    flashSaved: false,
    streak: 0,
    weekScore: 0,
    lifeScore: 0,
    couponCount: 0,
    ringPx: 112,                    // 得分环直径（px，见 calcRingPx）
    canRecord: false,               // 低段：家长可代记（孩子还小，按不动手机）

    /* 具体肯定卡（对应原型 praiseSheet）：文案引擎的出口 */
    sheet: false,
    fact: '',
    trait: '',
    points: 0,
    overflow: 0,
    dimName: '',
    praiseUid: '',
    selfOpen: false,
    selfText: '',
    altSeed: 0,
  },

  onLoad() {
    // 冷启动闸门：未完成「必改 3 项」就先去共建，这一页不渲染
    if (app.gateOnboarding()) return;
    // 先算出本机应显示的环直径，再渲染，避免首帧用错尺寸
    this.setData({ ringPx: store.calcRingPx() });
    this.render();
  },
  onShow() {
    if (guard.requireOnboarded()) return;   // 未完成「必改 3 项」前不放行
    this.render();
  },
  onReady() {
    // canvas 节点在 ready 之后才可查询，这里把尺寸与当前分数补给它
    this.drawRing();
  },
  onPullDownRefresh() {
    this.render();
    wx.stopPullDownRefresh();
  },

  /** 环的重绘统一从这里走：先确保 px 尺寸，再把分数传下去 */
  drawRing() {
    const ring = this.selectComponent('#ring');
    if (!ring) return;
    const px = store.calcRingPx();
    if (px !== this.data.ringPx) this.setData({ ringPx: px });
    ring.render(Number(this.data.score) || 0, Number(this.data.cap) || 12);
  },

  /* ---------------- 渲染 ---------------- */

  render() {
    const s = store.state();
    if (!s) return;
    const cap = store.capNow();
    const date = store.todayKey();
    const score = store.dayScore(date);
    const capped = score >= cap;

    // 按维度分组：active !== false 的条目才出现，顺序沿用模板顺序
    const dims = store.DIMS.map(d => ({ k: d.k, n: d.n, cls: 'dim--' + d.k, cap, items: [] }));
    const byDim = {};
    dims.forEach(d => { byDim[d.k] = d; });

    const items = store.itemsOf();
    items.forEach(it => {
      const box = byDim[it.dim];
      if (!box) return;
      const used = store.countOn(it.id, date);
      const maxed = used >= it.limit;
      box.items.push({
        id: it.id,
        name: it.name,
        points: it.points,
        limit: it.limit,
        used,
        maxed,
        // 到日上限后除「本条已记满」之外的卡片都转为只提示，与原型 dataset.locked 一致
        locked: capped && !maxed,
        countTxt: used + '/' + it.limit,
      });
    });

    const stats = app.globalData.bump();
    this.setData({
      stage: s.stage,
      onboarded: !!s.onboarded,   // 闸门：未共建完不渲染页面
      nick: s.nick,
      cap,
      score,
      remain: Math.max(0, cap - score),
      dims: dims.filter(d => d.items.length > 0),
      boostText: BOOST[s.stage] || BOOST.mid,
      itemCount: items.length,
      ruleHint: items.length + ' 条行为 · ' + s.rewards.length + ' 档奖励',
      streak: stats.streak,
      weekScore: stats.weekScore,
      lifeScore: stats.lifetime,
      couponCount: stats.couponCount,
      canRecord: store.canParentRecord(),
    }, () => this.drawRing());
  },

  /* ---------------- 打卡（唯一加分入口） ---------------- */

  onTapItem(e) {
    const id = e.currentTarget.dataset.id;
    const it = store.itemById(id);
    if (!it) return;

    // 两种「不能再加分」分开提示，避免把「到上限」说成是她没做到
    if (store.dayScore(store.todayKey()) >= store.capNow()) {
      wx.showToast({ title: '今天已经很棒了，剩下的留给明天', icon: 'none' });
      return;
    }
    if (store.countOn(it.id, store.todayKey()) >= it.limit) {
      wx.showToast({ title: '今天这项已经记过啦，明天再来', icon: 'none' });
      return;
    }

    const r = store.addPoints({
      itemId: it.id,
      name: it.name,
      dim: it.dim,
      points: it.points,
      praise: store.praiseOf(it),
    });

    if (!r.ok) {
      wx.showToast({ title: r.reason, icon: 'none', duration: 2000 });
      this.render();
      return;
    }
    this.render();
    this.openPraise(r.entry);
  },

  /* ---------------- 具体肯定卡 ---------------- */

  openPraise(entry) {
    const parts = store.splitPraise(entry.praise);
    this.setData({
      sheet: true,
      fact: parts.fact || entry.name,
      trait: parts.trait || '你在往前走',
      points: entry.points,
      overflow: entry.overflow || 0,
      dimName: store.dimLabel(entry.dim),
      praiseUid: entry.uid,
      selfOpen: false,
      selfText: '',
      altSeed: 0,
    });
  },

  closePraise() { this.setData({ sheet: false, selfOpen: false }); },

  /** 弹层内部点击不该关掉弹层（catchtap 需要一个真实存在的方法） */
  noop() {},

  dimKeyOf() {
    const e = store.state().log.find(l => l.uid === this.data.praiseUid);
    return e ? e.dim : 'self';
  },

  /** 「换一句」只换特质描述，不换事实：事实是她刚做的事，不能改 */
  onAnother() {
    const next = this.data.altSeed + 1;
    const line = store.altPraise(this.dimKeyOf(), next);
    if (!line) return;
    this.setData({ trait: line, altSeed: next });
  },

  onSelfOpen() { this.setData({ selfOpen: true, selfText: '' }); },
  onSelfInput(e) { this.setData({ selfText: e.detail.value }); },

  onSelfSave() {
    const r = store.setEntryPraise(this.data.praiseUid, this.data.selfText);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    this.setData({ selfOpen: false });
    wx.showToast({ title: '存好了，这句话是你自己说的', icon: 'none' });
    this.render();
  },

  onPraiseOk() {
    const over = this.data.overflow;
    this.setData({ sheet: false, selfOpen: false });
    if (over > 0) {
      wx.showToast({ title: '到上限了，多做的 ' + over + ' 分没计入，但已经看见', icon: 'none' });
    }
  },

  /* ---------------- 今日闪光点 ---------------- */

  onFlashInput(e) {
    this.setData({ flashText: e.detail.value, flashSaved: false });
  },

  onFlashSave() {
    const t = (this.data.flashText || '').trim();
    if (!t) {
      wx.showToast({ title: '写一句就好，短一点也没关系', icon: 'none' });
      return;
    }
    store.setFlash(t);
    this.setData({ flashSaved: true });
    wx.showToast({ title: '今天的你，被留下来了', icon: 'none' });
    this.render();
  },

  /* ---------------- 页面跳转 ---------------- */

  goRepair() { wx.navigateTo({ url: '/pages/repair/index' }); },
  goRules() { wx.navigateTo({ url: '/pages/rules/index' }); },
  goShop() { wx.switchTab({ url: '/pages/shop/index' }); },
  goMe() { wx.switchTab({ url: '/pages/me/index' }); },
  /** 低段：孩子还小，把家长端入口摆在明面上（家长端里有「帮 TA 记一笔」） */
  goParent() { wx.navigateTo({ url: '/pages/parent/index' }); },
});
