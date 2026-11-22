/* ============================================================
   罗森塔尔 · pages/onboarding/index.js（规则共建 · 必改 3 项）

   这是第三条硬约束的**首启闸门**：
   · 第一次打开、或切换学段之后（切换学段 = 重新定一次规则），
     这一页会盖住整个应用，改不满 3 处就点不动「开始使用」；
   · 三个改动分别计入 amend.point / amend.item / amend.reward，
     真正生效由 store.finishBuild() 判定 —— 前端置灰只是提示，不是防线；
   · app.js 的 requireOnboarded() 会在每个页面的 onShow 里兜底，
     所以绕过这一页直接进 tab（返回键、分享链接进入某个 tab）也会被弹回来。
   ============================================================ */
'use strict';

const store = require('../../utils/store.js');

const app = getApp();

const SCORES = [1, 2, 3, 4, 5];
const SCORE_LABELS = SCORES.map(n => n + ' 分');

Page({
  data: {
    /* 学段：页面根节点用它拼 .stage-* 类（换主题），由 render() 从 store 里填 */
    stage: 'mid',
    /* 进度 */
    amend: { point: 0, item: 0, reward: 0 },
    amended: 0,
    missing: '',
    canFinish: false,
    finishTxt: '',
    stageName: '',
    cap: 12,
    itemCount: 0,
    rewardCount: 0,

    /* ① 改分值：与原型一致，先给前 8 条 */
    pointItems: [],
    /* ② 改行为项：删掉候选 + 新增输入 */
    delItems: [],
    newName: '',
    newPoints: 2,
    newPointsLabel: '2 分',
    newPointsIdx: 1,
    /* ③ 改奖励 */
    rewards: [],
    editingCost: 0,
    editingTitle: '',
  },

  onLoad() { this.render(); },
  onShow() { this.render(); },

  render() {
    const s = store.state();
    if (!s) return;
    const amended = store.amendedCount();
    const items = store.itemsOf();
    const labels = { point: '改分值', item: '改行为项', reward: '改奖励' };
    const missing = ['point', 'item', 'reward']
      .filter(k => !(s.amend[k] > 0))
      .map(k => labels[k])
      .join('、');

    /* 已改过的排在前面，方便她看到自己动过哪些 */
    const sorted = items.slice().sort((a, b) => (b.customBy === 'child' ? 1 : 0) - (a.customBy === 'child' ? 1 : 0));

    this.setData({
      stage: s.stage,                  // 页面根节点的 .stage-* 主题类
      amend: s.amend,
      amended,
      missing,
      /* picker 的候选：分值 1–5（与加减按钮的边界一致）。
         之前只在 data 里写了 newPointsLabel，忘了给 range 用的 scores，
         结果 picker 的 range 是空的 —— 模板引用了却没赋值的字段就会这样。 */
      scores: SCORE_LABELS,
      canFinish: store.canFinishBuild(),
      finishTxt: store.canFinishBuild() ? '提交提案，给妈妈确认' : ('还差：' + missing),
      stageName: store.stageOf(s.stage).n,
      cap: store.capNow(),
      itemCount: items.length,
      rewardCount: s.rewards.length,
      pointItems: sorted.slice(0, 8).map(i => ({
        id: i.id, name: i.name, points: i.points,
        changed: i.customBy === 'child',
        // 分值范围 1–5，与原型的加减按钮一致
        canMinus: i.points > 1,
        canPlus: i.points < 5,
      })),
      delItems: sorted.slice(0, 10).map(i => ({ id: i.id, name: i.name, points: i.points })),
      rewards: s.rewards.map(r => ({ cost: r.cost, tier: r.tier, title: r.title, changed: r.customBy === 'child' })),
    });
  },

  /* ---------------- ① 改分值 ---------------- */

  onPlus(e) { this.bumpPoints(e.currentTarget.dataset.id, 1); },
  onMinus(e) { this.bumpPoints(e.currentTarget.dataset.id, -1); },

  bumpPoints(id, d) {
    const it = store.itemById(id);
    if (!it) return;
    const next = it.points + d;
    if (next < 1 || next > 5) return;              // 与原型的 1–5 边界一致
    const r = store.setItemPoints(id, next);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    this.render();
  },

  /* ---------------- ② 改行为项 ---------------- */

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    const it = store.itemById(id);
    if (!it) return;
    wx.showModal({
      title: '删掉「' + it.name + '」？',
      content: '删掉后它不再出现在今天。历史记录里已经得过分的条目不会被抹掉，随时能改回来。',
      success: res => {
        if (!res.confirm) return;
        store.removeItem(id);
        this.render();
      },
    });
  },

  onNewNameInput(e) { this.setData({ newName: e.detail.value }); },
  onNewPoints(e) {
    const idx = Number(e.detail.value);
    this.setData({ newPoints: SCORES[idx], newPointsIdx: idx, newPointsLabel: SCORE_LABELS[idx] });
  },

  onAddItem() {
    const name = (this.data.newName || '').trim();
    if (!name) { wx.showToast({ title: '先写一句你想加的事', icon: 'none' }); return; }
    const r = store.addItem({
      name: name, dim: 'self', points: this.data.newPoints, limit: 1,
      p: '把这件事做到了', t: '这是你自己加进来的一条',
    });
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    this.setData({ newName: '' });
    this.render();
    wx.showToast({ title: '加好了，放在「自主力」里', icon: 'none' });
  },

  /* ---------------- ③ 改奖励 ---------------- */

  onEditReward(e) {
    const cost = Number(e.currentTarget.dataset.cost);
    const r = store.state().rewards.find(x => x.cost === cost);
    this.setData({ editingCost: cost, editingTitle: r ? r.title : '' });
  },

  onRewardInput(e) { this.setData({ editingTitle: e.detail.value }); },

  onSaveReward() {
    const out = store.setRewardTitle(this.data.editingCost, this.data.editingTitle);
    if (!out.ok) { wx.showToast({ title: out.reason, icon: 'none' }); return; }
    this.setData({ editingCost: 0, editingTitle: '' });
    this.render();
    wx.showToast({ title: '记下了：这条奖励换成你要的', icon: 'none' });
  },

  onCancelReward() { this.setData({ editingCost: 0, editingTitle: '' }); },

  /**
   * 提交提案：改满 3 处后还不能直接开始用 ——
   * 规则要**家长签一次**才生效（PRD §3：单方修改进入待生效）。
   * 所以这里把提案存下来，然后带她去家长签署页。
   */
  onFinish() {
    const r = store.finishBuild();
    if (!r.ok) {
      // store 是真正的防线：未改满 3 处一定进不去
      wx.showToast({ title: r.reason, icon: 'none' });
      this.render();
      return;
    }
    app.globalData.bump();
    wx.showModal({
      title: '提案提交好了',
      content: '规则 v1.' + r.ruleVersion + ' 还差最后一步：请妈妈点一次「我按你的版本来」，' +
               '两边都签了才生效 —— 她也不能自己偷偷改。',
      showCancel: false,
      confirmText: '去让妈妈确认',
      success: () => {
        this.render();
        wx.redirectTo({ url: '/pages/parent/index' });
      },
    });
  },

  /**
   * 「先去看看」：允许瞥一眼主界面，但**闸门仍然生效** ——
   * 到了今天页 onShow 会被 guard 弹回来，所以这只是一个提示，不是绕过。
   * 这样既不让按钮点了没反应，也不给「跳过共建」留后门。
   */
  onSkip() {
    wx.showToast({ title: '随时可以在「我的 → 规则共建」里继续改', icon: 'none' });
    wx.switchTab({ url: '/pages/today/index' });
  },
});
