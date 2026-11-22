# 罗森塔尔 · Android APK 构建与安装（自己/家人装，不上架）

这是把 [`single/罗森塔尔.html`](../single/罗森塔尔.html) 套进 Capacitor 的 Android 壳：
**零联网、零账号、数据只在设备的 WebView 本地存储里**。
你不需要装 Android Studio，全部在 GitHub Actions 上构建。

- 应用名：罗森塔尔
- 包名：`com.rosenthal.family`（**永远不要改**：改了等于另一个 App，覆盖安装会失败、数据会留不下）
- 支持：Android 5.1+（minSdk 22），手机和平板通用
- 权限：**一个都不申请**，已从 Manifest 移除 `INTERNET`，并用 `tools:node="remove"` 防止依赖把它合并回来

---

## 一、只做一次：建仓库 + 签名

### 1. 建仓库并推送

在 GitHub 新建**私有**仓库（例如 `rosenthal-family`），把工作区推上去：

```bash
git init
git add .
git commit -m "罗森塔尔家庭版"
git remote add origin https://github.com/<你的用户名>/rosenthal-family.git
git push -u origin main
```

> 根 `.gitignore` 已排除 `node_modules/`、`mobile/www/`、`mobile/android/app/src/main/assets/public/`、`*.keystore` 等；**不要**把 keystore 提交进仓库。
> 仓库里必须包含 `miniprogram/utils/`（引擎源码）、`single/`（单文件版与回归）、`mobile/`（Android 工程）、`.github/workflows/`；不要只推 `mobile/`，否则 CI 第一步就找不到引擎。

### 2. 固定签名

固定签名 = 一个 keystore 文件 + 4 个值。两种来源任选：

**推荐：本地生成（keystore 不经过任何服务器）**
```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 10000 -nodes \
  -subj "/CN=Rosenthal Family/OU=Family/O=Rosenthal/L=Home/ST=Home/C=CN"
openssl pkcs12 -export -in cert.pem -inkey key.pem \
  -out rosenthal-release.keystore -name rosenthal -passout pass:<随机密码>
```
然后把 `rosenthal-release.keystore` 转 base64，连同两个密码、`rosenthal` 一起填进 GitHub Secrets。
（本项目已经这样做好了：`.secrets/secrets.txt` 里就是 4 个值，keystore 文件也在里面。）

**备选：GitHub Actions 生成**
跑「一次性生成 Android 签名」workflow，从 artifact 里拿 4 个值，存完 Secrets 后**删掉那次 run/artifact**。

### 3. 存 4 个 Secrets

仓库 → **Settings → Secrets and variables → Actions → New repository secret**：

```
KEYSTORE_BASE64   = keystore 的 base64（单行）
STORE_PASSWORD    = 生成时设的密码
KEY_ALIAS         = rosenthal
KEY_PASSWORD      = 和 STORE_PASSWORD 相同（PKCS12 格式里两者必须是同一个值）
```

### 4. 离线备份

**keystore 丢了 = 以后无法覆盖升级**（只能卸载重装，本机数据会清）。
把 `.secrets/rosenthal-release.keystore` 和 `.secrets/secrets.txt` 备份到 U 盘 / 密码管理器；
同时养成在 App 里「家长 → 导出全量备份 JSON」的习惯。

---

## 二、每次出包

GitHub → **Actions** → 「罗森塔尔 · Android APK」→ **Run workflow**（填版本号，如 `1.0.1`）。
或者本地打 tag 自动出包：

```bash
git tag v1.0.1 && git push origin v1.0.1
```

流程会自动：

1. `node single/_smoke.mjs` —— 82 项回归（含 jsdom 真实点击链路），**不全绿就中止**；
2. `node single/build.mjs` 重新生成单文件产物；
3. 逐字节复制成 `mobile/www/index.html`（校验：同源、零外链、零网络调用）；
4. `npm ci` → `cap sync android` → JDK 17 → `assembleRelease` 固定签名；
5. 校验 APK 内含 `assets/public/index.html`、且合并后的 Manifest 不含 `INTERNET`；
6. 上传 artifact **`rosenthal-apk`**（`罗森塔尔.apk`，保留 30 天）。

