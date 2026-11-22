/* ============================================================
   罗森塔尔 Rosenthal · utils/export-gate.js
   导出闸门：把「免费次数校验 → 出图 → 预览 / 交付 → 计次」收敛到一处，
   四个导出入口页（rules / me / week / growth）共用，避免每页各写一遍。

   试运行阶段：免费 EXPORT_FREE_LIMIT 次；用满后统一提示「内测中，敬请期待」，
   **不接任何支付**。阶段 B 只要改 store.exportQuota 的实现即可，本文件与页面不动。
   ============================================================ */
'use strict';

const store = require('./store.js');
const render = require('./render-image.js');

const LOCKED_TITLE = '内测中';
const LOCKED_MSG = '导出功能正在内测，敬请期待';

/** 是否还允许导出；不允许就直接弹「内测中」并返回 false */
function allowed() {
  if (store.exportQuota().canExport) return true;
  wx.showModal({ title: LOCKED_TITLE, content: LOCKED_MSG, showCancel: false, confirmText: '知道了' });
  return false;
}

/** 成功交付一次后计次（失败不要调用） */
function done() { store.consumeExport(); }

/**
 * 导出成图片并预览（规则表 / 一周一页）。
 * 成功后计次；失败给出提示、**不计次**（不消耗她的免费额度）。
 */
function image(kind, payload) {
  render.toImages(kind, payload).then(paths => {
    store.consumeExport();
    wx.previewImage({ urls: paths });
  }).catch(() => {
    wx.showToast({ title: '出图失败，请稍后再试', icon: 'none' });
  });
}

module.exports = { allowed, done, image, LOCKED_TITLE, LOCKED_MSG };
