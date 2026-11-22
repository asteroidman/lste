# 罗森塔尔 · 微信小程序测试环境（`lste-wx/`）

这是 [`../miniprogram/`](../miniprogram/) 的**测试环境**：一个可直接用微信开发者工具打开的
DevTools 项目根，外加一套三层测试工程。

> 为什么单独建一个文件夹：`miniprogram/` 里有一条硬约束 —— **保持零 npm 依赖**
> （回归里用 `!exists('package.json') && !exists('node_modules')` 锁死）。
> 测试工具（jest / miniprogram-simulate / miniprogram-automator）只能挂在别处，
> 于是放在这里，`miniprogram/` 一个字节都不动。

---

## 一、它是怎么和 `miniprogram/` 连起来的

`lste-wx/miniprogram` 是 `../miniprogram` 的一份**只读镜像（真实目录）**，由
[`tools/sync-source.mjs`](tools/sync-source.mjs) 从单一真源同步生成：

```
E:\wwwwroot\lste-weixin\
├── miniprogram\            ← 唯一真源（零 npm 依赖，不能动）
└── lste-wx\                ← 测试环境
    ├── miniprogram\        ← 真源的镜像（npm run sync 生成；别在这里改代码）
    └── tests\ tools\ …
```

**为什么用「镜像 + 同步」而不是目录联接（junction）**：微信开发者工具的编译器 /
文件监听**不跟随 Windows 目录联接**。指向联接时，DevTools 会报
`根据 project.config.json 中 miniprogramRoot 指定的小程序目录 miniprogram/，在该目录下未找到 app.json`。
换成真实目录就好了 —— 镜像由脚本生成，保持与真源一致。

- 改了 `../miniprogram` 的代码后，**先 `npm run sync`**（`npm test` 会自动先 sync 一次），
  再在 DevTools 里点「编译」；
- 引擎套件与 Jest **直接读真源 `../miniprogram`**（不经镜像），所以测试永远对着真源，
  不存在「测试过了、镜像旧了」的问题；镜像只服务于 DevTools 编译。
- 镜像目录已写进 [`.gitignore`](.gitignore)，不进版本库。

`project.config.json` 里 `miniprogramRoot` = `miniprogram/`，`useCompilerPlugins` 关掉了
（本项目是纯 JS，不用 TS 编译器插件）。

---

## 二、三层测试

| 层 | 命令 | 测什么 | 需不需要开发者工具 |
| --- | --- | --- | --- |
| ① 引擎层 | `npm run test:engine` | `miniprogram/_smoke_s1.js`：三条硬约束、计分/兑换/周复盘/共建/隐私/日期等 **741 项断言**，跑在真实 `utils/store.js` 上 | 否 |
| ② 组件 / 模板层 | `npm run test:unit`（Jest） | 用官方 `miniprogram-simulate`（官方 wcc/wxss 编译器 + jsdom）**真实编译 WXML/WXSS 并渲染**：`ring-progress` 组件 + **全部 10 个页面的模板编译** + 出图版面纯函数（`render-image`）；补引擎套件看不到的「模板能否编译、数据能否绑上」 | 否 |
| ③ 工具 / 真机层 | `npm run devtools:auto` | 用官方 `miniprogram-automator` 驱动开发者工具，验证「工具里真能跑起来」 | **是** |

一次跑前两层：

```bash
npm test          # = test:engine + test:unit
```

---

## 三、用微信开发者工具打开

1. 打开「微信开发者工具」→ 导入项目 → 选本目录 `E:\wwwwroot\lste-weixin\lste-wx`；
   （`project.config.json` 已配好 `appid`、`miniprogramRoot`，无需再改）
2. 点「编译」，即可看到罗森塔尔小程序（首启应进「规则共建」页）。

**跑第 ③ 层（自动化）前的一次性设置**：
开发者工具 →「设置 → 安全设置」→ 打开「**服务端口**」。
之后：

```bash
# 若自动探测不到 cli.bat，先指定：
$env:WX_CLI = "D:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat"
npm run devtools:auto
```

> 本机实测：`cliPath` 正确时，若「服务端口」没开，`automator.launch` 会报
> `Failed to launch wechat web devTools…`。打开服务端口后即可连上。

---

## 四、目录结构

```
lste-wx/
├── project.config.json        DevTools 项目配置（miniprogramRoot=miniprogram/，appid 已填）
├── project.private.config.json 本机私有配置（每个机器不同，已 gitignore）
├── package.json               测试工程（npm scripts / devDependencies）
├── jest.config.js             Jest 配置（jsdom）
├── tsconfig.json              仅给编辑器 IntelliSense 用（本项目是 JS，不参与编译）
├── typings/                   miniprogram-api-typings（编辑器类型提示）
├── miniprogram/            真源 ../miniprogram 的镜像（npm run sync 生成）
├── tests/
│   ├── ring-progress.spec.js  组件层：真实编译 + 渲染得分环
│   ├── pages-compile.spec.js  模板层：官方编译器逐个编译全部 10 个页面
│   ├── render-image.spec.js   出图层：导出长图的版面纯函数
│   └── store.spec.js          引擎层：在 Jest 里直连真实 store（样板）
└── tools/
    └── devtools-smoke.js      工具层：miniprogram-automator 冒烟
```

`node_modules / tests / tools / typings / *.config.js / package.json` 都写进了
`project.config.json` 的 `packOptions.ignore`，**不会被打进小程序包**。

---

## 五、为什么用 `miniprogram-simulate`

引擎套件（第 ① 层）是手写的 Node 桩，它在 README「验证的边界」里承认有一个盲区：
**WXML/WXSS 是不是真被编译器接受**、模板里数据绑得对不对，它证不了。
`miniprogram-simulate` 用的是官方编译器，正好补上这一层：

```js
const simulate = require('miniprogram-simulate');
const id = simulate.load('./miniprogram/components/ring-progress/index');
const comp = simulate.render(id, { score: 6, cap: 12 });
comp.attach(document.body);
expect(comp.dom.innerHTML).toContain('今日已得');
```

它跑在 jsdom 里：拿不到真实 canvas 节点，所以得分环走的是组件的
**CSS 兜底路径**（`data.ready === false`）—— 这恰好把「老基础库降级」那条分支也盖住了。

### 这一层已经抓到过一个真 bug

`pages/onboarding/index.wxml` 与 `pages/week/index.wxml` 里各有一个 `<br>`。
Node 引擎套件自己写的启发式解析器把它当成「合法空元素」放过了，**但官方编译器不认** ——
DevTools 一编译就报 `expect end-tag br … near view`，整页打不开。
`tests/pages-compile.spec.js` 现在用官方编译器逐个编译 10 个页面，能一字不差地复现这个错误；
`_smoke_s1.js` 也补了一条点名 `<br>/<hr>/<img>/<div>…` 的断言。两处源码已改成合法写法。

---

## 六、下一步（这个环境还没做完的部分）

- [x] 用 `miniprogram-simulate` 编译**每个页面的 WXML/WXSS** →
      `tests/pages-compile.spec.js`（并借此抓到并修掉了 `<br>` 编译错误）；
- [ ] 第 ③ 层扩展成真正的 E2E：首启共建 → 打卡 → 肯定卡 → 周复盘 → 导出，逐步 `page.$$` 驱动；
- [ ] `jest --coverage` 出覆盖率报告（现在 16 条组件/模板/引擎/出图用例，是起步样板）；
- [ ] 把 `ring-progress` 的 canvas 绘制路径也搬进 Jest（用假 2d context 驱动 `_draw`）；
- [x] 把 `lste-wx` 加进工作区根的 README 与基线命令。
