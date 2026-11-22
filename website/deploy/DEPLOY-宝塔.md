# 罗森塔尔 · 网页版 · 宝塔部署手册

> 环境：**宝塔面板** · **Nginx 1.26.3** · **MySQL 8.0.48** · **Node.js 20 LTS**。
> **PHP 8.3 不需要**：本项目的后端是 Node.js（Express），不是 PHP；装 PHP 不影响部署，也不用配置 PHP 站点。

本文从零到可访问，按顺序执行即可。命令都在服务器终端里跑。

---

## 0. 你需要准备

- 一个已解析到服务器的域名（**大陆服务器需 ICP 备案**；未备案可先用「IP:端口」调试）。
- 宝塔里已装：**Nginx 1.26.3**、**MySQL 8.0.48**。
- 安装 **Node.js**：宝塔 → 软件商店 → 搜索「**Node.js版本管理器**」（或「PM2管理器」）→ 安装 → 选 **20 LTS**。
  - 装完后确认：`node -v`、`npm -v`、`pm2 -v` 可用。

---

## 1. 建站（Nginx）

宝塔 → **网站** → 添加站点：

- 域名：`your-domain.com`
- 根目录：`/www/wwwroot/rosenthal-web`（下面会放代码）
- PHP 版本：**纯静态**（不要选 PHP）
- 数据库：**先不创建**（第 3 步单独建）

创建后先不改 Nginx，等第 6 步再粘贴配置。

---

## 2. 上传代码

把本地 `website/` 目录上传到 `/www/wwwroot/rosenthal-web/`。

**不要上传** `node_modules/`、`logs/`、`.env`（服务器会重新生成）。

上传后的结构应是：

```
/www/wwwroot/rosenthal-web/
├─ public/  server/  db/  deploy/  tools/
├─ package.json  package-lock.json
└─ README-宝塔部署.md
```

设置属主（宝塔默认 `www`）：

```bash
cd /www/wwwroot/rosenthal-web
chown -R www:www .
chmod -R u+rwX .
```

---

## 3. 建数据库并导入表

宝塔 → **数据库** → 添加数据库：

- 数据库名：`rosenthal`
- 用户名：`rosenthal`
- 密码：`<强密码，记下来>`
- 字符集：`utf8mb4`

然后导入表结构（在服务器终端）：

```bash
cd /www/wwwroot/rosenthal-web
mysql -u rosenthal -p rosenthal < db/schema.sql
```

> 表里含 `family_state`（家庭工作状态）、账号/家庭/规则/流水/券/兑换码等 17 张表。
> `point_ledger` 的 `delta>0` 约束、奖励 `cost>0` 约束就是「只加分」的结构性保证。

**红线权限（建议做）**：只对「只增不改」的表收回 UPDATE/DELETE，
**不要整库收回**（会话表 sessions、user、family_state、redeem_code 都需要更新）：

```sql
REVOKE UPDATE, DELETE ON `rosenthal`.`point_ledger` FROM 'rosenthal'@'%';
REVOKE UPDATE, DELETE ON `rosenthal`.`coupon`       FROM 'rosenthal'@'%';
REVOKE UPDATE, DELETE ON `rosenthal`.`redemption`   FROM 'rosenthal'@'%';
FLUSH PRIVILEGES;
```

---

## 4. 配置 `.env`

```bash
cd /www/wwwroot/rosenthal-web
cp deploy/.env.production.example .env
openssl rand -hex 32        # 生成 SESSION_SECRET
nano .env
```

必改：

```ini
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
SESSION_SECRET=<上一步生成的随机串>
BCRYPT_ROUNDS=10
COOKIE_SECURE=false        # 还没配 HTTPS 时先 false；配好证书后改 true
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=rosenthal
DB_PASSWORD=<第 3 步的密码>
DB_NAME=rosenthal
SPONSOR_QR=/assets/pay.svg
```

> `COOKIE_SECURE=true` 只有在**已启用 HTTPS** 时才设；否则浏览器不会发回会话 cookie，表现为「登录后又变未登录」。

---

## 5. 安装依赖并启动 Node

```bash
cd /www/wwwroot/rosenthal-web
npm ci --omit=dev          # 没有 lock 就用 npm install --omit=dev
mkdir -p logs
pm2 start deploy/ecosystem.config.js --update-env
pm2 save
pm2 status
```

