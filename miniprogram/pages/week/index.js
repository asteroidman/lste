/* ============================================================
   罗森塔尔 · pages/week/index.js（周复盘）
   对应原型 renderWeek() 的 5 步向导 + 周报。

   全部业务逻辑在 utils/store.js（可被 Node 回归直接测），本页只做：
   算好展示数据 → setData → 事件回传 store。本文件不直接改状态。

   5 步：① 想记住的三件事 → ② 想留下的一个习惯 → ③ 下周只改一件小事
        → ④ 想不想挑战一件新事（+5，做不到不扣分）→ ⑤ 结算并生成周报
   ============================================================ */
'use strict';

const store = require('../../utils/store.js');
const guard = require('../../utils/guard.js');
const exportGate = require('../../utils/export-gate.js');

const app = getApp();

const WD = ['一', '二', '三', '四', '五', '六', '日'];
const CN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 与 store 共用一套维度标签：周奖励流水显示成「周奖励」，不落成「记录」 */
const dimName = k => store.dimLabel(k);

Page({
  data: {
    stage: 'mid',
    nick: '',
    /* 周数据 */
    weekScore: 0,
    cap: 12,
    weekDays: [],
    activeDays: 0,
    streak: 0,
    byDim: [],
    /* 向导 */
    step: 0,
    steps: [1, 2, 3, 4, 5],
    done: false,
    report: null,
    cands: [],
    picks: [],            // 待选的三件事，带 on 标记（WXML 里不能调函数）
    keepOptions: [],
    keepCustom: '',
    keepCustomOpen: false,
    customHighlight: '',
    nextText: '',
    challengeText: '',
    suggestions: [],
    /* 结算预览 */
    bonusPreview: null,
  },

  onLoad() { this.render(); },
  onShow() {
    if (guard.requireOnboarded()) return;   // 未完成「必改 3 项」前不放行
    this.render();
  },

  dimName,

  render() {
    const s = store.state();
    if (!s) return;

    const dates = store.weekDates();          // [今天, 昨天, … 六天前]
    const ordered = dates.slice().reverse();  // 展示成 周一 → 今天 的顺序感
    const st = store.weekStats();

    const byDim = {};
    s.log.filter(l => !l.reversed && dates.indexOf(l.date) >= 0).forEach(l => {
      byDim[l.dim] = (byDim[l.dim] || 0) + l.points;
    });

    const week = s.week || null;
    const draft = week ? null : store.weekDraft();
    const step = week ? 4 : (draft ? draft.step : 0);

    /* 第 1 步的候选与选中标记 */
    const picks = [];
    if (!week && step === 0) {
      store.weekCandidates(6).forEach(c => {
        picks.push({
          kind: 'cand',
          label: c.name,
          value: c.praise,
          on: draft.highlights.indexOf(c.praise) >= 0,
          dim: dimName(c.dim),
          date: c.date,
        });
      });
      draft.highlights.forEach(h => {
        if (!picks.some(p => p.value === h)) {
          picks.push({ kind: 'custom', label: h, value: h, on: true, dim: '我自己写的', date: '' });
        }
      });
    }

    /* 第 2 步的习惯候选 */
    const keepOptions = [];
    if (!week && step === 1) {
      store.KEEP_OPTIONS.forEach(k => keepOptions.push({ label: k, value: k, on: draft.keep === k }));
      keepOptions.push({
        label: draft.keepCustom || '我自己想的',
        value: store.KEEP_CUSTOM,
        on: draft.keep === store.KEEP_CUSTOM,
        custom: true,
      });
    }

    const bonus = store.weekBonus(week ? week.challenge : (draft ? draft.challenge : ''));

    this.setData({
      stage: s.stage,
      onboarded: !!s.onboarded,   // 闸门：未共建完不渲染页面
      nick: s.nick,
      weekScore: st.score,
      cap: store.capNow(),
      weekDays: ordered.map((d, i) => {
        const p = d.split('-');
        const sc = store.dayScore(d);
        return {
          date: d,
          sc,
          wd: WD[(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay() + 6) % 7],
          md: CN[Number(p[2])] || p[2],
          isToday: i === ordered.length - 1,
        };
      }),
      activeDays: st.days,
      streak: st.streak,
      byDim: store.DIMS.map(d => ({ n: d.n, v: byDim[d.k] || 0 })),
      step,
      done: !!week,
      report: week ? Object.assign({}, week, {
        dims: store.DIMS.map(d => ({ n: d.n, v: byDim[d.k] || 0 })),
      }) : null,
      cands: store.weekCandidates(6),
      picks,
      keepOptions,
      keepCustom: draft ? draft.keepCustom : '',
      nextText: draft ? draft.next : '',
      challengeText: draft ? draft.challenge : '',
      suggestions: (draft && draft.lastSuggest) ? store.SHRINK_SUGGESTIONS : [],
      bonusPreview: bonus,
    });
  },

  /* ---------------- 向导交互 ---------------- */

  onPickHighlight(e) {
    const v = e.currentTarget.dataset.v;
    const on = e.currentTarget.dataset.on === 'true' || e.currentTarget.dataset.on === true;
    const r = on ? store.unpickHighlight(v) : store.pickHighlight(v);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    this.render();
  },

  onCustomHighlight(e) { this.setData({ customHighlight: e.detail.value }); },

  onAddCustomHighlight() {
    const r = store.pickHighlight(this.data.customHighlight);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    this.setData({ customHighlight: '' });
    this.render();
  },

  onPickKeep(e) {
    const v = e.currentTarget.dataset.v;
    if (v === store.KEEP_CUSTOM) {
      store.setWeekPatch({ keep: v, keepCustom: this.data.keepCustom || '' });
      this.setData({ keepCustomOpen: true });
      return;
    }
    store.setWeekPatch({ keep: v });
    this.render();
  },

  onKeepCustomInput(e) {
    this.setData({ keepCustom: e.detail.value });
    store.setWeekPatch({ keepCustom: e.detail.value, keep: store.KEEP_CUSTOM });
  },

  onNextInput(e) {
    this.setData({ nextText: e.detail.value });
    store.setWeekPatch({ next: e.detail.value });
  },

  onChallengeInput(e) {
    this.setData({ challengeText: e.detail.value });
    store.setWeekPatch({ challenge: e.detail.value });
  },

  onUseSuggestion(e) {
    const v = e.currentTarget.dataset.v;
    store.setWeekPatch({ next: v, lastSuggest: '' });
    this.setData({ nextText: v, suggestions: [] });
    this.render();
  },

  onPrev() {
    const r = store.weekStep(this.data.step - 1);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    this.render();
  },

  onNext() {
    const target = this.data.step + 1;
    const r = store.weekStep(target);
    if (!r.ok) {
      // 「目标说得太大」不是错误，是邀请拆小 —— 用提示而不是拦截
      if (r.big) { this.render(); wx.showToast({ title: '这个目标有点大，拆小一点？', icon: 'none' }); return; }
      wx.showToast({ title: r.reason, icon: 'none' });
      return;
    }
    this.render();
  },

  /** 第 5 步：结算并生成周报（加成自动算，谁都不能改） */
  onFinish() {
    const r = store.finishWeek();
    if (!r.ok) {
      // 已经是结算过的状态：直接把周报显示出来，不重复发奖励
      this.render();
      wx.showToast({ title: r.reason || '再试一次', icon: 'none' });
      return;
    }
    const w = r.week;
    this.render();
    wx.showToast({
      title: w.bonus > 0 ? ('周报生成好了，+ ' + w.bonus + ' 分已入账') : '周报生成好了',
      icon: 'none',
    });
    app.globalData.bump();
  },

  /** 「下周继续」：只清周报，不回收已入账的奖励 */
  onRestart() {
    wx.showModal({
      title: '开始新的一周？',
      content: '这一周的奖励已经入账，不会被收回；周报会从这一页收起来。',
      success: res => {
        if (!res.confirm) return;
        store.resetWeek();
        app.globalData.bump();
        this.render();
        wx.switchTab({ url: '/pages/today/index' });
      },
    });
  },

  /**
   * 导出打印版：先过免费配额闸门，再把「一周一页」画成一张可打印的长图预览。
   * （试运行免费 3 次，用满提示「内测中」；阶段 B 换成云函数 PDF 时这里不用改内容。）
   */
  onExport() {
    if (!exportGate.allowed()) return;
    exportGate.image('week', store.buildWeekPage({ nick: this.data.nick }));
  },

  goToday() { wx.switchTab({ url: '/pages/today/index' }); },
  goGrowth() { wx.switchTab({ url: '/pages/growth/index' }); },
});
