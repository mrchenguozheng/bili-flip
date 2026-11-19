# AGENTS.md

给接手这个仓库的维护者（AI 或人）看的操作说明。**先读 [README](README.md) 与 [CHANGELOG](tampermonkey/CHANGELOG.md) 了解“是什么”，再读这份了解“怎么改不算错”。**

改动前默认假设：这是一个已经定型的 1.0.0，用户对交互细节有过明确取舍（见第 2 节），随手“优化”很容易踩回去。

---

## 1. 仓库速览

```
README.md                            面向用户的说明书（中文 + English）
AGENTS.md                            本文件，维护约束
LICENSE                              MIT
eslint.config.mjs                    只作用于 tampermonkey/*.user.js
package.json / package-lock.json     只有 devDependencies（eslint、globals、jsdom）
tools/block.test.cjs                 jsdom 回归，npm test
tampermonkey/
  bilibili-home-flip-block.user.js   唯一运行时产物，全部逻辑都在这一个文件里
  CHANGELOG.md                       版本记录（js 里不写历史）
```

### 分支规则

| 分支 | 用途 | 规矩 |
|---|---|---|
| `main` | 只放**已发布版本** | 不直接往上提交实验；正式发版时才把 `dev` 快进合并过来并打 tag，其余时间保持不动 |
| `dev` | 日常开发与实验 | 一切改动先来这里；每次改动顺手递增版本号，验收、跑测试都在这里完成 |

`@updateURL` 指向 jsDelivr 的 `@main`，所以“main 稳定”等于“用户只在发版时拿到更新”。实验改动必须走 `dev`，否则用户会提前拿到未经验证的版本。

- 单文件、IIFE、`document-start`、无构建步骤；没有 `src/`，也不要引入打包器。
- 依赖只有篡改猴的 `GM_*` 与浏览器原生 API（`crypto.subtle`、`MutationObserver`、`prompt`）。
- 用户安装走 jsDelivr（`@main` 自动更新、`@<tag>` 锁版本）；GitHub raw 是 `text/plain`，**不能**当安装地址。

## 2. 不许改的红线

这些是用户逐条确认过的取舍，不是“暂时没做”：

1. **隐私**：明文导出永远不含 `bvid` / `title`。它们是“你看过什么”，不是“你屏蔽了谁”。带 BV 与标题的出口只有加密包一个。
2. **加密参数不许调低**：AES-GCM-256、PBKDF2-SHA256 **200000** 轮、salt 16 字节 / iv 12 字节每次随机；口令 **≥12 位**且同时含大写、小写、数字、符号，不同字符 ≥10 种，不含弱词。口令**只输一次**，写完当场用同一口令解一遍，解得开才落盘。
3. **不打印用户可见信息**：`console` 只允许内部异常（周期任务抛错、扫描失败第 N 次、连续失败停机）与带 `?bbm=debug` 时的扫描诊断（只有计数，不含 uid / 标题 / 名单）。名单不往控制台打印。
4. **零自绘 UI**：只有 `GM_registerMenuCommand` 与原生 `prompt` / `confirm`。不要加设置面板、悬浮球、气泡。
5. **不兼容旧格式**：没有旧键迁移、没有旧导出格式兜底、没有“兼容上个版本”的分支。改格式就同步改校验白名单并升版本号。
6. **只改显示**：给卡片加 `data-bbm` / `data-bbm-lock` 属性 + 一段 CSS。不下载、不拦截、不改写请求、不重构 B 站 DOM。
7. **只面向 Tampermonkey**（Edge / Chrome 已验证）。Violentmonkey、Greasemonkey 4 的适配要用户明确要求才做，且不许把实现分叉成两套。
8. **`?bbm=off` 必须保持“本页什么都不做、不碰存储”**。

菜单文案同样是约定，改之前先问：

- 八档开关一行一条，行首图标即状态：翻转生效 `↕️`（广告位）/ `↔️`（推荐位、直播位、屏蔽 UP）；禁止点击生效 `✅`；关掉一律 `⬜`（全角，不要换成 `[ ]` / `_` 之类）。
- 每行行尾固定 `（本页 N 张）`：N 是这一档**此刻实际作用在几张卡上**，数属性（`data-bbm` / `data-bbm-lock`）而不是数集合，所以开关一关数字必然归零。开着而 N=0 表示“本页没有这类卡”，不是出错。别把这个后缀去掉，也别改成百分比或“已生效”这种模糊说法。
- UP 行是**纯展示**，点了不该有反应；未屏蔽写「UP：张三；要屏蔽就点下面的理由」，已屏蔽写「⛔ 已屏蔽该UP：张三（第一条理由）」，只说第一条。
- 九项标签固定，菜单里没有新增 / 删除入口；存储与导出用短名，菜单显示 `TAG_SHOW` 的展开写法。
- 名单维护四项常驻（导出三条 + 导入 + 清空），空名单也保留，点下去才说“没有可导出的内容”。

