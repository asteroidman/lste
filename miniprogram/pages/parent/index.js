/* ============================================================
   罗森塔尔 · pages/parent/index.js（家长端）
   对应原型 renderParent() 与 PRD §1.4 红线 3：
   家长看不到「她今天没做什么」，只看得到「她做到了什么」，
   而且**不可删除**她的记录 —— 本页与 utils/store.js 都不提供删除接口。
   ============================================================ */
'use strict';

const store = require('../../utils/store.js');
const guard = require('../../utils/guard.js');

const app = getApp();

const fmtDate = k => { const p = String(k).split('-'); return p.length === 3 ? (Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日') : k; };

Page({
  data: {
    stage: 'mid',
    tab: 'todo',
    tabs: [
      { k: 'todo', n: '待确认' },
      { k: 'praise', n: '鼓励' },
      { k: 'report', n: '报告' },
      { k: 'record', n: '帮 TA 记' },
    ],
    todo: [],
    todoCount: 0,
    praise: [],
    report: null,
    banned: [],
    /* 帮 TA 记一笔：只在低段（家长陪记 / 可补记）开放，初中高中由她自己打卡 */
    canRecord: false,
    recordNote: '',
    recordItems: [],
    /* 规则双签：家长没签之前，这一页只显示签署卡 */
    signed: false,
    sig: null,
    amendList: [],       // 孩子改过的那几处，签字前要能看见自己同意了什么
  },

  onLoad() { this.render(); },
  onShow() {
    // 家长端是签署入口，传自己的路由让闸门放行；是否显示完整家长端由 signed 决定
    if (guard.requireOnboarded('pages/parent/index')) return;
    this.render();
  },

  /** 家长点「我按你的版本来」 */
  onAgree() {
    const r = store.parentAgree();
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    app.globalData.bump();
    wx.showModal({
      title: '规则 v1.' + r.version + ' 已生效',
      content: '从今天起按这一版执行，生效日期 ' + r.agreedDate +
               '。你不会偷偷改，她也不能单方改 —— 要改就得再签一次。',
      showCancel: false,
      confirmText: '好',
    });
    this.render();
  },

  render() {
    const s = store.state();
    if (!s) return;

    const sig = store.ruleSignature();
    const amendList = [];
    (s.items || []).forEach(i => {
      if (i.customBy === 'child') amendList.push({ kind: '行为项', text: i.name + '（' + i.points + ' 分）', active: i.active !== false });
    });
    (s.rewards || []).forEach(r => {
      if (r.customBy === 'child') amendList.push({ kind: '奖励', text: r.cost + ' 分 · ' + r.title, active: true });
    });

    /* 家长端的**唯一**数据来源：visibleToParent 会剔除她标了「仅自己可见」的条目。
       这里绝不直接读 s.log —— 页面自己过滤等于把隐私交给每个页面记得写 filter。 */
    const seen = store.visibleToParent();

    // ① 待确认：只列未确认的**正向**记录
    const todo = seen
      .filter(l => !l.confirmed && !l.reversed)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 20)
      .map(l => ({
        uid: l.uid,
        name: l.name,
        points: l.points,
        dateTxt: fmtDate(l.date),
        dim: store.dimLabel(l.dim),
        praise: l.praise,
        byParent: !!l.byParent,
      }));

    // ② 鼓励：已经确认过的记录，家长可以照着文案念一句
    const praise = seen
      .filter(l => l.confirmed && !l.reversed)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 10)
      .map(l => ({ uid: l.uid, name: l.name, points: l.points, dateTxt: fmtDate(l.date), praise: l.praise, byParent: !!l.byParent }));

    // ③ 报告：只统计「做到了什么」，不给缺口、不给对比
    const stats = app.globalData.bump();
    const week = store.weekDates().map(d => ({ date: d, sc: store.dayScore(d) }));
    const byDim = {};
    seen.filter(l => !l.reversed).forEach(l => {
      byDim[l.dim] = (byDim[l.dim] || 0) + l.points;
    });
    const report = {
      streak: stats.streak,
      weekScore: stats.weekScore,
      lifetime: stats.lifetime,
      week,
      dims: store.DIMS.map(d => ({ n: d.n, v: byDim[d.k] || 0 })),
      confirmedRatio: seen.length ? Math.round(seen.filter(l => l.confirmed).length / seen.length * 100) : 0,
      couponCount: s.coupons.filter(c => !c.used).length,
      hidden: store.hiddenCount(),     // 有多少条被她收起来了，只报数不报内容
    };

    this.setData({
      stage: s.stage,
      onboarded: !!s.onboarded,   // 闸门：未共建完不渲染页面
      signed: sig.active,         // 双签完成才显示完整家长端
      sig,
      amendList,
      todo,
      todoCount: todo.length,
      praise,
      report,
      banned: store.BANNED,
      /* 低龄孩子没法自己操作手机：低段给家长一个「帮 TA 记一笔」的入口 */
      canRecord: store.canParentRecord(),
      recordNote: store.canParentRecord()
        ? '她这个学段还小，你可以替她记 —— 记完会算进她的今天。'
        : '这个学段由她自己打卡，家长不代记 —— 这是对她的信任。',
      recordItems: store.canParentRecord()
        ? store.DIMS.map(d => ({
            k: d.k, n: d.n, cls: 'dim--' + d.k,
            items: store.itemsOf().filter(i => i.dim === d.k)
              .map(i => ({ id: i.id, name: i.name, points: i.points })),
          })).filter(d => d.items.length > 0)
        : [],
    });
  },

  onTab(e) {
    this.setData({ tab: e.currentTarget.dataset.k });
  },

  /**
   * 帮 TA 记一笔：代低龄孩子打卡。
   * 走的仍是 store.parentRecord → 唯一写入口 addPoints，只加分、日上限照旧；
   * 记录会盖上 byParent 戳，看得见是谁记的。家长依旧**没有**删除能力。
   */
  onRecord(e) {
    const id = e.currentTarget.dataset.id;
    const r = store.parentRecord(id);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    app.globalData.bump();
    wx.showToast({ title: '记下了，已经算进她今天', icon: 'none' });
    this.render();
  },

  /** 家长端 → 孩子端：低段家长常拿着手机，给一个明确的来回切换 */
  goChild() { wx.switchTab({ url: '/pages/today/index' }); },

  /** 家长唯一的写操作：确认 + 一句具体表扬。没有删除、没有改分 */
  onConfirm(e) {
    const uid = e.currentTarget.dataset.uid;
    const r = store.confirmEntries(uid);
    if (!r.ok) { wx.showToast({ title: '这条已经确认过了', icon: 'none' }); return; }
    wx.showToast({ title: '已确认，可以照着一句念给她听', icon: 'none' });
    this.render();
  },

  onConfirmAll() {
    const uids = this.data.todo.map(t => t.uid);
    if (!uids.length) return;
    const r = store.confirmEntries(uids);
    wx.showToast({ title: '确认了 ' + r.confirmed + ' 条', icon: 'none' });
    this.render();
  },
});
