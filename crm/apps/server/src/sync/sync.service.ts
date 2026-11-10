import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { BUSINESSES, toExternalBusiness, type Business } from '@fullyu/crm-shared';
import type { OutboxEvent } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { audit } from '../common/audit';
import { conflict, notFound } from '../common/errors';
import type { StaffContext } from '../common/auth.types';
import { externalClients } from '../external/external.clients';

const TZ_MS = 8 * 60 * 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

const readWebhooks = (): Record<string, string> => {
  const raw = (process.env.CRM_EXT_WEBHOOKS || '').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string' || !/^https?:\/\//.test(value)) continue;
      const business = key === 'teahour' ? 'sx' : key === 'retreat' ? 'ql' : key === 'presence' ? 'zc' : key;
      if (business === 'sx' || business === 'ql' || business === 'zc') result[business] = value;
    }
    return result;
  } catch {
    return {};
  }
};

const maxAttempts = (): number => {
  const value = Number(process.env.CRM_OUTBOX_MAX_ATTEMPTS || 5);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 10) : 5;
};

const signWebhook = (
  secret: string,
  timestamp: string,
  nonce: string,
  url: string,
  rawBody: string
): string => {
  const bodyHash = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${nonce}\nPOST\n${url}\n${bodyHash}`, 'utf8')
    .digest('hex');
};

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const interval = Number(process.env.CRM_OUTBOX_INTERVAL_MS || 0);
    if (Number.isInteger(interval) && interval > 0) {
      this.timer = setInterval(() => {
        this.deliverDue().catch(() => undefined);
      }, interval);
      this.timer.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async status() {
    const hooks = readWebhooks();
    const states = await this.prisma.businessSyncState.findMany();
    const byBusiness = new Map(states.map((state) => [state.business, state]));
    const now = Date.now();
    const businesses = [];
    for (const item of BUSINESSES) {
      const state = byBusiness.get(item.key);
      const [pending, failed, delivered] = await Promise.all([
        this.prisma.outboxEvent.count({
          where: { business: item.key, status: 'PENDING' }
        }),
        this.prisma.outboxEvent.count({
          where: { business: item.key, status: 'FAILED' }
        }),
        this.prisma.outboxEvent.count({
          where: { business: item.key, status: 'DELIVERED' }
        })
      ]);
      businesses.push({
        business: toExternalBusiness(item.key),
        lastSeenAt: state ? state.lastSeenAt.toISOString() : null,
        lastPath: state?.lastPath || '',
        lagSeconds: state ? Math.max(0, Math.floor((now - state.lastSeenAt.getTime()) / 1000)) : null,
        webhookConfigured: Boolean(hooks[item.key]),
        snapshotVersion: delivered,
        pending,
        failed
      });
    }
    return {
      businesses,
      pending: businesses.reduce((sum, item) => sum + item.pending, 0),
      failed: businesses.reduce((sum, item) => sum + item.failed, 0),
      now: new Date().toISOString()
    };
  }

  async events(query: { status?: string; business?: string; limit?: string }) {
    const status = query.status && ['PENDING', 'DELIVERED', 'FAILED', 'IGNORED'].includes(query.status)
      ? query.status
      : undefined;
    const business =
      query.business === 'teahour'
        ? 'sx'
        : query.business === 'retreat'
          ? 'ql'
          : query.business === 'presence'
            ? 'zc'
            : undefined;
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
    const rows = await this.prisma.outboxEvent.findMany({
      where: { ...(status ? { status } : {}), ...(business ? { business } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return { events: rows.map((row) => this.eventView(row)) };
  }

  async deliverDue(now = new Date()) {
    const hooks = readWebhooks();
    const due = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: 50
    });
    let delivered = 0;
    let failed = 0;
    let skipped = 0;
    for (const event of due) {
      const url = hooks[event.business];
      if (!url) {
        skipped += 1;
        continue;
      }
      const outcome = await this.send(event, url);
      if (outcome.ok) {
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'DELIVERED',
            attempts: { increment: 1 },
            deliveredAt: new Date(),
            lastError: ''
          }
        });
        delivered += 1;
      } else {
        const attempts = event.attempts + 1;
        const exhausted = attempts >= maxAttempts();
        const backoff = Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** Math.max(0, attempts - 1));
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: exhausted ? 'FAILED' : 'PENDING',
            attempts,
            nextAttemptAt: exhausted ? event.nextAttemptAt : new Date(Date.now() + backoff),
            lastError: outcome.error.slice(0, 300)
          }
        });
        if (exhausted) failed += 1;
      }
    }
    return { scanned: due.length, delivered, failed, skipped };
  }

  async retryEvent(id: string, staff: StaffContext, viaQueue = false) {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id } });
    if (!event) throw notFound('同步事件不存在');
    if (event.status === 'DELIVERED') {
      throw conflict('事件已投递成功，无需重投', { code: 'EVENT_DELIVERED' });
    }
    const updated = await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: ''
      }
    });
    await audit(this.prisma, {
      actor: staff,
      action: viaQueue ? '异常队列重投' : '同步事件重投',
      target: `${event.business} · ${event.topic} · ${event.id}`,
      detail: event.lastError.slice(0, 200)
    });
    return this.eventView(updated);
  }

  async queue() {
    const rows = await this.prisma.outboxEvent.findMany({
      where: { status: 'FAILED' },
      orderBy: { createdAt: 'asc' },
      take: 200
    });
    const expiredQuotes = await this.prisma.brandCardQuote.count({
      where: { usedAt: null, expiresAt: { lt: new Date() } }
    });
    return {
      items: rows.map((row) => ({
        ...this.eventView(row),
        type: 'OUTBOX_FAILED',
        title: `${toExternalBusiness(row.business) || row.business} 事件投递失败`,
        detail: row.lastError
      })),
      counts: { outboxFailed: rows.length, expiredQuotes }
    };
  }

  private async send(event: OutboxEvent, url: string): Promise<{ ok: boolean; error: string }> {
    const client = [...externalClients().values()].find(
      (item) => item.business === (event.business as Business)
    );
    const body = event.payloadJson;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(12).toString('base64url');
    const path = (() => {
      try {
        const parsed = new URL(url);
        return `${parsed.pathname}${parsed.search}`;
      } catch {
        return url;
      }
    })();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (client) {
      headers['x-fy-key'] = client.keyId;
      headers['x-fy-timestamp'] = timestamp;
      headers['x-fy-nonce'] = nonce;
      headers['x-fy-signature'] = signWebhook(
        client.secret,
        timestamp,
        nonce,
        path,
        body
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      });
      if (response.status >= 200 && response.status < 300) return { ok: true, error: '' };
      return { ok: false, error: `HTTP ${response.status}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message.slice(0, 300) };
    } finally {
      clearTimeout(timer);
    }
  }

  private eventView(row: OutboxEvent) {
    return {
      id: row.id,
      topic: row.topic,
      business: toExternalBusiness(row.business) || row.business,
      memberId: row.memberId,
      payload: (() => {
        try {
          return JSON.parse(row.payloadJson);
        } catch {
          return null;
        }
      })(),
      status: row.status,
      attempts: row.attempts,
      nextAttemptAt: row.nextAttemptAt.toISOString(),
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null
    };
  }
}

export const shanghaiIso = (at: Date): string =>
  new Date(at.getTime() + TZ_MS).toISOString().replace('Z', '+00:00');