自检（应返回 `{"ok":true}`）：

```bash
curl http://127.0.0.1:3000/api/health
```

> 也可用宝塔「Node 项目管理器」：项目目录 `/www/wwwroot/rosenthal-web`，启动文件 `server/index.js`，端口 `3000`，用 PM2 守护。

---

## 6. Nginx 反代

宝塔 → 网站 → `rosenthal-web` → **设置 → 配置文件**，
在 `server { ... }` 里加入 `deploy/nginx.conf.snippet` 的内容（`root`、`location /api/`、`location /`、gzip）。

关键两点：

```nginx
root /www/wwwroot/rosenthal-web/public;
location /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location / { try_files $uri $uri/ /index.html; }
```

保存后 **重载 Nginx**（宝塔会提示「配置文件已保存，是否重载？」→ 是）。

此时访问 `http://your-domain.com` 应能看到登录页。

---

## 7. HTTPS（强烈建议）

宝塔 → 网站 → 设置 → **SSL** → Let's Encrypt → 申请（需域名已备案解析）。

成功后：

1. 改 `.env`：`COOKIE_SECURE=true`
2. 重启 Node：`pm2 restart rosenthal-web --update-env`
3. 强制 HTTPS（宝塔 SSL 面板可开「强制 HTTPS」）

---

## 8. 首次使用

1. 打开站点 → **注册**（用户名 3–20 位、密码 ≥6 位）。
2. **创建家庭**，选择孩子学段（小学低段/高段/初中/高中）→ 自动生成行为项与奖励。
3. 进「规则」把表改成你自己的（**改满 3 处**）→ 提交。
4. 进「家长端」→ **设置家长密码**（4–8 位数字）→ 签署「我按你的版本来」→ 规则生效。
5. 之后可打卡、周复盘、兑换；「规则」里可改奖励分值/内容、新增/删除档位。

**赞助（过渡）**：
- 把 `public/assets/pay.svg` 换成你的微信/支付宝收款码，或设 `SPONSOR_QR`。
- 用户免费导出 10 次后，会提示赞助；你在后台生成兑换码：
  ```bash
  cd /www/wwwroot/rosenthal-web
  node tools/gen-code.js 10
  ```
  把输出里的 `INSERT` 语句在 MySQL 执行（或用 phpMyAdmin 导入），把兑换码发给用户；
  用户在赞助面板填入即解锁。

---

## 9. 备份与运维

- **数据库备份**：宝塔 → 数据库 → 备份（建议每天、保留 7–14 天）。
- **日志**：`/www/wwwroot/rosenthal-web/logs/out.log`、`error.log`（PM2）。
- **重启**：`pm2 restart rosenthal-web`；查看日志：`pm2 logs rosenthal-web`。
- **升级代码**：覆盖文件 → `npm ci --omit=dev` → `pm2 restart rosenthal-web --update-env`。

---

## 10. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 502 Bad Gateway | Node 没起或端口不对：`pm2 status`、`curl 127.0.0.1:3000/api/health` |
| 登录后又变未登录 | HTTPS 下 `COOKIE_SECURE` 没设 `true`，或纯 HTTP 却设了 `true` |
| 输入密码进不了家长端 | 正常：家长端需要 PIN。首次会要求设置；忘了就在数据库清 `family_state` 对应字段（或用新家庭） |
| 端口 3000 被占用 | 改 `.env` 的 `PORT`，同步改 Nginx 的 `proxy_pass` |
| MySQL 连接失败 | 宝塔数据库权限/密码；`DB_HOST=127.0.0.1`；MySQL 8 默认 `caching_sha2_password`，mysql2 已支持 |
| 上传后 404 | Nginx `root` 没指到 `public`，或 `location /` 没配 `try_files` |
| 导出提示「内测/赞助」 | 免费 10 次用完了；用兑换码解锁（第 8 步） |

---

## 附：为什么不用 PHP 8.3

本项目的服务端是 **Node.js + Express**（`server/`），复用小程序的规则引擎（`../miniprogram/utils/templates.js`）。
Nginx 只做静态与反代，PHP-FPM 完全不参与，所以宝塔里装不装 PHP 8.3 都不影响本项目。
若你确实希望改成 PHP 后端，那是另一次重写（不在当前范围）。
