// ==UserScript==
// @name         B站首页卡片翻转与UP屏蔽
// @namespace    https://github.com/mrchenguozheng/Bilibili-Home-Flip-Block
// @version      1.1.0
// @license      MIT
// @homepageURL  https://github.com/mrchenguozheng/Bilibili-Home-Flip-Block
// @supportURL   https://github.com/mrchenguozheng/Bilibili-Home-Flip-Block/issues
// @updateURL    https://cdn.jsdelivr.net/gh/mrchenguozheng/Bilibili-Home-Flip-Block@main/tampermonkey/bilibili-home-flip-block.user.js
// @downloadURL  https://cdn.jsdelivr.net/gh/mrchenguozheng/Bilibili-Home-Flip-Block@main/tampermonkey/bilibili-home-flip-block.user.js
// @description  首页三类卡片各带两个独立开关（首页广告位上下翻转、首页推荐位与首页直播位左右翻转，每类都能单独关掉翻转、单独关掉禁止点击），外加一份本地 UP 屏蔽名单：名单内的 UP 出现在首页时其卡片翻转、可禁止点击。屏蔽入口在视频播放页菜单，点中任一屏蔽理由即入名单；名单只在本地，导出分明文两档（只含 uid / 名字 / 时间）与口令加密一档（唯一能带出 BV 与标题的方式）。没有自绘面板，只有菜单项与原生 prompt/confirm；URL 带 ?bbm=off 本页全关。
// @match        *://*.bilibili.com/*
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCI+PHJlY3QgeD0iOCIgeT0iMTAiIHdpZHRoPSIzMiIgaGVpZ2h0PSIyNCIgcng9IjYiIGZpbGw9IiNmYjcyOTkiLz48cGF0aCBkPSJNMTQgMzRsLTQgN00zNCAzNGw0IDciIHN0cm9rZT0iI2ZiNzI5OSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48ZWxsaXBzZSBjeD0iMTkiIGN5PSIyNS42IiByeD0iMi40IiByeT0iMy42IiBmaWxsPSIjZmZmIi8+PGVsbGlwc2UgY3g9IjI5IiBjeT0iMjUuNiIgcng9IjIuNCIgcnk9IjMuNiIgZmlsbD0iI2ZmZiIvPjxwYXRoIGQ9Ik0yMS41IDEwaDVMMjQgMTMuNXoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        unsafeWindow
// @noframes
// ==/UserScript==
// 目标管理器：Tampermonkey（Edge / Chrome）。只用 GM_* 老接口 + 原生菜单，
// 未适配 Violentmonkey（它的 GM_unregisterMenuCommand 收菜单文字、本脚本传 id），
// 也未适配 Greasemonkey 4（无 GM_registerMenuCommand）。


/* ============================================================
 * 首页卡片处理：三类卡片各自「翻转 / 禁止点击」两档，外加一份本地 UP 屏蔽名单。
 * 只改 transform 与指针事件，不动布局、不改尺寸；范围仅 *.bilibili.com。
 *
 * 三类目标
 *   广告卡   卡内文本节点整串等于「广告」→ 整卡上下翻转（scaleY(-1)）
 *   推荐位   番剧/国创/综艺/课堂/电影/电视剧/纪录片/漫画/直播 → 左右翻转（scaleX(-1)）
 *   直播卡   .bili-live-card，或卡内指向 live.bilibili.com 的链接 → 左右翻转
 *   屏蔽UP   名单内 uid 的首页卡 → 左右翻转；只在首页信息流生效，
 *            搜索页 / 播放页推荐栏 / 分区页一律不动
 *
 * 上下翻转用在广告位：倒置会破坏重力与光照线索，识别成本明显更高。
 * 推荐位与直播位用左右翻转，理由同上但更轻。
 *
 * 开关与标记
 *   data-bbm（翻转）与 data-bbm-lock（禁止点击）两套属性互不依赖，
 *   八档：ad / adLock / floor / floorLock / live / liveLock / block / blockLock。
 *   用属性而非 class，自己的写入不会触发自己的观察者；URL 带 ?bbm=off 本页全关。
 *
 * 菜单
 *   TM 菜单扁平、无子菜单也无分隔符，所以只分行不分组。
 *   每行只写当前生效的那种效果，行首 ✅ / ⬜ 表示开 / 关；
 *   两个框都是全角 emoji，左边缘对齐，别换成 ASCII 的 _ 或空格。
 *
 * 屏蔽名单
 *   判定只看 uid；name / bvid / title / tags 是"回头查为什么屏蔽"的线索。
 *   bvid 只存纯号，URL 上的 ?spm_id_from= / vd_source= 等追踪参数一格不进本地。
 *   标签表写死九项，勾中任一理由即入名单，取消最后一项即移出；
 *   表外标签（存档里的、导入文件里的）一律折叠成「其他」。
 *   清空会先自动备份一份含标签的名单，备份没发出去就取消清空。
 *
 * 导出
 *   明文两档只写 uid / name / at（含标签那份加 tags），BV 与标题永不进明文。
 *   加密一档是唯一能带出 BV / 标题的路径：AES-GCM-256，
 *   口令经 PBKDF2-SHA256 200000 轮派生，salt / iv 每次随机；
 *   口令 ≥12 位且大写、小写、数字、符号齐全，只输一次，
 *   写完当场用同一口令自解一遍，解得开才落盘。口令不落盘、不进文件。
 *   输入走浏览器原生 prompt：无 DOM、无 input[type=password]，
 *   密码管理器识别不到也填不进来，只能手打或手动粘贴；回显是明文。
 *   导入按白名单校验形状，多一个字段整份拒绝；没有旧格式兼容。
 *
 * 存储与调度
 *   设置单键 bbm:settings（八档布尔，merge 收敛脏值），名单键 bbm:blocked。
 *   全页只保留一个 setTimeout；document.hidden 时任务暂停，切回可见补跑一次；
 *   变更只在卡片相关容器内才排扫描，单个任务抛错不影响其它任务。
 * ============================================================ */

