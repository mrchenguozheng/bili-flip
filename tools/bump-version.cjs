#!/usr/bin/env node
/* 版本号唯一入口：npm run bump -- minor "这次改了什么"
 *
 * 为什么要脚本：版本号散在四处（脚本 @version、SCRIPT_VERSION 兜底常量、
 * package.json、package-lock 根版本），外加 CHANGELOG 顶部条目。
 * 手改迟早漏一处，漏了就等于发了个“版本号撒谎”的包；这里一次写完再自检。
 *
 * 用法：
 *   npm run bump -- patch            1.1.0 → 1.1.1
 *   npm run bump -- minor "新增X"     1.1.0 → 1.2.0，并写进 CHANGELOG
 *   npm run bump -- major            1.1.0 → 2.0.0
 *   npm run bump -- 1.2.3 "说明"      直接指定版本
 *   npm run bump -- --check          只校验四处是否一致（不一致退出码非 0）
 *
 * 可以 require 本文件取 computeNext / readVersion / checkConsistency 做断言。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'tampermonkey', 'bilibili-home-flip-block.user.js');
const PKG = path.join(ROOT, 'package.json');
const LOCK = path.join(ROOT, 'package-lock.json');
const CHANGELOG = path.join(ROOT, 'tampermonkey', 'CHANGELOG.md');

const VERSION_RE = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/;
const HEADER_RE = /^\/\/ @version\s+([0-9]+\.[0-9]+\.[0-9]+)/m;
/* SCRIPT_VERSION 那一句里的兜底常量：|| '1.1.0'（跨行，限定在同一语句内） */
const FALLBACK_RE = /(const SCRIPT_VERSION =[\s\S]{0,200}?\|\| ')([0-9]+\.[0-9]+\.[0-9]+)(')/;

const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, text) => fs.writeFileSync(file, text, 'utf8');

function parseParts(version) {
  const m = VERSION_RE.exec(version);
  if (!m) throw new Error('版本号必须形如 1.2.3：' + version);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** level: patch / minor / major / 明确的 x.y.z */
function computeNext(current, level) {
  if (VERSION_RE.test(level)) return level;
  const [a, b, c] = parseParts(current);
  if (level === 'major') return a + 1 + '.0.0';
  if (level === 'minor') return a + '.' + (b + 1) + '.0';
  if (level === 'patch') return a + '.' + b + '.' + (c + 1);
  throw new Error('未知的递增类型：' + level + '（可用 patch / minor / major / x.y.z）');
}

function readVersion() {
  const src = read(SCRIPT);
  const header = HEADER_RE.exec(src);
  if (!header) throw new Error('脚本头部找不到 // @version');
  return header[1];
}

/** 返回所有不一致项；空数组表示四处齐平 */
function checkConsistency() {
  const problems = [];
  const src = read(SCRIPT);
  const header = HEADER_RE.exec(src);
  const fallback = FALLBACK_RE.exec(src);
  const pkg = JSON.parse(read(PKG));
  const lock = JSON.parse(read(LOCK));
  const changelog = read(CHANGELOG);
  const version = header ? header[1] : '(缺 @version)';

  if (!header) problems.push('脚本头部没有 // @version');
  if (!fallback) problems.push('脚本里找不到 SCRIPT_VERSION 的兜底常量');
  else if (fallback[2] !== version) {
    problems.push('SCRIPT_VERSION 兜底是 ' + fallback[2] + '，@version 是 ' + version);
  }
  if (pkg.version !== version) problems.push('package.json 是 ' + pkg.version + '，@version 是 ' + version);
  if (lock.version !== version) problems.push('package-lock 根版本是 ' + lock.version + '，@version 是 ' + version);
  const rootPkg = lock.packages && lock.packages[''];
  if (!rootPkg || rootPkg.version !== version) {
    problems.push('package-lock 的 packages[""].version 与 @version 不一致');
  }
  if (!changelog.includes('## ' + version + ' ')) problems.push('CHANGELOG 缺少 ' + version + ' 的条目');
  return problems;
}

function bump(next, note) {
  const current = readVersion();
  if (next === current) throw new Error('新版本与当前版本相同：' + current);
  const problems = checkConsistency();
  // 允许“还没写 CHANGELOG”的旧状态先对齐，但版本号本身必须四处一致
  const blocking = problems.filter((p) => !/CHANGELOG/.test(p));
  if (blocking.length) throw new Error('先修好现有不一致：\n  ' + blocking.join('\n  '));
  if (read(CHANGELOG).includes('## ' + next + ' ')) throw new Error('CHANGELOG 里已有 ' + next + '，别重复发版');

  // 1) 脚本头部
  let src = read(SCRIPT);
  src = src.replace(HEADER_RE, (all, v) => all.replace(v, next));
  // 2) 兜底常量
  if (!FALLBACK_RE.test(src)) throw new Error('脚本里找不到 SCRIPT_VERSION 的兜底常量');
  src = src.replace(FALLBACK_RE, (all, head, old, tail) => head + next + tail);
  write(SCRIPT, src);

  // 3) package.json / package-lock（保持 2 空格缩进与结尾换行）
  const pkg = JSON.parse(read(PKG));
  pkg.version = next;
  write(PKG, JSON.stringify(pkg, null, 2) + '\n');
  const lock = JSON.parse(read(LOCK));
  lock.version = next;
  if (lock.packages && lock.packages['']) lock.packages[''].version = next;
  write(LOCK, JSON.stringify(lock, null, 2) + '\n');

  // 4) CHANGELOG：插在最上面那条版本之前
  const date = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
  const text = read(CHANGELOG);
  const first = text.search(/^## /m);
  if (first < 0) throw new Error('CHANGELOG 里没有版本小节，先补一条 ## 1.0.0');
  const bullet = note && note.trim() ? '- ' + note.trim() : '- （待补：一句话说清这次改了什么）';
  const section = '## ' + next + ' — ' + date + '\n\n' + bullet + '\n\n';
  write(CHANGELOG, text.slice(0, first) + section + text.slice(first));

  const after = checkConsistency();
  if (after.length) throw new Error('写完后仍不一致（请检查文件是否被其他进程占用）：\n  ' + after.join('\n  '));
  return { from: current, to: next };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  try {
    if (argv.includes('--check')) {
      const problems = checkConsistency();
      if (problems.length) {
        console.error('版本号不一致：\n  ' + problems.join('\n  '));
        process.exit(1);
      }
      console.log('版本号一致：' + readVersion());
    } else {
      const level = argv.find((a) => !a.startsWith('--')) || 'patch';
      const noteIdx = argv.indexOf('--note');
      const note = noteIdx >= 0 ? argv[noteIdx + 1] : argv.filter((a) => !a.startsWith('--') && a !== level).join(' ');
      const current = readVersion();
      const next = computeNext(current, level);
      const out = bump(next, note);
      console.log('版本 ' + out.from + ' → ' + out.to + '：@version / SCRIPT_VERSION / package.json / package-lock / CHANGELOG 已同步');
    }
  } catch (e) {
    console.error('[bump] ' + e.message);
    process.exit(1);
  }
}

module.exports = { computeNext, readVersion, checkConsistency, bump };
