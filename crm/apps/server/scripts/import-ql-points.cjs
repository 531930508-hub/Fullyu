#!/usr/bin/env node
/**
 * 轻疗历史积分 → CRM（一次性基线导入）。
 *
 * 口径：与轻疗 IntegrationService.getLocalIntegrationByCustomerList 完全一致
 *   type=1(加) AND state=1(正常) AND normal_score<>0 AND (end_time 为空或未过期)，按客户求和。
 *
 * 用法（在 CRM 服务器执行）：node import-ql-points.cjs /tmp/ql_points.tsv
 * 幂等：ref = qlmig:<customerId>，重跑不会重复入账。
 */
const fs = require('fs');
const crypto = require('crypto');

const ENV_FILE = process.env.CRM_ENV_FILE || '/etc/fullyu-crm/crm.env';
const BASE = process.env.CRM_BASE || 'http://127.0.0.1:8898';
const PATH_ = '/api/external/points/earn';
const CONCURRENCY = 4;
const REASON = '轻疗历史积分迁移';

const line = fs
  .readFileSync(ENV_FILE, 'utf8')
  .split('\n')
  .find((l) => l.startsWith('CRM_EXT_KEYS='));
const keys = JSON.parse(line.slice('CRM_EXT_KEYS='.length).trim().replace(/^"|"$/g, ''));
const keyId = Object.keys(keys).find((k) => keys[k].business === 'ql');
if (!keyId) throw new Error('缺少 ql 密钥');
const secret = keys[keyId].secret;

const sign = (ts, body) =>
  crypto
    .createHmac('sha256', secret)
    .update(
      `${ts}\nPOST\n${PATH_}\n${crypto.createHash('sha256').update(body, 'utf8').digest('hex')}`,
      'utf8'
    )
    .digest('hex');

async function post(body) {
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
      if (res.ok) return { ok: true };
      if (res.status >= 500 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      return { ok: false, reason: `HTTP ${res.status} ${text.slice(0, 120)}` };
    } catch (error) {
      if (attempt === 3) return { ok: false, reason: error.message.slice(0, 120) };
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  return { ok: false, reason: 'unreachable' };
}

(async () => {
  const file = process.argv[2] || '/tmp/ql_points.tsv';
  const rows = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.split('\t'));
  let ok = 0;
  let done = 0;
  let totalPoints = 0;
  const failed = [];
  const queue = [...rows];
  const worker = async () => {
    while (queue.length) {
      const [id, bal] = queue.shift();
      const points = Number(bal);
      if (!Number.isInteger(points) || points <= 0) {
        failed.push([id, `余额非正整数: ${bal}`]);
        continue;
      }
      const body = JSON.stringify({
        localUserId: String(id),
        points,
        reason: REASON,
        ref: `qlmig:${id}`
      });
      const result = await post(body);
      if (result.ok) {
        ok += 1;
        totalPoints += points;
      } else failed.push([id, result.reason]);
      done += 1;
      if (done % 200 === 0) console.log(`[${done}/${rows.length}] ok=${ok} failed=${failed.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  fs.writeFileSync('/tmp/ql-points-failed.tsv', failed.map((r) => r.join('\t')).join('\n') + '\n');
  const reasons = new Map();
  for (const [, reason] of failed) reasons.set(reason, (reasons.get(reason) || 0) + 1);
  console.log('=== 汇总 ===');
  console.log(`ok=${ok} failed=${failed.length} points_sum=${totalPoints} source_rows=${rows.length}`);
  for (const [reason, n] of [...reasons.entries()]) console.log(`  ${n} 条 · ${reason}`);
})().catch((e) => {
  console.error('导入失败：', e.message);
  process.exit(1);
});