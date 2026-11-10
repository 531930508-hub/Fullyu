import type { Database as DatabaseType } from 'better-sqlite3';
import { assertStoreAccess, hasPerm, type StaffUser } from '../lib/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { logAction } from '../db/index.js';
import { monthRange, type DateRange } from '../lib/dates.js';
import { hardware } from '../hardware/index.js';

type LossRow = {
  id: string;
  store_id: string;
  product_id: string;
  name: string;
  kind: string;
  qty: number;
  unit: string;
  amount_cents: number;
  reason: string;
  note: string;
  status: string;
  reported_by: string | null;
  decided_by: string | null;
  decided_at: number | null;
  decision_note: string;
  approval_id: string | null;
  at: number;
  store_name?: string | null;
};

export type LossPolicy = {
  enabled: boolean;
  monthlyRatio: number;
  approvalThresholdCents: number;
  approvers: string[];
};

export function getLossPolicy(db: DatabaseType): LossPolicy {
  const row = db.prepare("SELECT value_json FROM settings WHERE key = 'lossPolicy'").get() as
    | { value_json: string }
    | undefined;
  if (!row) return { enabled: true, monthlyRatio: 3, approvalThresholdCents: 10000, approvers: ['u-zhou', 'u-lin'] };
  return JSON.parse(row.value_json) as LossPolicy;
}

