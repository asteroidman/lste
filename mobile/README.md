# 罗森塔尔 · Android 壳（Capacitor）

把 [`../single/罗森塔尔.html`](../single/罗森塔尔.html) 原样套进 Android APK。
**不联网、不申请任何权限、不上架**，自己/家人安装。

- 完整流程见 [`../docs/APK-构建与安装.md`](../docs/APK-构建与安装.md)
- 云构建：[`.github/workflows/android.yml`](../.github/workflows/android.yml)（本机不需要 Android SDK）
- 一次性签名：[`.github/workflows/keystore.yml`](../.github/workflows/keystore.yml)

## 本地常用命令

```bash
cd mobile
npm ci
npm run preflight       # 82 项回归 → 重建单文件版 → 复制 www → 校验一致性/无外链
npm run sync            # 上述 + cap sync android（本地装了 SDK 才能接着 gradlew）
npm run assets          # 从 assets/ 重新生成各密度图标与启动图，并修正自适应图标背景层
cd android && ./gradlew assembleRelease   # 需 JDK 17 + Android SDK；无签名信息时是 debug 签名
```

> 本地 `assembleRelease` 没有签名 Secrets 时会退化成 debug 签名，**仅供自测**；
> 发给家人请用 GitHub Actions 出的固定签名包，否则以后无法覆盖升级。

## 目录

| 路径 | 说明 |
| --- | --- |
| `assets/` | 1024px 图标、自适应前景/背景源图 |
| `capacitor.config.json` | `appId com.rosenthal.family` / `appName 罗森塔尔` / `webDir www` |
| `scripts/sync-web.mjs` | 逐字节复制单文件产物到 `www/index.html` |
| `scripts/verify-web.mjs` | 一致性 + 零外链 + 零网络调用校验 |
| `android/` | Capacitor 生成的原生工程（Manifest 无权限、build.gradle 固定签名） |
| `www/` | **生成物**，git 忽略；CI 每次重建 |

改界面只动 `../single/src/*`，不要手改 `www/` 或 APK 里的网页。
