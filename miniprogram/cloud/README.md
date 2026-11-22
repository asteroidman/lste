# 云开发（S4）

这个目录是 S4 的云数据层：**集合定义 + 安全规则 + 适配器**。
它不需要云环境就能在 Node 里跑回归（`node _smoke_s1.js`），
真正接云时只差 AppID、环境 ID 与一次控制台配置。

## 三个文件各管什么

| 文件 | 作用 |
| --- | --- |
| [`schema.js`](schema.js) | 13 个集合的字段与权限原则（取自 PRD §8 与移植指南 §5.2），**声明式**，无依赖 |
| [`authz.js`](authz.js) | 安全规则的**纯 JS 参考实现**：`can(actor, collection, action, doc)` 穷举角色 × 动作 × 归属 |
| [`database.rules.json`](database.rules.json) | 上面那套判断的**云侧等价写法**，直接贴进开发者工具的数据库安全规则 |
| [`adapter.js`](adapter.js) | 本地状态 ↔ 云文档的字段映射 + 写入前预检；没有 `wx.cloud` 时降级为「未连接」 |

## 为什么把安全规则写成两份

云开发的安全规则只能在控制台 / `database.rules.json` 里配，**本机没有云环境就测不了**。
而规则的正确性恰恰是本项目最不能出错的地方：

- 家长**不能删除**她的记录（PRD §1.4 红线 3）；
- 流水 `point_ledger` **只增不改**（指南 §5.2 要求在安全规则里写死）；
- 已发出的券**不可 delete**（家长端无撤回能力）；
- 家长读不到 `is_private: true` 的记录（PRD §2.1 数据主人）；
- 规则版本**必须双签**才写 `effective_at`（PRD §3 单方修改待生效）。

所以把同一套判断写成纯函数（`authz.js`），在 Node 里穷举组合验证；
`database.rules.json` 是它在云侧的等价写法。**两者不一致就是 bug**——
`_smoke_s1.js` 有对拍断言逐条比对，改任何一边都会被抓出来。

## 接云需要的四步（本机做不了）

1. 用**真实 AppID** 在开发者工具里开通云开发，拿到环境 ID；
2. 建集合：`schema.js` 里 `COLLECTION_NAMES` 的 13 个一次建好；
3. 配安全规则：把 `database.rules.json` 的 `rules` 贴进「数据库 → 安全规则」；
4. 在 `app.js` 里 `wx.cloud.init({ env })`，然后把 `adapter.mapLocal()` 接进同步流程
   （本地仍是事实来源，云是可选的家庭共享通道 —— PRD §9）。

## 还没做的

- **上报通道**：`utils/store.js` 的 `metrics()` 已经按 PRD §10 算好了六层指标，
  接上任意分析后端时把返回结构直接上报即可，不用重写；缺的只是「往哪发」。
- **服务端 PDF**：`store.buildWeekPage().pdfPayload` 是可直接 POST 的最小载荷。
- **冲突处理**：PRD §9 建议「最后写入优先 + 双方可见变更日志」，本工程尚未实现
  —— 目前是本地优先、云未接入，谈不上冲突。
