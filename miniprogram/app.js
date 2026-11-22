/* ============================================================
   罗森塔尔 Rosenthal · app.js（小程序入口）
   对应移植指南：原型 app.js 里的 globalData + utils/store.js 两层。

   这里只做三件事：
   1. 首次启动把状态读出来（或建一份新状态）；
   2. 把规则引擎挂到 globalData，方便页面直接取用；
   3. 提供页面间共享的派生数据（页面通知后刷新）。
   ============================================================ */
'use strict';

const store = require('./utils/store.js');
const guard = require('./utils/guard.js');
const sync = require('./utils/sync.js');
const cloud = require('./cloud/adapter.js');

App({
  globalData: {
    store,
    guard,
    sync,
    cloud,
    stats: null,
    /** 页面改过状态后调用：刷新派生数据并让其他已打开页面重读 */
    bump() {
      this.stats = this.snapshot();
      return this.stats;
    },
    /** 一次算出各页面都要用的数字，避免每个页面各算一遍 */
    snapshot() {
      const s = store.state();
      return {
        stage: s.stage,
        nick: s.nick,
        grade: s.grade,
        cap: store.capNow(),
        todayScore: store.dayScore(store.todayKey()),
        balance: store.balance(),
        lifetime: store.lifetime(),
        streak: store.streak(),
        weekScore: store.weekScore(),
        amended: store.amendedCount(),
        onboarded: !!s.onboarded,
        pending: store.confirmedCount(),
        couponCount: s.coupons.filter(c => !c.used).length,
      };
    },
  },

  onLaunch() {
    // 冷启动：读出本地状态；没有就走一份「还没共建过规则」的新状态
    store.load();
    this.globalData.stats = this.globalData.snapshot();
  },

  /**
   * 冷启动闸门：规则还没双签生效时，reLaunch 到该去的地方
   * （孩子没改完 → 共建页；改完了等家长 → 家长签署页）。
   * 首页在 onLoad 里调用，这样不必给 app.json 再加一个入口页。
   * 返回 true 表示已经跳走，首页应当停止后续流程。
   */
  gateOnboarding() {
    /* 首次冷启动先把「罗森塔尔效应」讲一遍（store.needsIntro），
       看完再按闸门走：孩子没改完 → 共建页；改完了等家长 → 家长签署页。 */
    if (!store.needsIntro() && !guard.needsOnboarding()) return false;
    wx.reLaunch({ url: guard.gateTarget() });
    return true;
  },

  /**
   * 合并一份对端状态（云或另一台设备），按 PRD §9 的策略。
   * 没有云环境时也可以在「我的 → 我的数据」里手动触发，用于自查合并行为。
   * @returns {{ok:boolean, stats?:object, log?:Array, reason?:string}}
   */
  mergeCloud(remoteState) {
    if (!remoteState || typeof remoteState !== 'object') {
      return { ok: false, reason: '没有可合并的对端数据' };
    }
    const res = sync.merge(store.state(), remoteState);
    store.replaceState(res.state);
    this.globalData.stats = this.globalData.snapshot();
    return { ok: true, stats: res.stats, log: res.log, text: sync.logText(res.log) };
  },
});