## 3. 架构地图（按文件内区段）

| 区段 | 干什么 | 改它时注意 |
|---|---|---|
| 头部元数据 | `@name` / `@namespace` / `@version` / `@updateURL` / `@downloadURL` / `@icon` | `@updateURL` 固定用 jsDelivr `@main`；写成 `@<tag>` 等于关掉自动更新 |
| 设置层 | `DEFAULTS`、`LABELS`、`load` / `save`、`KEY='bbm:settings'` | 新增开关要同时补 `DEFAULTS` 与 `LABELS`（`name`/`effect`/`off`，翻转类加 `icon`） |
| 标记与选择器 | `MARK='data-bbm'`、`LOCK='data-bbm-lock'`、`CARD`、`CARD_WRAP`、`LIVE_CARD`、`FLOOR_TITLE` | 选择器随 B 站改版失效；三类卡片各留兜底路径 |
| 形状兜底 | `VIDEO_LINK`、`LIVE_LINK`、`SHAPE_DEPTH`、`SHAPE_MAX_LINKS`、`SHAPE_MAX_ANCHORS`、`SHAPE_MAX_IMAGES`、`SHAPE_MAX_TEXT`、`isChrome()`、`shapeCardFrom(seed, linkSel)`、`shapeAdCardFrom()`、`cardClassMissing()` | 只在首页且「有视频链接但零 `CARD`」时启用；判定是“同类链接 ≤3、整层链接 ≤5、图片 ≤3、有 img、文字 ≤200”，顶栏/页头/导航直接排除。任一条放宽都会出现整排甚至整页被翻 |
| 调度器 | `tasks` / `every()` / `arm()` / `fire()` / `bind()` | 全页只有一个 `setTimeout`；`document.hidden` 暂停、切回补跑；任务抛错不影响其它任务 |
| 扫描 | `paint()`、`collectAdCards()`、`collectFlipCards()`、`collectBlockCards()`、`scanGuarded()`、`shutDown()`、`diagState()`、`countOf()`、`statKeyNow()` | 用 Set 差集做增量；连续三次抛错会摘掉全部标记把页面还给 B 站；`shapeHits` 每轮重置，`diagKey` 只分四档；每个扫描轮次结束前把八档计数拼成 `statKey`，变了才置 `menuDirty` |
| 观察者 | `observer` + `relevant()` + `schedule()` | 只认 `CARD` / `CARD_WRAP` 子树内的 `childList` 与 `class` / `href` 变化，140ms 合批 |
| 名单存储 | `BLOCK_KEY='bbm:blocked'`、`UIDS_KEY='bbm:blocked:uids'`、`storeGet/storeSet`、`refreshBlock()`、`readUids()`、`saveBlock()` | 索引是缓存：写整份后必须回写索引；索引缺失/损坏退回读整份 |
| 分档轮询 | `blockPollMs()`、`blockPoll()` | ≤1k 3s、≤5k 10s、≤20k 30s、其余 60s；只读索引，集合真变了才重扫并重画菜单 |
| UP 识别 | `bvidFromUrl()`、`stateVideo()`、`domVideo()`、`apiVideo()`、`resolveVideo()` | 三层：地址栏 BV → `unsafeWindow.__INITIAL_STATE__` → 接口；接口失败 30s 内不重试同一条 |
| 标签 | `DEFAULT_TAGS`、`TAG_SHOW`、`normTags()`、`mapTags()`、`buildTagSchema()` | 表外标签一律折叠成 `其他`；改标签含义才动 `TAG_SCHEMA_V` |
| 导出/导入 | `exportBlock()`、`exportEncrypted()`、`importBlock()`、`applyImport()`、`shapeError()` | 白名单 `PAYLOAD_KEYS` / `ENC_KEYS` / `KDF_KEYS` / `ENTRY_KEYS` 与写入端必须同步 |
| 菜单 | `buildMenu(light)`、`switchLabel()`、`toggle()`、`toggleTagOnCurrent()`、`MENU_IDS` | 每次重建先按 id 注销旧项；`GM_unregisterMenuCommand` 收 id，不收文字；E 段诊断行只在 `shapeEver` 或“零卡片但有链接”时出现；`light=true` 只重画计数、不读整份名单；`toggle()` 必须**先扫后画**，否则会画出「已关闭（本页 3 张）」 |
| 启动 | `start()`、`waitRoot()` | 样式挂在 `document.head || document.documentElement`，`document-start` 时 head 可能还不存在 |

