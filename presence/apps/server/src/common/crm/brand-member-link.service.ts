import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

/**
 * CRM 会员号 ↔ 本地账号的映射。
 *
 * CRM 推送只带 memberNo，不带本地 userId；会员页与权益解析每次都会拿到 memberNo，
 * 顺手回写 `users.crm_member_no`，推送到达时就能精确清掉对应账号的权益缓存，
 * 不必为了「刷一个缓存」去调 CRM 猜账号，也不用整表清缓存（会把其他会员一起打回查库）。
 */
@Injectable()
export class BrandMemberLinkService {
  private readonly logger = new Logger('BrandMemberLinkService')
  /** 每个进程记住最近一次写入的值，避免每次读会员页都写库。 */
  private readonly written = new Map<string, string>()

  constructor(private readonly prisma: PrismaService) {}

  /** 回写映射；失败只记日志，不影响会员页与定价主流程。 */
  async remember(userId: string, memberNo: string | undefined | null): Promise<void> {
    const no = String(memberNo || '').trim()
    if (!userId || !no) return
    if (this.written.get(userId) === no) return
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { crmMemberNo: no } })
      this.written.set(userId, no)
      if (this.written.size > 5000) {
        const oldest = this.written.keys().next().value
        if (oldest !== undefined) this.written.delete(oldest)
      }
    } catch (error) {
      // 唯一键冲突（同一会员号已绑到另一个账号）等异常：留给人工核对，不阻断读接口。
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`保存 CRM 会员号映射失败（${userId} / ${no}）：${message}`)
    }
  }

  /** 推送到达时按 memberNo 反查本地账号；没绑定过就返回 null。 */
  async findUserId(memberNo: string | undefined | null): Promise<string | null> {
    const no = String(memberNo || '').trim()
    if (!no) return null
    const user = await this.prisma.user.findUnique({
      where: { crmMemberNo: no },
      select: { id: true },
    })
    return user?.id || null
  }
}