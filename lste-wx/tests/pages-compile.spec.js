/* ============================================================
   模板编译测试 · 全部页面的 index.wxml（+ index.wxss）
   —— 用官方编译器逐个编译页面模板。这一层正是 Node 引擎套件（[B] 段）
     的盲区：它用的是自己写的启发式解析器，曾把 `<br>` 当成合法空元素放过，
     而官方编译器会报 “expect end-tag br” 直接打断整页编译。

   做法：用 miniprogram-simulate 加载每个页面。页面的 JS 是 Page({...})，
   在组件沙箱里跑不到 getApp/Page 是**预期**的；真正的失败信号是
   WXML/WXSS 的编译错误（含 expect / end-tag / wxml / wxss 等字样）。
   ============================================================ */
'use strict';

const path = require('path');
const simulate = require('miniprogram-simulate');

/* 与 app.json 的 pages 保持一致；漏一个就用 app.json 兜底校验（见下） */
const PAGES = [
  'today', 'growth', 'week', 'shop', 'me',
  'parent', 'repair', 'rules', 'intro', 'onboarding',
];

const pagePath = name =>
  path.join(__dirname, '..', '..', 'miniprogram', 'pages', name, 'index');

/** 判断某个错误是不是「WXML/WXSS 编译错误」而不是「页面 JS 在沙箱里缺全局」 */
function classify(err) {
  const msg = String((err && err.message) || err || '');
  const runtimeNotDefined = /(getApp|Page|App|wx|Component|globalData) is not defined/.test(msg);
  const compileError = /expect|end-tag|wxml|wxss|Bad value|unexpected|parse|invalid tag/i.test(msg);
  return { msg: msg.split('\n')[0], runtimeNotDefined, compileError };
}

describe('页面模板 · 官方编译器全覆盖', () => {
  test('app.json 注册的页面都在本测试的清单里', () => {
    const appJson = require('../../miniprogram/app.json');
    const registered = (appJson.pages || []).map(p => p.replace(/^pages\//, '').replace(/\/index$/, ''));
    const missing = registered.filter(p => PAGES.indexOf(p) < 0);
    expect(missing).toEqual([]);   // 新增页面没纳入编译测试就会在这里报
  });

  test('每个页面的 WXML/WXSS 都能被官方编译器编译通过', () => {
    const failures = [];
    PAGES.forEach(name => {
      try {
        simulate.load(pagePath(name));
      } catch (err) {
        const { msg, runtimeNotDefined, compileError } = classify(err);
        /* 预期：页面 JS 里 const app = getApp() / Page(...) 在组件沙箱里未定义。
           只要不是「缺全局」而是编译错误，就判失败。 */
        if (compileError || !runtimeNotDefined) failures.push(name + ': ' + msg);
      }
    });
    expect(failures).toEqual([]);
  });
});
