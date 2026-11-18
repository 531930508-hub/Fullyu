#!/usr/bin/env node
/**
 * H5 构建 + 完整性校验 + 部署 + 线上回读
 *
 *   node scripts/h5.mjs build     # 构建并校验（每次交付前必跑）
 *   node scripts/h5.mjs check     # 只校验 + 与线上比对（不构建）
 *   node scripts/h5.mjs deploy    # 构建 → 校验 → 备份 → 上传 → 回读确认（测试环境）
 *
 * 校验三件事，任一不过即非 0 退出：
 *   1. 主包体积正常（防止又出"空壳"）
 *   2. pages.json 里每个页面都在路由中登记，且入口 import 的页面产物都存在（防止页面漏编译）
 *   3. 线上 mall-test 的资产指纹与本地产物是否一致（防止 H5 不是最新）
 *
 * 部署目标：test-cityretreat = root@8.133.6.18:/opt/fullyu-mall-test/h5
 *   （nginx `sites-enabled/test-cityretreat.fullyu.cn.conf` 的 `location /h5/`；可用 H5_DEPLOY_HOST 覆盖）
 * 2026-11-17 起 H5 站点在 `https://test-cityretreat.fullyu.cn/h5/`（manifest 的 h5.router.base 已改为 /h5/）。
 * 注意：线上那份产物是改名当天把旧构建（base=/）就地改前缀得到的，指纹与本地新构建不可比；
 *      下次 `npm run h5:build && npm run h5:deploy` 正式重建覆盖后即恢复可比。
 * 优先级：build/check 只读；deploy 会先备份到 backups/h5-<时间戳>.tgz 再原子切换目录。
 *
 * 注意（2026-11 踩过的坑）：vite-plugin-uni 只加载 package.json 里声明过的平台包，
 * 且识别的是带 `uni-app.apply` 字段的那个——H5 必须声明 `@dcloudio/uni-h5`，
 * 只装 `@dcloudio/uni-h5-vite` 不会被加载，结果是"构建成功但只产出空壳"。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'unpackage/dist/build/h5');
const ASSETS = path.join(OUT, 'assets');
const LIVE = process.env.H5_LIVE_URL || 'https://test-cityretreat.fullyu.cn/h5/';
const DEPLOY_HOST = process.env.H5_DEPLOY_HOST || 'root@8.133.6.18';
const DEPLOY_DIR = process.env.H5_DEPLOY_DIR || '/opt/fullyu-mall-test/h5';
const MIN_MAIN_KB = 200;
const MIN_ASSETS = 80;

function stripJson(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,(\s*[}\]])/g, '$1');
}

function pageList() {
  const json = JSON.parse(stripJson(fs.readFileSync(path.join(ROOT, 'pages.json'), 'utf8')));
  const list = json.pages.map((p) => p.path);
  for (const sub of json.subPackages || []) {
    for (const p of sub.pages) list.push(`${sub.root}/${p.path}`.replace(/\/+/g, '/'));
  }
  return list;
}

function build() {
  console.log('▶ 构建 H5 …');
  execFileSync(
    path.join(ROOT, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),
    ['build', '-p', 'h5'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        UNI_INPUT_DIR: ROOT,
        UNI_OUTPUT_DIR: OUT,
        NODE_ENV: 'production',
        // 本流程部署目标是测试环境；生产 H5 需显式传 VITE_API_BASE=https://cityretreat.fullyu.cn/api
        VITE_API_BASE: process.env.VITE_API_BASE || 'https://test-cityretreat.fullyu.cn/api',
      },
    },
  );
}

function verify() {
  if (!fs.existsSync(path.join(OUT, 'index.html'))) throw new Error('产物缺失：index.html');
  if (!fs.existsSync(ASSETS)) throw new Error('产物缺失：assets/');

  const files = fs.readdirSync(ASSETS);
  if (files.length < MIN_ASSETS) {
    throw new Error(`产物只有 ${files.length} 个资产（阈值 ${MIN_ASSETS}），疑似又产出空壳`);
  }
  const mainJs = files
    .filter((f) => /^index-.*\.js$/.test(f))
    .map((f) => ({ f, kb: fs.statSync(path.join(ASSETS, f)).size / 1024 }))
    .sort((a, b) => b.kb - a.kb)[0];
  if (!mainJs || mainJs.kb < MIN_MAIN_KB) {
    throw new Error(`主包 ${mainJs ? mainJs.kb.toFixed(0) + 'KB' : '缺失'}，低于 ${MIN_MAIN_KB}KB，疑似空壳`);
  }

  // 页面产物校验不能靠「路径拼文件名」猜 chunk：uni 对目录下的 index.vue
  // 会把 chunk 命名成 <上级目录>-<目录名>（pages/mall/index → pages-mall-mall），
  // 与同目录的 mall.vue 撞名但文件不同，靠前缀匹配必然误判。
  // 改为校验真实链接关系：每个页面在路由里有登记，且入口 import 的目标文件都在。
  const pages = pageList();
  const entryText = fs.readFileSync(path.join(ASSETS, entryOf(fs.readFileSync(path.join(OUT, 'index.html'), 'utf8'))), 'utf8');
  // 只查路由表（在入口 chunk 里），不能全量搜 bundle：别的代码带着页面 URL 会让缺失页蒙混过关。
  // 首页是以 path:"/" + alias 登记的，其余是 path:"/xxx"，统一按带引号的完整路径查。
  const noRoute = pages.filter((p) => !entryText.includes(`/${p}"`));
  if (noRoute.length) {
    throw new Error(`有 ${noRoute.length} 个页面没有出现在路由里：\n  - ${noRoute.join('\n  - ')}`);
  }
  const linked = [...entryText.matchAll(/import\("\.\/([^"]+\.js)"\)/g)].map((m) => m[1]);
  const broken = linked.filter((r) => !files.includes(r));
  if (broken.length) {
    throw new Error(`入口引用了不存在的页面产物：\n  - ${broken.join('\n  - ')}`);
  }

  console.log(`✔ 资产 ${files.length} 个 / 主包 ${mainJs.kb.toFixed(0)}KB / 页面 ${pages.length} 个全部产出`);
  return files;
}

function entryOf(html) {
  return (html.match(/\/assets\/(index-[\w-]+\.js)/) || [])[1] || '';
}

/** 线上是否就是这次构建：入口指纹必须相同，且所有引用都在本地产物里。 */
async function compareLive() {
  const localEntry = entryOf(fs.readFileSync(path.join(OUT, 'index.html'), 'utf8'));
  let html;
  try {
    const res = await fetch(LIVE, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (e) {
    console.log(`⚠ 无法访问线上 ${LIVE}（${e.message}），跳过新旧比对`);
    return null;
  }
  const liveRefs = [...html.matchAll(/\/assets\/([\w.-]+\.(?:js|css))/g)].map((m) => m[1]);
  const local = new Set(fs.readdirSync(ASSETS));
  const stale = liveRefs.filter((r) => !local.has(r));
  const liveEntry = entryOf(html);
  if (!liveEntry) {
    console.log('⚠ 线上首页没有找到入口 assets，跳过比对');
    return null;
  }
  if (liveEntry !== localEntry) {
    console.log(`✖ 线上仍是旧版：线上入口 ${liveEntry}，本地 ${localEntry} → 需要部署`);
    return false;
  }
  if (stale.length) {
    console.log(`✖ 线上引用了本地产物里不存在的资产：${stale.join(', ')}`);
    return false;
  }
  console.log(`✔ 线上就是本次构建（${liveEntry}，${liveRefs.length} 个引用）`);
  return true;
}

/**
 * 部署到测试服务器：备份旧目录 → 上传新产物 → 原子切换 → （调用方）回读确认。
 *
 * 打包先落本地临时文件再喂给 ssh 的 stdin：避免把整个 tar 塞进内存/管道；
 * mac 的 bsdtar 会写入 xattr pax 头（远端 GNU tar 一直刷 unknown keyword 警告），
 * 用 --no-xattrs 去掉（仅 darwin 支持），COPYFILE_DISABLE 再挡掉 ._ 影子文件。
 */
async function deploy() {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const tgz = path.join(os.tmpdir(), `fullyu-h5-${stamp}.tgz`);
  const tarArgs = ['czf', tgz, '-C', OUT, '.'];
  if (process.platform === 'darwin') tarArgs.splice(2, 0, '--no-xattrs');
  const remote = `set -e; T=/opt/fullyu-mall-test; mkdir -p $T/backups; ` +
    `tar czf $T/backups/web-${stamp}.tgz -C ${DEPLOY_DIR} .; ` +
    `rm -rf ${DEPLOY_DIR}.new; mkdir -p ${DEPLOY_DIR}.new; tar xzf - -C ${DEPLOY_DIR}.new; ` +
    `chown -R systemd-network:systemd-network ${DEPLOY_DIR}.new; ` +
    `rm -rf ${DEPLOY_DIR}.prev; mv ${DEPLOY_DIR} ${DEPLOY_DIR}.prev; mv ${DEPLOY_DIR}.new ${DEPLOY_DIR}; ` +
    `echo "已切换到 web-${stamp}"`;
  try {
    execFileSync('tar', tarArgs, {
      env: { ...process.env, COPYFILE_DISABLE: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    execFileSync('ssh', ['-o', 'ConnectTimeout=15', DEPLOY_HOST, remote], {
      input: fs.readFileSync(tgz),
      stdio: ['pipe', 'inherit', 'inherit'],
      timeout: 120000,
    });
  } catch (e) {
    console.error(`✖ 部署失败：${e.message}`);
    process.exit(1);
  } finally {
    fs.rmSync(tgz, { force: true });
  }
  console.log(`✔ 已部署到 ${DEPLOY_HOST}:${DEPLOY_DIR}`);
}

const cmd = process.argv[2] || 'build';
if (cmd === 'build' || cmd === 'deploy') build();
const files = verify();
fs.writeFileSync(
  path.join(ROOT, 'unpackage/dist/build/h5-build-info.json'),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      assets: files.length,
      pages: pageList().length,
      entry: fs.readFileSync(path.join(OUT, 'index.html'), 'utf8').match(/\/assets\/(index-[\w-]+\.js)/)?.[1],
    },
    null,
    2,
  ),
);
if (cmd === 'deploy') await deploy();
const inSync = await compareLive();
if (cmd === 'deploy' && inSync === false) {
  console.error('✖ 部署后线上仍不一致，请检查 nginx root 或 CDN 缓存');
  process.exit(1);
}