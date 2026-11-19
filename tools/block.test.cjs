/* jsdom 回归：在 Node 里把整份用户脚本跑起来，断言开关、翻转标记、屏蔽匹配、
   双存储键与索引自愈、分档轮询、导出/导入/加密。运行：npm test
   断言名以 PASS/FAIL 开头，退出码非 0 表示有失败。 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SCRIPT = fs.readFileSync(
  path.join(__dirname, '..', 'tampermonkey', 'bilibili-home-flip-block.user.js'),
  'utf8'
);

const log = (ok, name, extra) => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  →  ' + extra : ''));
  if (!ok) process.exitCode = 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function boot({ url, html, store }) {
  const dom = new JSDOM(html, {
    url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const menus = [];
  const alerts = [];
  const prompts = [];
  const promptMsgs = [];
  const logs = [];
  let confirmQueue = [];
  let lastBlob = null;
  let downloads = [];

  win.GM_getValue = (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d);
  win.GM_setValue = (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); };
  let menuId = 1;
  win.GM_registerMenuCommand = (label, fn) => {
    const id = menuId++;
    menus.push({ id, label, fn });
    return id;
  };
  win.GM_unregisterMenuCommand = (id) => {
    const i = menus.findIndex((m) => m.id === id);
    if (i >= 0) menus.splice(i, 1);
  };
  win.alert = (m) => alerts.push(String(m));
  // 名单查看改走 console：把 log/table 收起来备查
  win.console = {
    log: (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')),
    table: (rows) => logs.push('TABLE ' + JSON.stringify(rows)),
    warn: () => {},
    error: () => {},
    info: (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')),
  };
  win.confirm = () => (confirmQueue.length ? confirmQueue.shift() : false);
  win.prompt = (msg) => {
    promptMsgs.push(String(msg));
    return prompts.length ? prompts.shift() : null;
  };
  win.HTMLAnchorElement.prototype.click = function () {
    if (this.download) downloads.push(this.download);
  };
  win.URL.createObjectURL = (blob) => { lastBlob = blob; return 'blob:mock'; };
  win.URL.revokeObjectURL = () => {};
  // 加密导出需要 WebCrypto 与 TextEncoder/Decoder（jsdom 默认都没有）
  Object.defineProperty(win, 'crypto', { value: require('crypto').webcrypto, configurable: true });
  win.TextEncoder = TextEncoder;
  win.TextDecoder = TextDecoder;

  const before = menus.slice();
  win.eval(SCRIPT);

  const menu = (labelRe) => {
    // 每次 buildMenu 都会清空重注册，所以取最新那批
    const found = menus.filter((m) => labelRe.test(m.label));
    return found[found.length - 1];
  };

  return {
    win, store, menus, alerts, prompts, promptMsgs, downloads, logs,
    setPrompts: (arr) => { prompts.length = 0; arr.forEach((v) => prompts.push(v)); },
    setConfirms: (arr) => { confirmQueue = arr.slice(); },
    getBlob: () => lastBlob,
    menu,
    // 最近一次进 console 的全部内容（一组输出通常 3 行）
    lastLog: () => logs.slice(-5).join('\n'),
    allLogs: () => logs.join('\n'),
  };
}

const CARD = (uid, name) =>
  '<div class="bili-video-card">' +
  '<a class="bili-video-card__info--owner" href="//space.bilibili.com/' + uid + '">' + name + '</a>' +
  '<div class="bili-video-card__info--tit">t</div>' +
  '</div>';

// 菜单是扁平的，分组只靠前缀符号（▦ ⊘ # ☰ ⌕ ✱ ↺ ⇩ ⇧ ⌫ ⊕ ⊖）

(async () => {
  /* ---------------- 1. 首页：命中名单 → 左右翻转 + 禁点 ---------------- */
  {
    const store = { 'bbm:blocked': [{ uid: '12345', name: '张三', bvid: 'BV1xx411c7mD', title: 'T', reason: '', at: 1 }] };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body>' + CARD('12345', '张三') + CARD('99999', '路人') + '</body>', store });
    await sleep(200);
    const cards = env.win.document.querySelectorAll('.bili-video-card');
    log(cards[0].getAttribute('data-bbm') === 'block', '命中名单的卡片被标记为 block');
    log(cards[1].getAttribute('data-bbm') === null, '未命中的卡片不动');
    const css = env.win.document.querySelector('style').textContent;
    log(css.indexOf('[data-bbm="block"]') !== -1 && css.indexOf('scaleX(-1)') !== -1, 'block 走左右翻转', '');
    log(css.indexOf('[data-bbm-lock] *{pointer-events:none') !== -1, '禁点挂在自己的属性上');
    log(cards[0].getAttribute('data-bbm-lock') === '1', '命中名单的卡片默认禁止点击');

    // 存储里删掉这个人（两个键一起写，等价于另一个标签页导入/清空）→ 3s 轮询摘标记
    store['bbm:blocked'] = [];
    store['bbm:blocked:uids'] = 'v1|0|';
    await sleep(3300);
    log(cards[0].getAttribute('data-bbm') === null, '名单清空后 3s 内轮询摘掉标记');
  }

  /* ---------------- 1b. 只在首页生效：播放页/搜索页不翻转 ---------------- */
  {
    const store = { 'bbm:blocked': [{ uid: '12345', name: '张三', at: 1 }] };
    const env = boot({
      url: 'https://www.bilibili.com/video/BV1xx411c7mD/',
      html: '<body>' + CARD('12345', '张三') + '</body>',
      store,
    });
    await sleep(200);
    log(env.win.document.querySelector('.bili-video-card').getAttribute('data-bbm') === null, '播放页推荐栏不算首页，不翻转');
  }
  {
    const store = { 'bbm:blocked': [{ uid: '12345', name: '张三', at: 1 }] };
    const env = boot({
      url: 'https://search.bilibili.com/all?keyword=x',
      html: '<body>' + CARD('12345', '张三') + '</body>',
      store,
    });
    await sleep(200);
    log(env.win.document.querySelector('.bili-video-card').getAttribute('data-bbm') === null, '搜索页不翻转');
  }

  /* ---------------- 2. 视频页：识别 UP、记录 BV 与标题 ---------------- */
  {
    const store = {};
    const env = boot({
      url: 'https://www.bilibili.com/video/BV1xx411c7mD/?spm_id_from=333.1007&vd_source=abc123&t=1.2&p=2',
      html: '<body><h1 class="video-title" title="标题A">标题A</h1></body>',
      store,
    });
    env.win.__INITIAL_STATE__ = {
      bvid: 'BV1xx411c7mD',
      videoData: { owner: { mid: 12345, name: '张三' }, title: '标题A' },
    };
    // document-start 时 state 还没注入：靠心跳补识别
    await sleep(3400);

    const m = env.menu(/^UP：张三/);
    log(!!m, '视频页注册了 UP 行', m && m.label);
    log(!!m && m.label === 'UP：张三；要屏蔽就点下面的理由', '未屏蔽时这一行写名字加提示', m && m.label);

    // 菜单格式：类别：两个状态并列，当前那个打勾
    const labels = env.menus.map((x) => x.label);
    log(!!env.menu(/^↕️ 首页广告位：上下翻转$/), '广告卡翻转：生效时用 ↕️ 标出方向');
    log(!!env.menu(/^✅ 首页广告位：禁止点击$/), '广告卡点击：同一类别名 + 另一种状态');
    const flips = labels.filter((l) => /^(↕️|↔️) /.test(l));
    const checks = labels.filter((l) => /^✅ 首页/.test(l));
    log(flips.length === 4 && checks.length === 4, '四档翻转用方向图标、四档禁点仍用 ✅',
      flips.length + '/' + checks.length);
    log(flips.filter((l) => /↕️/.test(l)).length === 1, '只有广告位是 ↕️', flips.join(' | '));
    log(!env.menu(/全部开启|全部关闭/), '没有全局一键开关');
    log(!env.menu(/新增标签|删除标签/), '菜单里不再有新增/删除标签');

    const box = env.menu(/^屏蔽理由：⬜ 标题党（封面 \/ 标题不符 \/ 悬疑）$/);
    log(!!box, '标签是空框', box && box.label);

    // UP 行是纯展示：点它弹一条状态，不问问题、不改名单
    const beforePrompts = env.promptMsgs.length;
    m.fn();
    log(env.promptMsgs.length === beforePrompts, '展示行点了不问任何问题（不弹 prompt）');
    log((store['bbm:blocked'] || []).length === 0, '展示行点了不改名单');
    log(env.alerts.length === 0, '展示行点了不弹任何框', env.alerts.join(' | ').slice(0, 80));

    // 屏蔽靠标签：点一次理由即入名单
    env.menu(/^屏蔽理由：⬜ 标题党（封面 \/ 标题不符 \/ 悬疑）$/).fn();
    const list = store['bbm:blocked'] || [];
    log(list.length === 1, '点一项理由 = 入名单', JSON.stringify(list));
    const e = list[0] || {};
    log(e.uid === '12345', 'uid 正确', e.uid);
    log(e.bvid === 'BV1xx411c7mD', 'BV 只存纯号，丢掉 spm_id_from / vd_source / p / t', e.bvid);
    log(e.title === '标题A', '标题被记录', e.title);
    log((e.tags || []).join('/') === '标题党', '点中的那项理由成了第一条标签', JSON.stringify(e.tags));
    const agg = env.menu(/^⛔ 已屏蔽该UP：张三/);
    log(!!agg && agg.label === '⛔ 已屏蔽该UP：张三（标题党）', '展示行改成已屏蔽UP并附理由', agg && agg.label);
    log(!env.menu(/^查看首页屏蔽名单/), '没有"查看名单"这个菜单项（看名单靠导出）');
    const ex = env.menu(/JSON，不含标签/);
    log(!!ex && ex.label === '导出首页屏蔽名单（1 条，JSON，不含标签）', '导出项写明能导出几条', ex && ex.label);
    log((env.menu(/导出首页屏蔽名单（含标签|含标签 ⚠/) || {}).label === '导出首页屏蔽名单（1 条，JSON，含标签 ⚠ 个人判断）',
      '含标签那条也写条数', (env.menu(/JSON，含标签/) || {}).label);
    log(!env.menu(/搜索名单|批量删除|回滚/), '名单维护里没有搜索 / 批量删除 / 回滚');

    // 取消最后一项理由 = 把人移出名单
    env.menu(/^屏蔽理由：✅ 标题党（封面 \/ 标题不符 \/ 悬疑）$/).fn();
    log((store['bbm:blocked'] || []).length === 0, '取消最后一个理由 = 移出名单', JSON.stringify(store['bbm:blocked']));
    log(env.menu(/^UP：张三/) && env.menu(/^UP：张三/).label === 'UP：张三；要屏蔽就点下面的理由', '移出后展示行回到名字加提示');

    // 多选
    env.menu(/^屏蔽理由：⬜ 恰饭广告（软广 \/ 暗广 \/ 恰烂钱 \/ 带货）$/).fn();
    env.menu(/^屏蔽理由：⬜ 引战带节奏（蹭热度 \/ 蹭事故 \/ 删评）$/).fn();
    log((((store['bbm:blocked'] || [])[0] || {}).tags || []).join('/') === '恰饭广告/引战带节奏', '可以多选', JSON.stringify((store['bbm:blocked'] || [])[0].tags));
    log(!!env.menu(/^⛔ 已屏蔽该UP：张三（恰饭广告）$/), '多条理由时行里只写第一条', JSON.stringify((store['bbm:blocked'] || [])[0].tags));

    // 只取消其中一个：人还在名单里，理由减一
    env.menu(/^屏蔽理由：✅ 恰饭广告（软广 \/ 暗广 \/ 恰烂钱 \/ 带货）$/).fn();
    log((((store['bbm:blocked'] || [])[0] || {}).tags || []).join('/') === '引战带节奏', '取消一项理由仍留在名单', JSON.stringify((store['bbm:blocked'] || [])[0].tags));

    // 点已屏蔽那一行：什么也不弹，状态与理由已经写在行里
    const beforeAlerts2 = env.alerts.length;
    const beforePrompts2 = env.promptMsgs.length;
    env.menu(/^⛔ 已屏蔽该UP：张三/).fn();
    log(env.alerts.length === beforeAlerts2 && env.promptMsgs.length === beforePrompts2, '已屏蔽行点了也不弹框');
    log(/引战带节奏/.test(env.menu(/^⛔ 已屏蔽该UP：张三/).label), '行里已经写出理由', env.menu(/^⛔ 已屏蔽该UP：张三/).label);

    // 取消最后一项
    env.menu(/^屏蔽理由：✅ 引战带节奏（蹭热度 \/ 蹭事故 \/ 删评）$/).fn();
    log((store['bbm:blocked'] || []).length === 0, '理由清空即移出名单');
  }

  /* ---------------- 2b. 标签表固定：菜单里 9 项，没有自定义 ---------------- */
  {
    const store = {};
    const env = boot({
      url: 'https://www.bilibili.com/video/BV1xx411c7mD/',
      html: '<body></body>',
      store,
    });
    env.win.__INITIAL_STATE__ = { bvid: 'BV1xx411c7mD', videoData: { owner: { mid: 12345, name: '张三' }, title: '标题A' } };
    await sleep(3400);

    const rows = env.menus.filter((x) => /^屏蔽理由：/.test(x.label)).map((x) => x.label);
    log(rows.length === 9, '标签固定 9 行', String(rows.length));
    log(rows[rows.length - 2].indexOf('其他') !== -1 && rows[rows.length - 1].indexOf('不再关注') !== -1,
      '「其他」在倒数第二、「不再关注」在最后', rows.slice(-2).join(' | '));
    log(!rows.some((l) => /（空）|自定义/.test(l)), '没有自定义标签入口');

    env.menu(/^屏蔽理由：⬜ 内容注水（云评测 \/ 合集 \/ 切片）$/).fn();
    log((store['bbm:blocked'] || []).length === 1, '屏蔽时不弹输入框，直接进名单');
  }

  /* ---------------- 3. 导出：拆两条，默认那条不含标签 ---------------- */
  {
    const store = {
      'bbm:blocked': [
        { uid: '12345', name: '张三', bvid: 'BV1xx411c7mD', title: '标题A', tags: ['标题党'], at: 1 },
      ],
    };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
    await sleep(200);

    env.menu(/导出首页屏蔽名单（\d+ 条，JSON，不含标签）/).fn();
    const plain = await env.getBlob().text();
    const pj = JSON.parse(plain);
    log(pj.entries.length === 1, '不含标签：条目数正确');
    log(!('tags' in pj.entries[0]) && !('reason' in pj.entries[0]), '不含标签：文件里没有 tags / reason 字段', JSON.stringify(pj.entries[0]));
    log(!('tags' in pj), '不含标签：文件里也没有标签表');
    log(env.downloads[0] === 'bbm-blocked-' + new Date().toISOString().slice(0, 10) + '.json', '不含标签：文件名无 with-tags', env.downloads[0]);
    const cnKey = /"[^"]*[\u4e00-\u9fa5][^"]*"\s*:/;
    log(!cnKey.test(plain), '导出 JSON 的 key 里没有中文', plain.slice(0, 120));

    // 含标签：confirm 取消 → 不出文件，并且要明确告诉用户"取消了"
    env.setConfirms([false]);
    const n0 = env.downloads.length;
    env.menu(/导出首页屏蔽名单（\d+ 条，JSON，含标签/).fn();
    log(env.downloads.length === n0, '含标签：confirm 取消则不下文件');
    log(env.alerts.some((m) => m.indexOf('已取消') !== -1), '含标签：取消时给出明确提示，不是静默返回', env.alerts.join(' | '));

    // 环境里没有 confirm（管理器不发弹窗）→ 照常导出，导出后再提示风险
    {
      const e3 = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
      await sleep(200);
      e3.win.confirm = undefined;
      const n3 = e3.downloads.length;
      e3.menu(/导出首页屏蔽名单（\d+ 条，JSON，含标签/).fn();
      log(e3.downloads.length === n3 + 1, '没有 confirm 也照样导出', e3.downloads[e3.downloads.length - 1]);
      log(e3.alerts.some((m) => m.indexOf('个人主观判断') !== -1), '没有 confirm 时导出后补风险提示', e3.alerts.join(' | '));
    }

    env.setConfirms([true]);
    env.menu(/导出首页屏蔽名单（\d+ 条，JSON，含标签/).fn();
    const withT = JSON.parse(await env.getBlob().text());
    log((withT.entries[0].tags || []).join('/') === '标题党', '含标签：标签在文件里');
    log(Array.isArray(withT.tags) && withT.tags.indexOf('标题党') !== -1, '含标签：连标签表一起带上');
    log(env.downloads[env.downloads.length - 1].indexOf('with-tags') !== -1, '含标签：文件名带 with-tags', env.downloads[env.downloads.length - 1]);
    log(withT.format === 'bbm-blocklist' && typeof withT.scriptVersion === 'string', '含标签：meta 里带格式与脚本版本', String(withT.scriptVersion));
    const sc = withT.tagSchema || {};
    log(sc['恰饭广告'] && sc['恰饭广告'].name === '恰饭广告' && Array.isArray(sc['恰饭广告'].covers)
      && sc['恰饭广告'].covers.join('|') === '软广|暗广|恰烂钱|带货', '含标签：tagSchema 描述覆盖范围', JSON.stringify(sc['恰饭广告']));
    log(typeof sc['恰饭广告'].display === 'string' && sc['恰饭广告'].display.indexOf('（') !== -1, '含标签：tagSchema 带展示写法', String(sc['恰饭广告'].display));
    log(!!(sc['不再关注'] && sc['不再关注'].name === '不再关注' && !sc['不再关注'].covers), '含标签：无近义说法的标签只有 name', JSON.stringify(sc['不再关注']));
    log(!('tagSchema' in pj), '不含标签：文件里也不带标签描述');
  }

  /* ---------------- 3c. BV 与标题永不出现在导出里 ---------------- */
  {
    const store = {
      'bbm:blocked': [
        { uid: '12345', name: '张三', bvid: 'BV1xx411c7mD', title: '标题A', tags: ['标题党'], at: 1 },
      ],
    };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
    await sleep(200);

    log(!env.menu(/导出带上 BV|导出带 BV/), '菜单里没有"导出带上 BV"这类开关');

    env.menu(/JSON，不含标签/).fn();
    const a = JSON.parse(await env.getBlob().text());
    log(!('bvid' in a.entries[0]) && !('title' in a.entries[0]), '不含标签那份：没有 bvid / title', JSON.stringify(a.entries[0]));

    env.setConfirms([true]);
    env.menu(/JSON，含标签/).fn();
    const b = JSON.parse(await env.getBlob().text());
    log(!('bvid' in b.entries[0]) && !('title' in b.entries[0]), '含标签那份：同样没有 bvid / title', JSON.stringify(b.entries[0]));
    log((b.entries[0].tags || []).join('/') === '标题党', '含标签那份：标签照旧在');
    log(!/BV1xx411c7mD/.test(JSON.stringify(b)) && !/标题A/.test(JSON.stringify(b)), '整份文件里搜不到 BV 与标题',
      JSON.stringify(b).slice(0, 160));

    // 清空前的自动备份也守同一条规矩
    env.setConfirms([true]);
    env.menu(/清空首页屏蔽名单/).fn();
    const bk = JSON.parse(await env.getBlob().text());
    log(!('bvid' in bk.entries[0]) && !('title' in bk.entries[0]), '备份里也没有 bvid / title', JSON.stringify(bk.entries[0]));
  }

  /* ---------------- 3d. 加密导出：口令门槛 + 能解回来 ---------------- */
  {
    const store = {
      'bbm:blocked': [
        { uid: '12345', name: '张三', bvid: 'BV1xx411c7mD', title: '标题A', tags: ['标题党'], at: 1 },
      ],
    };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
    await sleep(200);

    const item = env.menu(/^导出加密包/);
    log(!!item && item.label === '导出加密包（1 条，口令保护，含标签与 BV/标题）', '菜单里有加密包一项，并写条数',
      item && item.label);

    const n0 = env.downloads.length;
    // 太短
    env.setPrompts(['Ab1!short']);
    item.fn();
    await sleep(60);
    log(env.downloads.length === n0, '太短的口令不导出');
    log(env.alerts.some((m) => m.indexOf('口令不合格') !== -1), '太短：明确说口令不合格', env.alerts.join(' | '));
    log(env.alerts.some((m) => m.indexOf('口令至少 12 位') !== -1), '门槛是 12 位', env.alerts.join(' | '));
    log(env.promptMsgs.some((m) => m.indexOf('不能自动填充') !== -1), '提示里写明不能自动填充');

    // 长度够但缺大写 / 缺数字 / 缺特殊字符
    const cases = [
      ['abcdefghijklmnop1!', '缺大写'],
      ['Abcdefghijklmnop1', '缺特殊字符'],
      ['Abcdefghijklmnop!', '缺数字'],
    ];
    for (const [pwd, why] of cases) {
      env.setPrompts([pwd]);
      item.fn();
      await sleep(60);
      log(env.downloads.length === n0, why + '：不导出');
    }
    log(env.alerts.some((m) => m.indexOf('缺少大写字母') !== -1), '缺大写：提示缺大写');
    log(env.alerts.some((m) => m.indexOf('缺少特殊字符') !== -1), '缺特殊：提示缺特殊字符');
    log(env.alerts.some((m) => m.indexOf('缺少数字') !== -1), '缺数字：提示缺数字');

    // 只问一次：不再要第二遍确认
    {
      const nBefore = env.promptMsgs.length;
      env.setPrompts(['Bbm-2026-Kill!Ads#7']);
      item.fn();
      await sleep(400);
      log(env.promptMsgs.length === nBefore + 1, '口令只问一次', '问了几次：' + (env.promptMsgs.length - nBefore));
    }

    // 12 位过线：能生成文件
    {
      const PWD12 = 'Abcdefgh1!xy';
      const n1 = env.downloads.length;
      env.setPrompts([PWD12]);
      item.fn();
      await sleep(400);
      log(env.downloads.length > n1, '正好 12 位 + 四类齐全：可以导出',
        env.downloads[env.downloads.length - 1]);
    }

    // 合格口令：一旦通过就落文件
    const PWD = 'Bbm-2026-Kill!Ads#7';
    env.setPrompts([PWD]);
    const n2 = env.downloads.length;
    item.fn();
    await sleep(400);
    log(env.downloads.length === n2 + 1, '合格口令：生成文件', env.downloads[env.downloads.length - 1]);
    log(/enc\.json$/.test(env.downloads[env.downloads.length - 1]), '加密包文件名带 -enc', env.downloads[env.downloads.length - 1]);
    const packRaw = await env.getBlob().text();
    const pack = JSON.parse(packRaw);
    log(pack.format === 'bbm-blocklist-enc' && typeof pack.ct === 'string' && pack.ct.length > 20, '文件是加密包结构', pack.format);
    log(!/张三|BV1xx411c7mD|标题A|标题党/.test(packRaw), '加密包里看不到任何明文（名字 / BV / 标题 / 标签）', packRaw.slice(0, 120));
    log(pack.kdf && pack.kdf.iterations === 200000, 'PBKDF2 轮数写进文件', String(pack.kdf && pack.kdf.iterations));

    // 换个环境导入：贴加密包 + 对口令 → 连 BV 与标题一起还原
    {
      const store2 = {};
      const e2 = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store: store2 });
      await sleep(200);
      e2.setPrompts([packRaw, PWD]);
      e2.menu(/^导入首页屏蔽名单/).fn();
      await sleep(400);
      const got = (store2['bbm:blocked'] || [])[0] || {};
      log(got.uid === '12345' && got.name === '张三', '解密导入：条目回来了', JSON.stringify(got));
      log(got.bvid === 'BV1xx411c7mD' && got.title === '标题A', '解密导入：BV 与标题也在（这是加密包独有的）', JSON.stringify(got));
      log((got.tags || []).join('/') === '标题党', '解密导入：标签也在');
    }

    // 口令错：一条都不改
    {
      const store3 = { 'bbm:blocked': [{ uid: '99999', name: '原有', tags: [], at: 1 }] };
      const e3 = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store: store3 });
      await sleep(200);
      e3.setPrompts([packRaw, 'Wrong-Pass!2026Xy']);
      e3.menu(/^导入首页屏蔽名单/).fn();
      await sleep(400);
      log((store3['bbm:blocked'] || []).length === 1, '口令错：名单原样不动', JSON.stringify(store3['bbm:blocked']));
      log(e3.alerts.some((m) => m.indexOf('解不开') !== -1), '口令错：提示解不开', e3.alerts.join(' | '));
    }
  }

  /* ---------------- 3e. 导入只收干净形状：多一个字段就拒 ---------------- */
  {
    const base = {
      'bbm:blocked': [{ uid: '99999', name: '原有', tags: [], at: 1 }],
    };

    // 加密包被顺手加了口令字段
    async function tampered(packExtra, pwd) {
      const store = JSON.parse(JSON.stringify(base));
      const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
      await sleep(200);
      env.setPrompts([JSON.stringify(packExtra), pwd || 'Bbm-2026-Kill!Ads#7']);
      env.menu(/^导入首页屏蔽名单/).fn();
      await sleep(300);
      return { store, env };
    }

    const pack = {
      format: 'bbm-blocklist-enc', v: 1,
      kdf: { algo: 'PBKDF2-SHA256', iterations: 200000 },
      salt: 'AAAA', iv: 'BBBB', ct: 'CCCC',
      note: '口令没有存在任何地方，忘了就解不开这份文件。',
      pwd: 'Bbm-2026-Kill!Ads#7',
    };
    let r = await tampered(pack);
    log(r.store['bbm:blocked'].length === 1, '加密包带 pwd 字段：拒绝导入，名单不动');
    log(r.env.alerts.some((m) => m.indexOf('pwd') !== -1), '加密包带 pwd 字段：提示里点名 pwd', r.env.alerts.join(' | '));
    log(!r.env.promptMsgs.some((m) => m.indexOf('输入导出时设的口令') !== -1), '带 pwd 字段时连口令都不问');

    // note 被改写但在合法字段里：仍然放行（我们认证不了 note 的内容）
    // kdf 里塞额外字段
    const p2 = JSON.parse(JSON.stringify(pack));
    delete p2.pwd;
    p2.kdf.hint = 'pwd-is-here';
    r = await tampered(p2);
    log(r.store['bbm:blocked'].length === 1 && r.env.alerts.some((m) => m.indexOf('kdf') !== -1), 'kdf 带额外字段：拒绝',
      r.env.alerts.join(' | '));

    // 明文名单的条目里塞备注
    const listPack = {
      v: 3,
      entries: [{ uid: '12345', name: '张三', at: 1, remark: 'pwd: abc' }],
      exportedAt: '2026-11-19T00:00:00.000Z',
      count: 1,
    };
    {
      const store = JSON.parse(JSON.stringify(base));
      const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
      await sleep(200);
      env.setPrompts([JSON.stringify(listPack)]);
      env.menu(/^导入首页屏蔽名单/).fn();
      await sleep(200);
      log(store['bbm:blocked'].length === 1, '条目带 remark：拒绝导入');
      log(env.alerts.some((m) => m.indexOf('remark') !== -1), '条目带 remark：提示里点名 remark', env.alerts.join(' | '));
    }

    // 顶层多一个 note 也算
    {
      const store = JSON.parse(JSON.stringify(base));
      const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
      await sleep(200);
      env.setPrompts([JSON.stringify({ v: 3, entries: [{ uid: '12345', name: '张三', at: 1 }], note: 'pwd 123' })]);
      env.menu(/^导入首页屏蔽名单/).fn();
      await sleep(200);
      log(store['bbm:blocked'].length === 1, '顶层带 note：拒绝导入');
      log(env.alerts.some((m) => m.indexOf('note') !== -1), '顶层带 note：提示里点名 note', env.alerts.join(' | '));
    }
  }

  /* ---------------- 3b. 名单为空时，四条维护项仍然在 ---------------- */
  {
    const store = { 'bbm:blocked': [] };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
    await sleep(200);
    log(!env.menu(/^查看首页屏蔽名单/), '空名单：也没有"查看名单"项');
    log((env.menu(/JSON，不含标签/) || {}).label === '导出首页屏蔽名单（0 条，JSON，不含标签）',
      '空名单：导出项写明 0 条', (env.menu(/JSON，不含标签/) || {}).label);
    log(!!env.menu(/导出首页屏蔽名单（\d+ 条，JSON，不含标签）/), '空名单：导出（不含标签）还在');
    log(!!env.menu(/导出首页屏蔽名单（\d+ 条，JSON，含标签/), '空名单：导出（含标签）还在');
    log(!!env.menu(/^导入首页屏蔽名单/), '空名单：导入还在');
    log(!!env.menu(/^清空首页屏蔽名单$/), '空名单：清空还在');

    const n = env.downloads.length;
    env.menu(/导出首页屏蔽名单（\d+ 条，JSON，不含标签）/).fn();
    log(env.downloads.length === n, '空名单：导出不会生成空文件');
    log(env.alerts.some((m) => m.indexOf('名单是空的') !== -1), '空名单：点导出会说明原因', env.alerts.join(' | '));
  }

  /* ---------------- 4b. 老存档里的 reason 不再兼容 ---------------- */
  {
    const store = {
      'bbm:blocked': [{ uid: '12345', name: '张三', title: 'T', reason: '当年手填的理由', at: 1 }],
    };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
    await sleep(200);
    // 老理由不再兼容：存档里直接不留 reason 字段，导出里也读不到
    env.menu(/导出首页屏蔽名单（\d+ 条，JSON，不含标签）/).fn();
    const raw = await env.getBlob().text();
    log(raw.indexOf('当年手填的理由') === -1, '导出里没有旧理由', raw.slice(0, 160));
    const pj = JSON.parse(raw);
    log(!('reason' in pj.entries[0]) && (pj.entries[0].tags || []).length === 0, '老条目没有标签时 tags 为空', JSON.stringify(pj.entries[0]));
  }
  {
    const store = {
      'bbm:blocked': [{ uid: '12345', name: '张三', bvid: 'BV1xx411c7mD', title: '旧标题', tags: ['标题党'], at: 1 }],
    };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
    await sleep(200);

    const payload = JSON.stringify({
      v: 3,
      entries: [
        { uid: '12345', name: '', bvid: 'BV1yy411c7mE', title: '文件标题', tags: ['恰饭广告'], at: 2 },
        { uid: 'abc', name: '非法 uid', at: 3 },
        { uid: '67890', name: '李四', bvid: 'BV1zz411c7mF', title: '新标题', tags: ['新标签Q', 'x'.repeat(80)], at: 4 },
        'not-an-object',
      ],
    });
    env.setPrompts([payload]);
    env.menu(/导入首页屏蔽名单（合并）/).fn();

    const list = store['bbm:blocked'];
    log(list.length === 2, '脏条目被丢弃，只多一条', JSON.stringify(list.map((e) => e.uid)));
    const a = list.filter((e) => e.uid === '12345')[0];
    log((a.tags || []).join('/') === '标题党/恰饭广告', '标签取并集，本地的不被覆盖', JSON.stringify(a.tags));
    log(a.bvid === 'BV1xx411c7mD' && a.title === '旧标题', '本地非空字段不被文件覆盖');
    const b = list.filter((e) => e.uid === '67890')[0];
    log(b && (b.tags || []).join('/') === '其他', '表外标签折叠成「其他」', JSON.stringify(b && b.tags));
    log(!('bbm:tags' in store), '导入不再写标签表');
    log(!!env.alerts.pop(), '导入后有汇总提示');

    // 带 reason 的旧形状：没发布过，直接拒绝整份
    env.setPrompts([JSON.stringify({ v: 3, entries: [{ uid: '55555', name: '老条目', reason: '旧备注', at: 5 }] })]);
    env.menu(/导入首页屏蔽名单（合并）/).fn();
    log(store['bbm:blocked'].length === 2, '条目带 reason：整份拒绝');
    log(env.alerts.some((m) => m.indexOf('reason') !== -1), '条目带 reason：提示里点名 reason', env.alerts.join(' | '));
  }

  /* ---------------- 5. 名单管理：编号 / 搜索 / 批量 / 回滚 / 清空 ---------------- */
  {
    const store = {
      'bbm:blocked': [
        { uid: '12345', name: '张三', bvid: 'BV1xx411c7mD', title: 'T', tags: ['标题党'], at: 1 },
        { uid: '67890', name: '张三', bvid: 'BV1yy411c7mE', title: 'T2', tags: [], at: 2 },
      ],
    };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
    await sleep(200);

    // 没有"查看"入口之后，两条都在导出里，标签与条号不再由控制台承担
    log(!env.menu(/^查看首页屏蔽名单/), '没有"查看名单"项');
    env.menu(/导出首页屏蔽名单（\d+ 条，JSON，不含标签）/).fn();
    const plain2 = JSON.parse(await env.getBlob().text());
    log(plain2.entries.length === 2 && plain2.entries[0].name === '张三', '两个同名的人都在导出里（按 uid 区分）', JSON.stringify(plain2.entries.map((x) => x.uid)));

    // 搜索 / 批量删除 / 回滚 / 批量打标签都已移除
    log(!env.menu(/搜索名单|批量删除|回滚|批量打标签/), '菜单里没有搜索 / 批量删除 / 回滚 / 批量打标签');

    // 清空：先确认，默认先导一份带标签的备份
    const nDl = env.downloads.length;
    env.setConfirms([false]);
    env.menu(/清空首页屏蔽名单/).fn();
    log((store['bbm:blocked'] || []).length > 0, '清空时点取消：名单不动');
    log(env.downloads.length === nDl, '清空时点取消：不导出');

    env.setConfirms([true]);
    env.menu(/清空首页屏蔽名单/).fn();
    log((store['bbm:blocked'] || []).length === 0, '清空生效');
    log(env.downloads[env.downloads.length - 1] === 'bbm-blocked-' + new Date().toISOString().slice(0, 10) + '-with-tags-cleared.json', '清空前自动导出备份', env.downloads[env.downloads.length - 1]);
    const bk = JSON.parse(await env.getBlob().text());
    log(bk.entries.length === 2, '备份里条目数正确', bk.entries.length);
    log(bk.entries.every((x) => 'tags' in x), '备份带上标签（方便恢复）');
    log(/备份/.test(env.alerts[env.alerts.length - 1] || '') && /已清空/.test(env.alerts[env.alerts.length - 1] || ''), '清空后提示备份文件名', env.alerts[env.alerts.length - 1]);
  }

  /* ---------------- 5b. 旧存档里的自定义标签折叠成「其他」 ---------------- */
  {
    const store = {
      'bbm:blocked': [{ uid: '12345', name: '张三', tags: ['旧标签A', '标题党'], at: 1 }],
    };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body></body>', store });
    await sleep(200);

    log(!env.menu(/新增标签|删除标签/), '菜单里没有新增/删除标签');
    // 已打的标签是 ✅：需要站在播放页（标签行只在有当前 UP 时出现）
    const e2 = boot({
      url: 'https://www.bilibili.com/video/BV1xx411c7mD/',
      html: '<body></body>',
      store,
    });
    e2.win.__INITIAL_STATE__ = { bvid: 'BV1xx411c7mD', videoData: { owner: { mid: 12345, name: '张三' }, title: 'T' } };
    await sleep(3400);
    log(!!e2.menu(/^屏蔽理由：✅ 其他$/) && !!e2.menu(/^屏蔽理由：✅ 标题党（封面 \/ 标题不符 \/ 悬疑）$/), '已打的标签都是 ✅，表外的落到「其他」',
      e2.menus.filter((x) => /^屏蔽理由：/.test(x.label)).map((x) => x.label).join(' | '));
    log((store['bbm:blocked'][0].tags || []).length === 2, '旧数据不被就地改写，只在内存里折叠');
  }

  /* ---------------- 6. ?bbm=off 与开关 ---------------- */
  {
    const store = { 'bbm:blocked': [{ uid: '12345', name: '张三', at: 1 }] };
    const env = boot({ url: 'https://www.bilibili.com/?bbm=off', html: '<body>' + CARD('12345', '张三') + '</body>', store });
    await sleep(200);
    log(env.win.document.querySelector('.bili-video-card').getAttribute('data-bbm') === null, '?bbm=off 时屏蔽不生效');
  }
  {
    const store = { 'bbm:blocked': [{ uid: '12345', name: '张三', at: 1 }] };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body>' + CARD('12345', '张三') + '</body>', store });
    await sleep(200);
    const card = env.win.document.querySelector('.bili-video-card');
    log(card.getAttribute('data-bbm') === 'block', '默认开启时生效');
    log(card.getAttribute('data-bbm-lock') === '1', '默认也禁止点击');

    // 只关翻转：不翻了，但仍然禁点
    env.menu(/^↔️ 首页屏蔽UP主：左右翻转$/).fn();
    log(card.getAttribute('data-bbm') === null, '关掉翻转后不再标记');
    log(card.getAttribute('data-bbm-lock') === '1', '关掉翻转但仍禁止点击');
    log(env.menu(/^⬜ 首页屏蔽UP主：正常显示$/) !== undefined, '关掉后勾到"正常显示"上');

    // 再关禁点：连锁也没有了
    env.menu(/^✅ 首页屏蔽UP主：禁止点击$/).fn();
    log(card.getAttribute('data-bbm-lock') === null, '关掉禁止点击后卡片可点');
    log(env.menu(/^⬜ 首页屏蔽UP主：可以点击$/) !== undefined, '点击那行变成可以点击');

    // 恢复翻转：翻回来，但仍可点
    env.menu(/^⬜ 首页屏蔽UP主：正常显示$/).fn();
    log(card.getAttribute('data-bbm') === 'block', '翻转恢复');
    log(card.getAttribute('data-bbm-lock') === null, '此时仍然可点');

    // 再开禁点
    env.menu(/^⬜ 首页屏蔽UP主：可以点击$/).fn();
    log(card.getAttribute('data-bbm-lock') === '1', '禁点恢复');
  }

  /* ---------------- 7. 广告卡 / 直播卡：翻转与禁点各自独立 ---------------- */
  {
    const AD = '<div class="bili-video-card"><span class="badge">广告</span><div class="bili-video-card__info--tit">t</div></div>';
    const LIVE = '<div class="bili-live-card"><a href="https://live.bilibili.com/123">直播</a></div>';

    const e1 = boot({ url: 'https://www.bilibili.com/', html: '<body>' + AD + '</body>', store: { 'bbm:settings': { ad: true, adLock: false } } });
    await sleep(200);
    const c1 = e1.win.document.querySelector('.bili-video-card');
    log(c1.getAttribute('data-bbm') === 'ad', '广告卡：翻转还在');
    log(c1.getAttribute('data-bbm-lock') === null, '广告卡：关掉点击后可以点');

    const e2 = boot({ url: 'https://www.bilibili.com/', html: '<body>' + AD + '</body>', store: { 'bbm:settings': { ad: false, adLock: true } } });
    await sleep(200);
    const c2 = e2.win.document.querySelector('.bili-video-card');
    log(c2.getAttribute('data-bbm') === null, '广告卡：关掉翻转后不翻');
    log(c2.getAttribute('data-bbm-lock') === '1', '广告卡：但仍在禁点');

    const e3 = boot({ url: 'https://www.bilibili.com/', html: '<body>' + LIVE + '</body>', store: { 'bbm:settings': { live: true, liveLock: false } } });
    await sleep(200);
    const c3 = e3.win.document.querySelector('.bili-live-card');
    log(c3.getAttribute('data-bbm') === 'flip', '直播卡：翻转还在');
    log(c3.getAttribute('data-bbm-lock') === null, '直播卡：关掉点击后可以点');

    const e4 = boot({ url: 'https://www.bilibili.com/', html: '<body>' + LIVE + '</body>', store: { 'bbm:settings': { live: false, liveLock: true } } });
    await sleep(200);
    const c4 = e4.win.document.querySelector('.bili-live-card');
    log(c4.getAttribute('data-bbm') === null, '直播卡：关掉翻转后不翻');
    log(c4.getAttribute('data-bbm-lock') === '1', '直播卡：但仍在禁点');
  }

  /* ---------------- 8. 未知设置键一律忽略 ---------------- */
  {
    const store = {
      'bbm:settings': { block: true, lock: false }, // lock 不是合法键，没有兼容义务
      'bbm:blocked': [{ uid: '12345', name: '张三', at: 1 }],
    };
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body>' + CARD('12345', '张三') + '</body>', store });
    await sleep(200);
    const card = env.win.document.querySelector('.bili-video-card');
    log(card.getAttribute('data-bbm') === 'block', '未知键 lock：翻转照旧生效');
    log(card.getAttribute('data-bbm-lock') === '1', '未知键 lock 被忽略，blockLock 用默认值 true',
      card.getAttribute('data-bbm-lock'));
  }

  /* ---------------- 9. 换视频：不能沿用上一条的 UP ---------------- */
  {
    const store = {
      'bbm:blocked': [{ uid: '12345', name: '张三', bvid: 'BV1xx411c7mD', title: '旧标题', reason: '', at: 1 }],
    };
    const env = boot({
      // 同一标签内跳到另一条视频，但 __INITIAL_STATE__ 还是上一条的
      url: 'https://www.bilibili.com/video/BV1yy411c7mE/',
      html: '<body>' +
        '<div class="up-info--name"><a href="//space.bilibili.com/67890">李四</a></div>' +
        '<h1 class="video-title" title="新标题">新标题</h1>' +
        '</body>',
      store,
    });
    env.win.__INITIAL_STATE__ = {
      bvid: 'BV1xx411c7mD',
      videoData: { owner: { mid: 12345, name: '张三' }, title: '旧标题' },
    };
    await sleep(3400);

    const m = env.menu(/^UP：李四/);
    log(!!m, '换视频后仍然有 UP 行', m && m.label);
    log(!!m && m.label === 'UP：李四；要屏蔽就点下面的理由', '不沿用上一条的 UP（这里是李四，不在名单里）', m && m.label);

    env.menu(/^屏蔽理由：⬜ 内容注水（云评测 \/ 合集 \/ 切片）$/).fn();
    const list = store['bbm:blocked'];
    log(list.length === 2 && list.some((e) => e.uid === '67890'), '屏蔽的是新 UP，旧的没被改', JSON.stringify(list.map((e) => e.uid)));
    const added = list.filter((e) => e.uid === '67890')[0] || {};
    log(added.bvid === 'BV1yy411c7mE', '新记录的 BV 是当前地址栏的', added.bvid);
    log(added.title === '新标题', '新记录的标题是当前页的', added.title);
  }

  /* ---------------- 10. 同一 UP 换视频：仍然认出它 ---------------- */
  {
    const store = {
      'bbm:blocked': [{ uid: '12345', name: '张三', bvid: 'BV1xx411c7mD', title: '旧', reason: '', at: 1 }],
    };
    const env = boot({
      url: 'https://www.bilibili.com/video/BV1zz411c7mF/',
      html: '<body><div class="up-info--name"><a href="//space.bilibili.com/12345">张三</a></div></body>',
      store,
    });
    env.win.__INITIAL_STATE__ = {
      bvid: 'BV1xx411c7mD',
      videoData: { owner: { mid: 12345, name: '张三' }, title: '旧' },
    };
    await sleep(3400);
    const m = env.menu(/^⛔ 已屏蔽该UP：张三/);
    log(!!m && m.label === '⛔ 已屏蔽该UP：张三（未标理由）', '同一个 UP 的另一条视频仍显示已屏蔽', m && m.label);
  }

  /* ---------------- 11. 读名单按条数分档：1200 条时不再 3 秒一读 ---------------- */
  {
    const big = [];
    for (let i = 0; i < 1200; i += 1) big.push({ uid: String(20000 + i), name: 'UP' + i, tags: [], at: 1 });
    big.unshift({ uid: '12345', name: '张三', tags: ['标题党'], at: 1 });
    const store = { 'bbm:blocked': big };
    const env = boot({
      url: 'https://www.bilibili.com/',
      html: '<body>' + CARD('12345', '张三') + '</body>',
      store,
    });
    await sleep(200);
    const card = env.win.document.querySelector('.bili-video-card');
    log(card.getAttribute('data-bbm') === 'block', '1200 条：启动即按名单打标记');

    // 第一轮 poll 在 3s，跑完才把间隔放到 10s；先等它过去
    await sleep(3600);
    store['bbm:blocked'] = [];              // 外部清空（两个键一起写，同另一个标签页）
    store['bbm:blocked:uids'] = 'v1|0|';
    await sleep(3400);
    log(card.getAttribute('data-bbm') === 'block', '1200 条：3 秒后还没重读（不再是 3s 一读）');

    await sleep(7200);               // 距清空约 10.6s，10s 档应该已经读到
    log(card.getAttribute('data-bbm') === null, '1200 条：10 秒档内读到了新名单');

    // 扫描本身不受名单大小影响：新插入的广告卡照样在 3 秒内被处理
    const fresh = env.win.document.createElement('div');
    fresh.className = 'bili-video-card';
    fresh.innerHTML = '<span>广告</span>';
    env.win.document.body.appendChild(fresh);
    await sleep(3400);
    log(fresh.getAttribute('data-bbm') === 'ad', '1200 条时扫描仍是 3 秒一轮', fresh.getAttribute('data-bbm'));
  }

  /* ---------------- 12. 两个键：轮询只读索引，整份名单在菜单处对齐 ---------------- */
  {
    const store = { 'bbm:blocked': [{ uid: '12345', name: '张三', tags: ['标题党'], at: 1 }] };
    let fullReads = 0;
    // 记一下整份名单被读了几次（GM_getValue 走的就是这个 getter）
    Object.defineProperty(store, 'bbm:blocked', {
      configurable: true,
      get() { fullReads += 1; return this.__full; },
      set(v) { this.__full = v; },
    });
    store['bbm:blocked'] = [{ uid: '12345', name: '张三', tags: ['标题党'], at: 1 }];
    const env = boot({ url: 'https://www.bilibili.com/', html: '<body>' + CARD('12345', '张三') + '</body>', store });
    await sleep(200);
    const card = env.win.document.querySelector('.bili-video-card');
    log(card.getAttribute('data-bbm') === 'block', '两键：启动按整份名单打标记');
    log(store['bbm:blocked:uids'] === 'v1|1|12345', '两键：启动时补写了 uid 索引', store['bbm:blocked:uids']);

    // 只改整份、不动索引（手动改存储，最需要容错的那条路）：轮询看不见，打开菜单时对齐
    store['bbm:blocked'] = [];
    const before = fullReads;
    await sleep(3300);
    log(card.getAttribute('data-bbm') === 'block', '两键：只改整份时轮询不动标记');
    log(fullReads === before, '两键：轮询阶段整份一次都没读', String(fullReads - before));
    env.menu(/^↕️ 首页广告位/).fn();     // 任何一次菜单交互都会重建菜单
    log(card.getAttribute('data-bbm') === null, '两键：打开菜单后按整份名单对齐');
    log(store['bbm:blocked:uids'] === 'v1|0|', '两键：菜单对齐后索引被纠正', store['bbm:blocked:uids']);

    // 索引损坏：退回读整份并修复，不会因为索引坏了就丢名单
    store['bbm:blocked'] = [{ uid: '12345', name: '张三', tags: ['标题党'], at: 1 }];
    store['bbm:blocked:uids'] = 'garbage';
    await sleep(3300);
    log(card.getAttribute('data-bbm') === 'block', '索引损坏时按整份名单重新判定');
    log(store['bbm:blocked:uids'] === 'v1|1|12345', '索引损坏后自动修复', store['bbm:blocked:uids']);
  }

  /* ---------------- 13. A/B 灰度：类名整批换掉，靠形状兜底 ---------------- */
  {
    const B_CARD = (uid, name) =>
      '<div class="v-card-x">' +
      '<a class="cover-x" href="//www.bilibili.com/video/BV1xx411c7mD"><img src="c.jpg"><span>12:34</span></a>' +
      '<div class="tit-x"><a href="//www.bilibili.com/video/BV1xx411c7mD">标题</a></div>' +
      '<a class="owner-x" href="//space.bilibili.com/' + uid + '">' + name + '</a>' +
      '</div>';

    const html =
      '<body>' +
      '<div class="feed-x">' +
      B_CARD('12345', '张三') +
      B_CARD('99999', '路人') +
      B_CARD('88888', '补位') +
      '</div>' +
      // 广告卡：没有时长条、链接指向站外，只有「广告」两个字
      '<div class="ad-x"><a href="//ad.example"><img src="a.jpg"><span>广告</span></a></div>' +
      // 普通卡：标题里含「广告」但不是独立两字
      '<div class="v-card-y"><a href="//www.bilibili.com/video/BV1xx411c7mE"><img src="n.jpg"><span>广告位</span></a></div>' +
      // 直播卡：没有 .bili-live-card，只剩链接
      '<div class="live-x"><a href="//live.bilibili.com/123"><img src="l.jpg"><span>直播中</span></a></div>' +
      // 推荐位：没有了 .floor-title / .floor-single-card，只剩模块标记
      '<div class="rec-x" data-mod="partition_recommend.content"><a href="//www.bilibili.com/video/BV1xx411c7mF"><img src="r.jpg"></a><span class="ft-x">番剧</span></div>' +
      '</body>';

    const store = { 'bbm:blocked': [{ uid: '12345', name: '张三', at: 1 }] };
    const env = boot({ url: 'https://www.bilibili.com/', html, store });
    await sleep(200);
    const doc = env.win.document;
    const feed = doc.querySelector('.feed-x');
    const b1 = feed.querySelector('.v-card-x');
    log(env.menus.length > 0, '类名失效：菜单仍然注册成功');

    log(b1.getAttribute('data-bbm') === 'block', '类名失效：名单内卡片按形状认出并标记');
    log(feed.querySelectorAll('.v-card-x')[1].getAttribute('data-bbm') === null, '类名失效：名单外卡片不动');
    log(feed.getAttribute('data-bbm') === null, '类名失效：整块信息流容器没有被误标');
    log(doc.body.getAttribute('data-bbm') === null, '类名失效：body 没有被当成一张卡');

    const ad = doc.querySelector('.ad-x');
    log(ad.getAttribute('data-bbm') === 'ad', '类名失效：广告卡按「广告」两字 + 形状认出');
    log(doc.querySelector('.v-card-y').getAttribute('data-bbm') === null, '类名失效：标题含「广告位」的普通卡不动');

    log(
      doc.querySelector('.live-x').getAttribute('data-bbm') === 'flip',
      '类名失效：直播卡按链接形状兜底',
      String(doc.querySelector('.live-x').getAttribute('data-bbm'))
    );
    log(doc.querySelector('.rec-x').getAttribute('data-bbm') === 'flip', '类名失效：推荐位按 data-mod 前缀兜底');

    // 依赖 3s 心跳：诊断结论变化后重建菜单，多出一行只在失效时出现的提示
    await sleep(3400);
    const warn = env.menus.filter((m) => /^⚠️ /.test(m.label));
    log(warn.length === 1, '类名失效：菜单出现诊断提示行', warn.map((m) => m.label).join(' | '));
    log(warn.some((m) => /形状兜底/.test(m.label)), '类名失效：提示的是形状兜底');

    // 存储里换回老类名：下一轮扫描恢复类名路径，提示行随之消失
    const card = doc.createElement('div');
    card.className = 'bili-video-card';
    card.innerHTML =
      '<a class="bili-video-card__info--owner" href="//space.bilibili.com/12345">张三</a>';
    doc.body.appendChild(card);
    feed.className = 'feed-x';
    await sleep(3400);
    log(card.getAttribute('data-bbm') === 'block', '类名恢复：新插入的老类名卡片立刻命中');
  }

  /* ---------------- 14. ?bbm=debug 才打诊断，平时一行不打 ---------------- */
  {
    const store = { 'bbm:blocked': [] };
    const html = '<body>' + CARD('12345', '张三') + CARD('99999', '路人') + '</body>';
    const quiet = boot({ url: 'https://www.bilibili.com/', html, store });
    await sleep(200);
    log(!quiet.allLogs().includes('[bbm]'), '默认不打任何诊断');

    const loud = boot({ url: 'https://www.bilibili.com/?bbm=debug', html, store });
    await sleep(200);
    log(loud.allLogs().includes('[bbm] 扫描诊断'), '带 bbm=debug 才打扫描诊断');
    log(!loud.allLogs().includes('12345'), '诊断不回显 uid');
  }

  /* ---------------- 15. 顶栏里的直播/视频入口不是卡片 ---------------- */
  {
    const store = { 'bbm:blocked': [{ uid: '12345', name: '张三', at: 1 }] };
    const header =
      '<header class="bili-header"><div class="right-entry">' +
      '<a href="//live.bilibili.com/123"><img src="live.png"><span>直播</span></a>' +
      '<a href="//www.bilibili.com/video/BV1xx411c7mD"><img src="v.png"><span>投稿</span></a>' +
      '<a href="//space.bilibili.com/1"><img src="ava.png"><span>创作中心</span></a>' +
      '</div></header>';

    // 播放页：顶栏有「直播」入口，但没有一张卡 → 什么都不该翻
    const video = boot({
      url: 'https://www.bilibili.com/video/BV1f8sh6JEKj/',
      html: '<body>' + header + '</body>',
      store,
    });
    await sleep(200);
    log(
      video.win.document.querySelector('.right-entry').getAttribute('data-bbm') === null,
      '播放页顶栏不会被翻（直播入口不是卡片）'
    );

    // 首页 + 类名全换：形状兜底上阵，仍然不该把顶栏一起翻
    const renames =
      '<div class="v-card-x"><a href="//www.bilibili.com/video/BV1xx411c7mD"><img src="c.jpg"><span>12:34</span></a>' +
      '<a href="//space.bilibili.com/12345">张三</a></div>' +
      '<div class="v-card-x"><a href="//www.bilibili.com/video/BV1xx411c7mE"><img src="c2.jpg"><span>05:20</span></a>' +
      '<a href="//space.bilibili.com/99999">路人</a></div>' +
      '<div class="v-card-x"><a href="//www.bilibili.com/video/BV1xx411c7mF"><img src="c3.jpg"><span>08:08</span></a>' +
      '<a href="//space.bilibili.com/88888">补位</a></div>';
    const home = boot({
      url: 'https://www.bilibili.com/',
      html: '<body>' + header + renames + '</body>',
      store,
    });
    await sleep(200);
    const doc = home.win.document;
    log(doc.querySelector('.right-entry').getAttribute('data-bbm') === null, '首页顶栏的直播入口不会被当成卡翻过去');
    log(doc.querySelectorAll('.v-card-x')[0].getAttribute('data-bbm') === 'block', '顶栏存在时卡片照常按形状命中');
  }

  /* ---------------- 16. 版本号：四处必须一致，忘改就红 ---------------- */
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const meta = SCRIPT.match(/^\/\/ @version\s+([0-9]+\.[0-9]+\.[0-9]+)/m);
    const fallback = SCRIPT.match(/\|\| '([0-9]+\.[0-9]+\.[0-9]+)'/);
    const changelog = fs.readFileSync(
      path.join(__dirname, '..', 'tampermonkey', 'CHANGELOG.md'),
      'utf8'
    );
    log(!!meta && meta[1] === pkg.version, '版本：@version 与 package.json 一致', meta && meta[1]);
    log(
      !!fallback && fallback[1] === pkg.version,
      '版本：SCRIPT_VERSION 兜底值与 package.json 一致',
      fallback && fallback[1]
    );
    log(changelog.includes('## ' + pkg.version), '版本：CHANGELOG 有当前版本条目', pkg.version);
  }

  // jsdom 的计时器会让进程常驻，断言跑完直接收工
  process.exit(process.exitCode || 0);
})();
