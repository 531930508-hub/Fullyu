import type { Prisma } from '@prisma/client';
import { newId } from './ids';

export type LogInput = {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  detail?: string;
  type?: string;
  storeId?: string | null;
  orderId?: string | null;
  at?: number;
};

export async function logAction(db: Prisma.TransactionClient, input: LogInput): Promise<void> {
  await db.log.create({
    data: {
      id: newId('L'),
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      action: input.action,
      detail: input.detail ?? '',
      type: input.type ?? '',
      storeId: input.storeId ?? null,
      orderId: input.orderId ?? null,
      at: new Date(input.at ?? Date.now())
    }
  });
}
