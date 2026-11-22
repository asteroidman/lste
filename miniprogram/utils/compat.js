/* ============================================================
   罗森塔尔 Rosenthal · utils/compat.js
   基础库兼容层：把「这个工程最低要多少基础库」变成一份可测试的声明。

   为什么要单独写：用比用户设备更新的接口，在真机上会直接抛错或静默失效，
   而这台机器上没有开发者工具、测不出来。所以把结论写成数据 + 断言：

   · MIN_BASE_LIB 是**运行时可用的最低基础库**，取自工程里用到的最高版本要求；
   · 每个需要较新基础库的能力都在 API 表里写明，并有降级路径（fallbacks()）；
   · 探针接口（windowInfo）是唯一直接读 wx 的地方 —— 它必须能在没有 wx 的
     Node 环境里安全返回默认值，这条也有断言守着。

   工程里实际用到的 19 个接口，最高的两项要求是：
     wx.getWindowInfo            2.20.1  → 有降级（wx.getSystemInfoSync）
     wx.showModal editable       2.17.1  → 有降级（不带输入框的弹窗）
     其余全部 ≤ 2.16.1
   所以 MIN_BASE_LIB = "2.20.1"。
   ============================================================ */
'use strict';

const MIN_BASE_LIB = '2.20.1';

/**
 * 工程用到的 wx 接口清单（线上传前用它核对是否有超出最低版本的新接口）。
 * since 为该接口的最低基础库版本；fallback 说明低版本时怎么办。
 */
const API_TABLE = [
  { api: 'wx.getStorageSync', since: '1.0.0', use: '本地状态读取', fallback: null },
  { api: 'wx.setStorageSync', since: '1.0.0', use: '本地状态落盘', fallback: null },
  { api: 'wx.showToast', since: '1.0.0', use: '轻提示', fallback: null },
  { api: 'wx.showModal', since: '1.0.0', use: '确认弹窗', fallback: null },
  { api: 'wx.showModal editable', since: '2.17.1', use: '规则页改奖励内容（带输入框）', fallback: '低版本退回不带输入框的弹窗，改奖励只能整条替换' },
  { api: 'wx.navigateTo', since: '1.0.0', use: '进二级页', fallback: null },
  { api: 'wx.navigateBack', since: '1.0.0', use: '介绍页从「我的」进入后返回', fallback: null },
  { api: 'wx.redirectTo', since: '1.0.0', use: '替换当前页', fallback: null },
  { api: 'wx.switchTab', since: '1.0.0', use: '切 tab', fallback: null },
  { api: 'wx.reLaunch', since: '1.0.0', use: '闸门跳转（清页面栈）', fallback: null },
  { api: 'wx.setClipboardData', since: '1.0.0', use: '导出交付（一周一页 / CSV / 备份）', fallback: null },
  { api: 'wx.stopPullDownRefresh', since: '1.0.0', use: '下拉刷新收尾', fallback: null },
  { api: 'wx.createSelectorQuery', since: '1.4.0', use: '查 canvas 节点', fallback: null },
  { api: 'wx.createOffscreenCanvas', since: '2.16.1', use: '离屏 canvas 出图（导出/打印）', fallback: null },
  { api: 'wx.canvasToTempFilePath', since: '1.9.0', use: '把画布导出成图片文件', fallback: null },
  { api: 'wx.previewImage', since: '1.0.0', use: '预览 / 保存导出图片', fallback: null },
  { api: 'wx.getSystemInfoSync', since: '1.0.0', use: '取 pixelRatio / windowWidth（降级用）', fallback: null },
  { api: 'wx.getWindowInfo', since: '2.20.1', use: '取 pixelRatio / windowWidth（首选）', fallback: '退到 wx.getSystemInfoSync（已废弃但仍可用）' },
  { api: 'wx.cloud', since: '2.2.3', use: '云开发（可选能力）', fallback: '未开通云开发时整个云层降级为未连接，本地功能不受影响' },
];

/** 需要较新基础库的接口（其余都是老接口，不必逐个探测） */
const NEEDS_PROBE = ['getWindowInfo'];

const hasWx = () => typeof wx !== 'undefined' && !!wx;

/** 取要探测的宿主对象：默认全局 wx，也允许显式传入（便于在 Node 里注入桩测试） */
const hostOf = (wxApi) => wxApi || (hasWx() ? wx : null);

/** 运行时探测：优先用 wx.canIUse，取不到就退回 typeof 判断 */
function supports(api, wxApi) {
  const host = hostOf(wxApi);
  if (!host) return false;
  try {
    if (typeof host.canIUse === 'function') {
      const ok = host.canIUse(api);
      if (ok !== undefined && ok !== null) return !!ok;
    }
  } catch (e) { /* canIUse 本身有问题时退回 typeof */ }
  const name = String(api).replace(/^wx\./, '').split('.')[0];
  return typeof host[name] !== 'undefined';
}

/**
 * 窗口信息探针：低版本自动降级，且在没有 wx 的环境（Node）里安全返回默认值。
 * @param {object} [wxApi] 可选的宿主对象（不传就用全局 wx）；
 *   组件里显式把 wx 传进来，测试时就能注入桩，不必污染全局。
 */
function windowInfo(wxApi) {
  const fallback = { pixelRatio: 2, windowWidth: 375, windowHeight: 667 };
  const host = hostOf(wxApi);
  if (!host) return fallback;
  try {
    if (typeof host.getWindowInfo === 'function') {
      const i = host.getWindowInfo();
      if (i && i.windowWidth) {
        return { pixelRatio: i.pixelRatio || 2, windowWidth: i.windowWidth, windowHeight: i.windowHeight || 667 };
      }
    }
    if (typeof host.getSystemInfoSync === 'function') {
      const i = host.getSystemInfoSync();
      if (i && i.windowWidth) {
        return { pixelRatio: i.pixelRatio || 2, windowWidth: i.windowWidth, windowHeight: i.windowHeight || 667 };
      }
    }
  } catch (e) { /* 任何异常都退回默认值，不能因为取尺寸失败而白屏 */ }
  return fallback;
}

/** 这份清单的最低要求 = 表里最高的 since */
function requiredBaseLib() {
  return API_TABLE.reduce((max, row) => (row.since > max ? row.since : max), '0.0.0');
}

/** 低版本时的降级说明（给人看的） */
function fallbacks() {
  return API_TABLE.filter(r => r.fallback).map(r => ({ api: r.api, since: r.since, fallback: r.fallback }));
}

module.exports = { MIN_BASE_LIB, API_TABLE, NEEDS_PROBE, supports, windowInfo, requiredBaseLib, fallbacks };