export function saveLossPolicy(db: DatabaseType, staff: StaffUser, input: Partial<LossPolicy>) {
  if (!hasPerm(staff, 'loss:config')) throw forbidden('没有维护报损规则的权限');
  const current = getLossPolicy(db);
  const ratio = input.monthlyRatio == null ? current.monthlyRatio : Number(input.monthlyRatio);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) throw badRequest('月度损耗率预警线应在 0–100 之间');
  const threshold =
    input.approvalThresholdCents == null ? current.approvalThresholdCents : Math.round(Number(input.approvalThresholdCents));
  if (!Number.isFinite(threshold) || threshold < 0) throw badRequest('审批起点金额无效');
  const approvers = Array.from(new Set((input.approvers || current.approvers || []).filter(Boolean)));
  const active = approvers.filter((id) => {
    const row = db.prepare('SELECT active FROM users WHERE id = ?').get(id) as { active: number } | undefined;
    return row?.active;
  });
  if (!active.length) throw badRequest('请至少选择一位启用中的报损审批人');
  const policy: LossPolicy = {
    enabled: input.enabled == null ? current.enabled : !!input.enabled,
    monthlyRatio: ratio,
    approvalThresholdCents: threshold,
    approvers: active
  };
  db.prepare(
    `INSERT INTO settings (key, value_json, updated_at) VALUES ('lossPolicy', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
  ).run(JSON.stringify(policy), Date.now());
  logAction(db, {
    actorId: staff.id,
    actorName: staff.name,
    action: '更新报损规则',
    detail: `月度损耗率 >${ratio}% 预警 · 审批起点 ¥${(threshold / 100).toFixed(2)} · ${active.length} 位审批人`,
    type: 'loss'
  });
  return policy;
}

export function lossValue(db: DatabaseType, productId: string, qty: number) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | { kind: string; dose_g: number; cost_cents: number; name: string; unit_zh: string; unit_en: string }
    | undefined;
  if (!product) throw notFound('商品不存在');
  if (!Number.isFinite(qty) || qty <= 0) throw badRequest('请填写有效的报损数量');
  if (product.kind === 'tea') {
    if (qty > 100000) throw badRequest('单次报损数量过大，请分批登记');
    return { amountCents: Math.round((qty / product.dose_g) * product.cost_cents), unit: 'g' };
  }
  if (!Number.isInteger(qty)) throw badRequest('整件商品报损须为整数');
  return { amountCents: qty * product.cost_cents, unit: product.unit_zh };
}

function deductStock(db: DatabaseType, storeId: string, productId: string, qty: number) {
  const res = db
    .prepare('UPDATE stock SET grams = grams - ? WHERE store_id = ? AND product_id = ? AND grams >= ?')
    .run(qty, storeId, productId, qty);
  if (!res.changes) throw conflict('本店库存不足，无法完成报损扣减');
}

export function reportLoss(
  db: DatabaseType,
  staff: StaffUser,
  input: { storeId?: string; productId?: string; qty?: number; reason?: string; note?: string }
) {
  if (!hasPerm(staff, 'loss:report')) throw forbidden('没有登记报损的权限');
  const policy = getLossPolicy(db);
  if (!policy.enabled) throw conflict('报损功能已停用，请联系总部');
  const storeId = String(input.storeId || '');
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as
    | { id: string; name: string }
    | undefined;
  if (!store) throw badRequest('请选择有效门店');
  assertStoreAccess(staff, storeId);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(String(input.productId || '')) as
    | { id: string; name: string; name_en: string; kind: string; dose_g: number; cost_cents: number; unit_zh: string; unit_en: string }
    | undefined;
  if (!product) throw notFound('商品不存在');
  const qty = product.kind === 'tea' ? Math.round(Number(input.qty) * 10) / 10 : Number(input.qty);
  if (!Number.isFinite(qty) || qty <= 0) throw badRequest('请填写有效的报损数量');
  if (product.kind !== 'tea' && !Number.isInteger(qty)) throw badRequest('整件商品报损须为整数');
  const stock = db.prepare('SELECT grams FROM stock WHERE store_id = ? AND product_id = ?').get(storeId, product.id) as
    | { grams: number }
    | undefined;
  const have = stock?.grams || 0;
  if (have < qty) {
    throw conflict(`本店 ${product.name} 库存仅 ${have}${product.kind === 'tea' ? 'g' : '件'}，请核对后重试`);
  }
  const reason = String(input.reason || '').trim();
  if (!reason) throw badRequest('请选择或填写报损原因');
  const { amountCents, unit } = lossValue(db, product.id, qty);
  const needsApproval = policy.approvalThresholdCents > 0 && amountCents >= policy.approvalThresholdCents;
  const now = Date.now();
  const id = newId('LS');
  const approvalId = needsApproval ? newId('AP') : null;
  const tx = db.transaction(() => {
    if (!needsApproval) deductStock(db, storeId, product.id, qty);
    db.prepare(
      `INSERT INTO losses (id, store_id, product_id, name, kind, qty, unit, amount_cents, reason, note, status,
        reported_by, decided_by, decided_at, decision_note, approval_id, at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      storeId,
      product.id,
      product.name,
      product.kind,
      qty,
      unit,
      amountCents,
      reason,
      String(input.note || '').trim().slice(0, 200),
      needsApproval ? 'pending' : 'approved',
      staff.id,
      needsApproval ? null : staff.id,
      needsApproval ? null : now,
      needsApproval ? '' : '未达审批线，门店已登记',
      approvalId,
      now
    );
    if (approvalId) {
      db.prepare(
        `INSERT INTO approvals (id, kind, status, amount_cents, store_id, order_id, summary, payload_json, requested_by, decided_by, comment, result_note, created_at, decided_at)
         VALUES (?, 'LOSS', 'pending', ?, ?, NULL, ?, ?, ?, NULL, '', '', ?, NULL)`
      ).run(
        approvalId,
        amountCents,
        storeId,
        `报损申请：${product.name} · ${qty}${unit} · ¥${(amountCents / 100).toFixed(2)} · ${reason}`,
        JSON.stringify({ lossId: id, productId: product.id, qty, storeId }),
        staff.id,
        now
      );
    }
    logAction(db, {
      actorId: staff.id,
      actorName: staff.name,
      action: needsApproval ? '提交超限报损' : '登记门店报损',
      detail: `${store.name} · ${product.name} ${qty}${unit} · ¥${(amountCents / 100).toFixed(2)} · ${reason}`,
      type: 'loss',
      storeId,
      at: now
    });
  });
  tx();
  return getLoss(db, id);
}

export function approveLoss(db: DatabaseType, staff: StaffUser, lossId: string) {
  const loss = db.prepare('SELECT * FROM losses WHERE id = ?').get(lossId) as LossRow | undefined;
  if (!loss) throw notFound('报损记录不存在');
  if (loss.status !== 'pending') throw conflict('该报损不在待审批状态');
  deductStock(db, loss.store_id, loss.product_id, loss.qty);
  db.prepare(
    "UPDATE losses SET status = 'approved', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?"
  ).run(staff.id, Date.now(), '总部复核通过', lossId);
  logAction(db, {
    actorId: staff.id,
    actorName: staff.name,
    action: '审批通过报损',
    detail: `${loss.name} ${loss.qty}${loss.unit} · ¥${(loss.amount_cents / 100).toFixed(2)}`,
    type: 'loss',
    storeId: loss.store_id
  });
  return getLoss(db, lossId);
}

