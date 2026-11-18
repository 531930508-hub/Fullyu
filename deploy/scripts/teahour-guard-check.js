#!/usr/bin/env node
/**
 * 时叙 env 守卫预检 / 改写（进程外，不碰运行中的服务）。
 *
 * 为什么需要：批次 4 要把 NODE_ENV 从 staging 改成 production，而生产守卫会在
 * 「INTEGRATIONS_MODE=mock」这类带病配置上直接抛错拒绝启动。若先写 env 再重启，
 * 服务会起不来；所以**先拿部署产物在进程外跑一遍守卫**，通过了再动服务。
 *
 *   node teahour-guard-check.js check   <env文件> <apps/server 目录>
 *   node teahour-guard-check.js rewrite <env文件> <输出文件> <目标NODE_ENV>
 *
 * check：任一守卫抛错 → 退出码 1；全部通过 → 0，并打印各渠道实际模式。
 * rewrite：把 NODE_ENV 改成目标值；把 INTEGRATIONS_MODE 与各 INTEGRATIONS_<CH>_MODE
 *          里的 mock 改成 disabled（live 的不动），其余行原样保留。
 */
const fs = require('fs');

const readEnv = (file) => {
  const raw = fs.readFileSync(file, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"') && v.length > 1) ||
      (v.startsWith("'") && v.endsWith("'") && v.length > 1)
    ) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
};

const CHANNELS = ['printer', 'teaMachine', 'payment', 'platform', 'wechat'];

const cmd = process.argv[2];

if (cmd === 'check') {
  const [, , , envFile, appRoot] = process.argv;
  if (!envFile || !appRoot) {
    console.error('用法：node teahour-guard-check.js check <env文件> <apps/server 目录>');
    process.exit(2);
  }
  const env = readEnv(envFile);
  const integ = require(`${appRoot}/node_modules/@teahour/integrations`);
  const cfg = require(`${appRoot}/dist/config/config.js`);
  const crm = require(`${appRoot}/dist/crm/crm.config.js`);
  const brand = require(`${appRoot}/dist/crm/brand-member.config.js`);

  console.log(`env 文件：${envFile}`);
  console.log(`NODE_ENV=${env.NODE_ENV || '(未设)'}  INTEGRATIONS_MODE=${env.INTEGRATIONS_MODE || '(未设)'}`);

  let failed = 0;
  const failedMessages = [];
  const guard = (label, fn) => {
    try {
      fn();
      console.log(`  ${label}: OK`);
    } catch (e) {
      failed += 1;
      failedMessages.push(`${label}: ${e.message}`);
      console.log(`  ${label}: 会拒绝启动 -> ${e.message}`);
    }
  };

  guard('integrations', () => {
    const c = integ.loadIntegrationsConfig({ uploadRoot: '/tmp', assetUrl: () => '', env });
    console.log(`    mode=${c.mode}`);
    for (const ch of CHANNELS) console.log(`    ${ch} = ${c.channels[ch]}`);
  });
  guard('jwtSecret', () => {
    cfg.jwtSecret(env);
  });
  guard('crmConfig', () => {
    const c = crm.crmConfig(env);
    console.log(`    ${c ? `enabled ${c.baseUrl}` : 'off'}`);
  });
  guard('brandMemberConfig', () => {
    const c = brand.brandMemberConfig(env);
    console.log(`    ${c ? `enabled ${c.baseUrl}` : 'off'}`);
  });

  if (failed) {
    console.log(`\n结论：这套 env 在 NODE_ENV=${env.NODE_ENV || '(未设)'} 下**不能**启动（${failed} 项不通过）。`);
    process.exit(1);
  }
  console.log(`\n结论：这套 env 在 NODE_ENV=${env.NODE_ENV || '(未设)'} 下可以启动。`);
  process.exit(0);
}

if (cmd === 'rewrite') {
  const [, , , envFile, outFile, targetEnv] = process.argv;
  if (!envFile || !outFile || !targetEnv) {
    console.error('用法：node teahour-guard-check.js rewrite <env文件> <输出文件> <目标NODE_ENV>');
    process.exit(2);
  }
  const raw = fs.readFileSync(envFile, 'utf8');
  const seen = new Set();
  const changes = [];
  const channelSet = new Set(CHANNELS.map((c) => `INTEGRATIONS_${c.toUpperCase()}_MODE`));

  const out = raw
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) return line;
      const [, indent, key, rest] = m;
      let value = rest.trim();
      const quoted = value.startsWith('"') || value.startsWith("'");
      if (quoted && value.length > 1) value = value.slice(1, -1);
      seen.add(key);

      let next = null;
      if (key === 'NODE_ENV' && value !== targetEnv) next = targetEnv;
      if (key === 'INTEGRATIONS_MODE' && value.trim().toLowerCase() === 'mock') next = 'disabled';
      if (channelSet.has(key) && value.trim().toLowerCase() === 'mock') next = 'disabled';
      if (next === null) return line;

      changes.push(`${key}: ${value} -> ${next}`);
      return `${indent}${key}=${next}`;
    })
    .join('\n');

  const missing = [];
  if (!seen.has('NODE_ENV')) missing.push(`NODE_ENV=${targetEnv}`);
  if (!seen.has('INTEGRATIONS_MODE')) missing.push('INTEGRATIONS_MODE=disabled');

  const body = missing.length ? `${out.replace(/\n*$/, '')}\n${missing.join('\n')}\n` : out;
  fs.writeFileSync(outFile, body, { mode: 0o600 });

  if (changes.length === 0 && missing.length === 0) {
    console.log('无需改写：这套 env 已经符合目标（NODE_ENV 已达标、没有显式 mock）。');
  } else {
    for (const c of changes) console.log(`改写 ${c}`);
    for (const c of missing) console.log(`追加 ${c}`);
  }
  console.log(`已写出拟用 env：${outFile}（未安装到线上，权限 600）`);
  process.exit(0);
}

console.error('用法：node teahour-guard-check.js check|rewrite ...');
process.exit(2);