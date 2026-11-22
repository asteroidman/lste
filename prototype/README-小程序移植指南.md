# 罗森塔尔网页原型 · 微信小程序移植指南

原型目录：`prototype/`（4 个文件，零依赖、零构建，双击 `index.html` 即可运行）

| 文件 | 作用 | 对应小程序 |
| --- | --- | --- |
| `index.html` | 页面结构：8 个页面 + tabBar + 弹层 + 初始化遮罩 | `app.json`（页面注册/tabBar） + `pages/*/index.wxml` |
| `app.css` | 设计令牌 + 全部组件样式 | `app.wxss` + `pages/*/index.wxss` |
| `app.js` | 规则引擎 + 状态 + 渲染 + 事件 | `app.js`（globalData） + `utils/store.js` + `pages/*/index.js` |
| `_smoke.js` | 开发期回归测试（`node _smoke.js`，79 项断言） | 不进小程序，可改造成 `miniprogram-simulate` 用例 |

> 原型里的左侧「演示侧栏」和手机外框只是评审用的舞台层（`.rail` / `.phone`），移植时整层删掉，只保留 `.phone__screen` 里面的内容。

---

## 一、页面与 tabBar 映射

原型用一套「页面栈」模拟小程序的 tab / navigateTo 关系，可直接对应 `app.json`：

```jsonc
{
  "pages": [
    "pages/today/index",    // 今日（tab 1，默认首页）
    "pages/growth/index",   // 成长（tab 2）
    "pages/week/index",     // 周复盘（tab 3）
    "pages/shop/index",     // 兑换（tab 4）
    "pages/me/index",       // 我的（tab 5）
    "pages/parent/index",   // 家长端（navigateTo，非 tab）
    "pages/repair/index",   // 修复行动（navigateTo）
    "pages/rules/index",    // 我的规则（navigateTo）
    "pages/onboarding/index"// 规则共建 · 必改 3 项（首次启动 redirectTo）
  ],
  "window": { "navigationBarTitleText": "罗森塔尔", "navigationBarBackgroundColor": "#F6F1E8",
              "navigationBarTextStyle": "black", "backgroundColor": "#F6F1E8" },
  "tabBar": {
    "color": "#9498A0", "selectedColor": "#D97A3D", "backgroundColor": "#F6F1E8",
    "borderStyle": "white",
    "list": [
      { "pagePath": "pages/today/index",  "text": "今天",   "iconPath": "assets/tab-today.png",  "selectedIconPath": "assets/tab-today-on.png" },
      { "pagePath": "pages/growth/index", "text": "成长",   "iconPath": "assets/tab-growth.png", "selectedIconPath": "assets/tab-growth-on.png" },
      { "pagePath": "pages/week/index",   "text": "周复盘", "iconPath": "assets/tab-week.png",   "selectedIconPath": "assets/tab-week-on.png" },
      { "pagePath": "pages/shop/index",   "text": "兑换",   "iconPath": "assets/tab-shop.png",   "selectedIconPath": "assets/tab-shop-on.png" },
      { "pagePath": "pages/me/index",     "text": "我的",   "iconPath": "assets/tab-me.png",     "selectedIconPath": "assets/tab-me-on.png" }
    ]
  }
}
```

两个硬限制正好卡住：**tabBar 最多 5 项**（本产品正好 5 个，不能再加），tabBar 图标必须是**本地图片**（不能用 SVG 内联、不支持网络图与自定义字体图标）——原型里的 `<symbol>` 雪碧图要导出成 5×2 张 PNG（建议 81×81px）。

---

## 二、设计令牌：px → rpx

原型按 **390px 逻辑宽**设计，小程序 `750rpx = 屏幕宽`，因此：

```
rpx = px × 750 / 390 ≈ px × 1.923      （建议四舍五入到偶数）
```

