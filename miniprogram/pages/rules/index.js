/* ============================================================
   罗森塔尔 · pages/rules/index.js（我的规则）
   对应原型 renderRules() 与 renderBuild() 的一部分。

   这一页承载第三条硬约束「必改 3 项」的落地入口：
   · 改分值 → amend.point
   · 删行为项 / 加行为项 → amend.item
   · 改奖励内容 → amend.reward
   三处都改过才允许 finishBuild()，否则 store 直接拒绝（不是前端置灰而已）。
   ============================================================ */
'use strict';

const store = require('../../utils/store.js');
const guard = require('../../utils/guard.js');
const exportGate = require('../../utils/export-gate.js');

const app = getApp();

const SCORES = [1, 2, 3, 4, 5];
const SCORE_LABELS = SCORES.map(n => n + ' 分');

const DATE_CN = k => { const p = String(k).split('-'); return p.length === 3 ? (Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日') : k; };
const whoOf = it => {
  if (it.customBy === 'child') return '月亮改的' + (it.stamp ? ' · ' + DATE_CN(it.stamp) : '');
  return '家长定的';
};

Page({
  data: {
    stage: 'mid',
    dims: [],
    rewards: [],
    scores: SCORE_LABELS,
    amend: { point: 0, item: 0, reward: 0 },
    amended: 0,
    amendChip: '',
    canFinish: false,
    finishTxt: '',
    onboarded: false,
    ruleVersion: 0,
    newItemName: '',
    newItemPoints: 2,
    newItemPointsLabel: '2 分',
    newItemPointsIdx: 1,
  },

  onLoad() { this.render(); },
  onShow() {
    if (guard.requireOnboarded()) return;   // 未完成「必改 3 项」前不放行
    this.render();
  },

  render() {
    const s = store.state();
    if (!s) return;
    const amended = store.amendedCount();

    const dims = store.DIMS.map(d => ({
      k: d.k,
      n: d.n,
      cls: 'dim--' + d.k,
      items: [],
    })).filter(d => {
      d.items = store.itemsOf().filter(i => i.dim === d.k).map(i => ({
        id: i.id,
        name: i.name,
        points: i.points,
        limit: i.limit,
        who: whoOf(i),
        mine: i.customBy === 'child',
      }));
      return d.items.length > 0;
    });

    const sig = store.ruleSignature();
    this.setData({
      stage: s.stage,
      dims,
      rewards: s.rewards.map(r => ({ cost: r.cost, tier: r.tier, title: r.title, who: r.customBy === 'child' ? '月亮改的' : '家长定的', mine: r.customBy === 'child' })),
      amend: s.amend,
      amended,
      amendChip: amended >= 3 ? '已改满 3 处' : ('已改 ' + amended + ' / 3 处'),
      canFinish: store.canFinishBuild(),
      finishTxt: store.canFinishBuild() ? '提交提案，给妈妈确认' : ('还差 ' + (3 - amended) + ' 处'),
      onboarded: !!s.onboarded,
      ruleVersion: s.ruleVersion || 0,
      /* 双签状态：没签完就不能说「已生效」 */
      sigActive: sig.active,
      sigText: sig.active
        ? ('规则 v1.' + sig.ruleVersion + ' 已双签生效 · ' + sig.agreedDate)
        : (amended >= 3 ? '已提交，等妈妈点一次「我按你的版本来」才生效' : '改满 3 处后才能提交给妈妈确认'),
    });
  },

  /* ---- 改分值（第 1 改） ---- */
  onPickScore(e) {
    const id = e.currentTarget.dataset.id;
    const idx = Number(e.detail.value);
    const r = store.setItemPoints(id, SCORES[idx]);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    wx.showToast({ title: '这条改成 ' + r.item.points + ' 分，记下是你改的', icon: 'none' });
    this.render();
  },

  /* ---- 删行为项（第 2 改） ---- */
  onRemoveItem(e) {
    const id = e.currentTarget.dataset.id;
    const it = store.itemById(id);
    if (!it) return;
    wx.showModal({
      title: '删掉「' + it.name + '」？',
      content: '删掉后它不再出现在今天。历史记录里已经得过分的条目不会被抹掉，随时可以改回来。',
      success: res => {
        if (!res.confirm) return;
        store.removeItem(id);
        wx.showToast({ title: '已删掉，这是你改的', icon: 'none' });
        this.render();
      },
    });
  },

  onNewItemInput(e) { this.setData({ newItemName: e.detail.value }); },
  onNewItemPoints(e) {
    const idx = Number(e.detail.value);
    this.setData({ newItemPoints: SCORES[idx], newItemPointsIdx: idx, newItemPointsLabel: SCORE_LABELS[idx] });
  },
  onAddItem() {
    const name = (this.data.newItemName || '').trim();
    if (!name) { wx.showToast({ title: '先写一条你想要的', icon: 'none' }); return; }
    const r = store.addItem({ name, dim: 'self', points: this.data.newItemPoints, limit: 1,
                              p: '把这件事做完了', t: '你在给自己加一件真正想做的事' });
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    this.setData({ newItemName: '' });
    wx.showToast({ title: '加上了，这一条是你自己定的', icon: 'none' });
    this.render();
  },

  /* ---- 改奖励内容（第 3 改） ---- */
  onPickReward(e) {
    const cost = e.currentTarget.dataset.cost;
    const r = store.state().rewards.find(x => x.cost === Number(cost));
    if (!r) return;
    wx.showModal({
      title: '把 ' + cost + ' 分这档换成你要的',
      editable: true,
      placeholderText: '写清楚想要什么，越具体越好',
      content: r.title,
      success: res => {
        if (!res.confirm) return;
        const out = store.setRewardTitle(cost, res.content);
        if (!out.ok) { wx.showToast({ title: out.reason, icon: 'none' }); return; }
        wx.showToast({ title: '记下了：这条奖励换成你要的', icon: 'none' });
        this.render();
      },
    });
  },

  /* ---- 改奖励分值 / 新增 / 删除（都属于「改奖励」这一改） ---- */
  onSetCost(e) {
    const cost = Number(e.currentTarget.dataset.cost);
    const r = store.state().rewards.find(x => x.cost === cost);
    if (!r) return;
    wx.showModal({
      title: '把 ' + cost + ' 分这档改成多少分？',
      editable: true,
      placeholderText: '填一个新的分值（正整数）',
      content: String(cost),
      success: res => {
        if (!res.confirm) return;
        const n = parseInt(res.content, 10);
        const out = store.setRewardCost(cost, n);
        if (!out.ok) { wx.showToast({ title: out.reason, icon: 'none' }); return; }
        wx.showToast({ title: '分值改好了：' + out.reward.cost + ' 分', icon: 'none' });
        this.render();
      },
    });
  },

  onRemoveReward(e) {
    const cost = Number(e.currentTarget.dataset.cost);
    wx.showModal({
      title: '删掉 ' + cost + ' 分这档奖励？',
      content: '删掉后兑换页不再出现它。已经发出的券不受影响，随时可以再加回来。',
      success: res => {
        if (!res.confirm) return;
        const out = store.removeReward(cost);
        if (!out.ok) { wx.showToast({ title: out.reason, icon: 'none' }); return; }
        wx.showToast({ title: '删掉了', icon: 'none' });
        this.render();
      },
    });
  },

  onAddReward() {
    wx.showModal({
      title: '加一档奖励',
      editable: true,
      placeholderText: '格式：分值 空格 内容，例「500 一次海边旅行」',
      content: '',
      success: res => {
        if (!res.confirm) return;
        const text = String(res.content || '').trim();
        const m = text.match(/^(\d+)\s+(.+)$/);
        if (!m) { wx.showToast({ title: '写成「分值 内容」，例：500 一次旅行', icon: 'none' }); return; }
        const out = store.addReward({ cost: Number(m[1]), title: m[2] });
        if (!out.ok) { wx.showToast({ title: out.reason, icon: 'none' }); return; }
        wx.showToast({ title: '加好了：' + out.reward.cost + ' 分', icon: 'none' });
        this.render();
      },
    });
  },

  /* ---- 完成共建（未改满 3 处会被 store 拒绝） ---- */
  onFinish() {
    const r = store.finishBuild();
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    app.globalData.bump();
    /* 提交只是提案完成：规则要家长签一次才生效（PRD §3 单方修改待生效）。
       所以这里不再宣称「已生效」，而是带她去家长签署页。 */
    wx.showModal({
      title: '提案提交好了',
      content: '规则 v1.' + r.ruleVersion + ' 还差妈妈签一次「我按你的版本来」才生效。',
      showCancel: false,
      confirmText: '去让妈妈确认',
      success: () => {
        this.render();
        wx.redirectTo({ url: '/pages/parent/index' });
      },
    });
  },

  /* ---- 打印 / 下载：罗森塔尔规则表（四学段通用） ---- */

  /**
   * 导出规则表：先过免费配额闸门（试运行免费 3 次，用满提示「内测中」），
   * 再把它画成一张可打印的长图预览。交付成功后由 export-gate 计次。
   */
  onPrintRuleTable() {
    if (!exportGate.allowed()) return;
    exportGate.image('rule', store.buildRuleTable({ nick: store.state().nick }));
  },

  /** 规则表的 Excel 版（CSV），双击即开 */
  onExportRuleCsv() {
    if (!exportGate.allowed()) return;
    const csv = store.buildRuleTableCsv();
    wx.setClipboardData({
      data: csv.text,
      success: () => {
        exportGate.done();
        wx.showToast({ title: '已复制，粘到 Excel 里就是一张表', icon: 'none', duration: 2400 });
      },
    });
  },
});
