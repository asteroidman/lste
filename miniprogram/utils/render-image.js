/* ============================================================
   罗森塔尔 Rosenthal · utils/render-image.js
   导出交付物：把「规则表 / 一周一页」画成一张**可打印的长图**。

   为什么用离屏 Canvas（而不是云函数 PDF）：
   · 试运行阶段零云成本、离线可用，与「本地优先」架构一致；
   · 小程序不能像网页那样 window.print，交一张高清长图（存相册/发打印店）就够用；
   · 阶段 B 若要真 PDF，把本文件换成云函数渲染即可（buildWeekPage 已带 pdfPayload）。

   分层（为了能在 Node 里测）：
   · buildBlocks / wrapText / blockHeight / paginate —— **纯函数**，不碰 wx，可被回归直接测；
   · toImages —— 唯一用 wx（离屏画布 → 导出图片文件）的部分。
   ============================================================ */
'use strict';

/* 版面常量：逻辑宽 750（与 rpx 设计稿一致），绘制时按 dpr 放大位图 */
const L = {
  W: 750,
  PAD: 44,
  pageH: 1600,             // 单页逻辑高上限，超出分页
  title:   { size: 42, lh: 58, gap: 10, weight: 'bold' },
  sub:     { size: 26, lh: 40, gap: 8,  color: '#7A7168' },
  section: { size: 30, lh: 46, gap: 8,  top: 18, weight: 'bold' },
  row:     { size: 26, lh: 40, gap: 4 },
  text:    { size: 24, lh: 38, gap: 4 },
  muted:   { size: 22, lh: 34, gap: 2,  color: '#9498A0' },
  sign:    { size: 24, lh: 40, gap: 6,  color: '#4A443D' },
  quote:   { size: 22, lh: 34, gap: 2,  color: '#7A7168' },
};

/** 单字符宽度估算（纯函数）：CJK 按 1 个字宽，其余按 0.55 */
function charW(ch) {
  const c = ch.codePointAt(0);
  return (c >= 0x2E80 && c <= 0x9FFF) || (c >= 0x3000 && c <= 0x30FF) || (c >= 0xFF00 && c <= 0xFFEF) ? 1 : 0.55;
}
function textW(text, size) {
  let w = 0;
  for (const ch of String(text || '')) w += charW(ch) * size;
  return w;
}