(() => {
  'use strict';

  // 只在 B 站生效（@match 已限定，这里再兜一层，防止被其他页面手动注入）
  if (!/(^|\.)bilibili\.com$/i.test(location.hostname)) return;

  /** 标记属性：值为 'ad'（上下翻）或 'flip' / 'block'（左右翻）。CSS 全靠它匹配 */
  const MARK = 'data-bbm';
  /** 禁止点击是独立的一档：单独一个属性，翻转开关关了也能继续禁点 */
  const LOCK = 'data-bbm-lock';
  const CARD = '.bili-video-card';

  /* ---------------------------------------------------------
   * 开关：DEFAULTS + 单键对象 + merge 类型收敛
   * 没在篡改猴里跑时（比如手动贴到控制台），GM API 不存在，
   * 直接退回 DEFAULTS，脚本仍可用
   * ------------------------------------------------------- */
  /** 每一类的「翻转」与「禁止点击」都是独立一档：八档全部分开 */
  const DEFAULTS = {
    ad: true, adLock: true,
    floor: true, floorLock: true,
    live: true, liveLock: true,
    block: true, blockLock: true,
  };
  /** 菜单一行 = 「<图标> 类别：当前效果」；关掉就写回正常状态（正常显示 / 可以点击）。
      翻转类生效时行首是方向图标（↕️ 上下 / ↔️ 左右），其余仍用 ✅ / ⬜ */
  const LABELS = {
    ad: { name: '首页广告位', effect: '上下翻转', off: '正常显示', icon: '↕️' },
    adLock: { name: '首页广告位', effect: '禁止点击', off: '可以点击' },
    floor: { name: '首页推荐位', effect: '左右翻转', off: '正常显示', icon: '↔️' },
    floorLock: { name: '首页推荐位', effect: '禁止点击', off: '可以点击' },
    live: { name: '首页直播位', effect: '左右翻转', off: '正常显示', icon: '↔️' },
    liveLock: { name: '首页直播位', effect: '禁止点击', off: '可以点击' },
    block: { name: '首页屏蔽UP主', effect: '左右翻转', off: '正常显示', icon: '↔️' },
    blockLock: { name: '首页屏蔽UP主', effect: '禁止点击', off: '可以点击' },
  };
  const KEY = 'bbm:settings';
  const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

  /** 存档里可能是 布尔 / "true" / "false" / 1 / 0，一律收成布尔，认不出就用默认值 */
  function asBool(v, dflt) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (['true', '1', 'on', 'yes', '开'].indexOf(s) !== -1) return true;
      if (['false', '0', 'off', 'no', '关'].indexOf(s) !== -1) return false;
    }
    return dflt;
  }

  /** 逐字段收敛：不认识、类型不对的字段一律回落 DEFAULTS */
  function merge(raw) {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      ad: asBool(r.ad, DEFAULTS.ad),
      adLock: asBool(r.adLock, DEFAULTS.adLock),
      floor: asBool(r.floor, DEFAULTS.floor),
      floorLock: asBool(r.floorLock, DEFAULTS.floorLock),
      live: asBool(r.live, DEFAULTS.live),
      liveLock: asBool(r.liveLock, DEFAULTS.liveLock),
      block: asBool(r.block, DEFAULTS.block),
      blockLock: asBool(r.blockLock, DEFAULTS.blockLock),
    };
  }

  function load() {
    if (!hasGM) return merge(null);
    return merge(GM_getValue(KEY, null));
  }

  function save() {
    if (!hasGM) return;
    try { GM_setValue(KEY, merge(ENABLE)); } catch (e) { /* 配额/隐私模式：本次仍生效，只是不持久 */ }
  }

  /* ?bbm=off：本页临时全部关闭（不改存储，刷新回来就恢复） */
  const OFF = /(?:^|[?&#])bbm=off(?:[&#]|$)/.test(location.search + location.hash);
  /* ?bbm=debug：只在带参数时往控制台打扫描诊断（不打名单内容），排查改版用 */
  const DEBUG = /(?:^|[?&#])bbm=debug(?:[&#]|$)/.test(location.search + location.hash);
  const allOff = () => {
    const o = {};
    Object.keys(DEFAULTS).forEach((k) => { o[k] = false; });
    return o;
  };
  const ENABLE = OFF ? allOff() : load();

  /* ---------------------------------------------------------
   * A-① 广告卡片要上下镜像的元素
   * 注意：这里只列「叶子级」的文字容器，不要同时列父子节点
   * （父子都翻 = 翻两次 = 又正过来了）。
   * 封面 img 那条同时命中 __image img 和 __cover img 也没关系，
   * 它们在同一条规则里，只应用一次。
   * ------------------------------------------------------- */
  const FLIP = [
    '.bili-video-card__image img',
    '.bili-video-card__cover img',
    '.bili-video-card__stats',
    '.bili-video-card__info--tit',
    '.bili-video-card__info--owner',
  ];

  /* ---------------------------------------------------------
   * A-② 识别「广告」卡片
   * 整串匹配，避免命中标题里带“广告”的普通视频
   * ------------------------------------------------------- */
  function hasAdWord(card) {
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue.trim() !== '广告') continue;
      const p = node.parentElement;
      if (!p) continue;
      if ((p.textContent || '').trim() !== '广告') continue;
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------
   * B / C. 识别「推荐位卡片」与「直播卡片」—— 都做 左右翻转 + 禁点
   *
   * 推荐位卡片是混在信息流里的分区推荐位，真实 DOM：
   *   <div class="floor-single-card" data-mod="partition_recommend.content">
   *     <div class="floor-card single-card">
   *       <div class="badge"><svg/><span class="floor-title">番剧</span></div>
   *
   * 用「标签文字」判定而不是类名：.floor-title 里的整串文字
   * 精确命中白名单才算，标题里出现“综艺”二字的普通视频不会误伤。
   * 容器用 closest 向上找，改名了也还有兜底选择器。
   *
   * 直播卡片：
   *   1) 稳定类名 .bili-live-card
   *   2) 兜底：卡片容器内含指向 live.bilibili.com 的链接
   *      （只认"卡片级"容器，导航栏里的直播入口不在这些容器内，不会误伤）
   * ------------------------------------------------------- */
  const LIVE_CARD = '.bili-live-card';
  const CARD_WRAP =
    '.bili-live-card, .bili-video-card, .feed-card, .bili-feed-card, .floor-single-card';

  const FLOOR_TITLE = '.floor-title';
  const FLOOR_LABELS = [
    '直播',
    '番剧',
    '国创',
    '综艺',
    '课堂',
    '电影',
    '电视剧',
    '纪录片',
    '漫画',
  ];
  /* 找「整张推荐位卡」这一层 —— 必须显式由外到内逐个找，不能用
     closest('.floor-single-card, [data-mod="partition_recommend.content"]')：
     data-mod 就挂在卡片内部的 <a> 上，把它和卡片写在同一个 closest 里，
     closest 会就近返回那个 <a>。标记加到 <a> 上以后，
     卡片标题（在 <a> 之外、.info-container 里）既不会翻转、也还能点击。
     （note：这条只列叶子级容器，父子同时翻会翻回正面） */
  function outerFloorCard(el) {
    return (
      el.closest('.floor-single-card') ||
      el.closest('[data-mod="partition_recommend.content"]') ||
      el.closest('.floor-card') ||
      el.closest('.feed-card, .bili-feed-card')
    );
  }

  /* ---------------------------------------------------------
   * 形状兜底（A/B 灰度：类名可能整批换掉）
   *
   * 只在「页面上明显有视频链接、但一个 .bili-video-card 都没有」时启用，
   * 平时一次都不跑，不给每 3 秒的扫描加成本。
   * 卡片判定只认形态：沿链接向上爬，取还能算「单张卡」的最外层——
   *   视频链接 ≤ 3 个（封面 + 标题 + 播放按钮这种）、有封面 img、
   *   可见文字不超过 SHAPE_MAX_TEXT（再往上就是信息流容器，文字会爆长）。
   * 认不出就返回空：宁可不动，也不猜着翻别人一整排。
   * ------------------------------------------------------- */
  const VIDEO_LINK = 'a[href*="/video/"]';
  const LIVE_LINK = 'a[href*="live.bilibili.com"]';
  const SHAPE_DEPTH = 6; // 从链接向上最多爬几层
  const SHAPE_MAX_LINKS = 3; // 一层里同类链接不超过这个数，才算单张卡
  const SHAPE_MAX_ANCHORS = 5; // 整层链接总数上限：顶栏、页头、信息流都会超
  const SHAPE_MAX_IMAGES = 3; // 整层图片上限：整块容器图片更多
  const SHAPE_MAX_TEXT = 200; // 单张卡可见文字长度上限，挡住整块信息流

  /** 顶栏、页头、导航不是卡片；B 站播放页顶部那排图标就栽在这里过 */
  function isChrome(el) {
    return !!(el.closest && el.closest('header, nav, .bili-header, .international-header, .mini-header'));
  }

  /** linkSel 决定“同类链接”是哪一种：视频卡数 /video/，直播卡数 live.bilibili.com */
  function shapeCardFrom(seed, linkSel) {
    const sel = linkSel || VIDEO_LINK;
    let el = seed;
    let best = null;
    for (let i = 0; i < SHAPE_DEPTH; i++) {
      el = el && el.parentElement;
      if (!el) break;
      if (isChrome(el)) break;
      const links = el.querySelectorAll(sel).length;
      if (!links) continue; // 这一层根本不含同类链接，继续往上找
      if (links > SHAPE_MAX_LINKS) break; // 再往上就是整排信息流
      // 链接、图片总数同时设上限：页面里只剩一个直播链接时，
      // 光靠“同类链接数”挡不住 body / 顶栏，它们会被一路认成“一张卡”
      if (el.querySelectorAll('a').length > SHAPE_MAX_ANCHORS) break;
      if (el.querySelectorAll('img').length > SHAPE_MAX_IMAGES) break;
      if (!el.querySelector('img')) continue;
      if ((el.textContent || '').trim().length > SHAPE_MAX_TEXT) break;
      best = el;
    }
    return best;
  }

  /** 广告卡没有时长条、链接也可能指向站外：只要求有封面图、有链接、文字短 */
  function shapeAdCardFrom(node) {
    let el = node && node.parentElement;
    for (let i = 0; i < SHAPE_DEPTH && el; i++) {
      if (isChrome(el)) break;
      if (
        el.querySelector('img') &&
        el.querySelector('a') &&
        (el.textContent || '').trim().length <= SHAPE_MAX_TEXT
      ) return el;
      el = el.parentElement;
    }
    return null;
  }

  /** 类名路径整体失效：有卡片形状，但没有一张带老类名 */
  function cardClassMissing() {
    return !document.querySelector(CARD) && document.querySelectorAll(VIDEO_LINK).length >= 3;
  }

  /* ---------------------------------------------------------
   * 调度器
   * 全页只一个 setTimeout；隐藏时暂停；切回可见只补一次；
   * 任务抛错只影响它自己。
   * ------------------------------------------------------- */
  const tasks = new Set();
  let timer = 0;
  let at = Infinity;
  let bound = false;

  const runnable = (t) => !t.dead && (t.hidden || !document.hidden);

  function arm() {
    let next = Infinity;
    for (const t of tasks) if (runnable(t) && t.due < next) next = t.due;
    if (next === at && timer) return;
    clearTimeout(timer);
    timer = 0;
    at = next;
    if (next === Infinity) return;
    timer = window.setTimeout(fire, Math.max(0, next - performance.now()));
  }

  function fire() {
    timer = 0;
    at = Infinity;
    const now = performance.now();
    for (const t of [...tasks]) {
      if (!runnable(t)) continue;
      // 到期时间相近（不到周期的 1/10 或 60ms）的任务合并到这一次唤醒
      const slack = Math.max(60, t.ms / 10);
      if (t.due - now > slack) continue;
      t.due = now + t.ms;
      try { t.fn(); } catch (e) { console.error('[bbm] 周期任务异常', e); }
      // 自适应任务：本轮跑完再决定下一轮隔多久（名单变大了就放宽）
      if (t.msFn) { t.ms = t.msFn(); t.due = now + t.ms; }
    }
    arm();
  }

  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        // 切回可见：过期的任务马上补一次，而不是把错过的几次连发
        const now = performance.now();
        for (const t of tasks) if (t.due < now) t.due = now;
      }
      arm();
    });
  }

  /** 注册周期任务。ms 可以是数字，也可以是「返回本轮之后间隔」的函数：
      每跑完一轮重算一次，用来按名单规模放宽轮询 */
  function every(ms, fn) {
    bind();
    const first = typeof ms === 'function' ? ms() : ms;
    const t = {
      ms: first, msFn: typeof ms === 'function' ? ms : null,
      fn, due: performance.now() + first, hidden: false, dead: false,
    };
    tasks.add(t);
    arm();
    return () => { t.dead = true; tasks.delete(t); arm(); };
  }

  /* ---------------------------------------------------------
   * 标记 / 还原
   * 用 data-bbm 承载状态，CSS 按属性匹配：
   *   - 写入属性不在 MutationObserver 的 attributeFilter 里，不会形成回环
   *   - 关掉某类时只摘自己那一档，不影响另一档
   * ------------------------------------------------------- */
  let hitsAd = new Set();
  let hitsFlip = new Set();
  let hitsBlock = new Set();

  /* ---- 诊断（只给维护者看：菜单里一行状态，控制台只认调试参数） ---- */
  let shapeHits = 0; // 本轮靠形状兜底认出的卡片数
  let shapeEver = false; // 曾经启用过兜底，菜单里的提示行据此出现
  let diagKey = ''; // 上一轮诊断结论，变了才重画菜单
  let menuDirty = false; // 诊断结论变了，等下一次心跳重画菜单

  /** opts.flip(el) / opts.lock(el)：逐张卡决定这一轮要翻、要锁，
      不传就按"这一类两项都开"处理（兼容旧调用） */
  function paint(next, kind, opts) {
    const prev = kind === 'ad' ? hitsAd : kind === 'flip' ? hitsFlip : hitsBlock;
    const o = opts || {};
    prev.forEach((el) => {
      // 卡片被复用/移除，或这一类整个关掉 → 恢复原样
      if (next.has(el)) return;
      if (el.getAttribute(MARK) === kind) el.removeAttribute(MARK);
      // 只在它已经不属于任何一类时才摘锁，免得把另一类的锁顺手剥掉
      if (!el.getAttribute(MARK)) el.removeAttribute(LOCK);
    });
    next.forEach((el) => {
      const flip = o.flip ? o.flip(el) : true;
      const lock = o.lock ? o.lock(el) : true;
      if (flip) { if (el.getAttribute(MARK) !== kind) el.setAttribute(MARK, kind); }
      else if (el.getAttribute(MARK) === kind) el.removeAttribute(MARK);
      if (lock) el.setAttribute(LOCK, '1');
      else el.removeAttribute(LOCK);
    });
    if (kind === 'ad') hitsAd = next;
    else if (kind === 'flip') hitsFlip = next;
    else hitsBlock = next;
    return next;
  }

  function clearAll() {
    document.querySelectorAll('[' + MARK + '],[' + LOCK + ']').forEach((el) => {
      el.removeAttribute(MARK);
      el.removeAttribute(LOCK);
    });
    hitsAd = new Set();
    hitsFlip = new Set();
    hitsBlock = new Set();
  }

  /* 统一收集：两类卡片合集一次处理。
     分开处理会互相摘标记（一张卡同时命中直播和推荐位时）。
     同时把「这张卡属于哪一类」记下来：翻转和禁点是两张开关，
     一张卡既要按所属类别决定翻不翻，也要按所属类别决定锁不锁。 */
  function collectFlipCards() {
    const all = new Set();
    const liveSet = new Set();
    const floorSet = new Set();

    // 直播卡片（类名）；翻转关了但禁点还开着也要收进来
    if (ENABLE.live || ENABLE.liveLock) {
      document.querySelectorAll(LIVE_CARD).forEach((el) => { all.add(el); liveSet.add(el); });

      // 直播卡片（链接兜底）：先按老类名容器取；类名整批失效时再按形状爬。
      // 形状兜底只在首页、且确实一张类名卡片都没有时才跑——
      // 否则播放页顶栏里那个「直播」入口会被当成一张卡翻过去。
      const missing = isHomeFeed() && cardClassMissing();
      document.querySelectorAll(LIVE_LINK).forEach((a) => {
        const card = a.closest(CARD_WRAP) || (missing ? shapeCardFrom(a, LIVE_LINK) : null);
        if (!card) return;
        all.add(card);
        liveSet.add(card);
        if (missing) shapeHits += 1;
      });
    }

    // 推荐位卡片：① 标签文字白名单 ② 结构兜底（模块标记 data-mod，按前缀匹配）
    // 两条都取「整张卡」那一层，保证封面与标题一起翻转、一起禁点
    if (ENABLE.floor || ENABLE.floorLock) {
      document.querySelectorAll(FLOOR_TITLE).forEach((t) => {
        const label = (t.textContent || '').trim();
        if (FLOOR_LABELS.indexOf(label) === -1) return;
        const card = outerFloorCard(t);
        if (card) { all.add(card); floorSet.add(card); }
      });

      document.querySelectorAll('[data-mod^="partition_recommend"]').forEach((el) => {
        const card = outerFloorCard(el) || (isHomeFeed() ? shapeCardFrom(el) : null);
        if (card) { all.add(card); floorSet.add(card); }
      });
    }

    return { all, live: liveSet, floor: floorSet };
  }

  function collectAdCards() {
    const next = new Set();
    if (!ENABLE.ad && !ENABLE.adLock) return next; // 两项都关时 next 恒空，hitsAd 会在下一轮被清干净
    document.querySelectorAll(CARD).forEach((card) => {
      if (hasAdWord(card)) next.add(card);
    });
    if (isHomeFeed() && cardClassMissing()) {
      // 类名失效时的广告识别：仍然只认「整串等于广告」的文本节点，再按形状找卡片
      const root = document.body || document.documentElement;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if ((node.nodeValue || '').trim() !== '广告') continue;
        const p = node.parentElement;
        if (!p || (p.textContent || '').trim() !== '广告') continue;
        const card = shapeAdCardFrom(p);
        if (card) { next.add(card); shapeHits += 1; }
      }
    }
    return next;
  }

  /* ---------------------------------------------------------
   * D. 屏蔽名单
   *   名单里某个 UP 的卡片 → 左右翻转 + 整张不可点击
   *   录入入口只在视频播放页：篡改猴菜单一键屏蔽 / 解除
   *
   * 存哪儿：优先 GM 存储 —— 与 bilibili.com 的站点数据隔离，
   *   清站点 cookie/站点数据时名单不会被一起带走；没有 GM 时退
   *   localStorage（同源即可，因为视频页与首页都在 www.bilibili.com）。
   *
   * 两个键：
   *   bbm:blocked        整份名单，低频读（启动、菜单、导入、清空、加/解人）
   *   bbm:blocked:uids   只有 uid 的一行 "v1|条数|uid,uid,..."，轮询只读它
   *   一万条时索引约 170 KB，整份约 2.5 MB，轮询成本差一个量级。
   *   索引只是缓存：读整份时发现对不上就按整份重写；索引缺失或损坏时
   *   退回读整份，不会因为索引坏了就把名单当成空的。
   *
   * 轮询节奏：GM 存储没有变更事件，首页按名单规模分档重读
   *   （≤1k 每 3 秒、≤5k 每 10 秒、≤20k 每 30 秒、更多 60 秒）。
   *   别的标签页导入/清空会同时写两个键，因此一个档位内自动生效；
   *   手动只改 bbm:blocked 时，打开一次菜单就会按整份对齐。
   *
   * 记什么：{uid, name, bvid, title, tags, at}
   *   只有 uid 参与判定，其余字段都是"回头查为什么屏蔽他"的线索。
   *   bvid 只存纯号，URL 上的 ?spm_id_from= / vd_source= /
   *   share_session_id= 之类是推荐链路与设备指纹，一格都不进本地。
   *   这些线索默认只留在本地：导出只写 uid / name / at（+ 标签那份写 tags），
   *   bvid 与 title 任何情况下都不导出——它们是"你看过什么"，比理由更敏感，
   *   想连它们一起带走只有一种办法：自己另存一份加密文件，不经这套导出。
   * ------------------------------------------------------- */
  const BLOCK_KEY = 'bbm:blocked';
  const UIDS_KEY = 'bbm:blocked:uids'; // 轮询只读这一行，整份名单是低频读
  /** 标签表是写死的：预设 8 个 + 「其他」兜底。没有自定义标签，理由只能在菜单里勾 */
  const TAG_LEN = 16; // 单个标签最长（存和导出的都是短名）
  const TAG_MAX = 6; // 一条最多几个标签
  const FALLBACK_TAG = '其他'; // 说过头了、或旧数据/导入文件里出现表外标签，都归到这里
  /* 预设标签（短名，落盘/导出都用它）+ 菜单上的展开写法（只在勾选行显示）。
     一个标签 = 一类可复现的行为，括号里是它收编下来的近义说法，不各自单列：
       恰饭广告（软广 / 暗广 / 恰烂钱 / 带货）
       标题党（封面 / 标题不符 / 悬疑）
       内容注水（云评测 / 合集 / 切片）
       搬运抄袭（洗稿 / 不标源 / AI）
       引战带节奏（蹭热度 / 蹭事故 / 删评）
       情绪营销（卖惨 / 焦虑 / 剧本）
       伪科普（断章取义 / 无出处） */
  const TAG_SHOW = {
    '恰饭广告': '恰饭广告（软广 / 暗广 / 恰烂钱 / 带货）',
    '标题党': '标题党（封面 / 标题不符 / 悬疑）',
    '内容注水': '内容注水（云评测 / 合集 / 切片）',
    '搬运抄袭': '搬运抄袭（洗稿 / 不标源 / AI）',
    '引战带节奏': '引战带节奏（蹭热度 / 蹭事故 / 删评）',
    '情绪营销': '情绪营销（卖惨 / 焦虑 / 剧本）',
    '伪科普': '伪科普（断章取义 / 无出处）',
  };
  const DEFAULT_TAGS = ['恰饭广告', '标题党', '内容注水', '搬运抄袭', '引战带节奏', '情绪营销', '伪科普', '其他', '不再关注'];
  const TAGS = DEFAULT_TAGS.slice(); // 固定表，运行期不再增删
  /** 版本号取管理器读到的 @version，缺失时回落本文件的常量 */
  const SCRIPT_VERSION =
    (typeof GM_info !== 'undefined' && GM_info && GM_info.script && GM_info.script.version) || '1.1.0';
  const TAG_SCHEMA_V = 1; // 标签描述结构的版本，改字段含义时才 +1

  /** 导出用的标签描述：短名 → 显示写法 + 它收编了哪些近义说法。
      纯描述，不影响判定 */
  function buildTagSchema() {
    const out = {};
    TAGS.forEach((t) => {
      const show = TAG_SHOW[t];
      if (!show) { out[t] = { name: t }; return; }
      const m = show.match(/^(.*)（(.*)）$/);
      const row = { name: t, display: show };
      if (m) row.covers = m[2].split(/\s*\/\s*/).filter(Boolean);
      out[t] = row;
    });
    return out;
  }
  const UID_RE = /^[1-9]\d{0,15}$/;
  const BVID_RE = /^(?:BV[0-9A-Za-z]{10}|av[1-9]\d{6,})$/;
  const VIDEO_PATH_RE = /\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i;

  function storeGet(k, dflt) {
    if (hasGM) {
      try {
        const v = GM_getValue(k, dflt);
        if (v !== undefined) return v;
      } catch (e) { /* 读失败时退 localStorage */ }
    }
    try {
      const raw = localStorage.getItem(k);
      return raw == null ? dflt : JSON.parse(raw);
    } catch (e) { return dflt; }
  }

  function storeSet(k, v) {
    if (hasGM) {
      try { GM_setValue(k, v); return; } catch (e) { /* 写失败时退 localStorage */ }
    }
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私模式/配额：本次仍生效，只是不持久 */ }
  }

  /** 折叠空白 + 截断：标题/名字里带换行会把菜单和 alert 撕开 */
  function txt(v, max) {
    if (typeof v !== 'string' && typeof v !== 'number') return '';
    return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function clip(s, n) {
    s = s || '';
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  /** 标签清洗：数组或"逗号/空格分隔的字符串"都收，去重、截断、限条数 */
  function normTags(v) {
    const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(/[,，;；、\s]+/) : []);
    const out = [];
    for (const item of arr) {
      const t = txt(item, TAG_LEN).replace(/^#+/, '');
      if (!t || out.indexOf(t) !== -1) continue;
      out.push(t);
      if (out.length >= TAG_MAX) break;
    }
    return out;
  }

  const tagExists = (t) => TAGS.indexOf(t) !== -1;
  /** 标签表是固定的：表外的一律折叠成「其他」（旧存档里的自定义标签、别人文件里的标签都走这里） */
  function mapTags(v) {
    const out = [];
    normTags(v).forEach((t) => {
      const x = tagExists(t) ? t : FALLBACK_TAG;
      if (out.indexOf(x) === -1) out.push(x);
    });
    return out;
  }

  /** 逐条清洗：uid 不合法整条丢；其余字段越界就截断，不整条丢 */
  function cleanEntry(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    const uid = txt(e.uid, 20).replace(/^uid:/i, '');
    if (!UID_RE.test(uid)) return null;
    const bvid = txt(e.bvid, 32);
    return {
      uid,
      name: txt(e.name, 64),
      bvid: BVID_RE.test(bvid) ? bvid : '',
      title: txt(e.title, 200),
      tags: mapTags(e.tags),
      at: typeof e.at === 'number' && isFinite(e.at) ? e.at : Date.now(),
    };
  }

  /** 存档只有一种形状：{uid,name,bvid,title,tags,at} 的数组（或包在 entries 里） */
  function parseBlockList(raw) {
    const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray(raw.entries)) ? raw.entries : [];
    const out = [];
    const seen = new Set();
    for (const item of arr) {
      const e = cleanEntry(item);
      if (!e || seen.has(e.uid)) continue;
      seen.add(e.uid);
      out.push(e);
    }
    return out;
  }

  let BLOCK = [];
  let BLOCK_UIDS = new Set();

  /* ---- 两个存储键 ----
     bbm:blocked       整份名单（uid/name/bvid/title/tags/at），低频读
     bbm:blocked:uids  只有 uid 的一行文本，高频轮询只读它
     格式 "v1|<条数>|<uid,uid,...>"：一万条约 170 KB，是整份名单的 1/10 多一点。
     索引只是缓存：读整份时若对不上就按整份重写，任何一侧写到一半都不会卡死。 */
  function uidsLine(list) {
    return 'v1|' + list.length + '|' + list.map((e) => e.uid).join(',');
  }

  /** 解析失败返回 null（缺键、格式不对、条数对不上、uid 不合法或有重复） */
  function parseUids(raw) {
    if (typeof raw !== 'string') return null;
    const parts = raw.split('|');
    if (parts.length !== 3 || parts[0] !== 'v1') return null;
    const n = Number(parts[1]);
    if (!isFinite(n) || n < 0 || Math.floor(n) !== n) return null;
    if (!n) return parts[2] ? null : new Set();
    const ids = parts[2].split(',');
    if (ids.length !== n) return null;
    const set = new Set();
    for (const id of ids) {
      if (!UID_RE.test(id)) return null;
      set.add(id);
    }
    return set.size === n ? set : null;
  }

  const sameSet = (a, b) => {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  };

  /** 整份读：顺带校正索引。返回 uid 集合有没有真变 */
  function refreshBlock() {
    const prev = BLOCK_UIDS;
    BLOCK = parseBlockList(storeGet(BLOCK_KEY, []));
    BLOCK_UIDS = new Set(BLOCK.map((e) => e.uid));
    const line = uidsLine(BLOCK);
    if (storeGet(UIDS_KEY, '') !== line) storeSet(UIDS_KEY, line); // 索引落后/缺失就补上
    return !sameSet(prev, BLOCK_UIDS);
  }

  /** 只读索引（轮询用）。索引坏了才退回读整份。返回 uid 集合有没有真变 */
  function readUids() {
    const set = parseUids(storeGet(UIDS_KEY, ''));
    if (!set) return refreshBlock();
    const prev = BLOCK_UIDS;
    BLOCK_UIDS = set;
    return !sameSet(prev, set);
  }

  /** 读名单的间隔按条数分档：解析成本随条数线性涨，3 秒一次在大名单上太浪费。
      扫描兜底仍是固定 3 秒，不受这里影响。
      ≤1k → 3s；1k–5k → 10s；5k–20k → 30s；更多 → 60s */
  function blockPollMs() {
    const n = BLOCK.length;
    if (n <= 1000) return 3000;
    if (n <= 5000) return 10000;
    if (n <= 20000) return 30000;
    return 60000;
  }

  /** 轮询：索引没变就到此为止，整份名单一次都不碰 */
  function blockPoll() {
    if (!readUids()) return;
    buildMenu(); // buildMenu 里会读整份并校正（名字/标签/条数都刷新）
    applyNow();
  }

  function saveBlock() {
    storeSet(BLOCK_KEY, BLOCK); // 先整份
    storeSet(UIDS_KEY, uidsLine(BLOCK)); // 再索引：反了的话下次读整份会纠正
  }

  const isBlocked = (uid) => BLOCK_UIDS.has(String(uid));

  /* ---- 卡片 → uid：只认 owner 链接，取不到就不猜 ---- */
  const OWNER_LINK = 'a[href*="space.bilibili.com"]';

  function cardUid(card) {
    const owner =
      card.querySelector('.bili-video-card__info--owner ' + OWNER_LINK) ||
      card.querySelector('.bili-video-card__info--owner a') ||
      card.querySelector(OWNER_LINK);
    if (!owner) return '';
    const href = owner.getAttribute('href') || owner.href || '';
    const m = href.match(/space\.bilibili\.com\/(\d+)/);
    return m ? m[1] : '';
  }

  /* ---- 只在首页信息流生效：这是"首页屏蔽"，不是全站屏蔽 ---- */
  const isHomeFeed =
    () => /^www\.bilibili\.com$/i.test(location.hostname) &&
      (location.pathname === '/' || location.pathname === '/index.html');

  function collectBlockCards() {
    const next = new Set();
    // 翻转关了但禁点还开着，这张卡仍然要处理（只锁不翻）
    if ((!ENABLE.block && !ENABLE.blockLock) || !BLOCK_UIDS.size || !isHomeFeed()) return next;
    document.querySelectorAll(CARD).forEach((card) => {
      const uid = cardUid(card);
      if (uid && BLOCK_UIDS.has(uid)) next.add(card);
    });
    if (cardClassMissing()) {
      // 类名失效：从视频链接爬回卡片，再按 owner 链接取 uid，判定标准不变
      document.querySelectorAll(VIDEO_LINK).forEach((a) => {
        const card = shapeCardFrom(a);
        if (!card) return;
        const uid = cardUid(card);
        if (uid && BLOCK_UIDS.has(uid)) { next.add(card); shapeHits += 1; }
      });
    }
    return next;
  }

  /* ---- 视频页当前 UP：三层来源，上一层拿到就不往下走 ----
     1) unsafeWindow.__INITIAL_STATE__.videoData.owner（B 站渲染整页的数据源，
        页面改版改的是模板与 class，不是这份状态，最稳）
     2) api.bilibili.com/x/web-interface/view（B 站前端自己也在用，只依赖 BV 号）
     3) DOM 里的 UP 信息区链接（最后兜底，最脆）
     三层全失败就不注册菜单项：不猜、不误屏。 */
  let VIDEO = null; // { uid, name, bvid, title }
  /** bvid → 上次请求时间。失败的也记上，30s 后允许重试——
      失败也记上时间，30s 后允许重试，一次网络抖动不至于让这条视频永远没有菜单项 */
  const apiTried = new Map();
  const API_RETRY_MS = 30000;

  const isVideoPage = () => VIDEO_PATH_RE.test(location.pathname);

  function bvidFromUrl() {
    const m = location.pathname.match(VIDEO_PATH_RE);
    if (!m) return '';
    const raw = m[1];
    return /^bv/i.test(raw) ? 'BV' + raw.slice(2) : 'av' + raw.slice(2);
  }

  function titleFromDom() {
    const h = document.querySelector('.video-title, h1.video-title, h1[title]');
    if (!h) return '';
    return txt(h.getAttribute('title') || h.textContent, 200);
  }

  function stateVideo() {
    let st = null;
    try { st = (typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow.__INITIAL_STATE__) || null; } catch (e) { st = null; }
    if (!st) { try { st = window.__INITIAL_STATE__ || null; } catch (e) { st = null; } }
    const vd = st && st.videoData;
    if (!vd || !vd.owner || vd.owner.mid == null) return null;
    return {
      uid: String(vd.owner.mid),
      name: txt(vd.owner.name, 64),
      bvid: txt(st.bvid || vd.bvid, 32),
      title: txt(vd.title, 200),
    };
  }

  const UP_SCOPES = ['.up-info--name', '.up-name', '.up-info', '#v_upinfo', '.video-info-container'];

  function domVideo() {
    for (const sel of UP_SCOPES) {
      const scope = document.querySelector(sel);
      if (!scope) continue;
      const link =
        (scope.matches && scope.matches(OWNER_LINK) ? scope : null) ||
        (scope.querySelector && scope.querySelector(OWNER_LINK)) ||
        (scope.closest && scope.closest(OWNER_LINK));
      if (!link) continue;
      const href = link.getAttribute('href') || link.href || '';
      const m = href.match(/space\.bilibili\.com\/(\d+)/);
      if (!m) continue;
      return { uid: m[1], name: txt(link.textContent, 64), bvid: bvidFromUrl(), title: titleFromDom() };
    }
    return null;
  }

  function setVideo(v) {
    const changed = !VIDEO || VIDEO.uid !== v.uid || VIDEO.bvid !== v.bvid;
    VIDEO = v;
    if (changed) buildMenu();
  }

  function apiVideo(bvid) {
    if (!bvid) return;
    const now = Date.now();
    if (now - (apiTried.get(bvid) || 0) < API_RETRY_MS) return;
    apiTried.set(bvid, now);
    try {
      const q = /^av/i.test(bvid) ? 'aid=' + bvid.slice(2) : 'bvid=' + bvid;
      const want = bvid;
      fetch('https://api.bilibili.com/x/web-interface/view?' + q, { credentials: 'include' })
        .then((r) => r.json())
        .then((j) => {
          const d = j && j.data;
          if (!d || !d.owner || d.owner.mid == null) return;
          if (!isVideoPage() || bvidFromUrl() !== want) return;
          setVideo({
            uid: String(d.owner.mid),
            name: txt(d.owner.name, 64),
            bvid: txt(d.bvid, 32) || want,
            title: txt(d.title, 200),
          });
        })
        .catch(() => { /* 被 CORS / 登录态挡住就安静退到 DOM 层，30s 后再试 */ });
    } catch (e) { /* fetch 不可用时忽略 */ }
  }

  function resolveVideo(allowApi) {
    if (!isVideoPage()) {
      if (VIDEO) { VIDEO = null; buildMenu(); }
      return;
    }
    const cur = bvidFromUrl();
    // 同一个标签里换视频（点推荐、搜索进来）B 站不一定重注入 __INITIAL_STATE__：
    // 那份状态还是上一条的。不先清掉，菜单会一直挂在上一个 UP 上，
    // 看起来就像"没有屏蔽功能了、只剩解除"。
    if (VIDEO && cur && VIDEO.bvid && VIDEO.bvid !== cur) {
      VIDEO = null;
      buildMenu();
    }
    let v = null;
    try { v = stateVideo(); } catch (e) { v = null; }
    // 状态里的 BV 和地址栏对不上 = 上一条视频的残留，直接作废，改走 DOM/接口
    if (v && cur && v.bvid && v.bvid !== cur) v = null;
    if (!v) { try { v = domVideo(); } catch (e) { v = null; } }
    if (v) {
      if (!v.bvid) v.bvid = cur;
      if (!v.title) v.title = titleFromDom();
      setVideo(v);
      return;
    }
    // document-start 时页面还没注入 __INITIAL_STATE__、DOM 也还没建好，
    // 这时不必为一个多半能自愈的场景多打一次接口请求；交给心跳那一轮再试
    if (allowApi) apiVideo(cur);
  }

  /* ---- 名单操作（全部靠菜单 + prompt/confirm/alert，零自绘 UI） ---- */
  function addBlock(v) {
    if (!v || !v.uid || isBlocked(v.uid)) return;
    BLOCK.push({
      uid: v.uid,
      name: v.name || '',
      bvid: v.bvid || '',
      title: v.title || '',
      tags: normTags(v.tags),
      at: Date.now(),
    });
    BLOCK_UIDS.add(v.uid);
    saveBlock();
    buildMenu();
    applyNow();
    return entryOf(v.uid);
  }

  function removeBlock(uid) {
    BLOCK = BLOCK.filter((e) => e.uid !== uid);
    BLOCK_UIDS.delete(uid);
    saveBlock();
    buildMenu();
    applyNow();
  }

  function entryOf(uid) {
    return BLOCK.find((e) => e.uid === uid) || null;
  }

  function ymd(ts) {
    const d = new Date(typeof ts === 'number' && isFinite(ts) ? ts : Date.now());
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* ---- 名单的查看：不做菜单项，看名单靠导出；UP 行只显示状态，不加不减 ---- */

  /** 勾选标签：这就是唯一的屏蔽入口。
      他还没在名单里 → 顺手加进去（勾上第一项理由即表示"我要屏蔽他"）；
      取消最后一项理由 → 没有理由了，条目一起移出名单 */
  function toggleTagOnCurrent(label) {
    if (!VIDEO || !VIDEO.uid) { alert('先打开某个视频的播放页，再勾标签。'); return; }
    let e = entryOf(VIDEO.uid);
    if (!e) {
      addBlock({ uid: VIDEO.uid, name: VIDEO.name, bvid: VIDEO.bvid, title: VIDEO.title, tags: [label] });
      return;
    }
    const i = (e.tags || []).indexOf(label);
    if (i === -1) {
      e.tags = mapTags((e.tags || []).concat([label]));
      saveBlock();
      buildMenu();
      return;
    }
    e.tags.splice(i, 1);
    if (!e.tags.length) { removeBlock(VIDEO.uid); return; }
    saveBlock();
    buildMenu();
  }

  const EXPORT_WARN =
    '导出的文件会包含你给每个 UP 打的标签。\n' +
    '这些是你的个人主观判断，文件若被他人获得，\n' +
    '可能被视为对该用户负面评价的传播。\n\n' +
    '点「确定」= 带上标签导出；点「取消」= 取消导出。';

  /* 风险确认：调不到 confirm（管理器不发弹窗、页面禁用对话框）时不能默默什么都不做，
     改成照常导出、导出后再把这段话提示一遍 */
  function askExportRisk() {
    try {
      if (typeof confirm !== 'function') return 'after';
      return confirm(EXPORT_WARN) ? 'ok' : 'cancel';
    } catch (e) {
      return 'after';
    }
  }

  /* ---------------------------------------------------------
   * 加密导出
   *   唯一一种会把 BV 号与视频标题写出去的方式，前提是口令够长够杂。
   *   AES-GCM-256，口令经 PBKDF2-SHA256 200000 轮派生，salt/iv 每次随机；
   *   口令本身不落盘、不进文件、不进 GM 存储，忘了就解不回来。
   * ------------------------------------------------------- */
  const PASS_MIN = 12;
  const ENC_ITER = 200000;
  const ENC_FORMAT = 'bbm-blocklist-enc';
  /* 只拦明显会被字典/键盘序列直接命中的口令；真正的强度靠长度和字符分布 */
  const WEAK_WORDS = [
    'password', 'passw0rd', '123456', 'qwerty', 'admin', 'bilibili',
    'letmein', 'iloveyou', 'abc123', '1qaz2wsx', 'zaq12wsx', 'woaini',
  ];

  /** 口令规则：≥12 位，且大写 / 小写 / 数字 / 特殊字符四类都得有；
      不同字符要够散、不许是纯重复、不许含常见弱词。
      只校验一次；手误不靠重复输入兜，靠导出后当场自解一遍 */
  function checkPassword(p) {
    if (!p) return '没有输入口令。';
    if (p.length < PASS_MIN) return '口令至少 ' + PASS_MIN + ' 位（现在 ' + p.length + ' 位）。';
    if (!/[A-Z]/.test(p)) return '缺少大写字母。';
    if (!/[a-z]/.test(p)) return '缺少小写字母。';
    if (!/[0-9]/.test(p)) return '缺少数字。';
    if (!/[^A-Za-z0-9]/.test(p)) return '缺少特殊字符（符号或空格都算）。';
    if (new Set(p).size < 10) return '不同字符太少（' + new Set(p).size + ' 种），换个更杂的。';
    const low = p.toLowerCase();
    for (const w of WEAK_WORDS) {
      if (low.indexOf(w) !== -1) return '口令里出现了常见弱词「' + w + '」。';
    }
    return '';
  }

  const b64enc = (buf) => {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  };
  const b64dec = (s) => {
    const bin = atob(String(s));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  };

  const subtleOf = () =>
    (typeof crypto !== 'undefined' && crypto && crypto.subtle ? crypto.subtle : null);

  async function deriveKey(pwd, salt, usage) {
    const subtle = subtleOf();
    const base = await subtle.importKey('raw', new TextEncoder().encode(pwd), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ENC_ITER, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      usage
    );
  }

  /** 明文 → 加密包（只含密文与解密需要的最小参数） */
  async function sealJson(pwd, obj) {
    const subtle = subtleOf();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pwd, salt, ['encrypt']);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
    return {
      format: ENC_FORMAT,
      v: 1,
      kdf: { algo: 'PBKDF2-SHA256', iterations: ENC_ITER },
      salt: b64enc(salt),
      iv: b64enc(iv),
      ct: b64enc(ct),
      note: '口令没有存在任何地方，忘了就解不开这份文件。',
    };
  }

  /** 加密包 → 对象；口令错或文件被改，GCM 会直接报错，不做猜测 */
  async function openJson(pwd, pack) {
    const subtle = subtleOf();
    const key = await deriveKey(pwd, b64dec(pack.salt), ['decrypt']);
    const plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: b64dec(pack.iv) },
      key,
      b64dec(pack.ct)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /** 落盘：建一个隐藏 <a> 点一下，失败把原文交给调用方兜底 */
  function saveText(name, json, onFail) {
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.style.display = 'none';
      (document.body || document.documentElement).appendChild(a);
      a.click();
      setTimeout(() => { try { a.remove(); } catch (e) {} URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch (e) {
      onFail(e);
      return false;
    }
  }

  /** 加密导出：唯一会写出 BV 与标题的路径，所以口令必须够长够杂。
      口令只在这一刻存在于内存，不写存储、不进文件。 */
  async function exportEncrypted() {
    if (!BLOCK.length) { alert('首页屏蔽名单是空的，没有可导出的内容。'); return; }
    if (!subtleOf()) {
      alert('这个页面拿不到 WebCrypto，无法做加密导出。\n（通常是因为页面不是 https，或浏览器禁用了加密接口）');
      return;
    }
    const rule = '至少 ' + PASS_MIN + ' 位，且含大写、小写、数字、符号。';
    const pwd = prompt(
      '设口令：' + rule + '\n' +
      '只输一次，忘了这份文件就打不开。\n' +
      '框里是明文，也不能自动填充，请手打。',
      ''
    );
    if (pwd === null) return;
    const bad = checkPassword(pwd);
    if (bad) { alert('口令不合格：' + bad + '\n\n' + rule); return; }
    /* 只问一次。手误不靠"再输一遍"防，靠下面写完立刻用同一口令解一遍：
       解得开才落盘，解不开就是口令自己都对不上密文，直接丢弃并报错。 */

    const entries = BLOCK.map((e) => ({
      uid: e.uid, name: e.name, bvid: e.bvid, title: e.title,
      tags: (e.tags || []).slice(), at: e.at,
    }));
    const payload = {
      v: 3,
      entries,
      tags: TAGS.slice(),
      exportedAt: new Date().toISOString(),
      count: entries.length,
      format: 'bbm-blocklist',
      scriptVersion: SCRIPT_VERSION,
      tagSchemaVersion: TAG_SCHEMA_V,
      tagSchema: buildTagSchema(),
    };
    let pack;
    try {
      pack = await sealJson(pwd, payload);
      // 自检：同一口令必须能把刚写出来的密文解回原文，否则这份文件等于废纸
      const back = await openJson(pwd, pack);
      if (!back || !Array.isArray(back.entries) || back.entries.length !== entries.length) {
        alert('自检失败：刚生成的密文解不回原文，已丢弃，没有写出任何文件。');
        return;
      }
    } catch (e) {
      alert('加密失败：' + (e && e.message ? e.message : e));
      return;
    }
    const json = JSON.stringify(pack, null, 2);
    const name = 'bbm-blocked-' + ymd(Date.now()) + '-enc.json';
    if (!saveText(name, json, (e) => { alert('下载失败：' + (e && e.message ? e.message : e)); })) return;
    alert(
      '已导出加密包：' + name + '\n\n' +
      '里面含标签、BV 号与视频标题，只有用刚才那个口令才能解开。\n' +
      '口令没有存在任何地方，请自己记牢；换台机器也得有这个口令才能导入。'
    );
  }

  /** 明文导出的公共部分（加密那份不走这里，它有自己的 payload）
      opts.noWarn：跳过标签风险确认（清空前的自动备份用，不然要连点两次）
      返回值：文件有没有发出去，调用方据此决定要不要继续清空 */
  function exportBlock(withTags, opts) {
    const o = opts || {};
    if (!BLOCK.length) { alert('首页屏蔽名单是空的，没有可导出的内容。'); return false; }
    let risk = 'ok';
    if (withTags && !o.noWarn) {
      risk = askExportRisk();
      if (risk === 'cancel') {
        // 明确告诉用户"没导出"，否则点了取消看起来就像坏了
        alert('已取消，没有生成文件。\n要导出带标签的版本，请再点一次并在弹窗里选「确定」。');
        return false;
      }
    }
    const entries = BLOCK.map((e) => {
      /* BV 号与标题不进导出：它们说的是"你看过什么"，不是"你屏蔽了谁"。
         这两样只留在本地，点 UP 行时才显示；名单要带走就只有 uid / name / at */
      const row = { uid: e.uid, name: e.name };
      // 不含标签那条连 tags 字段都不写：不是置空，是删除
      if (withTags) row.tags = (e.tags || []).slice();
      row.at = e.at;
      return row;
    });
    const payload = { v: 3, tags: withTags ? TAGS.slice() : undefined, exportedAt: new Date().toISOString(), count: entries.length, entries };
    if (!withTags) delete payload.tags;
    /* 导出里自带一份描述：谁读这个文件都不必反猜「恰饭广告」到底覆盖哪些行为。
       只描述标签本身，不含任何人对哪个 UP 的判断，所以放在带标签那份里也不增加暴露面 */
    if (withTags) {
      payload.format = 'bbm-blocklist';
      payload.scriptVersion = SCRIPT_VERSION;
      payload.tagSchemaVersion = TAG_SCHEMA_V;
      payload.tagSchema = buildTagSchema();
    }
    const json = JSON.stringify(payload, null, 2);
    const name = 'bbm-blocked-' + ymd(Date.now()) + (withTags ? '-with-tags' : '') + (o.suffix || '') + '.json';
    if (!saveText(name, json, (e) => {
      alert('下载失败：' + (e && e.message ? e.message : e) + '\n\n名单原文：\n' + json);
    })) return false;
    if (risk === 'after') alert('已按含标签的方式导出：' + name + '\n\n' + EXPORT_WARN.replace('点「确定」= 带上标签导出；点「取消」= 取消导出。', ''));
    try { if (typeof GM_setClipboard === 'function') GM_setClipboard(json); } catch (e) { /* 没有该 API 就只走文件 */ }
    return true;
  }

  /** 把一批条目按 uid 合并进名单（明文导入与解密后的导入共用） */
  function applyImport(incoming) {
    if (!incoming.length) { alert('没有解析出任何有效条目（uid 必须是纯数字）。'); return; }
    const map = new Map(BLOCK.map((e) => [e.uid, e]));
    let added = 0;
    let merged = 0;
    incoming.forEach((e) => {
      const cur = map.get(e.uid);
      if (!cur) { map.set(e.uid, e); added += 1; return; }
      // 合并语义：只补本地为空的线索字段，标签取并集
      if (!cur.name && e.name) cur.name = e.name;
      if (!cur.bvid && e.bvid) cur.bvid = e.bvid;
      if (!cur.title && e.title) cur.title = e.title;
      cur.tags = mapTags((cur.tags || []).concat(e.tags || []));
      merged += 1;
    });
    BLOCK = [...map.values()].sort((a, b) => a.at - b.at);
    BLOCK_UIDS = new Set(BLOCK.map((e) => e.uid));
    saveBlock();
    buildMenu();
    applyNow();
    alert('导入完成：新增 ' + added + ' 条，合并 ' + merged + ' 条，当前共 ' + BLOCK.length + ' 条。');
  }

  /** 导入只收自己人产出的形状。多出来的字段一律拒绝：
      最常见的"多出来"就是有人把口令顺手写进同一份 JSON（pwd / 密码 / note 改写），
      那样文件等于没加密，所以宁可导入失败也不让这种文件过门 */
  const PAYLOAD_KEYS = ['v', 'format', 'entries', 'tags', 'exportedAt', 'count', 'scriptVersion', 'tagSchemaVersion', 'tagSchema'];
  const ENC_KEYS = ['format', 'v', 'kdf', 'salt', 'iv', 'ct', 'note'];
  const KDF_KEYS = ['algo', 'iterations'];
  const ENTRY_KEYS = ['uid', 'name', 'bvid', 'title', 'tags', 'at'];

  /** 返回空串 = 形状合格；否则返回给用户看的中文原因 */
  function shapeError(data, encrypted) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return '顶层必须是 JSON 对象。';
    const allow = encrypted ? ENC_KEYS : PAYLOAD_KEYS;
    const extra = Object.keys(data).filter((k) => allow.indexOf(k) === -1);
    if (extra.length) {
      return '拒绝导入：文件里有导出时不会产生的顶层字段「' + extra.join('、') + '」。\n' +
        '把口令、备注之类写进同一份文件，等于把钥匙挂在锁上；这种文件不能被当作加密文件处理。';
    }
    if (encrypted) {
      if (!data.kdf || typeof data.kdf !== 'object') return '拒绝导入：加密包缺少 kdf。';
      const kx = Object.keys(data.kdf).filter((k) => KDF_KEYS.indexOf(k) === -1);
      if (kx.length) return '拒绝导入：kdf 里有额外字段「' + kx.join('、') + '」。';
      if (typeof data.salt !== 'string' || typeof data.iv !== 'string' || typeof data.ct !== 'string') {
        return '拒绝导入：加密包缺少 salt / iv / ct。';
      }
      return '';
    }
    const list = Array.isArray(data.entries) ? data.entries : null;
    if (list) {
      const bad = [];
      list.forEach((e) => {
        if (e && typeof e === 'object' && !Array.isArray(e)) {
          Object.keys(e).forEach((k) => {
            if (ENTRY_KEYS.indexOf(k) === -1 && bad.indexOf(k) === -1) bad.push(k);
          });
        }
      });
      if (bad.length) {
        return '拒绝导入：条目里有不该出现的字段「' + bad.join('、') + '」。\n' +
          '每条只允许 uid / name / bvid / title / tags / at。';
      }
    }
    return '';
  }

  async function importBlock() {
    const raw = prompt(
      '把导出的 JSON 整段粘进来\n（按 uid 合并进首页屏蔽名单：本地已有的标签只增不减）\n' +
      '加密包也贴这里，贴完会单独问你要口令',
      ''
    );
    if (raw === null) return;
    const t = raw.trim();
    if (!t) return;
    let data;
    try { data = JSON.parse(t); } catch (e) { alert('不是合法的 JSON：' + (e && e.message ? e.message : e)); return; }

    // 加密包：先要口令，解不开就什么都不改
    if (data && data.format === ENC_FORMAT) {
      const shape = shapeError(data, true);
      if (shape) { alert(shape); return; }
      if (!subtleOf()) { alert('这个页面拿不到 WebCrypto，解不开加密包。'); return; }
      const pwd = prompt('这份是加密包，输入导出时设的口令：', '');
      if (pwd === null) return;
      let plain;
      try {
        plain = await openJson(pwd, data);
      } catch (e) {
        alert('解不开：口令不对，或文件被改过。\n（加密包没有"重试找回"的余地，只能再试一次口令）');
        return;
      }
      const shape2 = shapeError(plain, false);
      if (shape2) { alert('加密包里解出来的内容形状不对，已拒绝：\n' + shape2); return; }
      applyImport(parseBlockList(plain));
      return;
    }

    const shape = shapeError(data, false);
    if (shape) { alert(shape); return; }
    applyImport(parseBlockList(data));
  }

  /** 清空前必须先落一份备份：清空是不可撤销的，而名单（含标签）
      只存在本地存储里，误点一次就全没了 */
  function clearBlock() {
    if (!BLOCK.length) { alert('首页屏蔽名单已经是空的。'); return; }
    const backup = 'bbm-blocked-' + ymd(Date.now()) + '-with-tags-cleared.json';
    const msg =
      '清空首页屏蔽名单？共 ' + BLOCK.length + ' 条，不可撤销。\n\n' +
      '清空前会先自动导出一份备份（含标签，只掉在你自己的下载目录）：\n' +
      backup + '\n\n' +
      '点「确定」= 备份并清空；点「取消」= 什么都不做。';
    if (!confirm(msg)) return;
    if (!exportBlock(true, { noWarn: true, suffix: '-cleared' })) {
      alert('备份没导出来，已取消清空，名单原样保留。');
      return;
    }
    const n = BLOCK.length;
    BLOCK = [];
    BLOCK_UIDS = new Set();
    saveBlock();
    buildMenu();
    applyNow();
    alert('已清空 ' + n + ' 条，备份文件：' + backup);
  }

  /* ---------------------------------------------------------
   * 扫描 + 兜底
   * 单次扫描抛错不回滚、不停服；连续 3 次都抛说明页面结构变了、
   * 继续跑只会刷报错，于是断开观察、摘掉全部标记，把页面还给 B 站。
   * ------------------------------------------------------- */
  let failing = 0;
  let stopped = false;

  function scan() {
    shapeHits = 0;
    paint(collectAdCards(), 'ad', {
      flip: () => !!ENABLE.ad,
      lock: () => !!ENABLE.adLock,
    });
    const f = collectFlipCards();
    paint(f.all, 'flip', {
      // 一张卡可能同时是直播位和推荐位：任一类要求翻就翻，任一类要求锁就锁
      flip: (el) => (f.live.has(el) && ENABLE.live) || (f.floor.has(el) && ENABLE.floor),
      lock: (el) => (f.live.has(el) && ENABLE.liveLock) || (f.floor.has(el) && ENABLE.floorLock),
    });
    paint(collectBlockCards(), 'block', {
      flip: () => !!ENABLE.block,
      lock: () => !!ENABLE.blockLock,
    });

    /* 诊断：类名还认不认得出卡片、兜底有没有上阵。
       结论只在变化时重画菜单，平时一行都不画。 */
    if (shapeHits > 0) shapeEver = true;
    const key = diagState();
    if (key !== diagKey) { diagKey = key; menuDirty = true; }
    if (DEBUG) {
      console.info('[bbm] 扫描诊断', {
        类名卡片: document.querySelectorAll(CARD).length,
        视频链接: document.querySelectorAll(VIDEO_LINK).length,
        形状兜底认出: shapeHits,
        广告命中: hitsAd.size,
        翻转命中: hitsFlip.size,
        屏蔽命中: hitsBlock.size,
      });
    }
  }

  /** 诊断结论只分四档，避免“链接数一变就重画菜单”（重画会顺带读整份名单） */
  function diagState() {
    if (shapeEver) return 'shape';
    if (classCardCount()) return 'named';
    return document.querySelectorAll(VIDEO_LINK).length >= 3 ? 'unnamed' : 'empty';
  }

  function scanGuarded() {
    if (stopped) return;
    try {
      scan();
      failing = 0;
    } catch (e) {
      failing += 1;
      console.error('[bbm] 扫描失败（第 ' + failing + ' 次）', e);
      if (failing >= 3) shutDown(e);
    }
  }

  function shutDown(e) {
    stopped = true;
    try { observer.disconnect(); } catch (err) { /* 未启动时忽略 */ }
    clearAll();
    console.error('[bbm] 连续失败，已停止处理并把页面还原给 B 站', e);
  }

  /* ---------------------------------------------------------
   * 变更过滤
   * 只有落在「卡片级容器」里的变更才值得重扫（140ms 合批）：
   *   - 首页弹幕、评论区、播放量刷新、顶栏动画全部被挡在外面
   *   - 同时覆盖列表延迟挂载、整块替换、卡片被复用（class/href 变化）
   * 只观察 class / href 两类属性；自己写的 data-bbm 不在其中，无回环。
   * ------------------------------------------------------- */
  const SCOPE = CARD + ', ' + CARD_WRAP;

  const inScope = (el) => el instanceof Element && (el.matches(SCOPE) || !!el.closest(SCOPE));

  function relevant(records) {
    for (const r of records) {
      if (inScope(r.target)) return true;
      const nodes = r.addedNodes;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.nodeType !== 1) continue;
        if (inScope(n) || n.querySelector(CARD)) return true;
      }
      const removed = r.removedNodes;
      for (let i = 0; i < removed.length; i++) {
        const n = removed[i];
        if (n.nodeType !== 1) continue;
        if (n.matches(SCOPE) || n.querySelector(CARD + ', ' + LIVE_CARD)) return true;
      }
    }
    return false;
  }

  let scanT = 0;
  function schedule() {
    if (stopped || scanT) return;
    scanT = window.setTimeout(() => { scanT = 0; scanGuarded(); }, 140);
  }

  const observer = new MutationObserver((records) => {
    if (relevant(records)) schedule();
  });

  /* ---------------------------------------------------------
   * 篡改猴菜单：扁平一条，每行「✅ 类别：当前效果」
   * TM 的菜单 API 没有子菜单，也不适合"点一项就重建整张菜单"（弹窗打开时
   * 未必即时刷新），所以不分组、不加符号，状态只靠行首的 ✅ / ⬜。
   * 标签表写死，菜单里既不放新增也不放删除，只有逐条勾选。
   * 菜单之外不弹窗：名单只经导出落地，不在 console 里打印。
   * ------------------------------------------------------- */
  const MENU_IDS = [];
  const BOX_OFF = '⬜ ';
  const BOX_ON = '✅ '

  /** 翻转类生效时用方向图标代替勾，一眼就能看出朝哪翻；
      没生效时仍用原来的 ⬜（禁止点击那几行没有方向，继续用 ✅）
      生效 = 「↕️ 首页广告位：上下翻转」/「↔️ 首页推荐位：左右翻转」 */
  const switchLabel = (name, on, effect, off, icon) =>
    (on ? (icon ? icon + ' ' : BOX_ON) : BOX_OFF) + name + '：' + (on ? effect : off);

  function menuEnabled() {
    return hasGM && typeof GM_registerMenuCommand === 'function';
  }

  function buildMenu() {
    if (!menuEnabled()) return;
    // 人打开菜单的时刻，期望看到的就是最新名单：这里读一次整份并按它校正索引，
    // 所以手动改 bbm:blocked 也能在下次打开菜单时对上（轮询只读 uid 索引，碰不到整份）
    if (refreshBlock()) applyNow();
    if (typeof GM_unregisterMenuCommand === 'function') {
      for (const id of MENU_IDS.splice(0)) {
        try { GM_unregisterMenuCommand(id); } catch (e) { /* 管理器不支持注销时忽略 */ }
      }
    }
    const reg = (label, fn) => MENU_IDS.push(GM_registerMenuCommand(label, fn));

    // A. 卡片开关（八档）：一行只说当前效果，点一下切到另一状态
    Object.keys(DEFAULTS).forEach((k) => {
      const item = LABELS[k];
      reg(switchLabel(item.name, !!ENABLE[k], item.effect, item.off, item.icon), () => toggle(k));
    });

    // B. UP 这一行是纯展示：点它没有任何反应，加/解全靠下面的理由标签
    if (VIDEO && VIDEO.uid) {
      const nm = clip(VIDEO.name || VIDEO.uid, 40);
      const e = entryOf(VIDEO.uid);
      if (e) {
        // 名字后面只写第一条理由，多选的其余不列：菜单行是提示，不是清单
        const t = (e.tags && e.tags.length) ? e.tags[0] : '未标理由';
        reg('⛔ 已屏蔽该UP：' + nm + '（' + t + '）', () => {});
      } else {
        reg('UP：' + nm + '；要屏蔽就点下面的理由', () => {});
      }
    }

    // C. 理由标签就是这个 UP 的勾选框
    if (VIDEO && VIDEO.uid) {
      const cur = entryOf(VIDEO.uid);
      const on = (cur && cur.tags) || [];
      TAGS.forEach((t) => {
        /* 菜单上显示展开写法（括号里是收编的近义说法），勾的仍存短名，存储与导出都是短名 */
        reg('屏蔽理由：' + (on.indexOf(t) !== -1 ? BOX_ON : BOX_OFF) + (TAG_SHOW[t] || t), () => toggleTagOnCurrent(t));
      });
    }

    // D. 名单维护：四条常驻，空名单也不撤项；点下去才说明"没有可导出的内容"
    const n = BLOCK.length;
    reg('导出首页屏蔽名单（' + n + ' 条，JSON，不含标签）', () => exportBlock(false));
    reg('导出首页屏蔽名单（' + n + ' 条，JSON，含标签 ⚠ 个人判断）', () => exportBlock(true));
    reg('导出加密包（' + n + ' 条，口令保护，含标签与 BV/标题）', () => exportEncrypted());
    reg('导入首页屏蔽名单（合并）', () => importBlock());
    reg('清空首页屏蔽名单', () => clearBlock());

    /* E. 诊断行：只在“类名认不出卡片、已经按形状兜底”或“有卡片但一张都没认出”
       时出现；正常页面完全没有这一行。点它没有反应，纯提示。 */
    if (isHomeFeed()) {
      if (shapeEver) {
        reg('⚠️ 卡片类名疑似改版，已按形状兜底（只作提示）', () => {});
      } else if (!classCardCount() && document.querySelectorAll(VIDEO_LINK).length >= 3) {
        reg('⚠️ 首页有卡片但一个都没认出（可能改版）', () => {});
      }
    }
  }

  function classCardCount() {
    return document.querySelectorAll(CARD).length;
  }

  function applyNow() {
    if (scanT) { clearTimeout(scanT); scanT = 0; }
    scanGuarded();
  }

  function toggle(k) {
    ENABLE[k] = !ENABLE[k];
    save();
    buildMenu(); // 重画菜单文字，反映新状态
    applyNow(); // 立刻生效：关掉会摘标记，打开会补打
  }

  /** 兜底：路由变了（B 站是前端路由，同一个 tab 内换页不重载）就立刻重扫一次；
      另外低频补扫——charData 变化（卡片被复用、标题被原地改写）不在观察范围内，
      靠这一轮兜住。3s 只在页面可见时跑（调度器负责暂停与补跑）。
      这里只管扫描与路由/UP 识别；名单重读由 blockPoll 按规模分档单独跑，
      所以名单再大，首页的扫描节奏也不变。 */
  let href = location.href;
  function heartbeat() {
    const moved = href !== location.href;
    if (moved) href = location.href;
    const cur = isVideoPage() ? bvidFromUrl() : '';
    // 换了视频（moved 能漏掉：地址变化但 href 判断被同一次心跳吞掉、或 BV 变了而 UP 没变）
    // 一律以"地址栏的 BV 和手上这份 VIDEO 对不上"为准，直接重识别
    const stale = !!VIDEO && !!cur && !!VIDEO.bvid && VIDEO.bvid !== cur;
    if (moved || stale || (!VIDEO && cur)) resolveVideo(true);
    if (!isVideoPage() && VIDEO) { VIDEO = null; buildMenu(); }
    scanGuarded();
    if (menuDirty) { menuDirty = false; buildMenu(); }
  }

  /* ---------------------------------------------------------
   * 启动
   * ------------------------------------------------------- */
  function start() {
    const style = document.createElement('style');
    style.textContent =
      /* ---- 广告卡片：图片 + 文字上下翻转，不随悬停还原 ---- */
      FLIP.map((s) => '[' + MARK + '="ad"] ' + s).join(',') +
      '{' +
      'transform:scaleY(-1) !important;' +
      'transform-origin:center !important;' +
      '}' +
      /* ---- 推荐位/直播卡片/屏蔽名单卡片：整张卡左右翻转 ---- */
      /* 整卡一起翻，卡片内部布局会镜像（角标从右移到左），最直观 */
      '[' + MARK + '="flip"],[' + MARK + '="block"]{' +
      'transform:scaleX(-1) !important;' +
      'transform-origin:center !important;' +
      '}' +
      /* ---- 不可点击：点击不跳转、不触发任何交互 ---- */
      /* 独立属性而不是挂在 data-bbm 上：翻转与禁点是两件事，可以分别开关。
         卡片本身用 pointer-events:none 就足以让点击穿透；
         再加一条后代规则，防止 B 站给子元素显式设了 pointer-events:auto */
      '[' + LOCK + ']{pointer-events:none !important;}' +
      '[' + LOCK + '] *{pointer-events:none !important;}' +
      /* ---- 顺手保留（只作用于广告卡）：标题白、播放量灰 ---- */
      '[' + MARK + '="ad"] .bili-video-card__info--tit{' +
      'color:#fff !important;' +
      '}' +
      '[' + MARK + '="ad"] .bili-video-card__stats{' +
      'color:#b3b3b3 !important;' +
      '}' +
      '[' + MARK + '="ad"] .bili-video-card__stats svg{' +
      'filter:grayscale(1) brightness(1.15) !important;' +
      '}';
    // document-start 时 head 可能还没有，直接挂到 documentElement 上，规则照样生效
    (document.head || document.documentElement).appendChild(style);

    if (stopped) return;
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      // class / href 变化：B 站复用卡片时不一定替换节点，
      // 可能只改 class 或把链接从直播间换成视频页
      attributes: true,
      attributeFilter: ['class', 'href'],
    });

    every(3000, heartbeat); // 扫描兜底 + 路由/UP 识别，固定 3 秒
    every(blockPollMs, blockPoll); // 读名单，按名单规模分档放宽
    refreshBlock();
    resolveVideo(false);
    buildMenu();
    diagKey = diagState(); // 首轮扫描前就记下基线，避免开机后为“状态没变”多读一次整份
    scanGuarded(); // 首次同步扫，不等防抖，避免首屏广告卡多闪一拍
  }

  /* documentElement 尚未建立时（document-start 极早时机），
     用 rAF 轮询等它出现再启动，避免样式注入失败导致这段期间不处理/闪烁 */
  function waitRoot(cb) {
    if (document.documentElement) return cb();
    const tick = () => {
      if (document.documentElement) cb();
      else (window.requestAnimationFrame || setTimeout)(tick, 0);
    };
    tick();
  }

  if (OFF) return; // ?bbm=off：本页什么都不做
  waitRoot(start);
})();