## 4. 常见坑

- **自改自扫回环**：标记必须写 `data-bbm` 属性，不要写 `class`。写属性不会触发自己的 `class` 过滤器，这是回环被掐断的唯一原因。
- **别加第二个定时器**：需要周期任务就 `every(msOrFn, fn)` 注册进统一调度器，间隔可以传函数（分档轮询就是这么做的）。`setInterval` 会让隐藏页继续跑。
- **整卡翻转**：推荐位/列表位要取最外层卡片节点（`outerFloorCard`），只标记内部 `<a>` 会出现“标题不翻但还能点”。
- **索引与整份的先后**：`saveBlock()` 先写整份再写索引；只改一处会让下一次轮询误判或重建菜单。
- **菜单重建的时机**：`buildMenu()` 开头会 `refreshBlock()`，所以手动改 `bbm:blocked` 时，打开一次菜单即对齐——但轮询不会替你发现整份变了。
- **别在 `scan()` 里直接重画菜单**：`buildMenu()` 会读整份名单，直接调用会让“轮询阶段整份零读”这条契约失效。扫描只置 `menuDirty`，由 `heartbeat()` 消费，且消费时传 `buildMenu(true)`（只画计数、跳过 `refreshBlock()`）；`diagKey` / `statKey` 开机前先记基线，避免为“状态没变”白读一次。
- **计数只数属性**：`countOf()` 读的是 `data-bbm` / `data-bbm-lock` 当前值，不是 `hitsAd` / `hitsBlock` 的 size——集合里放的是“识别到的卡”，关掉开关后卡还认得出来但效果已经摘掉，按集合数会显示成「已关闭（本页 3 张）」。`toggle()` 也必须先 `applyNow()` 再 `buildMenu()`，同一个道理。
- **形状兜底别外扩**：`SHAPE_MAX_LINKS` / `SHAPE_MAX_ANCHORS` / `SHAPE_MAX_IMAGES` / `SHAPE_MAX_TEXT` 是防止把整块容器甚至整页当成一张卡的闸门。历史上只按“同类链接数”判过一次，结果播放页顶栏里那个「直播」入口让整页被翻——同类链接数挡不住只有一条链接的页面级容器。
- **兜底只能在首页跑**：`collectFlipCards` / `collectAdCards` / `collectBlockCards` 里的形状路径都要先过 `isHomeFeed()`；播放页有推荐列，类名一失效就会误伤。
- **口令框是明文 `prompt`**：密码管理器认不到、也填不进来，这是已知代价（用户明确接受）。不要偷偷换成页面内 `input[type=password]`——那等于自绘 UI。
- **导入严格校验**：多一个字段整份拒绝并点名字段。这条是为了挡住“有人把密码顺手写进同一份 JSON”。放宽它等于拆掉这个防护。
- **改导出结构**：`exportBlock()` 里有 `v: 3` 与 `tags` 数组；改字段名要同时改 `shapeError` 的白名单、README 的导出表和 CHANGELOG。
- **`@version` 与 tag 要一起动**：`SCRIPT_VERSION` 从 `GM_info` 读，兜底常量写死在脚本里；发版漏改兜底值，加密包里写的版本号就会撒谎。用 `npm run bump` 就不会漏——手改是唯一会漏的路径。
- **Windows 上编辑**：文件是 UTF-8 无 BOM、LF。用能保留行尾的工具写，别让 CRLF 混进 `.user.js`。

## 5. 改完必须跑

```sh
node --check tampermonkey/bilibili-home-flip-block.user.js
npm install     # 首次
npm run lint
npm test
```

