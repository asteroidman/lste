/* ============================================================
   罗森塔尔 · pages/repair/index.js（修复行动）
   对应原型 renderRepair()。这一页的存在意义就是「不扣分」：
   没做到时只调方法、只把目标改小，完成时反而给一次正向留痕。
   ============================================================ */
'use strict';

const store = require('../../utils/store.js');
const guard = require('../../utils/guard.js');

const DATE_CN = k => { const p = String(k).split('-'); return p.length === 3 ? (Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日') : k; };

Page({
  data: {
    stage: 'mid',
    templates: [],
    mine: [],
    picked: '',
    note: '',
    pickedTpl: null,
  },

  onLoad() { this.render(); },
  onShow() {
    if (guard.requireOnboarded()) return;   // 未完成「必改 3 项」前不放行
    this.render();
  },

  render() {
    const s = store.state();
    if (!s) return;
    this.setData({
      stage: s.stage,
      onboarded: !!s.onboarded,   // 闸门：未共建完不渲染页面
      templates: store.REPAIRS.map(r => ({ k: r.k, t: r.t, d: r.d, act: r.act, on: this.data.picked === r.k })),
      mine: s.repairs.slice().sort((a, b) => b.ts - a.ts).map(r => {
        const tpl = store.REPAIRS.find(x => x.k === r.kind) || { t: r.kind };
        return { id: r.id, title: tpl.t, note: r.note, done: !!r.done, dateTxt: DATE_CN(store.dateKey(new Date(r.ts))) };
      }),
    });
  },

  onPick(e) {
    const k = e.currentTarget.dataset.k;
    const tpl = store.REPAIRS.find(r => r.k === k) || null;
    this.setData({ picked: k, pickedTpl: tpl, note: tpl ? tpl.act : '' });
  },

  onNoteInput(e) { this.setData({ note: e.detail.value }); },

  onSave() {
    if (!this.data.picked) { wx.showToast({ title: '先选一类', icon: 'none' }); return; }
    const r = store.addRepair(this.data.picked, this.data.note);
    if (!r.ok) { wx.showToast({ title: r.reason, icon: 'none' }); return; }
    this.setData({ picked: '', pickedTpl: null, note: '' });
    wx.showToast({ title: '记下了，没有扣分', icon: 'none' });
    this.render();
  },

  onDone(e) {
    const r = store.doneRepair(e.currentTarget.dataset.id);
    wx.showToast({ title: r.ok ? '这一步算走完了' : r.reason, icon: 'none' });
    this.render();
  },
});