| 令牌 | 原型 | 小程序 |
| --- | --- | --- |
| `--sp-1 … --sp-6` | 4 / 8 / 12 / 16 / 22 / 30 px | 8 / 16 / 24 / 32 / 42 / 58 rpx |
| `--r-sm/md/lg/xl/pill` | 10 / 16 / 22 / 30 / 999 px | 20 / 32 / 42 / 58 / 999 rpx |
| 正文 / 次要 / 弱 | 13.5 / 12 / 11 px | 26 / 23 / 21 rpx |
| 标题（衬线） | 18–22 px | 35–42 rpx |
| 大数字（得分环） | 34 px | 65 rpx |
| 点击目标 | ≥ 44 px | ≥ 85 rpx |

### 学段主题：`data-stage` 怎么搬到小程序

原型把学段挂在页面根节点上（`<div class="phone__screen" id="screen" data-stage="mid">`），用属性选择器切换整套令牌。小程序里没有属性选择器的等价写法（WXML 是数据驱动），改成**在页面根 view 上拼 class**：

```xml
<!-- pages/today/index.wxml -->
<view class="page-root stage-{{stage}}"> … </view>
```

```js
// pages/today/index.js
data: { stage: 'mid' },
onLoad(){ this.setData({ stage: wx.getStorageSync('rosenthal').stage || 'mid' }); }
```

```css
/* app.wxss —— 与原型 app.css 的「学段适配」段落一一对应 */
.stage-p12 { --r-md: 40rpx; --r-lg: 52rpx; font-size: 30rpx; }
.stage-high { --r-md: 24rpx; --r-lg: 32rpx; --paper: #F4F3F0; --amber: #B8642F; }
.stage-high .miles { display: none; }   /* 高中不做徽章 */
```

四个学段的模板（13 / 16 / 26 / 18 条）、日上限（8 / 10 / 12 / 12）与奖励档位（10 分起步 → 20 分起步 → 500 元大件），建议做成云数据库的一张 `stage_template` 集合，用 `stage` 字段取，避免把 73 条行为硬编码进小程序包（也能不发版调整）。

**小程序支持 CSS 变量**，`:root` 可原样搬到 `app.wxss`，改成 `page{ --paper:#F6F1E8; … }`（小程序没有 `:root`，用 `page` 选择器）。颜色令牌一个都不用改，直接复用。

---

## 三、必须替换的能力（逐条对照）

| 原型用了 | 小程序里 | 替代方案 |
| --- | --- | --- |
| `innerHTML` 拼字符串渲染（`renderToday` 等） | **不支持** | 全部改写成 WXML 的 `wx:for` + `wx:if`，JS 只 `setData` 数据。这是最大工作量：8 个 `renderXxx()` 要拆成 8 组 `data` 字段 |
| `document.addEventListener('click')` 事件委托 | **不支持**（无 DOM、无冒泡委托） | 每个可点元素写 `bindtap="onTapItem" data-id="{{item.id}}"`，在 `e.currentTarget.dataset` 里取参 |
| `localStorage` | **不支持** | `wx.setStorageSync('rosenthal', state)`；跨设备用云开发 |
| `color-mix(in srgb, var(--dim) 13%, transparent)` | 基础库/机型支持不稳 | 预计算成 rgba 常量，按维度写成 5 个类（如 `.dim--study .item__p{background:rgba(217,122,61,.13)}`） |
| `backdrop-filter: blur()`（tabBar/遮罩） | 部分机型无效 | 改成不透明背景 `#F6F1E8`；遮罩用 `rgba(28,24,20,.44)`（这个没问题） |
| `aspect-ratio`（热力图格子、惊喜卡） | 老基础库不稳 | 用固定高度（如 `height: 84rpx`）或 `width:12%; padding-top:12%` 撑高 |
| `.spark` 星屑动画用 `position:fixed` + 随机 `--dx` | 可行但需要动态样式 | 用 `wx:for` 渲染 6 个 `<view class="spark" style="left:{{s.x}}px;--dx:{{s.dx}}px">`，400ms 后 `setData` 清空 |
| `<svg><use href="#i-xxx"/></svg>` 图标 | 不支持 SVG 雪碧图 | tabBar 用 PNG；页面内小图标用 base64 内联的 `background-image`，或 `<image src="/assets/ic-x.png">` |
| 得分环（SVG `stroke-dasharray`） | SVG 不能内联在 WXML | 见下方「四、得分环三选一」 |
| 媒体查询 `@media (max-width:1024px)` | 只有 `wx.getWindowInfo()` | 用 `wx.getSystemInfoSync().windowWidth` 判断，或直接按手机版做（本产品只在手机用） |
| `@media print` 打印样式 | 不支持 | 打印版改为：`wx.downloadFile` + 服务端生成 PDF，或用 `wx.openDocument` 打开一份服务端渲染的 PDF |
| `Array.prototype.flat`、可选链等 | 新版基础库已支持 | 本原型代码已刻意避开 `??` / `?.`（Node 11 语法检查通过），移植时无需改语法 |