/** 纯函数：把一段文字按可用宽度折成多行 */
function wrapText(text, size, maxW) {
  const s = String(text === undefined || text === null ? '' : text);
  if (!s) return [''];
  const maxCharsW = Math.max(size, maxW);          // 至少容一个字
  const lines = [];
  let cur = '';
  let curW = 0;
  for (const ch of s) {
    if (ch === '\n') { lines.push(cur); cur = ''; curW = 0; continue; }
    const w = charW(ch) * size;
    if (curW + w > maxCharsW && cur) { lines.push(cur); cur = ''; curW = 0; }
    cur += ch; curW += w;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/* ---------------- 版面块（buildBlocks 输出） ---------------- */

/** 规则表：行为清单 + 分值 + 奖励档位 + 双签栏 */
function blocksForRule(p) {
  const o = p || {};
  const b = [];
  b.push({ t: 'title', text: '罗森塔尔 · 规则表' });
  b.push({ t: 'sub', text: (o.nick || '我') + '的这一份 · ' + (o.stageName || '') +
    (o.grade ? '（' + o.grade + '）' : '') + ' · 每日上限 ' + (o.cap || 0) + ' 分' });
  (o.dims || []).forEach(d => {
    b.push({ t: 'section', text: d.n });
    (d.items || []).forEach(i => b.push({
      t: 'row',
      left: '+' + i.points,
      text: i.name,
      right: '每天 ' + i.limit + ' 次' + (i.mine ? ' ★' : ''),
    }));
  });
  if ((o.rewards || []).length) {
    b.push({ t: 'section', text: '奖励档位' });
    o.rewards.forEach(r => b.push({
      t: 'row',
      left: r.cost + '分',
      text: r.title,
      right: (r.tier || '') + (r.mine ? ' ★' : ''),
    }));
  }
  b.push({ t: 'muted', text: '只加分，不扣分；每日上限随学段变；家长不能单方改，改一条要重新双签。' });
  b.push({ t: 'space', h: 10 });
  b.push({ t: 'sign', text: '她签名：____________　　家长签名：____________　　日期：____________' });
  b.push({ t: 'quote', text: '“你不是被积分管住的人，你是在练习管理自己。”' });
  return b;
}

/** 一周一页：本周概览 + 维度分布 + 做到的事 + 闪光点 + 双签栏 */
function blocksForWeek(p) {
  const o = p || {};
  const b = [];
  b.push({ t: 'title', text: '罗森塔尔 · 一周一页' });
  b.push({ t: 'sub', text: (o.nick || '她') + '的这一周 · ' + (o.range || '') +
    ' · 本周 ' + (o.score || 0) + ' 分 · 连续 ' + (o.streak || 0) + ' 天' });
  if ((o.dims || []).length) {
    b.push({ t: 'section', text: '这周的力气花在了哪' });
    o.dims.forEach(d => b.push({ t: 'row', left: String(d.v), text: d.n, right: '分' }));
  }
  b.push({ t: 'section', text: '这一周做到的事' });
  if ((o.flashes || []).length) {
    o.flashes.forEach(f => {
      b.push({ t: 'text', text: f.date + '　' + f.name + ' +' + f.points + (f.isPrivate ? '（仅自己可见）' : '') });
      if (f.praise) b.push({ t: 'muted', text: '　' + f.praise });
    });
  } else {
    b.push({ t: 'muted', text: '这一周还没有记录，下周从一件小事开始就好。' });
  }
  if ((o.notes || []).length) {
    b.push({ t: 'section', text: '我写下的闪光点' });
    o.notes.forEach(n => b.push({ t: 'text', text: n.date + '　' + n.text }));
  }
  if (o.signature) {
    b.push({ t: 'space', h: 10 });
    b.push({ t: 'sign', text: '规则版本：v1.' + (o.signature.ruleVersion || 0) +
      (o.signature.active ? '（' + o.signature.agreedDate + ' 双签生效）' : '（待家长签署）') });
    b.push({ t: 'sign', text: '她签名：____________　　家长签名：____________　　日期：____________' });
  }
  b.push({ t: 'quote', text: '“你已经做到过的，都被留下来了。”' });
  return b;
}

/** 纯函数：按 kind 生成版面块 */
function buildBlocks(kind, payload) {
  return kind === 'week' ? blocksForWeek(payload) : blocksForRule(payload);
}

/** 纯函数：单个块的高度（含与下一块的间距） */
function blockHeight(b) {
  const styles = { title: L.title, sub: L.sub, section: L.section, row: L.row, text: L.text, muted: L.muted, sign: L.sign, quote: L.quote };
  if (b.t === 'space') return Number(b.h) || 0;
  const st = styles[b.t] || L.text;
  const avail = L.W - L.PAD * 2;
  let lines = 1;
  if (b.t === 'row') {
    const leftW = textW(b.left, st.size);
    const rightW = b.right ? textW(b.right, st.size) : 0;
    lines = wrapText(b.text, st.size, avail - leftW - rightW - 16).length;
  } else {
    lines = wrapText(b.text, st.size, avail).length;
  }
  return (st.top || 0) + lines * st.lh + (st.gap || 0);
}

/** 纯函数：把版面块分页（每页逻辑高不超过 maxH） */
function paginate(blocks, maxH) {
  const cap = (Number(maxH) || L.pageH) - L.PAD * 2;
  const pages = [];
  let cur = [];
  let h = 0;
  (blocks || []).forEach(b => {
    const bh = blockHeight(b);
    if (cur.length && h + bh > cap) { pages.push(cur); cur = []; h = 0; }
    cur.push(b);
    h += bh;
  });
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

/** 一页的逻辑高度（含上下留白） */
function pageHeight(blocks) {
  return L.PAD * 2 + (blocks || []).reduce((a, b) => a + blockHeight(b), 0);
}

/* ---------------- 绘制（唯一用 wx 的部分） ---------------- */

function fontOf(st) {
  return (st.weight ? st.weight + ' ' : '') + st.size + 'px sans-serif';
}

/** 把一页版面块画到 2d context 上 */
function drawBlocks(ctx, blocks) {
  let y = L.PAD;
  const avail = L.W - L.PAD * 2;
  ctx.textBaseline = 'top';
  blocks.forEach(b => {
    const st = { title: L.title, sub: L.sub, section: L.section, row: L.row, text: L.text, muted: L.muted, sign: L.sign, quote: L.quote }[b.t] || L.text;
    y += st.top || 0;
    ctx.fillStyle = st.color || '#2B2622';
    ctx.font = fontOf(st);

    if (b.t === 'row') {
      const leftW = textW(b.left, st.size);
      const rightW = b.right ? textW(b.right, st.size) : 0;
      ctx.fillText(String(b.left || ''), L.PAD, y);
      const lines = wrapText(b.text, st.size, avail - leftW - rightW - 16);
      lines.forEach((ln, i) => ctx.fillText(ln, L.PAD + leftW + 16, y + i * st.lh));
      if (b.right) {
        const rw = textW(b.right, st.size);
        ctx.fillText(b.right, L.W - L.PAD - rw, y);
      }
      y += lines.length * st.lh + (st.gap || 0);
      return;
    }

    const lines = b.t === 'space' ? [] : wrapText(b.text, st.size, avail);
    lines.forEach((ln, i) => ctx.fillText(ln, L.PAD, y + i * st.lh));
    y += lines.length * st.lh + (st.gap || 0);
  });
}

/** 画一页并导出成临时图片文件 */
function drawPage(blocks, dpr) {
  return new Promise((resolve, reject) => {
    const H = pageHeight(blocks);
    let canvas;
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: Math.round(L.W * dpr), height: Math.round(H * dpr) });
    } catch (e) { reject(e); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('无法获取 2d context')); return; }
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, L.W, H);
    drawBlocks(ctx, blocks);
    wx.canvasToTempFilePath({
      canvas,
      x: 0, y: 0,
      width: Math.round(L.W * dpr),
      height: Math.round(H * dpr),
      destWidth: Math.round(L.W * dpr),
      destHeight: Math.round(H * dpr),
      fileType: 'png',
      success: res => resolve(res.tempFilePath),
      fail: reject,
    });
  });
}

/** 取一个稳妥的像素比（老基础库/取不到时退 2） */
function dprOf() {
  try {
    const w = require('./compat.js').windowInfo().pixelRatio || 2;
    return Math.min(Math.max(w, 1), 2);   // 封顶 2，避免长图内存过大
  } catch (e) { return 2; }
}

/**
 * 出图主入口：返回 Promise<string[]>（每页一个图片路径）。
 * 失败时 reject，调用方（export-gate）负责降级提示。
 */
function toImages(kind, payload) {
  const pages = paginate(buildBlocks(kind, payload));
  const dpr = dprOf();
  return pages.reduce(
    (chain, pageBlocks) => chain.then(arr => drawPage(pageBlocks, dpr).then(path => arr.concat(path))),
    Promise.resolve([])
  );
}

module.exports = { L, wrapText, blockHeight, buildBlocks, paginate, pageHeight, toImages };
