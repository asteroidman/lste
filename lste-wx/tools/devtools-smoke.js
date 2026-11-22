/* ============================================================
   真机 / 工具层 E2E · tools/devtools-smoke.js
   —— 用官方 miniprogram-automator 驱动微信开发者工具，验证「工具里能跑起来」。

   运行：npm run devtools:auto
   前提（一次性）：开发者工具 →「设置 → 安全设置」→ 打开「服务端口」。
   若自动探测不到 cli.bat，用环境变量指定：
     $env:WX_CLI = "d:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat"
   ============================================================ */
'use strict';

const path = require('path');
const automator = require('miniprogram-automator');

const PROJECT = path.resolve(__dirname, '..');
const DEFAULT_CLI = 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat';
const CLI = process.env.WX_CLI || DEFAULT_CLI;

(async () => {
  let mp = null;
  try {
    mp = await automator.launch({ cliPath: CLI, projectPath: PROJECT });
    console.log('✔ 已连接开发者工具');
  } catch (err) {
    console.error('\n✘ 无法启动/连接开发者工具：' + (err && err.message));
    console.error('  请确认：① 已安装微信开发者工具；② 「设置 → 安全设置 → 服务端口」已打开；');
    console.error('         ③ 需要时用环境变量 WX_CLI 指定 cli.bat 路径。');
    process.exit(2);
  }

  try {
    const page = await mp.currentPage();
    const pathname = page && page.path ? page.path : '(未知)';
    console.log('✔ 当前页面：' + pathname);

    const sysInfo = await mp.systemInfo();
    console.log('✔ 模拟器基础库：' + (sysInfo && sysInfo.SDKVersion ? sysInfo.SDKVersion : '未知'));

    /* 冷启动闸门：未完成「必改 3 项」时应在共建页，否则在某个 tab */
    const expectGate = /pages\/(onboarding|today|growth|week|shop|me)\/index/.test(pathname);
    if (!expectGate) {
      console.error('✘ 页面路径不在预期的页面栈里：' + pathname);
      process.exit(1);
    }
    console.log('✔ 工具层冒烟通过');
  } finally {
    await mp.close();
  }
})();