---

## 四、得分环三选一

1. **Canvas 2D（推荐）**：`<canvas type="2d" id="ring">` + `wx.createSelectorQuery().select('#ring').fields({node:true,size:true})`，`ctx.arc` 画底环与进度环，加 `createLinearGradient` 做橙色渐变。canvas 2d 已支持同层渲染，底部弹层能正常盖住它。
2. **双半圆 + rotate**（兼容性最好）：两个 `border-radius:50%` 的 view，用 `transform:rotate(calc(...))` 加上 `overflow:hidden` 半圆遮罩，纯 CSS 表达 0–100%。
3. **conic-gradient + mask**：代码最短，但依赖较新的 WebView，老安卓机上会退化。

原型里的 `#ringFg` 的 `stroke-dashoffset` 对应值可直接换算：`offset = 301.6 × (1 − score / 12)`，Canvas 里就是 `endAngle = -90° + 360° × score / 12`。

---

## 五、数据层与云开发

### 5.1 本地版（第一周就能跑）

```js
// app.js
App({ globalData:{ state:null },
  onLaunch(){ this.globalData.state = wx.getStorageSync('rosenthal') || null; } })

// utils/store.js —— 唯一写入口，和原型 addPoints 一一对应
export function addPoints(state, { itemId, name, dim, points, praise }) {
  if (!(points > 0)) return { ok:false, reason:'系统里没有扣分' };
  const used = dayScore(state, todayKey());
  if (used >= capOf(state.stage)) return { ok:false, reason:'今天已经很棒了，剩下的留给明天' };
  // …push ledger, setData, wx.setStorageSync
}
```

**移植时请把 `addPoints` 原样保留**——它是「只加分」这条红线的物理实现，不要把分数拼装逻辑散到各个页面里。注意日上限已经随学段变化（原型里是 `capNow()`），不要再写死 `12`。

### 5.2 云开发（家庭共享时）

集合名与字段直接对应 PRD §8：

| 集合 | 关键字段 | 安全规则要点 |
| --- | --- | --- |
| `stage_template` | stage(p12/p36/mid/high), cap, items[], rewards[] | 全局只读，由运营侧维护，不发版即可调整 |
| `family` | invite_code, members | 仅家庭成员可读 |
| `user` | role(child/parent), nickname, stage | 角色与学段决定客户端分支 |
| `behavior_item` | dimension, name, points, daily_limit, created_by | 孩子可改自己的，家长改动需双签 |
| `check_in` | item_id, date, points, note, is_private | 仅本人可写；家长只读且 `is_private` 不返回 |
| `point_ledger` | delta(>0), reason, ref | **仅允许新增，禁止 update/delete**（在安全规则里写死） |
| `redemption` | reward_id, cost, status, coupon_code | 孩子可创建，家长只可改 `status`，**不可 delete** |
| `repair_action` | trigger_type, self_reminder, due_date | 不产生负分，完成时写入一次正向 ledger |
| `weekly_review` / `rule_version` / `surprise_card` / `milestone` | 见 PRD §8 | `rule_version` 需 child + parent 双签时间戳 |

---

## 六、建议组件拆分（6 个自定义组件）

| 组件 | 复用页面 | 关键 properties |
| --- | --- | --- |
| `ring-progress` | 今日 | `score`, `max` |
| `item-card` | 今日 / 我的规则 / 规则共建 | `item`, `count`, `locked`, `mode(view/edit)` |
| `bottom-sheet` | 全部 | `show`, `slot`；内部处理遮罩与手势 |
| `praise-modal` | 今日 | `fact`, `trait`, `points`, `overflow` |
| `heat-map` | 成长 | `month`, `scores` |
| `coupon-card` | 兑换 / 我的 | `coupon`, `used` |

