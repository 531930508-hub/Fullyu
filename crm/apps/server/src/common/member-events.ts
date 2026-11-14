import type { Member, MemberIdentity, Prisma } from '@prisma/client';
import { newId } from './ids';

const TZ_MS = 8 * 3600_000;

const shanghaiDate = (at: Date): string =>
  new Date(at.getTime() + TZ_MS).toISOString().slice(0, 10);

export type ProfileEventSource = 'staff' | 'external';

/**
 * 会员资料变更事件：主档改完后按已绑定身份写 outbox，业务端收到后用版本号判新旧。
 *
 * <p>payload 里带上各身份的业务与本地用户 id，业务端不需要再回查映射；
 * 同一份 payload 会投递给所有已绑定的业务。</p>
 */
export const enqueueProfileUpdated = async (
  tx: Prisma.TransactionClient,
  member: Member,
  identities: Pick<MemberIdentity, 'business' | 'localUserId'>[],
  source: ProfileEventSource
): Promise<void> => {
  if (!identities.length) return;
  const payloadJson = JSON.stringify({
    topic: 'member.profile.updated',
    memberNo: member.memberNo,
    source,
    version: member.profileVersion,
    name: member.name,
    gender: member.gender,
    birthday: member.birthday ? shanghaiDate(member.birthday) : null,
    avatarUrl: member.avatarUrl,
    identities: identities.map((identity) => ({
      business: identity.business,
      localUserId: identity.localUserId
    }))
  });
  const now = new Date();
  for (const identity of identities) {
    await tx.outboxEvent.create({
      data: {
        id: newId('OB'),
        topic: 'member.profile.updated',
        business: identity.business,
        memberId: member.id,
        payloadJson,
        nextAttemptAt: now
      }
    });
  }
};