export function rejectLoss(db: DatabaseType, staff: StaffUser, lossId: string, comment: string) {
  const loss = db.prepare('SELECT * FROM losses WHERE id = ?').get(lossId) as LossRow | undefined;
  if (!loss) throw notFound('报损记录不存在');
  if (loss.status !== 'pending') throw conflict('该报损不在待审批状态');
  db.prepare(
    "UPDATE losses SET status = 'rejected', decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?"
  ).run(staff.id, Date.now(), String(comment || '总部驳回').slice(0, 200), lossId);
  logAction(db, {
    actorId: staff.id,
    actorName: staff.name,
    action: '驳回报损',
    detail: `${loss.name} ${loss.qty}${loss.unit}${comment ? ` · ${comment}` : ''}`,
    type: 'loss',
    storeId: loss.store_id
  });
  return getLoss(db, lossId);
}

export function getLoss(db: DatabaseType, id: string) {
  const row = db
    .prepare(
      `SELECT l.*, s.name AS store_name FROM losses l LEFT JOIN stores s ON s.id = l.store_id WHERE l.id = ?`
    )
    .get(id) as LossRow | undefined;
  if (!row) throw notFound('报损记录不存在');
  return mapLoss(row);
}

export function mapLoss(row: LossRow) {
  return {
    id: row.id,
    storeId: row.store_id,
    storeName: row.store_name || row.store_id,
    productId: row.product_id,
    name: row.name,
    kind: row.kind,
    qty: row.qty,
    unit: row.unit,
    amountCents: row.amount_cents,
    reason: row.reason,
    note: row.note,
    status: row.status,
    reportedBy: row.reported_by,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    approvalId: row.approval_id,
    at: row.at
  };
}

export function listLosses(
  db: DatabaseType,
  options: { storeIds: string[]; range?: DateRange; status?: string; limit?: number }
) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.storeIds.length) {
    clauses.push(`l.store_id IN (${options.storeIds.map(() => '?').join(',')})`);
    params.push(...options.storeIds);
  }
  if (options.range) {
    clauses.push('l.at >= ? AND l.at < ?');
    params.push(options.range.from, options.range.to);
  }
  if (options.status && options.status !== 'all') {
    clauses.push('l.status = ?');
    params.push(options.status);
  }
  const rows = db
    .prepare(
      `SELECT l.*, s.name AS store_name FROM losses l LEFT JOIN stores s ON s.id = l.store_id
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY l.at DESC LIMIT ?`
    )
    .all(...params, options.limit || 200) as LossRow[];
  return rows.map(mapLoss);
}

export function lossSummary(
  db: DatabaseType,
  options: { range?: DateRange; storeIds: string[] }
) {
  const range = options.range || monthRange();
  const scope = options.storeIds.length ? options.storeIds : [];
  const rows = scope.map((storeId) => {
    const store = db.prepare('SELECT name FROM stores WHERE id = ?').get(storeId) as { name: string } | undefined;
    const list = listLosses(db, { storeIds: [storeId], range, limit: 500 }).filter((x) => x.status !== 'rejected');
    const approved = list.filter((x) => x.status === 'approved');
    const pending = list.filter((x) => x.status === 'pending');
    const salesRow = db
      .prepare(
        "SELECT COALESCE(SUM(amount_cents),0) AS amount FROM finance_entries WHERE store_id = ? AND type = 'SALE' AND at >= ? AND at < ?"
      )
      .get(storeId, range.from, range.to) as { amount: number };
    const amount = approved.reduce((n, x) => n + x.amountCents, 0);
    const policy = getLossPolicy(db);
    const ratio = salesRow.amount > 0 ? (amount / salesRow.amount) * 100 : 0;
    return {
      storeId,
      store: store?.name || storeId,
      amountCents: amount,
      pendingCents: pending.reduce((n, x) => n + x.amountCents, 0),
      salesCents: salesRow.amount,
      ratio,
      limit: policy.monthlyRatio,
      count: approved.length,
      pending: pending.length,
      warning: policy.enabled && salesRow.amount > 0 && ratio > policy.monthlyRatio,
      recent: list.slice(0, 8)
    };
  });
  return {
    from: range.from,
    to: range.to,
    rows,
    totalCents: rows.reduce((n, x) => n + x.amountCents, 0),
    pendingTotalCents: rows.reduce((n, x) => n + x.pendingCents, 0)
  };
}

export async function deviceStatuses() {
  const [printer, machines, payment] = await Promise.all([
    hardware.printer.status(),
    hardware.teaMachine.status(),
    hardware.payment.status()
  ]);
  return { printer, machines, payment, platform: { mode: hardware.platform.mode }, member: { mode: hardware.member.mode } };
}
