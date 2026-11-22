/* ============================================================
   罗森塔尔 · components/ring-progress/index.js
   得分环 —— 移植指南 §四「得分环三选一」的方案 1：Canvas 2D。

   为什么用 Canvas 2D 而不是 SVG / 双半圆：
   · 小程序 WXML 不能内联 SVG，原型的 stroke-dasharray 方案搬不过来；
   · Canvas 2D 支持**同层渲染**，底部弹层能正常盖住它；
   · 换算关系与原型一致：原型圆半径 48px、周长 301.6px，
     offset = 301.6 × (1 − score / cap)；Canvas 里就是
     endAngle = -90° + 360° × score / cap（移植指南 §四结尾）。

   尺寸单位注意：canvas 是原生组件，**只认 px，不认 rpx**。
   所以页面传入的 px 是按 750/视口宽 折算过的等价值（112px 设计稿尺寸），
   组件内部一律按 px 计算，显示尺寸与原型 1:1。
   ============================================================ */
'use strict';

const TAU = Math.PI * 2;

Component({
  properties: {
    score: { type: Number, value: 0, observer() { this._sync(); } },
    cap: { type: Number, value: 12, observer() { this._sync(); } },
    /** 显示直径（px，设计稿 112px） */
    size: { type: Number, value: 112, observer() { this._initCanvas(); } },
    /** 环宽（px，与原型 stroke-width:9 一致） */
    stroke: { type: Number, value: 9 },
  },

  data: {
    ready: false,        // canvas 就绪前先只显示数字，避免闪白
    borderPx: 9,         // 兜底环边框，必须用 px 才能和 canvas 对齐
  },

  lifetimes: {
    ready() {
      // ready 后节点已完成布局，可以安全查询 canvas 节点
      this._initCanvas();
    },
    detached() {
      this._canvas = null;
      this._ctx = null;
    },
  },

  methods: {
    _sync() {
      if (this._ctx) this._draw();
    },

    _initCanvas() {
      const cssSize = Number(this.data.size) || 112;
      this.setData({ borderPx: Number(this.data.stroke) || 9 });

      // 页面上下文里查节点：in(this) 在部分基础库上不支持，所以分两条路走
      const q = wx.createSelectorQuery();
      const query = typeof q.in === 'function' ? q.in(this) : q;
      query.select('#ringCanvas').fields({ node: true, size: true }).exec(res => {
        const info = res && res[0];
        if (!info || !info.node) {
          // 老基础库拿不到 canvas 2d 节点：保留纯数字 + CSS 兜底环，不抛错
          this.setData({ ready: false });
          return;
        }
        const canvas = info.node;
        /* 尺寸探针走 compat，并把 wx 显式传进去：
           低版本没有 wx.getWindowInfo 时它会退回 wx.getSystemInfoSync，
           两者都没有也不会抛错（Node 桩里注入的就是这个 wx）。 */
        let dpr = 2;
        try {
          dpr = require('../../utils/compat.js').windowInfo(wx).pixelRatio || 2;
        } catch (e) { dpr = 2; }

        canvas.width = cssSize * dpr;
        canvas.height = cssSize * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        this._canvas = canvas;
        this._ctx = ctx;
        this._cssSize = cssSize;
        this.setData({ ready: true });
        this._draw();
      });
    },

    _draw() {
      const ctx = this._ctx;
      if (!ctx) return;
      const cssSize = this._cssSize || Number(this.data.size) || 112;
      const cap = Number(this.data.cap) || 1;
      const sc = Math.max(0, Math.min(Number(this.data.score) || 0, cap));
      const lw = Number(this.data.stroke) || 9;
      const c = cssSize / 2;
      const r = c - lw / 2 - 1;               // 留 1px 防裁切
      const start = -Math.PI / 2;             // 12 点方向起笔
      const end = start + TAU * (sc / cap);

      ctx.clearRect(0, 0, cssSize, cssSize);

      // 底环
      ctx.beginPath();
      ctx.arc(c, c, r, 0, TAU);
      ctx.lineWidth = lw;
      ctx.strokeStyle = 'rgba(35,38,46,.10)';
      ctx.lineCap = 'round';
      ctx.stroke();

      if (sc <= 0) return;

      // 进度环：沿用原型的橙色线性渐变（#F0A868 → #C4662C）
      const grad = ctx.createLinearGradient(0, 0, cssSize, cssSize);
      grad.addColorStop(0, '#F0A868');
      grad.addColorStop(1, '#C4662C');
      ctx.beginPath();
      ctx.arc(c, c, r, start, end);
      ctx.lineWidth = lw;
      ctx.strokeStyle = grad;
      ctx.lineCap = 'round';
      ctx.stroke();
    },

    /** 页面在数据变化后调用（切换学段 / 绑定 canvas 完成时） */
    render(score, cap) {
      const patch = {};
      if (typeof score === 'number') patch.score = score;
      if (typeof cap === 'number') patch.cap = cap;
      if (Object.keys(patch).length) {
        // observer 会触发 _sync → _draw；没有 ctx 时也不会报错
        this.setData(patch);
        if (this._ctx) this._draw();
      } else {
        this._draw();
      }
    },

    redraw() { this._draw(); },
  },
});