- 基线：`node --check` 通过、`npm run lint` **0 问题**、`npm test` **199 PASS / 0 FAIL**。
- 回归就是仓库里的 `tools/block.test.cjs`：jsdom 把整份脚本跑起来，喂假存储 / 假菜单 / 假 prompt，覆盖开关、翻转换算、屏蔽匹配、双存储键与索引自愈、分档轮询、导出/导入/加密、A/B 双形态（老类名 DOM 与“类名全换只剩形状”的 DOM）、`?bbm=debug` 静默性、菜单「本页 N 张」计数。断言以 `PASS` / `FAIL` 开头，失败时退出码非 0。
- 加断言就照现有风格在后面续一组：`log(条件, '断言名', '补充值')`，别改已有断言名，方便对比历史基线。
- ESLint 只约束 `tampermonkey/*.user.js`；`tools/` 是 Node 脚本，不在 lint 范围，写它时按 Node 习惯来（`require`、`fs`、`__dirname`）。
- 改逻辑必须让 `npm test` 仍是 199 PASS（新增断言则同步更新本文件与 README 里的数字）；只改注释或文档时跑前两条即可。
- 验证“装了却不生效”的经典三连：篡改猴「允许的站点」是否含 `www.bilibili.com`；地址是否是首页 `/` 或 `/index.html`；文件是不是从 jsDelivr 装的（raw 是 `text/plain`，不会触发安装）。

## 6. 发布流程

**版本号只升不降，每次改动都要递增。** 新功能或行为变化记 minor（`1.1.0`），修 bug 记 patch（`1.1.1`），破坏性重写才动 major。一次改动没升版本号，就不算完成。

**不要手改版本号。** 版本号散在四处（`@version`、`SCRIPT_VERSION` 兜底常量、`package.json`、`package-lock.json` 根版本）加 `CHANGELOG.md` 顶部条目，漏一处就等于发了个“版本号撒谎”的包。统一走：

```sh
npm run bump -- patch "一句话说清改了什么"   # 1.1.0 → 1.1.1
npm run bump -- minor "新增X"                # 1.1.0 → 1.2.0
npm run bump -- 1.2.3 "说明"                 # 指定版本
npm run version:check                        # 只校验，不一致退出码非 0
```

`tools/bump-version.cjs` 一次写全五处并自检，`npm test` 里也调它的 `checkConsistency()`，漏改直接 FAIL。

注意两点：同一个**尚未打 tag** 的版本可以继续追加 CHANGELOG 条目（还在组装阶段）；一旦该版本已经 tag 过，任何新改动都必须先 bump 出新版本号。

1. `npm run bump -- <类型> "说明"`（自动改齐五处并插入 CHANGELOG 条目）。
2. 把 CHANGELOG 那条写实、写全；README 里若涉及行为变化同步改。
3. `node --check` + `npm run lint` + 回归全过（在 `dev` 上）。
4. `git push origin dev`，确认远端 `dev` 就是待发布内容。
5. 发布只做一次快进，不要在 `main` 上叠提交：
   `git checkout main && git merge --ff-only dev && git push origin main`
   然后 `git tag <版本号>` → `git push origin refs/tags/<版本号>`；`git checkout dev` 回去继续干活。
6. 想让人立刻装到新版，purge 一下分支缓存：
   `https://purge.jsdelivr.net/gh/mrchenguozheng/bili-flip@main/tampermonkey/bilibili-home-flip-block.user.js`

仓库的 git remote 用 SSH；本机若 `git ls-remote` 报 `Permission denied (publickey)`，是 Git 自带 ssh 读不到 Windows OpenSSH agent，设仓库级 `core.sshCommand = C:/Windows/System32/OpenSSH/ssh.exe` 即可。

## 7. 明确不要做

- 不要把 `bvid` / `title` 放进明文导出，也不要为“方便”加个总开关绕过加密。
- 不要在菜单里加二级菜单、子项、“查看名单”弹窗，或用 `alert` 展示名单。
- 不要扩大 `@match` 范围（现在是 `*://*.bilibili.com/*`，实际只在首页生效），也不要加统计、上报、外部请求。
- 不要引入运行时依赖、打包器、TypeScript 构建步骤；这个脚本的价值之一就是“单文件可直接读”。
- 不要改 `LICENSE` 的署名与许可类型。
- 不要为兼容旧版写迁移代码，也不要为“以后可能”预留空壳开关。

## 8. 协作约定

- 文档、注释、提交信息一律中文；README 后半保持 English 段落与中文段对应。
- 提交信息用一句话说清“改了什么、为什么”，前缀沿用 `chore:` / `docs:` / `feat:` / `fix:`，一次提交只做一件事。
- 拿不准菜单文案、图标、口令规则这类“用户看得见”的细节时，先问再改；拿不准 B 站选择器时，宁可加兜底路径也不要只留一条。
