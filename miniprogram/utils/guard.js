/* ============================================================
   罗森塔尔 Rosenthal · utils/guard.js
   页面闸门：规则没有**双签生效**之前，任何 tab 页都不该能用。

   为什么需要它：store.finishBuild() 只是把「孩子改满 3 处」记下来，
   拦不住「已经进入应用开始打卡」这件事；同样，家长签署也不能只是个按钮。
   真正的闸门有四层：
   1. 冷启动：app.gateOnboarding() 检查规则是否双签生效，没有就把首页
      reLaunch 到该去的地方（孩子没改完 → 共建页；改完了等家长 → 家长签署页）；
   2. 日常兜底：每个 tab 页 onShow 调本模块 —— 返回键回到某个 tab、
      从分享链接直接进入某个 tab、切换学段后状态被清零，都会在这一层被弹回；
   3. 家长端特例：家长签署页**必须**在闸门之外，否则就死锁了 ——
      孩子改完提案后全站被拦住，家长却进不去签字。所以家长端永远放行，
      它自己用 isRuleActive 决定是显示签署卡还是显示完整家长端；
   4. 引擎防线：finishBuild() / parentAgree() 各自校验前置条件，
      前端跳转只是体验。

   返回 true 表示「已拦下并正在跳转」，调用方应当直接 return，
   不要再渲染、更不要写数据。
   ============================================================ */
'use strict';

const ONBOARDING_URL = '/pages/onboarding/index';   // 孩子改规则（必改 3 项）
const PARENT_URL = '/pages/parent/index';           // 家长签署「我按你的版本来」
const INTRO_URL = '/pages/intro/index';             // 首次介绍页（罗森塔尔效应）

const store = require('./store.js');

let redirecting = false;

/** 当前用户是否还没走完规则签署（孩子提案 + 家长签字） */
function needsOnboarding() {
  const s = store.state();
  if (!s) return true;
  return !store.isRuleActive();
}

/** 是否还没看过首次介绍页 */
function needsIntro() { return store.needsIntro(); }

/**
 * 未放行时应该去哪个页面：
 * ① 没看过介绍页 → 先去介绍页（先把「期望的力量」讲一遍）；
 * ② 看过但孩子没改完 → 共建页；③ 改完了等家长 → 家长签署页。
 */
function gateTarget() {
  if (store.needsIntro()) return INTRO_URL;
  return store.state() && store.state().onboarded ? PARENT_URL : ONBOARDING_URL;
}

/**
 * 在页面 onShow 里调用。
 * @param {string} [selfRoute] 调用方自己的路由（如 'pages/parent/index'）。
 *        家长端与介绍页把自己传进来 —— 它们是「闸门入口」，必须放行，
 *        否则会自己跳自己（家长端还要负责签字，更不能被拦）。
 * @returns {boolean} true = 已拦下，调用方 return
 */
function requireOnboarded(selfRoute) {
  const self = selfRoute ? ('/' + selfRoute) : '';
  // 签署入口与介绍页自身永远放行，它们各自决定显示什么
  if (self === PARENT_URL || self === INTRO_URL) return false;

  /* 目标：介绍页 → 共建/签署页；都没有则放行 */
  let target = null;
  if (store.needsIntro()) target = INTRO_URL;
  else if (needsOnboarding()) target = gateTarget();
  if (!target) return false;

  if (redirecting) return true;          // 正在跳，避免连环跳转

  // 已经在目标页就不要再跳（否则会自己跳自己）
  try {
    const pages = getCurrentPages ? getCurrentPages() : [];
    const cur = pages.length ? pages[pages.length - 1] : null;
    if (cur && cur.route && ('/' + cur.route) === target) return true;
  } catch (e) { /* 取不到页面栈就按需要跳处理 */ }

  redirecting = true;
  /**
   * 复位时机：complete 回调 + 一小段兜底定时器。
   * 只靠 complete 不够 —— 如果它在当前 tick 内同步返回（或极快返回），
   * 紧跟着的另一个页面 onShow 就会再发一次跳转，出现连环跳转。
   */
  const release = () => { redirecting = false; };
  try { setTimeout(release, 300); } catch (e) { /* 没有定时器也不会卡死 */ }

  wx.reLaunch({
    url: target,
    complete: () => { setTimeout(release, 0); },
  });
  return true;
}

module.exports = {
  ONBOARDING_URL,
  PARENT_URL,
  INTRO_URL,
  needsOnboarding,
  needsIntro,
  gateTarget,
  requireOnboarded,
  /** 仅供回归测试用：清掉跳转去重状态，让每段测试互不影响 */
  _resetRedirecting() { redirecting = false; },
};
