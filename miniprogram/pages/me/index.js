/* ============================================================
   罗森塔尔 · pages/me/index.js（我的）
   对应原型 renderMe()：昵称、学段、规则共建进度、学段切换与入口列表。
   学段只能升不能降，且切换后强制重走一次「必改 3 项」（README §10 验收清单）。
   ============================================================ */
'use strict';

const store = require('../../utils/store.js');
const guard = require('../../utils/guard.js');
const exportGate = require('../../utils/export-gate.js');

const app = getApp();

Page({
  data: {
    stage: 'mid',
    nick: '',
    initial: '',
    grade: '',
    stageName: '',
    stageChip: '',
    stageSub: '',
    stagePerm: '',
    amended: 0,
    amendChip: '',
    ruleHint: '',
    menu: [],
    stageNames: [],      // picker 的候选：小学低段 → 高中
    /* 惊喜卡（自选，非抽奖） */
    surpriseOpen: false,
    surpriseCards: [],
    surpriseTxt: '',
    surpriseCanDraw: false,
  },

  onLoad() { this.render(); },
  onShow() {
    if (guard.requireOnboarded()) return;   // 未完成「必改 3 项」前不放行
    this.render();
  },

  render() {
    const s = store.state();
    if (!s) return;
    const stages = store.STAGES;
    const st = stages.find(x => x.k === s.stage) || stages[2];
    const amended = store.amendedCount();
    const items = store.itemsOf();

    const menu = [
      { key: 'rules',  icon: '规', label: '我的规则',  sub: items.length + ' 条行为 · ' + s.rewards.length + ' 档奖励 · 谁改的都有记录', url: '/pages/rules/index' },
      { key: 'repair', icon: '修', label: '修复行动',  sub: '手机超时 / 发脾气 / 拖延 / 没做到约定', url: '/pages/repair/index' },
      { key: 'parent', icon: '家', label: '家长端',    sub: '她只能看到你做到的，看不到你没做的', url: '/pages/parent/index' },
      { key: 'about',  icon: '斯', label: '关于罗森塔尔', sub: '期望的力量 · 随时再看一遍', url: '/pages/intro/index?from=me' },
    ];

    const sp = store.surpriseState();
    const sig = store.ruleSignature();

    this.setData({
      stage: s.stage,
      onboarded: !!s.onboarded,   // 闸门：未共建完不渲染页面
      nick: s.nick,
      initial: String(s.nick || '月').slice(0, 1),
      grade: st.n + ' · ' + st.g,
      stageName: st.n + '版规则',
      stageChip: '每日上限 ' + st.cap + ' 分',
      stageSub: st.sub,
      stagePerm: st.perm,
      amended,
      amendChip: amended >= 3 ? '已改满 3 处' : ('已改 ' + amended + ' / 3 处'),
      ruleHint: '当前是你自己的版本' + (s.ruleVersion ? '（v1.' + s.ruleVersion + '）' : '') ,
      /* 双签状态：让她看见妈妈签没签，这是双向的留痕 */
      sigText: sig.active
        ? ('妈妈已确认 · 生效日期 ' + sig.agreedDate)
        : (amended >= 3 ? '还差妈妈点一次「我按你的版本来」' : '改满 3 处后，请妈妈签一次'),
      sigChip: sig.active ? '双方已确认' : '待妈妈确认',
      sigOk: sig.active,
      menu,
      stageNames: stages.map(x => x.n + '（' + x.g + ' · 上限 ' + x.cap + ' 分）'),
      surpriseCards: sp.cards,
      surpriseCanDraw: sp.canDraw,
      surpriseTxt: sp.claimed
        ? '本周已经挑过一张了，下周继续'
        : (sp.canDraw ? '可以挑 1 张了，进来自己选' : ('连续 ' + sp.streak + ' 天 · 满 7 天可挑 1 张')),
    });
  },

  /** 切换学段：换模板/上限/奖励，历史记录保留，但共建计数归零 */
  onPickStage(e) {
    const k = e.detail.value;
    const st = store.STAGES[Number(k)];
    if (!st || st.k === store.state().stage) return;
    wx.showModal({
      title: '切到「' + st.n + '」？',
      content: '上限会变成 ' + st.cap + ' 分，行为项与奖励换成这套模板；' +
               '历史记录一条都不会删。换学段等于重新定一次规则，所以「必改 3 项」要重来一遍。',
      success: res => {
        if (!res.confirm) return;
        store.applyStage(st.k);
        app.globalData.bump();
        wx.showToast({ title: '已切到' + st.n, icon: 'none' });
        this.render();
      },
    });
  },

  goRules() { wx.navigateTo({ url: '/pages/rules/index' }); },
  goRepair() { wx.navigateTo({ url: '/pages/repair/index' }); },
  goParent() { wx.navigateTo({ url: '/pages/parent/index' }); },
  goGrowth() { wx.switchTab({ url: '/pages/growth/index' }); },

  /** 入口列表统一跳转：menu 里只配 url，避免每加一个入口就写一个方法 */
  onNav(e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },

  /* ---------------- 数据主权：导出 / 指标 / 彻底删除（PRD §7） ---------------- */

  /** 一键导出全部数据（JSON，可存下来或发给家长） */
  onExportAll() {
    const all = store.exportAll();
    const n = store.state().log.length;
    wx.showModal({
      title: '导出全部数据',
      content: '共 ' + n + ' 条记录，文件名 ' + all.filename + '。\n' +
               '这是你自己的档案，导出后可以保存或备份。',
      cancelText: '取消',
      confirmText: '复制到剪贴板',
      success: res => {
        if (!res.confirm) return;
        wx.setClipboardData({
          data: all.text,
          success: () => wx.showToast({ title: '已复制，找个地方存起来', icon: 'none', duration: 2400 }),
        });
      },
    });
  },

  /** 本机指标（PRD §10 口径），给她自己看，也给将来接分析后端用 */
  onMetrics() {
    const r = store.metricsReport();
    wx.showModal({
      title: '这一段时间的样子',
      content: r.text.length > 900 ? (r.text.slice(0, 900) + '……') : r.text,
      showCancel: false,
      confirmText: '知道了',
    });
  },

  /**
   * 彻底删除全部数据（不可撤销）。
   * 两道确认，第二道显式问「备份了吗」—— 这是她自己的档案，不能一键误删。
   */
  onWipeAll() {
    wx.showModal({
      title: '删除全部数据？',
      content: '所有记录、券、周报和规则都会从这台设备上删掉，而且不能恢复。',
      cancelText: '算了',
      confirmText: '继续',
      confirmColor: '#A85624',
      success: res1 => {
        if (!res1.confirm) return;
        wx.showModal({
          title: '最后确认',
          content: '备份过了吗？要先导出的话现在就退出去导出。\n删除后会回到第一次打开的样子，规则要重新定一次。',
          cancelText: '我先备份',
          confirmText: '确认删除',
          confirmColor: '#A85624',
          success: res2 => {
            if (!res2.confirm) return;
            store.wipeAll();
            app.globalData.bump();
            wx.showToast({ title: '已删除，回到第一次打开的样子', icon: 'none', duration: 2000 });
            setTimeout(() => wx.reLaunch({ url: '/pages/onboarding/index' }), 900);
          },
        });
      },
    });
  },

  /* ---------------- 打印 / 下载：规则表 + 一周一页（四学段通用） ---------------- */

  /** 罗森塔尔规则表：当前学段的行为清单 + 分值 + 奖励档位 + 双签栏（出图） */
  onPrintRuleTable() {
    if (!exportGate.allowed()) return;
    exportGate.image('rule', store.buildRuleTable({ nick: this.data.nick }));
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

  /** 一周一页：这一周做到的事 + 双签栏（出图），与成长页共用 store.buildWeekPage */
  onPrintWeekPage() {
    if (!exportGate.allowed()) return;
    exportGate.image('week', store.buildWeekPage({ nick: this.data.nick }));
  },

  /* ---------------- 惊喜卡：自选，不是抽奖 ---------------- */

  onSurprise() {
    const sp = store.surpriseState();
    if (!sp.canDraw) {
      wx.showToast({ title: sp.claimed ? '本周已经领过一张了，下周继续'
                                       : ('连续记录满 7 天就能挑一张，现在 ' + sp.streak + ' 天'),
                     icon: 'none' });
      return;
    }
    // 打开弹层让她自己挑：这里零随机，没有任何概率机制
    this.setData({ surpriseOpen: true });
  },

  onCloseSurprise() { this.setData({ surpriseOpen: false }); },
  noop() {},

  onPickCard(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const r = store.drawSurprise(idx);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); this.setData({ surpriseOpen: false }); return; }
    this.setData({ surpriseOpen: false });
    wx.showModal({
      title: '这张卡放进你的券里了',
      content: r.card.t + '\n有效期 ' + r.coupon.exp + '。券一发出来，家长就不能撤回。',
      showCancel: false,
      confirmText: '知道了',
    });
    app.globalData.bump();
    this.render();
  },
});
