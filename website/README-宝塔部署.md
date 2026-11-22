# 罗森塔尔 · 网页版（`website/`）

Node.js + MySQL 的网页版。**必须登录**使用。已完成 **P0（账号密码登录 + 家庭）**、
**P1（服务端规则引擎 + 核心页面/API）** 与 **P2（家长密码门 + 导出免费10次/赞助 + 奖励CRUD）**。
保留小程序的三条红线：只加分 / 必改 3 项 / 双签 / 家长不可删。

> **要部署到宝塔？** 直接看 [`deploy/DEPLOY-宝塔.md`](deploy/DEPLOY-宝塔.md)
> （Nginx 1.26.3 / MySQL 8.0.48 / Node 20）。后端是 Node.js，**不需要 PHP**（装 PHP 8.3 也不影响）。
> 也可以 `bash deploy/deploy.sh` 一键装依赖 + PM2 启动；Nginx 片段在 `deploy/nginx.conf.snippet`。

## 目录

```
website/
├─ public/            前端（零构建 vanilla SPA：介绍/今天/成长/兑换/周复盘/规则/家长端）
├─ server/            Node.js 后端（Express）
│  ├─ index.js        入口（选 MySQL 或内存数据源）
│  ├─ app.js          组装应用（可注入 repo，便于测试）
│  ├─ config.js       读 .env
│  ├─ middleware.js   登录/家庭闸门 + 内存限流
│  ├─ routes/         auth.js / family.js / child.js / parent.js
│  └─ lib/            secure.js / engine.js / repo-memory.js / repo-mysql.js / session-store.js
├─ db/schema.sql      MySQL 建表（含红线约束与 DB 权限示例）
├─ test/              Jest + supertest（security/auth/engine/api）
├─ .env.example
└─ package.json
```

## 引擎与红线（P1）

`server/lib/engine.js` **复用 `../miniprogram/utils/templates.js`**（行为项/奖励/维度/禁用词，单一真源），
在「家庭工作状态（JSON）」上操作，语义与小程序 `store.js` 一致：

- **只加分**：`addPoints` 拒绝 `points<=0`；全仓库没有写负分路径。
- **日上限随学段**：`capOf(S)` 在引擎层强制（p12/p36/mid/high = 8/10/12/12）。
- **周结算**独立入账，不占当日上限（`pointsOn` 忽略 `weekly`）。
- **必改 3 项**：`finishBuild` 未改满 3 处直接拒绝。
- **双签**：`isRuleActive` 需要孩子提案 + 家长 `agree`。
- **家长不可删**：没有任何删除打卡/券的接口；`visibleToParent` 过滤私密条目。
- 奖励可**改分值 / 改内容 / 新增 / 删除**（`setRewardCost/addReward/removeReward/…`）。

> 家庭的**工作状态**以 `family_state.json` 保存（镜像小程序 state，最大化复用引擎）；
> `point_ledger / check_in` 等规范化表保留给后续审计与查询。

## API 一览（P1）

`GET/POST /api/auth/*`、`/api/family/*`、`GET /api/me`、`GET /api/today`、`POST /api/checkin`、
`POST /api/undo`、`POST /api/entry/private`、`GET /api/growth`、`GET /api/rewards`、`POST /api/redeem`、
`POST /api/coupon/use`、`GET /api/rules`、`POST /api/rules/item|item/points|item/remove|reward|reward/title|reward/cost|reward/remove|finish`、
`GET /api/week`、`POST /api/week/finish`、`GET /api/parent/pending`、`POST /api/parent/confirm`、`POST /api/parent/agree`、`GET /api/parent/overview`。

## 本地跑

```bash
cd website
npm install
npm run dev          # 未配 .env 时用「内存数据源」，进程重启即清空
# 打开 http://127.0.0.1:3000
npm test             # secure + 登录 + 家庭 的自动化测试
```

## 宝塔部署（服务器）

1. **建站**：宝塔「网站」新建站点（域名或 IP）。
2. **装环境**：软件商店安装 **Node 项目管理器** 和 **MySQL**（Nginx 一般已装）。
3. **建库**：宝塔「数据库」新建库（如 `rosenthal`，账号 `rosenthal`），
   用 phpMyAdmin 或命令行导入 [`db/schema.sql`](db/schema.sql)：
   ```bash
   mysql -u rosenthal -p rosenthal < db/schema.sql
   ```
