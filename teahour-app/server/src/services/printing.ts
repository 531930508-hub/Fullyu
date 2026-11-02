import type { Database as DatabaseType } from 'better-sqlite3';
import { newId } from '../lib/ids.js';
import { hardware } from '../hardware/index.js';

type OrderForPrint = {
  id: string;
  number: string;
  store_id: string;
  store_name: string;
};

export function enqueuePrintJob(db: DatabaseType, orderId: string, reprint = false): string | null {
  const order = db
    .prepare(
      `SELECT o.id, o.number, o.store_id, s.name AS store_name FROM orders o
       JOIN stores s ON s.id = o.store_id WHERE o.id = ?`
    )
    .get(orderId) as OrderForPrint | undefined;
  if (!order) return null;
  const rows = db
    .prepare(
      `SELECT u.label, oi.name AS product_name, oi.temp, oi.ice
       FROM order_units u JOIN order_items oi ON oi.id = u.item_id
       WHERE u.order_id = ? ORDER BY u.label`
    )
    .all(orderId) as Array<{ label: string; product_name: string; temp: string | null; ice: string | null }>;
  if (!rows.length) return null;
  const payload = {
    orderId: order.id,
    orderNumber: order.number,
    storeId: order.store_id,
    reprint,
    labels: rows.map((row, index) => ({
      label: row.label,
      orderNumber: order.number,
      storeName: order.store_name,
      productName: row.product_name,
      temp: row.temp,
      ice: row.ice,
      cupIndex: index + 1,
      cupTotal: rows.length,
      printedAt: new Date().toISOString()
    }))
  };
  const id = newId('PJ');
  const now = Date.now();
  db.prepare(
    `INSERT INTO print_jobs (id, order_id, kind, payload_json, status, attempts, last_error, created_at, updated_at)
     VALUES (?,?,?,?, 'queued', 0, NULL, ?, ?)`
  ).run(id, orderId, reprint ? 'reprint' : 'labels', JSON.stringify(payload), now, now);
  db.prepare('UPDATE orders SET print_status = ? WHERE id = ?').run('queued', orderId);
  return id;
}

export async function processPrintJob(db: DatabaseType, jobId: string): Promise<{ ok: boolean; error?: string }> {
  const job = db
    .prepare(
      `SELECT j.*, o.store_id, s.printer_status FROM print_jobs j
       JOIN orders o ON o.id = j.order_id JOIN stores s ON s.id = o.store_id WHERE j.id = ?`
    )
    .get(jobId) as
    | {
        id: string;
        order_id: string;
        payload_json: string;
        status: string;
        attempts: number;
        store_id: string;
        printer_status: string;
      }
    | undefined;
  if (!job) return { ok: false, error: '打印任务不存在' };
  if (job.status === 'printed') return { ok: true };
  if (job.printer_status !== 'online') {
    db.prepare('UPDATE print_jobs SET last_error = ?, updated_at = ? WHERE id = ?').run(
      '门店标签机离线',
      Date.now(),
      jobId
    );
    db.prepare('UPDATE orders SET print_status = ? WHERE id = ?').run('queued', job.order_id);
    return { ok: false, error: '门店标签机离线' };
  }
  try {
    const payload = JSON.parse(job.payload_json);
    const result = await hardware.printer.print(payload);
    if (!result.ok) throw new Error(result.error || '打印失败');
    db.prepare(
      `UPDATE print_jobs SET status = 'printed', attempts = attempts + 1, last_error = NULL, updated_at = ? WHERE id = ?`
    ).run(Date.now(), jobId);
    db.prepare('UPDATE orders SET print_status = ? WHERE id = ?').run('printed', job.order_id);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare(
      `UPDATE print_jobs SET status = 'queued', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`
    ).run(message, Date.now(), jobId);
    db.prepare('UPDATE orders SET print_status = ? WHERE id = ?').run('queued', job.order_id);
    return { ok: false, error: message };
  }
}

export function listPrintJobs(db: DatabaseType, storeId?: string) {
  const rows = db
    .prepare(
      `SELECT j.*, o.number AS order_number, o.store_id FROM print_jobs j
       JOIN orders o ON o.id = j.order_id
       ${storeId ? 'WHERE o.store_id = ?' : ''}
       ORDER BY j.created_at DESC LIMIT 100`
    )
    .all(...(storeId ? [storeId] : [])) as Array<{
    id: string;
    order_id: string;
    order_number: string;
    store_id: string;
    kind: string;
    status: string;
    attempts: number;
    last_error: string | null;
    payload_json: string;
    created_at: number;
    updated_at: number;
  }>;
  return rows.map((row) => {
    const payload = JSON.parse(row.payload_json);
    return {
      id: row.id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      storeId: row.store_id,
      kind: row.kind,
      status: row.status,
      attempts: row.attempts,
      lastError: row.last_error,
      labels: payload.labels?.length || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });
}
