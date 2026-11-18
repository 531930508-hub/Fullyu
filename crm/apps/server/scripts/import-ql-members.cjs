#!/usr/bin/env node
/**
 * 轻疗生产用户 → CRM 会员回灌（走 CRM 自己的 1C 批量导入接口）。
 *
 * 用法（在 CRM 服务器上执行）：
 *   node import-ql-members.cjs /tmp/ql_customers.tsv
 *
 * 输入 TSV 列：客户 id、昵称、手机号、性别(-1/1/2)、头像、注册日期
 * 依据：
 *   - 只走 POST /api/external/members/import，复用现成的发号、手机号去重、身份绑定与审计；
 *   - 幂等：已存在身份 → unchanged，手机号命中已有会员 → bound，可直接重跑；
 *   - 手机号不合规（国际号码等）由接口逐条拒绝并汇总，不中断整批。
 */
const fs = require('fs');
const crypto = require('crypto');

const ENV_FILE = process.env.CRM_ENV_FILE || '/etc/fullyu-crm/crm.env';
const BASE = process.env.CRM_BASE || 'http://127.0.0.1:8898';
const PATH_ = '/api/external/members/import';
const BATCH = 200;

function readQlKey() {
  const line = fs
    .readFileSync(ENV_FILE, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('CRM_EXT_KEYS='));
  if (!line) throw new Error('crm.env 里没有 CRM_EXT_KEYS');
  const raw = line.slice('CRM_EXT_KEYS='.length).trim().replace(/^"|"$/g, '');
  const keys = JSON.parse(raw);
  const business = process.env.CRM_BUSINESS || 'ql';
  const keyId = Object.keys(keys).find((k) => keys[k].business === business);
  if (!keyId) throw new Error(`CRM_EXT_KEYS 里没有 ${business} 业务密钥`);
  return { keyId, secret: keys[keyId].secret };
}

const { keyId, secret } = readQlKey();

const sign = (ts, body) => {
  const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  return crypto
    .createHmac('sha256', secret)
    .update(`${ts}\nPOST\n${PATH_}\n${bodyHash}`, 'utf8')
    .digest('hex');
};

function toMember([id, name, phone, gender]) {
  const item = { localUserId: String(id) };
  const nickname = (name || '').trim().slice(0, 20);
  if (nickname) item.name = nickname;
  const p = (phone || '').trim();
  if (p) item.phone = p;
  const g = Number(gender);
  if (g === 1 || g === 2) item.gender = g;
  return item;
}

async function postBatch(members) {
  const body = JSON.stringify({ members });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const ts = String(Math.floor(Date.now() / 1000));
    try {
      const res = await fetch(BASE + PATH_, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-crm-key': keyId,
          'x-crm-timestamp': ts,
          'x-crm-signature': sign(ts, body)
        },
        body
      });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      if (res.status >= 500 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error('unreachable');
}

(async () => {
  const file = process.argv[2] || '/tmp/ql_customers.tsv';
  const rows = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('\t'));
  const total = { created: 0, bound: 0, unchanged: 0 };
  const failed = [];
  let batches = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map(toMember);
    const summary = await postBatch(chunk);
    total.created += summary.created || 0;
    total.bound += summary.bound || 0;
    total.unchanged += summary.unchanged || 0;
    for (const f of summary.failed || []) failed.push([f.localUserId, f.reason]);
    batches += 1;
    if (batches % 5 === 0 || i + BATCH >= rows.length) {
      console.log(
        `[${Math.min(i + BATCH, rows.length)}/${rows.length}] created=${total.created} bound=${total.bound} unchanged=${total.unchanged} failed=${failed.length}`
      );
    }
  }
  const reasons = new Map();
  for (const [, reason] of failed) reasons.set(reason, (reasons.get(reason) || 0) + 1);
  fs.writeFileSync('/tmp/ql-import-failed.tsv', failed.map((r) => r.join('\t')).join('\n') + '\n');
  console.log('=== 汇总 ===');
  console.log(JSON.stringify(total), 'failed=' + failed.length, 'source_rows=' + rows.length);
  for (const [reason, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n} 条 · ${reason}`);
  }
})().catch((error) => {
  console.error('导入失败：', error.message);
  process.exit(1);
});