4. **上传代码**：把 `website/` 传到站点目录（如 `/www/wwwroot/rosenthal-web`）。
5. **配 `.env`**：复制 `.env.example` 为 `.env`，填 `SESSION_SECRET`（一长串随机）和 `DB_*`。
6. **Node 项目**：宝塔「Node 项目管理器」添加项目
   - 项目目录：`/www/wwwroot/rosenthal-web`
   - 启动文件：`server/index.js`
   - 端口：`3000`，包管理器 npm，启动命令 `npm install`，用 PM2 守护。
7. **Nginx 反向代理**：站点配置里把 `/api` 转到 `http://127.0.0.1:3000`，
   其余静态文件由 Node 托管（或直接指到 `public/`）：
   ```nginx
   location /api/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
   location /     { proxy_pass http://127.0.0.1:3000; }
   ```
8. **HTTPS**：有域名时用宝塔一键申请 Let's Encrypt。
9. **红线（重要）**：给应用数据库账号**撤销**对「只增不改」表的 UPDATE/DELETE：
   ```sql
   REVOKE UPDATE, DELETE ON `rosenthal`.* FROM 'rosenthal'@'%';
   GRANT  SELECT, INSERT  ON `rosenthal`.`point_ledger` TO 'rosenthal'@'%';
   GRANT  SELECT, INSERT  ON `rosenthal`.`coupon`       TO 'rosenthal'@'%';
   GRANT  SELECT, INSERT  ON `rosenthal`.`redemption`   TO 'rosenthal'@'%';
   FLUSH PRIVILEGES;
   ```

> **未备案域名提醒**：大陆服务器 80/443 需 ICP 备案；未备案可先用「IP:端口」或香港节点访问，
> 正式对外前尽快备案。微信扫码登录与自动扫码支付需备案域名 + 主体资质（见根目录方案，P5/P6）。

## 阶段

- **P0（已完成）**：登录 + 家庭。
- **P1（已完成）**：服务端规则引擎（复用 `templates.js`）+ 核心 API/页面（今天/打卡/成长/兑换/周复盘/规则共建/家长端）。
- **P2（已完成）**：家长密码（PIN）门 + 导出免费 **10** 次 + 赞助（静态收款码 + 兑换码）+ 奖励 CRUD（改分值/改内容/新增/删除）。
- P3：奖励 CRUD 增强（网页版，P2 已提供基础版）。P4：奖励 CRUD（小程序端）。
- P5：微信扫码登录。P6：微信 Native 扫码支付。

## P2 用法

**家长密码（PIN）**
- 首次进「家长端」→ 设置 4–8 位数字密码；之后每次切换进家长端都要输一次（本会话有效，可点「锁定」）。
- 端点：`GET /api/parent/status`、`POST /api/parent/pin`、`POST /api/parent/unlock`、`POST /api/parent/lock`；
  受保护端点（pending/confirm/agree/overview）在**已设密码且未解锁**时返回 `403 {needPin:true}`。

**导出 / 打印 免费 10 次 → 赞助**
- `GET /api/export/quota`、`POST /api/export/consume`（超额返回 `403 {needSponsor:true}`）、
  `GET /api/sponsor/info`、`POST /api/sponsor/redeem`。
- 网页里的「导出 / 打印」按钮会先消耗一次额度，再打开打印页；超额则弹**赞助**面板。

**赞助收款码 + 兑换码**
- 收款码：把 `public/assets/pay.svg`（占位图）换成你的收款码，或用环境变量 `SPONSOR_QR` 指定。
- 兑换码：`node tools/gen-code.js 5` 生成码与 SQL（写入 `redeem_code` 表）；
  本地开发也可用环境变量 `SEED_REDEEM_CODES=CODE1,CODE2` 直接播种。
- 用户在赞助面板填入兑换码 → 核销 → `sponsorUnlocked` → 导出不再计数。

**环境变量补充**：`SPONSOR_QR`（收款码路径）、`SEED_REDEEM_CODES`（本地播种兑换码）。
