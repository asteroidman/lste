#!/usr/bin/env bash
# ============================================================
# 罗森塔尔 · 网页版 · 宝塔部署脚本
# 在服务器上、website/ 目录里执行：  bash deploy/deploy.sh
# 可选：首次导入建表  IMPORT_DB=1 DB_USER=rosenthal DB_NAME=rosenthal bash deploy/deploy.sh
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"
echo "[deploy] 目录：$APP_DIR"

echo "[deploy] 检查 Node"
node -v
npm -v

echo "[deploy] 安装生产依赖"
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

echo "[deploy] 准备 .env"
if [ ! -f .env ]; then
  cp deploy/.env.production.example .env
  echo "[deploy] 已生成 .env —— 请立刻编辑 SESSION_SECRET / DB_PASSWORD 后重新启动。"
else
  echo "[deploy] 已存在 .env（不覆盖）"
fi

mkdir -p logs

if [ "${IMPORT_DB:-0}" = "1" ]; then
  : "${DB_USER:?需要 DB_USER}"
  : "${DB_NAME:?需要 DB_NAME}"
  : "${DB_HOST:=127.0.0.1}"
  echo "[deploy] 导入 db/schema.sql 到 $DB_NAME（需要 mysql 客户端）"
  mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < db/schema.sql
fi

echo "[deploy] 启动 / 重载 PM2"
if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload deploy/ecosystem.config.js --update-env
  pm2 save
  pm2 status
else
  echo "[deploy] 未找到 pm2。请在宝塔「PM2管理器」里启动 server/index.js，"
  echo "         或执行： npm i -g pm2 && pm2 start deploy/ecosystem.config.js"
fi

echo "[deploy] 完成。下一步："
echo "  1) 宝塔 → 网站 → 配置文件：粘贴 deploy/nginx.conf.snippet 的 location/root"
echo "  2) 宝塔 → SSL：申请 Let's Encrypt 证书，并把 .env 的 COOKIE_SECURE 设为 true"
echo "  3) 浏览器打开站点，注册账号 → 创建家庭 → 开始使用"
