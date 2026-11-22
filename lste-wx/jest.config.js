/* ============================================================
   罗森塔尔 · 小程序测试环境 · Jest 配置
   —— 用官方 miniprogram-simulate（j-component）在 jsdom 里真实编译 WXML/WXSS
      并渲染组件；与 miniprogram/ 里的 Node 引擎套件（_smoke_s1.js）互补。

   注意：本配置文件位于 DevTools 项目根，已在 project.config.json 的
   packOptions.ignore 里排除，不会被打进小程序包。
   ============================================================ */
'use strict';

module.exports = {
  testEnvironment: 'jsdom',
  testEnvironmentOptions: { url: 'https://jest.test' },
  rootDir: __dirname,
  testMatch: ['<rootDir>/tests/**/*.spec.js'],
  /* 被测源码在 miniprogram/（指向 ../miniprogram 的目录联接）里，是 CommonJS，
     不需要 babel 转译；显式关掉 transform 可以少一层依赖。 */
  transform: {},
  moduleFileExtensions: ['js', 'json'],
  clearMocks: true,
};
