/* ============================================================
   罗森塔尔 · pages/growth/index.js（成长）
   对应原型 renderGrowth()：这一页只证明一件事 —— 做到过的都被留下来了。
   零比较、零排名，只有热力图、连续天数与可撤销的流水。
   ============================================================ */
'use strict';

const store = require('../../utils/store.js');
const guard = require('../../utils/guard.js');
const exportGate = require('../../utils/export-gate.js');

const app = getApp();

const CN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 热力等级：0 分是「休息」，不是失败，所以单独一档，不显示为空白羞耻 */
const levelOf = s => (s === 0 ? 0 : s <= 3 ? 1 : s <= 6 ? 2 : s <= 9 ? 3 : 4);

const fmtDate = k => {
  const p = String(k).split('-');
  return p.length === 3 ? (Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日') : k;
};
const fmtTime = ts => {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};
const dimName = k => store.dimLabel(k);
const mdCn = k => { const p = String(k).split('-'); return p.length === 3 ? (CN[Number(p[1])] + '月' + CN[Number(p[2])] + '日') : k; };

Page({
  data: {
    stage: 'mid',
    monthLabel: '',
    monthSum: 0,
    monthDays: 0,          // 那个月里「有记录」的天数
    streak: 0,
    lifetime: 0,
    weekScore: 0,
    activeDays: 0,         // 全部历史里有多少天有记录（而不是连续）
    heat: [],
    timeline: [],
  },

  onLoad() { this.render(); },
  onShow() {
    if (guard.requireOnboarded()) return;   // 未完成「必改 3 项」前不放行
    this.render();
  },

  render() {
    const s = store.state();
    if (!s) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const total = store.daysInMonth(y, m);
    const firstIdx = (new Date(y, m - 1, 1).getDay() + 6) % 7;   // 0 = 周一

    // 热力图：7 列，周一开头；空白格只是为了补齐第一周的位移
    const heat = [];
    for (let i = 0; i < firstIdx; i++) heat.push({ key: 'pad' + i, pad: true });
    let monthSum = 0, monthDays = 0;
    for (let d = 1; d <= total; d++) {
      // 未来的日子不画：否则本月剩下的日期会显示成「在休息」，那是错的
      if (d > now.getDate()) { heat.push({ key: 'future' + d, pad: true }); continue; }
      const date = store.dateKey(new Date(y, m - 1, d));
      const sc = store.dayScore(date);
      monthSum += sc;
      if (sc > 0) monthDays++;
      heat.push({
        key: date,
        pad: false,
        d,
        sc,
        lv: levelOf(sc),
        mark: sc >= 10 ? '✦' : '',
        today: d === now.getDate(),
      });
    }

    // 流水：最新的在前，最多展示 30 条，保证首屏不卡
    const timeline = s.log.slice().sort((a, b) => b.ts - a.ts).slice(0, 30).map(l => ({
      uid: l.uid,
      name: l.name,
      dim: dimName(l.dim),
      points: l.points,
      dateTxt: fmtDate(l.date) + ' ' + fmtTime(l.ts),
      praise: l.praise,
      reversed: !!l.reversed,
      isPrivate: !!l.private,
      byParent: !!l.byParent,
      canUndo: !l.reversed && (Date.now() - l.ts) <= 24 * 3600 * 1000,
    }));

    const stats = app.globalData.bump();
    this.setData({
      stage: s.stage,
      onboarded: !!s.onboarded,   // 闸门：未共建完不渲染页面
      /* 里程碑徽章：高中段由 .stage-high .miles{display:none} 整块隐藏（去游戏化） */
      milestones: store.milestones(),
      mileEarned: store.milestones().filter(m => m.earned).length,
      monthLabel: y + ' 年 ' + m + ' 月',
      monthSum,
      monthDays,
      streak: stats.streak,
      lifetime: stats.lifetime,
      weekScore: stats.weekScore,
      activeDays: Object.keys(s.log.reduce((acc, l) => { if (!l.reversed) acc[l.date] = 1; return acc; }, {})).length,
      heat,
      timeline,
    });
  },

  /* 24 小时内可撤销：不删历史，只打标记（store.undo） */
  onUndo(e) {
    const uid = e.currentTarget.dataset.uid;
    const r = store.undo(uid);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    wx.showToast({ title: '这条已撤销，记录还在', icon: 'none' });
    this.render();
  },

  /**
   * 隐私标记：这条只有她自己能看到。
   * 家长端的查询函数会直接剔除带 private 的条目，所以这是真的看不见，
   * 不是一个视觉上的开关。
   */
  onTogglePrivate(e) {
    const uid = e.currentTarget.dataset.uid;
    const r = store.setEntryPrivate(uid);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    wx.showToast({
      title: r.private ? '这条只有你自己能看到' : '已取消隐私标记，家长能看到了',
      icon: 'none',
    });
    this.render();
  },

  goToday() { wx.switchTab({ url: '/pages/today/index' }); },
  goShop() { wx.switchTab({ url: '/pages/shop/index' }); },

  /** 「我的成长档案」：一周一页（出图），与 week 页共用 store.buildWeekPage；先过免费配额 */
  onExport() {
    if (!exportGate.allowed()) return;
    exportGate.image('week', store.buildWeekPage());
  },

  /**
   * 导出流水 CSV（Excel 双击即开）。
   * PRD DoD 要求「打印版（一周一页）与 Excel 导出可用」；CSV 是纯文本，
   * 不需要后端就能生成，用剪贴板交付。同样计入免费导出次数。
   */
  onExportCsv() {
    const csv = store.buildLedgerCsv();
    if (csv.rowCount === 0) {
      wx.showToast({ title: '还没有记录可以导出', icon: 'none' });
      return;
    }
    if (!exportGate.allowed()) return;
    wx.setClipboardData({
      data: csv.text,
      success: () => {
        exportGate.done();
        wx.showToast({ title: '已复制，粘到 Excel 里就是一张表', icon: 'none', duration: 2400 });
      },
    });
  },
});