---

## 七、字体

原型用衬线体做标题（`Noto Serif SC / Songti SC`）。小程序**不保证**有宋体（Android 普遍没有），两条路：

1. `wx.loadFontFace({ family:'RosenthalSerif', source:'url("https://…/NotoSerifSC-subset.woff2")', global:true })` —— 记得只子集化常用字，否则体积爆炸；
2. 直接降级：标题用系统字（`PingFang SC` / 系统默认），靠**字重 + 字距**做出编辑感（`font-weight:600; letter-spacing:.02em`）。

建议先走方案 2 上线，方案 1 作为 V1.1 的视觉增强。

---

## 八、合规红线（提审前逐条确认，以微信官方最新规范为准）

1. **「惊喜卡」不能做成抽奖。** 小程序对抽奖类功能与类目资质有额外要求（[相关讨论](https://wxopen.club/topic/5e4679e5811a38cc5e4ad973)）。原型已经把 PRD 里的「抽卡」改成了 **「连续 7 天达成 → 自己挑一张」**，零随机、零概率，请保持这个形态。→ 同步修订 PRD §M6 的措辞。
2. **必须先配置《小程序用户隐私保护指引》**，否则相关接口调用会被拦截：见[官方隐私协议开发指南](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/PrivacyAuthorize.html)。
3. **积分不可购买、不可充值、不可提现、不可转让**（PRD 已是此规则）。iOS 上小程序不允许虚拟支付，一旦将来卖积分或会员就会违规。
4. **用户是 12 岁未成年人**：收集信息最小化（昵称即可，不要手机号/生日精确值），涉及个人信息需监护人同意；产品本身不做排行榜与公开比较，这是加分项，别在后续版本里加回去。
5. **不得诱导分享**：券与奖励的获取条件里不能出现「分享给好友 / 拉人助力」。
6. **类目建议**：选「工具 > 效率」或「教育 > 教育信息服务」，避开「商业促销 / 抽奖」这类需要资质的类目。

---

## 九、移植四阶段路线

| 阶段 | 产出 | 验收 |
| --- | --- | --- |
| **S1 结构搬移（2–3 天）** | app.json + 9 个页面骨架 + app.wxss 令牌 + tabBar 图标；静态页面手写死数据 | 五个 tab 能切、样式与原型一致 |
| **S2 数据化（3–5 天）** | 把 8 个 `renderXxx()` 改写成 WXML + `setData`；`utils/store.js` 落地 `addPoints` | `node _smoke.js` 里的 79 条断言在真机上等价通过 |
| **S3 交互闭环（3–5 天）** | 打卡→肯定卡→撤销、兑换→发券、周复盘 5 步、修复行动、必改 3 项 | 全流程可用，`wx.setStorageSync` 重启不丢 |
| **S4 云与家庭（5–7 天）** | 云开发集合 + 安全规则 + 家长端角色切换 | 两台手机同家庭数据互通；家长端仍无删除能力 |

---

## 十、移植验收清单

- [ ] 系统内不存在任何写入负分的路径（`addPoints` 之外无处改分）
- [ ] 日上限在**引擎层**生效，且取自当前学段（8 / 10 / 12 / 12），前端置灰只是提示
- [ ] 必改 3 项未完成时，「开始使用」不可点，且计数在 `rule_version` 留痕
- [ ] 已发出的券，家长端无删除/撤回入口（云函数也不提供该 action）
- [ ] 家长端查询不返回孩子标记为「仅自己可见」的记录
- [ ] 学段只能升不能降；切换学段后历史记录完整保留，且强制重走一次「必改 3 项」
- [ ] 高中段默认隐藏徽章体系；`允许自己休息一次` 这条不能被砍掉
- [ ] 打卡交互 ≤ 5 秒、首屏 ≤ 2s、离线可打卡
- [ ] 隐私保护指引已配置；惊喜卡是「自选」不是「抽奖」；不满 14 周岁有监护人单独同意
- [ ] 打印/导出改走服务端 PDF，`_smoke.js` 的 79 条断言在真机回归通过
