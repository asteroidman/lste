# 工作区 · 罗森塔尔（Rosenthal）

正向期待型青少年自我管理成长产品。当前工作区里只有一个项目，三部分内容：

| 目录 / 文件 | 是什么 | 状态 |
| --- | --- | --- |
| [`罗森塔尔-Rosenthal-网页产品PRD-v1.0.md`](罗森塔尔-Rosenthal-网页产品PRD-v1.0.md) | 主 PRD（正文版本 v1.1，12 章 + 附录 A/B） | 待评审；规则配置要等孩子答完「必改 3 项」才冻结 |
| [`罗森塔尔-需求访谈问卷.md`](罗森塔尔-需求访谈问卷.md) | 孩子卷 + 家长卷，答案直接变成规则配置 | 待填写 |
| [`prototype/`](prototype/) | 高保真网页原型（零依赖、零构建，双击 `index.html` 即可） | 完成，`node _smoke.js` → 79 项断言全绿 |
| [`miniprogram/`](miniprogram/) | 微信小程序工程（S1 + S2 + S3 全部完成） | 进行中，`node _smoke_s1.js` → 741 项断言全绿；**真机未验证** |
| [`lste-wx/`](lste-wx/) | 微信小程序**测试环境**（DevTools 项目根 + Jest/miniprogram-simulate/automator）。`miniprogram/` 是 `../miniprogram` 的镜像（`npm run sync` 生成） | 起步：`npm test` → 引擎 741 + Jest 16 全绿；工具层待开「服务端口」 |
| [`website/`](website/) | 网页版（Node.js + MySQL，宝塔部署）。**必须登录**；保留只加分/必改3项/双签/家长不可删红线 | **P2 完成**：登录/家庭 + 服务端引擎 + 家长密码门 + 导出免费10次/赞助（收款码+兑换码）+ 奖励CRUD；`npm test` → 36 全绿；部署见 [`website/deploy/DEPLOY-宝塔.md`](website/deploy/DEPLOY-宝塔.md) |
| [`lste/`](lste/) | **单文件家庭版**：`罗森塔尔.html` 一个文件、零依赖、零联网，数据只存本机 localStorage；家长 4–8 位 PIN（可改，带离线恢复码）管修改类操作；打印（今日卡/规则表/一周一页）免密；导出 CSV/备份 JSON 需密码 | 完成，`node lste/_smoke.mjs` → 82 项断言全绿（含 jsdom 真实点击链路）；重新构建 `node lste/build.mjs` |
| [`mobile/`](mobile/) | **Android 壳**（Capacitor）：把单文件产物原样套进 APK，零权限、不上架、自己/家人安装；固定签名保证覆盖升级不清数据 | 工程与 GitHub Actions 云构建就绪；出包见 [`docs/APK-构建与安装.md`](docs/APK-构建与安装.md)（iOS 暂不做） |
| [`docs/使用说明.md`](docs/使用说明.md) | **写给家长的用户手册**：安装、每日打卡、积分与奖励、周复盘、PIN、打印、备份换机、常见问题 | 完成 |
| [`marketing/`](marketing/) | 小红书推广物料：3 篇成稿笔记（神器分享 / 教育理念 / 亲子仪式感）+ 4 张 3:4 配图（封面插画 / 场景插画 / 三步图解 / 真实界面）+ 发布建议 | 完成，见 [`marketing/小红书/文案.md`](marketing/小红书/文案.md) |

另有两个**历史存档**文件，不是代码：`session.v4.jsonl` 与
`dsh-session-session-30177102-….zip` —— 上一个会话的导出（`cwd` 指向旧工作区）。

## 一条命令验证基线

```bash
cd prototype   && node _smoke.js        # 网页原型：79 / 79
cd ../miniprogram && node _smoke_s1.js  # 小程序骨架：741 / 741
cd ../lste-wx  && npm test              # 测试环境：引擎 741 + Jest 16（详见 lste-wx/README.md）
cd ../website  && npm test              # 网页版：Jest 36（登录/家庭/引擎/PIN/配额/兑换码，详见 website/README-宝塔部署.md）
node lste/_smoke.mjs                  # 单文件版：82 / 82（构建产物 + 引擎 + PIN + 打印 + 红线词 + jsdom 点击链路）
cd ../mobile   && npm run preflight       # Android 壳出包前预检：回归 + 重建 + 网页一致性/无外链
```

## 产品红线（写进代码约束，不可回归）

1. **不做扣分** —— 系统里不存在负分写入能力，`addPoints` 只接受正数；
2. **不做排行榜 / 同龄比较 / 公开分数**；
3. **不做家长监视面板** —— 家长只看得到「她做到了什么」，且不可删除她的记录；
4. **不推送羞辱性提醒** —— 只用邀请式文案；
5. **不用积分强制学习时长**，不做「扣分买回」。

## 三条硬约束（两套实现里都被测试锁死）

| 约束 | 网页原型 | 小程序 |
| --- | --- | --- |
| 只加分 | `app.js` 的 `addPoints` | [`utils/store.js`](miniprogram/utils/store.js) 的 `addPoints` |
| 日上限随学段 | `capNow()`（8 / 10 / 12 / 12） | 同上，且按日期收敛 |
| 必改 3 项 | `amend` 计数 + `renderBuild` | `amendedCount()` + `finishBuild()` 拒绝未满 3 处，再由家长 `parentAgree()` 双签生效 |

## 移植路线（来自原型目录的移植指南）

S1 结构搬移 → **S2 数据化** → **S3 交互闭环** → S4 云与家庭。
S1、S2 全部落地，**S3 交互闭环已完成**（得分环 Canvas 2D、具体肯定卡、周复盘 5 步向导、
惊喜卡、首启共建闸门、规则双签、隐私标记、打印导出）。
**S4 只剩云开发、上报通道、服务端 PDF 与真机验证**；指标口径与数据主权（一键导出 / 彻底删除）
已按 PRD §10 与 §7 在本地落地，接后端时不用重写。
逐条对照见 [`miniprogram/DELIVERY-对照表.md`](miniprogram/DELIVERY-对照表.md)，
诚实清单见 [`miniprogram/README.md`](miniprogram/README.md) 第六节。
