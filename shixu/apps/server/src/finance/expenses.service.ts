import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EXPENSE_CATEGORIES, expenseKey, parseExpenseAmount, parseExpenseDate, parseExpenseSheet, resolveExpenseCategory, resolveExpenseStore, sampleExpenseText, sampleMultiStoreExpenseText, type DateRange, type StoreAlias } from '@teahour/shared';
import { PrismaService } from '../common/prisma.service';
import { assertStoreAccess, type StaffContext } from '../common/auth.types';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../common/errors';
import { newId } from '../common/ids';
import { logAction } from '../common/logs';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private async storeAliases(): Promise<StoreAlias[]> {
    const rows = await this.prisma.store.findMany({ orderBy: [{ city: 'asc' }, { id: 'asc' }] });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      nameEn: row.nameEn,
      short: row.short,
      city: row.city,
      cityEn: row.cityEn
    }));
  }

  private async accessibleStores(staff: StaffContext): Promise<StoreAlias[]> {
    const all = await this.storeAliases();
    return staff.allStores ? all : all.filter((store) => staff.storeIds.includes(store.id));
  }

  private assertScope(staff: StaffContext, storeId: string): void {
    if (storeId === 'brand') {
      if (!staff.allStores) throw forbidden('只有全部门店范围才能录入品牌 / 总部费用');
      return;
    }
    assertStoreAccess(staff, storeId);
  }

  private async storeLabel(storeId: string): Promise<string> {
    if (storeId === 'brand') return '品牌零售 / 总部';
    const row = await this.prisma.store.findUnique({ where: { id: storeId } });
    return row?.name || storeId;
  }

  private categoryName(id: string): string {
    return EXPENSE_CATEGORIES.find((c) => c.id === id)?.name || id;
  }

  private mapExpense(row: {
    id: string;
    storeId: string;
    category: string;
    amountCents: number;
    at: string;
    memo: string;
    source: string;
    batchId: string | null;
    createdBy: string | null;
    createdAt: Date;
    voidedAt: Date | null;
    voidedBy: string | null;
  }, storeName: string | null) {
    return {
      id: row.id,
      storeId: row.storeId,
      storeName: row.storeId === 'brand' ? '品牌零售 / 总部' : storeName || row.storeId,
      category: row.category,
      categoryName: this.categoryName(row.category),
      amountCents: row.amountCents,
      date: row.at,
      memo: row.memo,
      source: row.source,
      batchId: row.batchId,
      createdBy: row.createdBy,
      createdAt: row.createdAt.getTime(),
      voidedAt: row.voidedAt ? row.voidedAt.getTime() : null,
      voidedBy: row.voidedBy
    };
  }

  async list(options: {
    storeIds: string[];
    range?: DateRange;
    includeVoided?: boolean;
    category?: string;
    limit?: number;
  }) {
    // SEC-04：空门店范围 = 什么都看不到（fail closed），绝不能退化成全库查询。
    if (!options.storeIds.length) return [];
    const rows = await this.prisma.expense.findMany({
      where: {
        storeId: { in: options.storeIds },
        ...(options.includeVoided ? {} : { voidedAt: null }),
        ...(options.range ? { at: { gte: options.range.fromDate, lte: options.range.toDate } } : {}),
        ...(options.category && options.category !== 'all' ? { category: options.category } : {})
      },
      orderBy: [{ at: 'desc' }, { createdAt: 'desc' }],
      take: options.limit || 500
    });
    const stores = await this.prisma.store.findMany();
    const names = new Map(stores.map((s) => [s.id, s.name]));
    return rows.map((row) => this.mapExpense(row, names.get(row.storeId) ?? null));
  }

  async summary(options: { storeIds: string[]; range: DateRange }) {
    const list = await this.list({ ...options, limit: 5000 });
    const byCategory = EXPENSE_CATEGORIES.map((category) => {
      const rows = list.filter((x) => x.category === category.id);
      return {
        id: category.id,
        name: category.name,
        nameEn: category.nameEn,
        amountCents: rows.reduce((n, x) => n + x.amountCents, 0),
        count: rows.length
      };
    });
    const byStore = new Map<string, { storeId: string; storeName: string; amountCents: number; count: number }>();
    for (const row of list) {
      const existing = byStore.get(row.storeId) || {
        storeId: row.storeId,
        storeName: row.storeName,
        amountCents: 0,
        count: 0
      };
      existing.amountCents += row.amountCents;
      existing.count += 1;
      byStore.set(row.storeId, existing);
    }
    return {
      totalCents: list.reduce((n, x) => n + x.amountCents, 0),
      count: list.length,
      byCategory,
      byStore: Array.from(byStore.values()).sort((a, b) => b.amountCents - a.amountCents)
    };
  }

  private async getExpense(id: string) {
    const row = await this.prisma.expense.findUnique({ where: { id } });
    if (!row) return null;
    const store = await this.prisma.store.findUnique({ where: { id: row.storeId } });
    return this.mapExpense(row, store?.name ?? null);
  }

  async add(
    staff: StaffContext,
    input: { storeId?: string; date?: string; category?: string; amount?: string | number; memo?: string }
  ) {
    const stores = await this.storeAliases();
    // 解析失败属于用户输入问题，统一翻译成 400，避免把门店/类别/金额写错变成 500。
    let storeId: string;
    let date: string;
    let category: ReturnType<typeof resolveExpenseCategory>;
    let amountCents: number;
    try {
      storeId = resolveExpenseStore(stores, input.storeId ?? '');
      date = parseExpenseDate(input.date);
      category = resolveExpenseCategory(input.category);
      amountCents = parseExpenseAmount(input.amount);
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : String(error));
    }
    this.assertScope(staff, storeId);
    const memo = String(input.memo || '').trim().slice(0, 120);
    const id = newId('EX');
    const now = new Date();
    await this.prisma.expense.create({
      data: {
        id,
        storeId,
        category: category.id,
        amountCents,
        at: date,
        memo,
        source: 'manual',
        batchId: null,
        createdBy: staff.id,
        createdAt: now
      }
    });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '录入运营费用',
      detail: `${await this.storeLabel(storeId)} · ${category.name} · ¥${(amountCents / 100).toFixed(2)}${memo ? ` · ${memo}` : ''}`,
      type: 'finance',
      storeId,
      at: now.getTime()
    });
    return this.getExpense(id);
  }

  async preview(staff: StaffContext, text: string) {
    const stores = await this.accessibleStores(staff);
    const existingRows = await this.prisma.expense.findMany({ where: { voidedAt: null } });
    const existing = new Set(
      existingRows.map((x) =>
        expenseKey({ storeId: x.storeId, category: x.category, date: x.at, amountCents: x.amountCents, memo: x.memo })
      )
    );
    const parsed = parseExpenseSheet(text, stores, { existingKeys: existing });
    const rows = parsed.rows.filter((row) => {
      if (row.storeId === 'brand') return staff.allStores;
      return staff.allStores || staff.storeIds.includes(row.storeId);
    });
    const denied = parsed.rows.length - rows.length;
    const errors = [...parsed.errors];
    if (denied > 0) errors.push({ line: 0, message: `${denied} 行属于未授权门店，已跳过` });
    const totalCents = rows.reduce((n, x) => n + x.amountCents, 0);
    return {
      rows,
      errors,
      duplicates: parsed.duplicates,
      lineCount: parsed.lineCount,
      totalCents,
      storeCount: new Set(rows.map((x) => x.storeId)).size
    };
  }

  async commit(staff: StaffContext, text: string, source = 'import') {
    const preview = await this.preview(staff, text);
    if (preview.errors.length) {
      const first = preview.errors[0];
      throw unprocessable(
        first.line ? `第 ${first.line} 行需要修正：${first.message}` : first.message,
        preview.errors
      );
    }
    const batchId = newId('IMP');
    const now = new Date();
    // TX-11：去重复核与写入同一事务（SQLite 写串行，检查+插入即无竞态窗口），
    // sourceKey 落库并有唯一索引兜底——并发/网络重试同一文件只落一次，
    // "相同金额"从不是唯一凭证：键包含门店/类别/日期/金额/备注/源行号。
    let skippedInTx = 0;
    let created = 0;
    let totalCents = 0;
    await this.prisma.$transaction(async (tx) => {
      const existingRows = await tx.expense.findMany({ where: { voidedAt: null } });
      const existingKeys = new Set(
        existingRows.map((x) =>
          expenseKey({
            storeId: x.storeId,
            category: x.category,
            date: x.at,
            amountCents: x.amountCents,
            memo: x.memo
          })
        )
      );
      const existingSourceKeys = new Set(
        existingRows.map((x) => x.sourceKey).filter((x): x is string => Boolean(x))
      );
      for (const row of preview.rows) {
        const key = expenseKey({
          storeId: row.storeId,
          category: row.category,
          date: row.date,
          amountCents: row.amountCents,
          memo: row.memo
        });
        const sourceKey = `imp:${createHash('sha256')
          .update(
            [row.storeId, row.category, row.date, row.amountCents, row.memo, row.line].join('|')
          )
          .digest('hex')
          .slice(0, 32)}`;
        if (existingKeys.has(key) || existingSourceKeys.has(sourceKey)) {
          skippedInTx += 1;
          continue;
        }
        existingKeys.add(key);
        existingSourceKeys.add(sourceKey);
        await tx.expense.create({
          data: {
            id: newId('EX'),
            storeId: row.storeId,
            category: row.category,
            amountCents: row.amountCents,
            at: row.date,
            memo: row.memo,
            source,
            batchId,
            sourceKey,
            createdBy: staff.id,
            createdAt: now
          }
        });
        created += 1;
        totalCents += row.amountCents;
      }
      if (!created) throw conflict('没有可新增的有效行（可能全部重复）');
      await logAction(tx, {
        actorId: staff.id,
        actorName: staff.name,
        action: '批量导入运营费用',
        detail: `${created} 笔 · ¥${(totalCents / 100).toFixed(2)} · 批次 ${batchId} · 重复跳过 ${preview.duplicates + skippedInTx} 笔`,
        type: 'finance',
        at: now.getTime()
      });
    });
    return {
      created,
      duplicates: preview.duplicates + skippedInTx,
      totalCents,
      storeCount: preview.storeCount,
      batchId
    };
  }

  async void(staff: StaffContext, id: string) {
    const row = await this.prisma.expense.findUnique({ where: { id } });
    if (!row) throw notFound('费用记录不存在');
    if (row.voidedAt) throw conflict('该费用已作废');
    this.assertScope(staff, row.storeId);
    await this.prisma.expense.update({
      where: { id },
      data: { voidedAt: new Date(), voidedBy: staff.id }
    });
    await logAction(this.prisma, {
      actorId: staff.id,
      actorName: staff.name,
      action: '作废运营费用',
      detail: `${await this.storeLabel(row.storeId)} · ${this.categoryName(row.category)} · ¥${(row.amountCents / 100).toFixed(2)}`,
      type: 'finance',
      storeId: row.storeId
    });
    return this.getExpense(id);
  }

  async sample(staff: StaffContext, today: string): Promise<string> {
    const stores = await this.accessibleStores(staff);
    if (!staff.allStores) {
      const names = stores.map((s) => s.name);
      return names.length ? sampleMultiStoreExpenseText(today, names) : sampleExpenseText(today);
    }
    return sampleMultiStoreExpenseText(today, stores.map((s) => s.name));
  }
}