`versionCode` 取 GitHub run number，单调递增，保证覆盖安装是「升级」。

---

## 三、家人安装

1. 在手机浏览器登录 GitHub，打开那次 workflow run，下载 `rosenthal-apk` → 得到 `罗森塔尔.apk`；
   也可以用微信/QQ 把 APK 文件直接发给家人（若微信内下载被拦，改用浏览器下载或网盘）。
2. 点开 APK → 系统提示「未知来源」→ 允许本次安装。
   - 小米：可能要临时关「纯净模式」；
   - 华为/荣耀：关「纯净模式 · 增强防护」；
   - 其它品牌：设置里允许该来源安装。
3. 首次打开：选学段 → 填昵称 → 开始。之后数据都在这台设备上。

**升级**：直接装新 APK 覆盖即可，**数据保留**（同签名）。

---

## 四、数据安全与备份说明

- App 不联网，也没有任何统计；`AndroidManifest.xml` 里没有 INTERNET 权限（并用 merge 规则挡住依赖带回权限）。
- `android:allowBackup="false"`：不参与系统的云备份 / 一键换机，避免数据离开设备；换手机请用下面的导出/恢复。
- 记录存在 WebView 的本地存储（localStorage），启动时已尽力申请 `navigator.storage.persist()`。
- 但本地存储仍可能因**卸载 App、清除 App 数据、系统存储回收**而消失，所以：
  - App 里「家长」页有 **全量备份 JSON / 恢复备份**；
  - 超过 7 天没备份会提醒；
  - 建议每月导出一次，存到网盘或发给自己。
- 换手机：旧机导出 JSON → 新机装 APK → 「恢复备份」。

---

## 五、常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 安装提示「应用未安装 / 签名冲突」 | 装过不同签名的包（比如本地 debug 包）。先卸载旧包再装——**会清数据**，先导出备份。以后只用同一个 keystore 出的包。 |
| 「解析软件包时出现问题」 | 下载不完整或 Android 版本低于 5.1；重新下载 / 换设备。 |
| 微信里点 APK 打不开 | 微信会拦 apk 直链，用手机浏览器打开下载链接，或先存到「文件」再点开。 |
| 打开是白屏 | 说明 `assets/public/index.html` 没进包；CI 的「校验 APK」步骤会拦住这种情况，看那步日志。 |
| 想自己本地出包 | 装 Android SDK + JDK 17，然后 `cd mobile && npm ci && npm run sync && cd android && ./gradlew assembleRelease`。没有签名 Secrets 时会退化成 debug 签名，**仅供自测，别发给家人**（下次正式包签名不一致）。 |

---

## 六、源码结构（改功能只看这里）

| 文件 | 作用 |
| --- | --- |
| `single/src/*` + `single/build.mjs` | 界面唯一事实来源；改完 `node single/build.mjs` |
| `single/_smoke.mjs` | 82 项回归，CI 第一关 |
| `mobile/scripts/sync-web.mjs` | 复制单文件产物 → `www/index.html` |
| `mobile/scripts/verify-web.mjs` | 产物一致性 / 无外链校验 |
| `mobile/capacitor.config.json` | appId / appName / webDir |
| `mobile/android/app/src/main/AndroidManifest.xml` | 无权限声明 |
| `mobile/android/app/build.gradle` | 固定签名 + 版本号参数 |
| `mobile/assets/*` | 1024px 图标 / 自适应前景 / 背景（`npm run assets` 生成各密度） |
| `.github/workflows/android.yml` | 出包流程 |
| `.github/workflows/keystore.yml` | 一次性签名生成 |

> iOS / iPadOS 暂不做。将来做时 `www/` 资源与 Capacitor 配置可直接复用，只需加 `ios/` 工程、签名证书与云 macOS 构建。
