import type { Database as DatabaseType } from 'better-sqlite3';
import { assertStoreAccess, hasPerm, type StaffUser } from '../lib/auth.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { logAction } from '../db/index.js';
import { executeRefund, getOrderRow, isOrderPrepared, refundQuoteForOrder, type RefundLineInput } from './orders.js';
import { approveLoss, rejectLoss } from './losses.js';

type ApprovalRow = {
  id: string;
  kind: string;
  status: string;
  amount_cents: number;
  store_id: string | null;
  order_id: string | null;
  summary: string;
  payload_json: string;
  requested_by: string | null;
  decided_by: string | null;
  comment: string;
  result_note: string;
  created_at: number;
  decided_at: number | null;
  requester_name?: string | null;
  store_name?: string | null;
  order_number?: string | null;
};

function mapApproval(row: ApprovalRow) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    amountCents: row.amount_cents,
    storeId: row.store_id,
    storeName: row.store_id === 'brand' ? '品牌零售' : row.store_name || row.store_id,
    orderId: row.order_id,
    orderNumber: row.order_number,
    summary: row.summary,
    requestedBy: row.requested_by,
    requesterName: row.requester_name || row.requested_by,
    decidedBy: row.decided_by,
    comment: row.comment,
    resultNote: row.result_note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>
  };
}

export function listApprovals(
  db: DatabaseType,
  options: { storeIds: string[]; status?: string; kind?: string; limit?: number }
) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.storeIds.length) {
    clauses.push(`a.store_id IN (${options.storeIds.map(() => '?').join(',')})`);
    params.push(...options.storeIds);
  }
  if (options.status && options.status !== 'all') {
    clauses.push('a.status = ?');
    params.push(options.status);
  }
  if (options.kind && options.kind !== 'all') {
    clauses.push('a.kind = ?');
    params.push(options.kind);
  }
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS requester_name, s.name AS store_name, o.number AS order_number
       FROM approvals a
       LEFT JOIN users u ON u.id = a.requested_by
       LEFT JOIN stores s ON s.id = a.store_id
       LEFT JOIN orders o ON o.id = a.order_id
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY CASE a.status WHEN 'pending' THEN 0 ELSE 1 END, a.created_at DESC
       LIMIT ?`
    )
    .all(...params, options.limit || 200) as ApprovalRow[];
  return rows.map(mapApproval);
}

function loadApproval(db: DatabaseType, id: string): ApprovalRow {
  const row = db
    .prepare(
      `SELECT a.*, u.name AS requester_name, s.name AS store_name, o.number AS order_number
       FROM approvals a
       LEFT JOIN users u ON u.id = a.requested_by
       LEFT JOIN stores s ON s.id = a.store_id
       LEFT JOIN orders o ON o.id = a.order_id
       WHERE a.id = ?`
    )
    .get(id) as ApprovalRow | undefined;
  if (!row) throw notFound('审批记录不存在');
  return row;
}

function assertApprover(staff: StaffUser, approval: ApprovalRow): void {
  const permission = approval.kind === 'REFUND' ? 'order:refund:approve' : 'loss:approve';
  if (!hasPerm(staff, permission)) throw forbidden('当前账号没有该审批权限');
  if (approval.store_id) assertStoreAccess(staff, approval.store_id);
}

export async function decideApproval(
  db: DatabaseType,
  staff: StaffUser,
  id: string,
  input: { decision: 'approve' | 'reject'; comment?: string }
) {
  const approval = loadApproval(db, id);
  if (approval.status !== 'pending') throw conflict('该审批已处理');
  assertApprover(staff, approval);
  const comment = String(input.comment || '').slice(0, 200);
  if (input.decision === 'reject') {
    const now = Date.now();
    db.transaction(() => {
      db.prepare(
        "UPDATE approvals SET status = 'rejected', decided_by = ?, comment = ?, decided_at = ? WHERE id = ?"
      ).run(staff.id, comment, now, id);
      if (approval.order_id) db.prepare('UPDATE orders SET refund_pending = 0 WHERE id = ?').run(approval.order_id);
    })();
    if (approval.kind === 'LOSS') {
      const payload = JSON.parse(approval.payload_json) as { lossId: string };
      rejectLoss(db, staff, payload.lossId, comment);
    }
    logAction(db, {
      actorId: staff.id,
      actorName: staff.name,
      action: approval.kind === 'REFUND' ? '驳回退款申请' : '驳回报损',
      detail: `${approval.summary}${comment ? ` · ${comment}` : ''}`,
      type: 'approval',
      storeId: approval.store_id,
      orderId: approval.order_id
    });
    return mapApproval(loadApproval(db, id));
  }

  if (approval.kind === 'LOSS') {
    const payload = JSON.parse(approval.payload_json) as { lossId: string };
    approveLoss(db, staff, payload.lossId);
    db.prepare(
      "UPDATE approvals SET status = 'approved', decided_by = ?, comment = ?, result_note = ?, decided_at = ? WHERE id = ?"
    ).run(staff.id, comment, '已通过，库存与成本已扣减', Date.now(), id);
    logAction(db, {
      actorId: staff.id,
      actorName: staff.name,
      action: '审批通过报损',
      detail: approval.summary,
      type: 'approval',
      storeId: approval.store_id
    });
    return mapApproval(loadApproval(db, id));
  }

  const payload = JSON.parse(approval.payload_json) as {
    lines: RefundLineInput[];
    reason?: string;
    prepared?: boolean;
  };
  let resultNote = '';
  try {
    const order = getOrderRow(db, approval.order_id || '');
    const quote = refundQuoteForOrder(db, order.id, payload.lines);
    const result = await executeRefund(db, staff, {
      order,
      quote: quote.quote,
      reason: payload.reason || '审批通过退款',
      prepared: isOrderPrepared(db, order.id),
      approvalId: approval.id,
      decidedBy: staff.name
    });
    resultNote = result.error ? `审批通过但退款执行失败：${result.error}` : `已退款 ¥${(result.refundedCents / 100).toFixed(2)}`;
  } catch (error) {
    resultNote = `审批通过但退款执行失败：${error instanceof Error ? error.message : String(error)}`;
  }
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      "UPDATE approvals SET status = 'approved', decided_by = ?, comment = ?, result_note = ?, decided_at = ? WHERE id = ?"
    ).run(staff.id, comment, resultNote, now, id);
    if (approval.order_id) db.prepare('UPDATE orders SET refund_pending = 0 WHERE id = ?').run(approval.order_id);
  })();
  logAction(db, {
    actorId: staff.id,
    actorName: staff.name,
    action: '审批退款',
    detail: `${approval.summary} · ${resultNote}`,
    type: 'approval',
    storeId: approval.store_id,
    orderId: approval.order_id
  });
  return mapApproval(loadApproval(db, id));
}

export function approvalCounts(db: DatabaseType, storeIds: string[]) {
  const clauses = storeIds.length
    ? `WHERE store_id IN (${storeIds.map(() => '?').join(',')})`
    : '';
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM approvals ${clauses} GROUP BY status`)
    .all(...storeIds) as Array<{ status: string; n: number }>;
  const map = Object.fromEntries(rows.map((x) => [x.status, x.n]));
  return { pending: map.pending || 0, approved: map.approved || 0, rejected: map.rejected || 0 };
}
