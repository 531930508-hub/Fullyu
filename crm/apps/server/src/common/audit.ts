import type { Prisma } from '@prisma/client';
import type { StaffContext } from './auth.types';
import { newId } from './ids';

export type AuditInput = {
  actor: Pick<StaffContext, 'id' | 'name'>;
  action: string;
  target?: string;
  detail?: string;
  at?: Date;
};

/** 审计只追加：不提供更新或删除入口。 */
export async function audit(
  db: Pick<Prisma.TransactionClient, 'auditLog'>,
  input: AuditInput
): Promise<void> {
  await db.auditLog.create({
    data: {
      id: newId('AL'),
      actorId: input.actor.id,
      actorName: input.actor.name,
      action: input.action,
      target: input.target ?? '',
      detail: input.detail ?? '',
      at: input.at ?? new Date()
    }
  });
}
