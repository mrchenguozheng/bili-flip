# B站首页卡片翻转与UP屏蔽

一个只改「显示」的 Tampermonkey 用户脚本：把 B 站首页里不想看的卡片翻过来，不让它们好端端地待在那儿；再给你一份只存本机的 UP 屏蔽名单。

![Tampermonkey](https://img.shields.io/badge/Tampermonkey-1.2.0-00b0ff) ![platform](https://img.shields.io/badge/platform-Edge%20%7C%20Chrome-lightgrey) ![license](https://img.shields.io/badge/license-MIT-green)

> **目标管理器：Tampermonkey（Edge / Chrome）。** 只用 `GM_*` 老接口与原生菜单。未适配 Violentmonkey（其 `GM_unregisterMenuCommand` 按菜单文字注销，本脚本按 id），也未适配 Greasemonkey 4（没有 `GM_registerMenuCommand`）。

## 目录

```
README.md                          本文件
AGENTS.md                          维护指南（改代码前先读）
eslint.config.mjs                  ESLint 配置（只约束 tampermonkey/ 下的脚本）
package.json                       仅 devDependencies：eslint、globals、jsdom
tools/
  block.test.cjs                   jsdom 回归（npm test）
tampermonkey/
  bilibili-home-flip-block.user.js  脚本本体（唯一需要安装的文件）
  CHANGELOG.md                      版本记录
```

用户装脚本不需要 `npm`；下面这套只给改代码的人用。

## 关于

这个脚本处理首页信息流里三类让人不想点开的卡片：带「广告」标记的、推荐位与直播位的、以及你自己屏蔽过的 UP 发布的。广告位整卡上下翻转（倒置会破坏重力与光照线索，比左右翻转更难一眼认出），其余做左右翻转，并可各自选择是否禁止点击。

它**不下载、不拦截、不改写任何请求**，也不修改 B 站的 DOM 结构：只给卡片加一个 `data-bbm` 属性，由一段 CSS 完成翻转。关掉开关或删掉脚本再刷新，页面就完全回到原样。

名单、标签、BV 与标题都只存在本机，不同步、不上传；导出默认连 BV 号与视频标题都不带。

## 安装

**[一键安装](https://cdn.jsdelivr.net/gh/mrchenguozheng/bili-flip@main/tampermonkey/bilibili-home-flip-block.user.js)** —— 在装了 Tampermonkey 的 Edge / Chrome 里点开，会直接进入安装页。

1. Edge / Chrome 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开上面的链接，Tampermonkey 会弹出安装页；也可以复制整份内容，在扩展里「添加新脚本」后粘贴保存。
3. 打开 `https://www.bilibili.com/` 刷新。

**为什么不用 GitHub 的 raw 地址**：raw 返回 `Content-Type: text/plain` + `nosniff`，浏览器只会把脚本当文本显示，篡改猴不会拦截安装；jsDelivr 返回 `application/javascript`，所以能直接进安装页。另外，篡改猴的「允许的站点」需包含 `cdn.jsdelivr.net`，否则同样看不到安装页。

安装后检查两处，这是“脚本装了却毫无反应”的两个常见原因：

- 篡改猴的**站点访问权限**要包含 `www.bilibili.com`（Edge 里若“允许的站点”只有 `cdn.jsdelivr.net`，脚本不会执行）。
- 首页地址要落在 `/` 或 `/index.html`；其它页面只有视频播放页会多出屏蔽名单入口，翻转不生效。

脚本头部的 `@updateURL` / `@downloadURL` 指向同一条 jsDelivr `@main` 地址，以后仓库里升版本，篡改猴会提示升级，不用手动重装。jsDelivr 对 `@main` 这类分支引用有缓存（最长约 12 小时）；想让新版本立刻可装，可在 [purge 工具](https://www.jsdelivr.com/tools/purge) 里刷一下那条 URL。

### 两条地址，各管一件事

| 用途 | 地址 | 特性 |
|---|---|---|
| 日常安装、自动更新 | `...@main/tampermonkey/bilibili-home-flip-block.user.js` | 只跟随**已发布版本**（`main` 锁定为最新 release，实验改动不进 `main`）；分支引用有缓存，改动后可能要 purge 才生效 |
| 锁定某个版本 | `...@1.0.0/tampermonkey/bilibili-home-flip-block.user.js` | 按 git tag 取，内容永不变化、没有缓存问题 |

```
https://cdn.jsdelivr.net/gh/mrchenguozheng/bili-flip@1.0.0/tampermonkey/bilibili-home-flip-block.user.js
```

锁版本地址适合发给别人复现同一份行为、或者在排查“是不是新版引入的问题”时退回旧版。脚本头部仍用 `@main`：`@updateURL` 若也写成固定版本，篡改猴就永远只会看到那一个版本，等于关掉了自动更新。

分支：`dev` 是日常开发与实验所在，`main` 只在发版时快进合并一次并打 tag。想提前试实验版，把地址里的 `@main` 换成 `@dev` 即可（同样会有分支缓存）。

发新版时：改 `@version` → 提交 → `git tag <版本号>` → 推 tag，那条 `@<版本号>` 地址就自动可用（仓库目前有 `1.0.0` 这个 tag；`1.1.0` 随发布打 tag）。

## 使用

入口全部在 Tampermonkey 的菜单里：点浏览器工具栏上的篡改猴图标，选本脚本，菜单项按顺序是八档开关、UP 行、九项屏蔽理由、名单维护四项。

### 八档开关

| 类别 | 翻转 | 禁止点击 |
|---|---|---|
| 首页广告位 | 上下翻转（`scaleY(-1)`） | 可选 |
| 首页推荐位（番剧 / 国创 / 综艺 / 课堂 / 电影 / 电视剧 / 纪录片 / 漫画 / 直播） | 左右翻转（`scaleX(-1)`） | 可选 |
| 首页直播位 | 左右翻转 | 可选 |
| 首页屏蔽UP主 | 左右翻转 | 可选 |

八档互相独立，没有“全部开启 / 全部关闭”。每档一行，写当前生效的那种效果；行首图标即状态：翻转生效时是方向图标（广告位 `↕️`、其余翻转 `↔️`），禁止点击生效时是 `✅`，关掉一律是 `⬜`。

每行行尾还带这一档**在本页实际作用了几张卡**，例如 `↕️ 首页广告位：上下翻转（本页 2 张）`。这就是“这一档到底有没有在这张页面上生效”的直读答案，不必猜图标：

- 开关开着、数字 > 0：这一档正在起作用，数字就是被处理的卡片数。
- 开关开着、数字 0：这一档没问题，只是本页没有这类卡片（例如首页没有直播位）。
- 开关关着：行首是 `⬜`，数字必然 0，因为效果已经摘掉了。

数字随扫描更新，最多晚 3 秒（一次心跳）；卡片被信息流换掉、翻页、懒加载补进来时会自己变，不用去点菜单。一个数字对应一档：翻转和禁止点击各自计数，关掉翻转不会把禁点的数字带走。

地址后加 `?bbm=off`，本页全部不生效，不改任何存储。

### 屏蔽名单

入口只在视频播放页的菜单里，且只在能确定当前 UP 的 uid 时才注册（地址栏 BV → 页面状态 → 接口，三层任一成功即用）。

- 点中任一「屏蔽理由」，当前 UP 就进名单，回到首页他发的卡片会翻转（并默认禁止点击）。
- 取消最后一项理由，即移出名单。
- 最上面那行只显示状态，点它没有任何反应：`⛔ 已屏蔽该UP：张三（恰饭广告）`（名字后只写第一条理由）或 `UP：张三；要屏蔽就点下面的理由`。
- 只按 uid 判定，名字仅用于显示。

### 标签（固定九项）

`恰饭广告 / 标题党 / 内容注水 / 搬运抄袭 / 引战带节奏 / 情绪营销 / 伪科普 / 其他 / 不再关注`

菜单里显示展开写法（括号内是收编的近义说法），存储与导出用短名。表外标签（旧存档里的、导入文件里的）一律折叠成「其他」。没有新增 / 删除标签的入口。

## 识别规则

- **广告卡**：卡内文本节点整串等于「广告」。不是包含“广告”二字，所以标题里带广告的普通视频不会误伤。
- **推荐位**：`.floor-title` 文字命中白名单，或模块带 `data-mod="partition_recommend.*"`（按前缀匹配）。
- **直播位**：`.bili-live-card`，或卡内存在指向 `live.bilibili.com` 的链接。
- **屏蔽名单**：只按 uid 匹配。

类名整批换掉（A/B 灰度、改版）时，还有一层**形状兜底**：只在「页面上明显有视频链接、却一个 `.bili-video-card` 都没有」时启用，沿链接向上爬，取「同类链接不超过 3 个、整层链接不超过 5 个、图片不超过 3 张、有封面图、文字不超过 200 字」的最外层当作整张卡；顶栏、页头、导航直接排除。认不出就不动，不做猜测。

## 数据与隐私

### 两个存储键

| 键 | 内容 | 何时读 |
|---|---|---|
| `bbm:blocked` | 整份名单 `[{uid, name, bvid, title, tags, at}]` | 启动、打开菜单、导入、清空、加/解人 |
| `bbm:blocked:uids` | 一行 `v1\|条数\|uid,uid,...` 的索引 | 后台轮询，只读这个 |

优先用 GM 存储（与 bilibili.com 的站点数据隔离，清站点 cookie 不会带走名单）；没有 GM 时退 `localStorage`。

索引只是缓存：读整份发现对不上就按整份重写；索引缺失或损坏时退回读整份。手动只改 `bbm:blocked` 的话，打开一次菜单即对齐。

### 导出

| 项 | 内容 |
|---|---|
| 明文，不含标签 | `{v, entries:[{uid,name,at}], exportedAt, count}` |
| 明文，含标签 | 同上，条目加 `tags`，并附 `format / scriptVersion / tagSchemaVersion / tagSchema` |
| 加密包 | 唯一会写出 BV 号与视频标题的路径 |

明文导出**永远不含** `bvid` / `title`：它们是“你看过什么”，不是“你屏蔽了谁”。

加密包参数：

- AES-GCM-256，口令经 PBKDF2-SHA256、200000 轮派生，`salt` 16 字节 / `iv` 12 字节每次随机。
- 口令 ≥ 12 位，须同时含大写、小写、数字、符号；不同字符 ≥ 10 种；不含常见弱词。
- 口令只输一次，写完当场用同一口令把密文解一遍，解得开才落盘。
- 口令不落盘、不进文件、不进控制台；忘了这份文件就解不开。
- 输入用浏览器原生 `prompt`：没有 `input[type=password]`，密码管理器识别不到、也填不进来，只能手打或手动粘贴；框里是明文。

### 导入

贴 JSON，按 uid 合并：本地没有的新增，已有的只补空字段、标签取并集。

- 加密包自动识别（`format = bbm-blocklist-enc`），贴进来后单独问口令；口令错直接报错，一条都不改。
- 形状按白名单严格校验，多一个字段整份拒绝并点名字段——把口令顺手写进同一份 JSON 的人，导不进来。
- 没有旧格式兼容，本脚本从 1.0.0 起发布。

### 清空

先弹确认，并自动导出一份含标签的备份（`-with-tags-cleared.json`）；备份没发出去就取消清空，名单原样保留。

## 设计要点

- **属性标记而非 class**：`data-bbm`（翻转）/ `data-bbm-lock`（禁止点击）。写属性不会触发自己的观察者，避免“自己改→自己扫”的回环。
- **单一调度器**：全页只一个 `setTimeout`；`document.hidden` 时暂停，切回可见补跑一次；单任务抛错不影响其它任务。
- **两种节奏**：扫描兜底固定 3 秒，与名单大小无关；读名单按条数分档（≤1k 3 秒、≤5k 10 秒、≤20k 30 秒、更多 60 秒），因为解析成本随条数线性涨。只有真读到不同的 uid 集合才重扫并重画菜单。
- **变更过滤**：只有落在卡片级容器内的 `childList` 与 `class/href` 变化才重扫，140ms 合批。
- **整卡翻转**：推荐位取最外层卡片节点，封面与标题一起翻、一起禁点；只标记内部的 `<a>` 会导致标题不翻还点得动。
- **广告卡用上下翻转**：倒置破坏重力与光照线索，识别成本高于左右翻转。
- **零自绘 UI**：只有 GM 菜单与原生 `prompt` / `confirm`。代价是口令框只能明文、也无法做批量编辑面板。

## 已知限制

- 只在 Edge + Tampermonkey 上人工验证过菜单与下载；其余行为由 jsdom 断言覆盖。
- 首页改版会让选择器失效：三类卡片各有兜底路径（含上文形状兜底），连续三次扫描抛错会断开观察、摘掉全部标记，把页面还给 B 站。
- 形状兜底只保证「认出卡片、整卡处理」，认不出的一律不动；类名改版后菜单里会多出一行 `⚠️` 提示，正常页面没有这一行。带 `?bbm=debug` 时控制台打一行扫描诊断（只有计数，不打名单内容）。
- 加密包的强度取决于口令。12 位且符合规则的人造口令（“词+年+符号”这类结构）面对定向攻击仍可能被模式字典在数小时内试完；真随机的 12 位则是物理上做不完的量级。
- 文件大小与条目数量大致成正比，加密包不隐藏“名单有几条”。
- 名单条数影响的是存储读写与内存，不影响扫描频率；一万条量级仍属轻负载，十万条开始明显变重。

## 开发与校验

改脚本前先装依赖（ESLint 与 jsdom 都只在本地跑，不参与脚本运行）：

```sh
npm install
npm run lint            # 检查写法
npm run lint:fix        # 顺手修可自动修的
npm test                # jsdom 回归，当前 199 条断言
npm run bump -- minor "这次改了什么"   # 版本号一次写齐：脚本、兜底常量、package.json、lock、CHANGELOG
npm run version:check   # 只校验四处版本是否一致，不一致退出码非 0
```

规则只有几条硬约束：`@eslint/js` recommended 全套、`no-multi-spaces`（对齐的行尾注释只能有一个空格）、`no-empty` 放行空 `catch`、`no-var`、`no-unused-vars` 不追究未用参数。篡改猴注入的全局（`GM_getValue` 等）在 `eslint.config.mjs` 里按 `@grant` 列表声明，浏览器全局取 `globals.browser`。

`npm test` 跑的是 [`tools/block.test.cjs`](tools/block.test.cjs)：用 jsdom 把整份脚本装进一个假页面，喂假存储与假菜单，断言开关行为、三类卡片的标记、屏蔽匹配、双存储键与索引自愈、分档轮询、导出/导入/加密的字段校验，以及版本号是否齐平（脚本 `@version`、兜底常量、`package.json`、`package-lock.json`、CHANGELOG）。每条结果以 `PASS` / `FAIL` 开头，有失败时退出码非 0。它不覆盖真实浏览器里的渲染与篡改猴菜单外观——那部分仍要在 Edge 上手动看一眼。

版本号不要手改：跑 `npm run bump`，它会把五处一次写完并自检；`npm run version:check` 可单独校验。

改完至少跑 `node --check tampermonkey/bilibili-home-flip-block.user.js`、`npm run lint` 和 `npm test`；全干净再提交。

## 兼容性

| 管理器 | 状态 | 说明 |
|---|---|---|
| Tampermonkey（Edge / Chrome） | 已验证 | 目标环境 |
| Violentmonkey | 未适配 | `GM_unregisterMenuCommand` 收菜单文字，本脚本传 id，会导致菜单越点越多 |
| Greasemonkey 4 | 不支持 | 没有 `GM_registerMenuCommand` |

## 变更记录

见 [`tampermonkey/CHANGELOG.md`](tampermonkey/CHANGELOG.md)。当前版本 1.1.0。

## 许可

MIT，见 [`LICENSE`](LICENSE)。脚本头部也写了 `@license MIT`，篡改猴的脚本详情页会显示出来。

可以拿去改、拿去发，只需保留版权声明与许可原文。

---

# English

A Tampermonkey userscript that changes only how the Bilibili home feed *looks*: cards you do not want to click get flipped, and you get a local blocklist of UPs.

<!-- 可选：在这里放一张首页前后对比图 -->

## What it does

- Flips ad cards upside down (inverted gravity and lighting cues make them harder to recognise than a left-right flip).
- Mirrors recommendation and live cards horizontally.
- Mirrors any card posted by a UP on your local blocklist, with an optional click lock.
- Eight independent toggles, one menu row each. The leading icon is the state: `↕️` / `↔️` for an active flip, `✅` for an active click lock, `⬜` for off. Each row ends with the number of cards it acted on **on this page** (`(本页 2 张)`), so "on but nothing matched here" is distinguishable from "actually working" without guessing icons.
- Falls back to card shape when Bilibili renames its CSS classes (A/B cohorts): a card is the outermost ancestor of a video link that still has at most three video links, a cover image and under 200 characters of text. If nothing matches, nothing is touched.

## What it does not do

It does not download, intercept, or rewrite any request, and does not restructure Bilibili's DOM. It only adds a `data-bbm` attribute to a card and lets a small stylesheet transform it. Remove the script and reload: the page is back to normal.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Edge or Chrome.
2. Open the [install link](https://cdn.jsdelivr.net/gh/mrchenguozheng/bili-flip@main/tampermonkey/bilibili-home-flip-block.user.js); Tampermonkey will offer to install it.
3. Reload `https://www.bilibili.com/`.

GitHub's raw URL serves `text/plain` with `nosniff`, so Tampermonkey never intercepts it; jsDelivr serves `application/javascript`, which triggers the install page.

`@updateURL` and `@downloadURL` point at the same jsDelivr URL, so version bumps show up as normal Tampermonkey updates. jsDelivr caches branch refs such as `@main` (up to ~12 hours); use the [purge tool](https://www.jsdelivr.com/tools/purge) when a release must be reachable immediately.

A tag-pinned URL is available for reproducible installs: `https://cdn.jsdelivr.net/gh/mrchenguozheng/bili-flip@1.0.0/tampermonkey/bilibili-home-flip-block.user.js`. Tags are immutable and uncached, but do not use one in `@updateURL` — it would freeze updates.

Two things to check if nothing happens: the extension's site access must include `www.bilibili.com`, and the page must be the home feed (`/` or `/index.html`).

## Privacy

The blocklist, its tags, BV ids and video titles never leave your machine. Plain-text exports contain only `uid`, `name`, `at` (plus `tags` in the variant that includes them). BV ids and titles are written only by the password-encrypted export (AES-GCM-256, PBKDF2-SHA256 with 200000 iterations, 12+ character passphrase entered once and verified by decrypting in place).

## Compatibility

Verified on Edge + Tampermonkey. Not adapted for Violentmonkey or Greasemonkey 4.

## License

MIT, see [`LICENSE`](LICENSE).
