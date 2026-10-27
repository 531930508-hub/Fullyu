import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { RedisService } from '../../common/redis.service'
import { BusinessException } from '../../common/exceptions/business.exception'
import { generateOrderNo } from '../../common/order-no.helper'

/** 社群创建/编辑入参（后台与主理人创建共用，字段白名单过滤） */
export interface CommunityInput {
  name?: string
  slogan?: string
  category?: string
  coverUrl?: string
  coverFallback?: string
  ownerUserId?: string | null
  ownerName?: string
  ownerTitle?: string
  ownerAvatar?: string
  memberCount?: number
  yearlyFee?: number
  isOfficial?: boolean
  isNew?: boolean
  tags?: string[]
  description?: string
  status?: string
  isActive?: boolean
  growth30d?: number
  activeToday?: number
  visibility?: string
  joinMode?: string
  interestPool?: string[]
}

/** 活动入参 */
export interface CommunityEventInput {
  communityId?: string
  /** YYYY-MM-DD */
  eventDate?: string
  time?: string
  endTime?: string
  title?: string
  /** OFFLINE | LIVE | ONLINE */
  type?: string
  venue?: string
  capacity?: number
  joined?: number
  courseId?: string
  scope?: string
  isActive?: boolean
  description?: string
}

/** 广场排序口径（内部逻辑，不向 C 端透出）：
 * 推荐 = 新社群流量扶持 + 老社群按增长/活跃表现加权；
 * 最新 = 新社群优先；热门 = 成员规模 + 近 30 天增长。 */
export type CommunitySort = 'recommend' | 'newest' | 'hot'

export type ModerationTarget = 'POST' | 'COMMENT'
export type ModerationAction = 'HIDE' | 'RESTORE' | 'DELETE'

const PRIVACY_VALUES = ['NONE', 'COMPLETED', 'ALL']
const INTEREST_LIMIT = 3
const POOL_LIMIT = 12

function parseTags(raw: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function parseJsonArray(raw: string | null | undefined): any[] {
  try {
    const arr = JSON.parse(raw || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** 加入关系是否仍在有效期内：免费社群只看是否加入，付费社群看年费有效期 */
  private isActiveJoin(community: { yearlyFee: number }, join: { paidUntil: Date | null } | null, now = new Date()) {
    if (!join) return false
    if (!community.yearlyFee) return true
    return Boolean(join.paidUntil && join.paidUntil.getTime() > now.getTime())
  }

  private fmtDate(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0')
    const day = `${d.getDate()}`.padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  }

  /** 活动结束时刻：优先使用 endTime，其次开始时间，最后当日 23:59 */
  private eventEndAt(e: { eventDate: Date; time: string; endTime?: string | null }): Date {
    const date = this.fmtDate(e.eventDate)
    const end = e.endTime || e.time || '23:59'
    const value = new Date(`${date}T${end}:00`)
    return Number.isFinite(value.getTime()) ? value : new Date(`${date}T23:59:59`)
  }

  private eventEnded(e: { eventDate: Date; time: string; endTime?: string | null }): boolean {
    return this.eventEndAt(e).getTime() <= Date.now()
  }

  private async getJoin(communityId: string, userId: string) {
    return this.prisma.communityJoin.findUnique({
      where: { communityId_userId: { communityId, userId } },
    })
  }

  /** 是否为本社群有效成员或主理人 */
  async assertMember(communityId: string, userId: string) {
    const c = await this.prisma.community.findUnique({ where: { id: communityId } })
    if (!c) throw new BusinessException('社群不存在', 4040)
    if (c.ownerUserId === userId) return c
    const join = await this.getJoin(communityId, userId)
    if (!this.isActiveJoin(c, join)) {
      throw new BusinessException('加入社群后可查看成员内容', 4031)
    }
    return c
  }

  private async assertHost(communityId: string, userId: string) {
    const c = await this.prisma.community.findUnique({ where: { id: communityId } })
    if (!c) throw new BusinessException('社群不存在', 4040)
    if (c.ownerUserId !== userId) throw new BusinessException('仅主理人可操作', 4032)
    return c
  }

  private hostRoleLabel(role?: string | null) {
    return role === 'EXTENDED' ? '扩展主理人' : role === 'BASIC' ? '基础主理人' : ''
  }

  private async hostRole(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { communityHostRole: true },
    })
    return u?.communityHostRole || null
  }

  // ==================== 公共查询（C 端） ====================

  /** 社群广场：仅公开可见、审核通过且启用的社群；isNew 仅参与排序不返回 */
  async listPublic(category?: string, keyword?: string, sort: CommunitySort = 'recommend') {
    const rows = await this.prisma.community.findMany({
      where: { status: 'APPROVED', isActive: true, visibility: 'PUBLIC' },
      orderBy: { createdAt: 'desc' },
    })
    const kw = (keyword || '').trim()
    const filtered = rows.filter((c) => {
      const catOk = !category || category === '全部' || c.category === category
      const kwOk = !kw || c.name.includes(kw) || parseTags(c.tags).some((t) => t.includes(kw))
      return catOk && kwOk
    })
    const score = (c: (typeof rows)[number]) =>
      c.growth30d * 2 + c.activeToday + Math.log(c.memberCount + 1) * 10 + (c.isNew ? 500 : 0)
    if (sort === 'newest') {
      filtered.sort((a, b) => Number(b.isNew) - Number(a.isNew) || b.createdAt.getTime() - a.createdAt.getTime())
    } else if (sort === 'hot') {
      filtered.sort((a, b) => b.memberCount + b.growth30d * 5 - (a.memberCount + a.growth30d * 5))
    } else {
      filtered.sort((a, b) => score(b) - score(a))
    }
    return filtered.map((c) => this.toPublicDTO(c))
  }

  /** C 端展示 DTO：剔除 isNew/growth30d/status 等内部运营字段 */
  private toPublicDTO(c: any) {
    return {
      id: c.id,
      name: c.name,
      slogan: c.slogan,
      category: c.category,
      cover: c.coverUrl || '',
      coverFallback: c.coverFallback || 'linear-gradient(135deg, #6D5934 0%, #A78E70 100%)',
      owner: { name: c.ownerName, title: c.ownerTitle || '', avatar: c.ownerAvatar || '' },
      /** 仅用于主理人主页分享与成员名片，不含隐私信息 */
      ownerUserId: c.ownerUserId || '',
      memberCount: c.memberCount,
      yearlyFee: c.yearlyFee,
      isOfficial: c.isOfficial,
      tags: parseTags(c.tags),
      description: c.description || '',
      activeToday: c.activeToday,
      visibility: c.visibility,
      joinMode: c.joinMode,
      interestPool: parseJsonArray(c.interestPool),
      createdAt: c.createdAt,
    }
  }

  async getPublic(id: string) {
    const c = await this.prisma.community.findFirst({
      where: { id, status: 'APPROVED', isActive: true },
    })
    if (!c) throw new BusinessException('社群不存在或已下架', 4040)
    const base = this.toPublicDTO(c)
    if (c.visibility === 'INVITE_ONLY') {
      // 邀请制社群：仅展示可公开的身份信息，不暴露简介、标签、成员规模与费用
      return {
        ...base,
        restricted: true,
        description: '',
        tags: [],
        interestPool: [],
        memberCount: 0,
        yearlyFee: 0,
        activeToday: 0,
      }
    }
    return { ...base, restricted: false }
  }

  /** 当前用户与社群的关系（是否已加入 / 是否主理人 / 入群方式 / 申请状态） */
  async getMembership(id: string, userId: string) {
    const c = await this.prisma.community.findUnique({ where: { id } })
    if (!c) throw new BusinessException('社群不存在', 4040)
    const join = await this.getJoin(id, userId)
    const joined = this.isActiveJoin(c, join)
    const request = await this.prisma.communityJoinRequest.findUnique({
      where: { communityId_userId: { communityId: id, userId } },
    })
    const claim = await this.findUsableClaim(id, userId)
    return {
      joined,
      managed: c.ownerUserId === userId,
      hostRole: c.ownerUserId === userId ? this.hostRoleLabel(await this.hostRole(userId)) : '',
      yearlyFee: c.yearlyFee,
      paidUntil: join?.paidUntil ?? null,
      /** 已加入但年费到期：前端展示续费，而不是再次“首加入” */
      expired: Boolean(join) && !joined && Boolean(c.yearlyFee),
      joinMode: c.joinMode,
      visibility: c.visibility,
      restricted: c.visibility === 'INVITE_ONLY' && !joined && c.ownerUserId !== userId,
      requestStatus: request?.status || null,
      requestNote: request?.reviewNote || '',
      privacy: join?.privacy || 'NONE',
      interests: parseJsonArray(join?.interests),
      inviteAccess: Boolean(claim),
      claimedInvite: claim
        ? {
            claimId: claim.id,
            inviteId: claim.inviteId,
            name: claim.invite.name,
            kind: claim.invite.kind,
            amount: claim.invite.amount,
          }
        : null,
    }
  }

  /** 我的社群：我管理的 + 我加入且仍在有效期内的 */
  async listMine(userId: string) {
    const [managed, joins] = await Promise.all([
      this.prisma.community.findMany({
        where: { ownerUserId: userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.communityJoin.findMany({ where: { userId }, orderBy: { joinedAt: 'desc' } }),
    ])
    const joinedIds = joins.map((j) => j.communityId)
    const joined = joinedIds.length
      ? await this.prisma.community.findMany({ where: { id: { in: joinedIds } } })
      : []
    const joinedMap = new Map(joined.map((c) => [c.id, c]))
    const now = new Date()
    return {
      hostRole: this.hostRoleLabel(await this.hostRole(userId)),
      managed: managed.map((c) => this.toPublicDTO(c)),
      joined: joins
        .map((j) => {
          const c = joinedMap.get(j.communityId)
          if (!c || !this.isActiveJoin(c, j, now)) return null
          return this.toPublicDTO(c)
        })
        .filter(Boolean),
    }
  }

  /** 活动日历数据：按实际日期/时间升序；内部活动仅成员可见 */
  async listEvents(id: string, userId?: string) {
    const c = await this.prisma.community.findUnique({ where: { id } })
    if (!c) throw new BusinessException('社群不存在', 4040)
    const isMember = Boolean(userId) && (c.ownerUserId === userId || this.isActiveJoin(c, await this.getJoin(id, userId!)))
    const events = await this.prisma.communityEvent.findMany({
      where: {
        communityId: id,
        isActive: true,
        ...(isMember ? {} : { scope: 'PUBLIC' }),
      },
      orderBy: [{ eventDate: 'asc' }, { time: 'asc' }],
    })
    const signups = userId && isMember
      ? await this.prisma.communityEventSignup.findMany({
          where: { communityId: id, userId, status: 'SIGNED' },
          select: { eventId: true },
        })
      : []
    const signed = new Set(signups.map((s) => s.eventId))
    return events.map((e) => this.toEventDTO(e, signed.has(e.id)))
  }

  private toEventDTO(e: any, signed = false) {
    return {
      id: e.id,
      communityId: e.communityId,
      date: this.fmtDate(e.eventDate),
      fullDate: this.fmtDate(e.eventDate),
      time: e.time,
      endTime: e.endTime || '',
      title: e.title,
      type: e.type,
      venue: e.venue || '',
      joined: e.joined,
      capacity: e.capacity,
      courseId: e.courseId || '',
      scope: e.scope,
      isActive: e.isActive,
      description: e.description || '',
      ended: this.eventEnded(e),
      signed,
      cover: e.community?.coverUrl || '',
    }
  }

  async getEvent(communityId: string, eventId: string, userId?: string) {
    const e = await this.prisma.communityEvent.findUnique({
      where: { id: eventId },
      include: { community: true },
    })
    if (!e || e.communityId !== communityId || !e.isActive) {
      throw new BusinessException('活动不存在或已停用', 4041)
    }
    const c = e.community
    const isMember = Boolean(userId) && (c.ownerUserId === userId || this.isActiveJoin(c, await this.getJoin(communityId, userId!)))
    if (e.scope === 'INTERNAL' && !isMember) {
      throw new BusinessException('该活动仅对社群成员开放', 4031)
    }
    const signup = userId
      ? await this.prisma.communityEventSignup.findUnique({
          where: { eventId_userId: { eventId, userId } },
        })
      : null
    return {
      ...this.toEventDTO({ ...e, community: c }, signup?.status === 'SIGNED'),
      community: { id: c.id, name: c.name, cover: c.coverUrl || '', ownerName: c.ownerName },
    }
  }

  /** 社群动态：成员专属；已发布且未隐藏/删除 */
  async listPosts(id: string, userId: string) {
    await this.assertMember(id, userId)
    const posts = await this.prisma.communityPost.findMany({
      where: {
        communityId: id,
        status: 'APPROVED',
        isHidden: false,
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
    })
    const comments = await this.prisma.communityComment.findMany({
      where: {
        communityId: id,
        postId: { in: posts.map((p) => p.id) },
        isHidden: false,
        isDeleted: false,
      },
      orderBy: { createdAt: 'asc' },
    })
    const byPost = new Map<string, any[]>()
    for (const cm of comments) {
      const list = byPost.get(cm.postId) || []
      list.push({
        id: cm.id,
        author: { name: cm.authorName, avatar: cm.authorAvatar || '' },
        content: cm.content,
        time: cm.createdAt,
      })
      byPost.set(cm.postId, list)
    }
    return posts.map((p) => ({
      ...this.toPostDTO(p),
      commentsList: byPost.get(p.id) || [],
    }))
  }

  private toPostDTO(p: any) {
    let images: string[] = []
    try {
      images = p.images ? JSON.parse(p.images) : []
    } catch {
      images = []
    }
    return {
      id: p.id,
      author: { id: p.authorId, name: p.authorName, role: p.authorRole, avatar: p.authorAvatar || '', level: p.authorLevel },
      time: p.createdAt,
      content: p.content,
      images,
      likes: p.likes,
      comments: p.comments,
      liked: false,
    }
  }

  /** 成员列表（仅成员可见；付费社群仅展示年费有效期内成员） */
  async listMembers(id: string, userId: string) {
    await this.assertMember(id, userId)
    const community = await this.prisma.community.findUnique({ where: { id } })
    if (!community) return []
    const allJoins = await this.prisma.communityJoin.findMany({
      where: { communityId: id },
      orderBy: { joinedAt: 'asc' },
    })
    const now = new Date()
    const joins = allJoins.filter((join) => this.isActiveJoin(community, join, now))
    if (!joins.length) return []
    const users = await this.prisma.user.findMany({
      where: { id: { in: joins.map((j) => j.userId) } },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))
    return joins
      .filter((j) => userMap.has(j.userId))
      .map((j) => {
        const u = userMap.get(j.userId)!
        return { id: u.id, name: u.nickname, avatar: u.avatar || '', joinedAt: j.joinedAt, interests: parseJsonArray(j.interests) }
      })
  }

  /** 成员名片：按对方在本社群的隐私设置展示活动记录 */
  async getMemberCard(communityId: string, targetUserId: string, requesterId: string) {
    const c = await this.assertMember(communityId, requesterId)
    const join = await this.getJoin(communityId, targetUserId)
    if (!join || !this.isActiveJoin(c, join)) {
      throw new BusinessException('该成员不在社群内', 4042)
    }
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, nickname: true, avatar: true },
    })
    if (!user) throw new BusinessException('成员不存在', 4042)
    const events = await this.prisma.communityEvent.findMany({
      where: { communityId, isActive: true, scope: 'PUBLIC' },
      orderBy: [{ eventDate: 'desc' }, { time: 'desc' }],
    })
    const visible = join.privacy === 'NONE'
      ? []
      : events.filter((e) => join.privacy === 'ALL' || this.eventEnded(e))
    return {
      id: user.id,
      name: user.nickname,
      avatar: user.avatar || '',
      joinedAt: join.joinedAt,
      privacy: join.privacy,
      interests: parseJsonArray(join.interests),
      activities: visible.map((e) => ({
        id: e.id,
        title: e.title,
        date: this.fmtDate(e.eventDate),
        time: e.time,
        ended: this.eventEnded(e),
      })),
    }
  }

  // ==================== 用户操作（小程序，需登录） ====================

  /**
   * 加入社群：
   * - 免费社群 / 免单礼遇：直接建立加入关系，并留一条 0 元订单作为权益凭证
   * - 付费社群：生成 COMMUNITY 待支付订单（可用邀请减免），支付成功后写有效期
   * - 审核/邀请制：审核通过或持有有效邀请后才允许进入支付/加入
   */
  async join(id: string, userId: string) {
    const c = await this.prisma.community.findFirst({
      where: { id, status: 'APPROVED', isActive: true },
    })
    if (!c) throw new BusinessException('社群不存在或已下架', 4040)

    const now = new Date()
    const exist = await this.getJoin(id, userId)
    if (this.isActiveJoin(c, exist, now)) {
      return { joined: true, requiresPayment: false, yearlyFee: c.yearlyFee }
    }

    const request = await this.prisma.communityJoinRequest.findUnique({
      where: { communityId_userId: { communityId: id, userId } },
    })
    const claim = await this.findUsableClaim(id, userId)
    const approved = request?.status === 'APPROVED'

    if (c.joinMode === 'INVITE' && !claim && !approved) {
      return {
        joined: false,
        requiresInvite: true,
        joinMode: c.joinMode,
        yearlyFee: c.yearlyFee,
      }
    }
    if (c.joinMode === 'APPROVAL' && !approved) {
      return {
        joined: false,
        requiresApproval: true,
        requestStatus: request?.status || null,
        joinMode: c.joinMode,
        yearlyFee: c.yearlyFee,
        claimedInvite: claim ? this.claimSummary(claim) : null,
      }
    }

    const waiver = claim?.invite.kind === 'WAIVER'
    const reduce = claim?.invite.kind === 'REDUCE' ? Math.max(0, claim.invite.amount) : 0
    const payable = waiver ? 0 : Math.max(0, c.yearlyFee - reduce)

    // 免年费 / 免费社群：直接建立权益并留 0 元订单
    if (payable <= 0) {
      if (!c.yearlyFee && !claim) {
        if (exist) {
          await this.prisma.communityJoin.update({
            where: { id: exist.id },
            data: { paidUntil: null, joinedAt: now, source: 'FREE' },
          })
          return { joined: true, requiresPayment: false, yearlyFee: 0 }
        }
        await this.prisma.$transaction([
          this.prisma.communityJoin.create({ data: { communityId: id, userId, source: 'FREE' } }),
          this.prisma.community.update({ where: { id }, data: { memberCount: { increment: 1 } } }),
        ])
        return { joined: true, requiresPayment: false, yearlyFee: 0 }
      }

      const orderNo = await generateOrderNo(this.redis, 'COMMUNITY', this.prisma)
      const paidUntil = new Date(now)
      paidUntil.setFullYear(paidUntil.getFullYear() + 1)
      const result = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNo,
            userId,
            communityId: id,
            orderType: 'COMMUNITY',
            originalPrice: c.yearlyFee,
            discountAmount: Math.max(0, c.yearlyFee - payable),
            actualPaid: 0,
            platformFee: 0,
            status: 'PAID',
            paymentTime: now,
            communityInviteId: claim?.inviteId || null,
            communityInviteClaimId: claim?.id || null,
          },
        })
        if (claim) {
          await tx.communityInviteClaim.update({
            where: { id: claim.id },
            data: { usedAt: now, orderId: order.id },
          })
          await tx.communityInvite.update({
            where: { id: claim.inviteId },
            data: { usedCount: { increment: 1 } },
          })
        }
        if (exist) {
          await tx.communityJoin.update({
            where: { id: exist.id },
            data: { paidUntil, joinedAt: now, source: waiver ? 'WAIVER' : 'COUPON', orderId: order.id },
          })
        } else {
          await tx.communityJoin.create({
            data: {
              communityId: id,
              userId,
              paidUntil,
              source: waiver ? 'WAIVER' : 'COUPON',
              orderId: order.id,
            },
          })
          await tx.community.update({ where: { id }, data: { memberCount: { increment: 1 } } })
        }
        return order
      })
      return {
        joined: true,
        requiresPayment: false,
        zeroPriceEntitlement: true,
        orderId: result.id,
        yearlyFee: c.yearlyFee,
        paid: 0,
      }
    }

    // 付费社群：复用未超时的待支付订单，避免重复创建
    const pending = await this.prisma.order.findFirst({
      where: {
        userId,
        communityId: id,
        orderType: 'COMMUNITY',
        status: 'PENDING_PAYMENT',
        createdAt: { gt: new Date(now.getTime() - 15 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    })
    if (pending) {
      return {
        joined: false,
        requiresPayment: true,
        orderId: pending.id,
        orderNo: pending.orderNo,
        amount: Number(pending.actualPaid),
        yearlyFee: c.yearlyFee,
        claimedInvite: claim ? this.claimSummary(claim) : null,
      }
    }

    const orderNo = await generateOrderNo(this.redis, 'COMMUNITY', this.prisma)
    const platformFee = Math.round(payable * 0.1)
    const order = await this.prisma.order.create({
      data: {
        orderNo,
        userId,
        communityId: id,
        orderType: 'COMMUNITY',
        originalPrice: c.yearlyFee,
        discountAmount: Math.max(0, c.yearlyFee - payable),
        actualPaid: payable,
        platformFee,
        status: 'PENDING_PAYMENT',
        communityInviteId: claim?.inviteId || null,
        communityInviteClaimId: claim?.id || null,
      },
    })
    return {
      joined: false,
      requiresPayment: true,
      orderId: order.id,
      orderNo: order.orderNo,
      amount: payable,
      originalAmount: c.yearlyFee,
      yearlyFee: c.yearlyFee,
      claimedInvite: claim ? this.claimSummary(claim) : null,
    }
  }

  private claimSummary(claim: any) {
    return {
      claimId: claim.id,
      inviteId: claim.inviteId,
      name: claim.invite.name,
      kind: claim.invite.kind,
      amount: claim.invite.amount,
    }
  }

  /** 找出当前用户在本社群可用的最佳邀请：免年费优先，其次减免金额最高 */
  private async findUsableClaim(communityId: string, userId: string) {
    const now = new Date()
    const claims = await this.prisma.communityInviteClaim.findMany({
      where: { communityId, userId, usedAt: null },
      include: { invite: true },
    })
    const usable = claims.filter(
      (claim) =>
        claim.invite.isActive &&
        (!claim.invite.expiresAt || claim.invite.expiresAt.getTime() > now.getTime()),
    )
    const weight = (kind: string, amount: number) =>
      kind === 'WAIVER' ? Number.MAX_SAFE_INTEGER : kind === 'REDUCE' ? amount : 0
    usable.sort((a, b) => weight(b.invite.kind, b.invite.amount) - weight(a.invite.kind, a.invite.amount))
    return usable[0] || null
  }

  async leave(id: string, userId: string) {
    const exist = await this.getJoin(id, userId)
    if (!exist) return { joined: false }
    // 付费社群有效期内不允许自助退出：直接退出会静默损失剩余年费，
    // 需由客服核实后走退款（退款回调会撤销有效期）。
    const community = await this.prisma.community.findUnique({ where: { id } })
    if (
      community &&
      community.yearlyFee > 0 &&
      exist.paidUntil &&
      exist.paidUntil.getTime() > Date.now()
    ) {
      throw new BusinessException('付费社群有效期内不支持自助退出，如需协助请联系客服', 4036)
    }
    await this.prisma.$transaction([
      this.prisma.communityJoin.delete({ where: { id: exist.id } }),
      this.prisma.community.updateMany({
        where: { id, memberCount: { gt: 0 } },
        data: { memberCount: { decrement: 1 } },
      }),
    ])
    return { joined: false }
  }

  // ----- 隐私与兴趣 -----

  async updatePrivacy(id: string, userId: string, privacy: string, interests: string[]) {
    if (!PRIVACY_VALUES.includes(privacy)) throw new BusinessException('隐私设置不合法', 4000)
    const c = await this.assertMember(id, userId)
    const join = await this.getJoin(id, userId)
    if (!join) throw new BusinessException('请先加入社群', 4031)
    const pool = parseJsonArray(c.interestPool).filter((x): x is string => typeof x === 'string')
    const picked = Array.from(new Set((interests || []).filter((x) => typeof x === 'string')))
    if (picked.length > INTEREST_LIMIT) throw new BusinessException('兴趣标签最多选择 3 个', 4000)
    if (picked.some((x) => !pool.includes(x))) throw new BusinessException('兴趣标签不在社群兴趣池内', 4000)
    const updated = await this.prisma.communityJoin.update({
      where: { id: join.id },
      data: { privacy: privacy as any, interests: JSON.stringify(picked) },
    })
    return { privacy: updated.privacy, interests: parseJsonArray(updated.interests) }
  }

  // ----- 入群申请 -----

  async applyJoin(id: string, userId: string, note?: string) {
    const c = await this.prisma.community.findFirst({
      where: { id, status: 'APPROVED', isActive: true },
    })
    if (!c) throw new BusinessException('社群不存在或已下架', 4040)
    if (c.joinMode === 'INVITE') {
      const claim = await this.findUsableClaim(id, userId)
      if (!claim) throw new BusinessException('该社群仅限邀请加入', 4033)
    }
    const join = await this.getJoin(id, userId)
    if (this.isActiveJoin(c, join)) return { status: 'APPROVED' as const, joined: true }
    const request = await this.prisma.communityJoinRequest.upsert({
      where: { communityId_userId: { communityId: id, userId } },
      create: { communityId: id, userId, note: note?.slice(0, 500) || null, status: 'PENDING' },
      update: { note: note?.slice(0, 500) || null, status: 'PENDING', reviewedBy: null, reviewedByName: null, reviewedAt: null, reviewNote: null },
    })
    return { status: request.status, joined: false }
  }

  async myRequest(id: string, userId: string) {
    const request = await this.prisma.communityJoinRequest.findUnique({
      where: { communityId_userId: { communityId: id, userId } },
    })
    return request
      ? { status: request.status, note: request.note, reviewNote: request.reviewNote, reviewedAt: request.reviewedAt }
      : null
  }

  // ----- 内容 -----

  /** 发布动态：实时可见，不做发布前审核 */
  async createPost(id: string, userId: string, content: string, images?: string[]) {
    if (!content?.trim()) throw new BusinessException('内容不能为空', 4000)
    const c = await this.assertMember(id, userId)
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    const created = await this.prisma.communityPost.create({
      data: {
        communityId: id,
        authorId: userId,
        authorName: user?.nickname || '成员',
        authorAvatar: user?.avatar || null,
        authorRole: c.ownerUserId === userId ? '主理人' : '成员',
        content: content.trim().slice(0, 4000),
        images: JSON.stringify((images || []).slice(0, 9)),
        status: 'APPROVED',
      },
    })
    return { id: created.id, success: true }
  }

  async createComment(communityId: string, postId: string, userId: string, content: string) {
    if (!content?.trim()) throw new BusinessException('评论不能为空', 4000)
    await this.assertMember(communityId, userId)
    const post = await this.prisma.communityPost.findUnique({ where: { id: postId } })
    if (!post || post.communityId !== communityId || post.isDeleted || post.isHidden) {
      throw new BusinessException('动态不存在', 4043)
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.communityComment.create({
        data: {
          postId,
          communityId,
          authorId: userId,
          authorName: user?.nickname || '成员',
          authorAvatar: user?.avatar || null,
          content: content.trim().slice(0, 500),
        },
      })
      await tx.communityPost.update({ where: { id: postId }, data: { comments: { increment: 1 } } })
      return created
    })
    return {
      id: comment.id,
      author: { name: comment.authorName, avatar: comment.authorAvatar || '' },
      content: comment.content,
      time: comment.createdAt,
    }
  }

  /** 内容治理：隐藏/恢复/删除；必须填写原因并留痕 */
  async moderate(
    communityId: string,
    input: { targetType: ModerationTarget; targetId: string; action: ModerationAction; reason: string },
    actor: { id: string; name: string; type: 'HOST' | 'PLATFORM' },
  ) {
    const reason = (input.reason || '').trim()
    if (!reason) throw new BusinessException('请填写处理原因', 4000)
    if (!['POST', 'COMMENT'].includes(input.targetType)) throw new BusinessException('不支持的治理对象', 4000)
    if (!['HIDE', 'RESTORE', 'DELETE'].includes(input.action)) throw new BusinessException('不支持的处理动作', 4000)
    if (actor.type === 'HOST') await this.assertHost(communityId, actor.id)

    const base =
      input.action === 'RESTORE'
        ? { isHidden: false, isDeleted: false, hiddenReason: null }
        : input.action === 'HIDE'
          ? { isHidden: true, hiddenReason: reason }
          : { isDeleted: true, isHidden: true, hiddenReason: reason }

    if (input.targetType === 'POST') {
      const post = await this.prisma.communityPost.findUnique({ where: { id: input.targetId } })
      if (!post || post.communityId !== communityId) throw new BusinessException('动态不存在', 4043)
      await this.prisma.communityPost.update({
        where: { id: post.id },
        data: { ...base, moderatedAt: new Date(), moderatedBy: actor.id },
      })
    } else {
      const comment = await this.prisma.communityComment.findUnique({ where: { id: input.targetId } })
      if (!comment || comment.communityId !== communityId) throw new BusinessException('评论不存在', 4044)
      // 评论表仅保留隐藏/删除标记，治理时间与操作人统一记录在治理日志中
      await this.prisma.communityComment.update({ where: { id: comment.id }, data: base })
    }

    await this.prisma.communityModerationLog.create({
      data: {
        communityId,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        reason,
        actorType: actor.type,
        actorId: actor.id,
        actorName: actor.name,
      },
    })
    return { success: true }
  }

  /** 小程序内主理人治理：只能操作自己管理的社群 */
  async moderateAsHost(
    communityId: string,
    userId: string,
    input: { targetType: ModerationTarget; targetId: string; action: ModerationAction; reason: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } })
    return this.moderate(communityId, input, {
      id: userId,
      name: user?.nickname || '主理人',
      type: 'HOST',
    })
  }

  async listModerationLogs(communityId: string, hostUserId?: string) {
    if (hostUserId) {
      const c = await this.prisma.community.findUnique({ where: { id: communityId }, select: { ownerUserId: true } })
      if (!c || c.ownerUserId !== hostUserId) throw new BusinessException('无权查看该社群', 4032)
    }
    return this.prisma.communityModerationLog.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
  }

  // ----- 活动报名 -----

  async signupEvent(communityId: string, eventId: string, userId: string) {
    const e = await this.prisma.communityEvent.findUnique({ where: { id: eventId }, include: { community: true } })
    if (!e || e.communityId !== communityId || !e.isActive) throw new BusinessException('活动不存在或已停用', 4041)
    if (this.eventEnded(e)) throw new BusinessException('活动已结束，不能报名', 4045)
    if (e.scope === 'INTERNAL') await this.assertMember(communityId, userId)
    const existing = await this.prisma.communityEventSignup.findUnique({
      where: { eventId_userId: { eventId, userId } },
    })
    if (existing?.status === 'SIGNED') return { signed: true }
    await this.prisma.$transaction(async (tx) => {
      if (e.capacity > 0 && e.joined >= e.capacity) throw new BusinessException('活动名额已满', 4046)
      await tx.communityEventSignup.upsert({
        where: { eventId_userId: { eventId, userId } },
        create: { eventId, communityId, userId, status: 'SIGNED' },
        update: { status: 'SIGNED' },
      })
      await tx.communityEvent.update({ where: { id: eventId }, data: { joined: { increment: 1 } } })
    })
    return { signed: true }
  }

  async cancelSignup(communityId: string, eventId: string, userId: string) {
    const existing = await this.prisma.communityEventSignup.findUnique({
      where: { eventId_userId: { eventId, userId } },
    })
    if (!existing || existing.status !== 'SIGNED') return { signed: false }
    await this.prisma.$transaction([
      this.prisma.communityEventSignup.update({ where: { id: existing.id }, data: { status: 'CANCELLED' } }),
      this.prisma.communityEvent.update({ where: { id: eventId }, data: { joined: { decrement: 1 } } }),
    ])
    return { signed: false }
  }

  // ----- 邀请 -----

  /** 邀请公开信息（扫码落地用；不暴露私密成员内容） */
  async getInvitePublic(inviteId: string) {
    const invite = await this.prisma.communityInvite.findUnique({
      where: { id: inviteId },
      include: { community: true },
    })
    if (!invite || !invite.isActive) throw new BusinessException('邀请已失效', 4047)
    const now = new Date()
    const expired = Boolean(invite.expiresAt && invite.expiresAt.getTime() <= now.getTime())
    const claimCount = await this.prisma.communityInviteClaim.count({ where: { inviteId } })
    const full = invite.quota > 0 && claimCount >= invite.quota
    const c = invite.community
    return {
      id: invite.id,
      name: invite.name,
      kind: invite.kind,
      amount: invite.amount,
      expiresAt: invite.expiresAt,
      quota: invite.quota,
      claimedCount: claimCount,
      available: !expired && !full && c.status === 'APPROVED' && c.isActive,
      reason: expired ? '邀请已过期' : full ? '邀请名额已满' : '',
      community: {
        id: c.id,
        name: c.name,
        slogan: c.visibility === 'INVITE_ONLY' ? '' : c.slogan,
        cover: c.coverUrl || '',
        coverFallback: c.coverFallback || '',
        ownerName: c.ownerName,
        joinMode: c.joinMode,
        visibility: c.visibility,
      },
    }
  }

  async claimInvite(inviteId: string, userId: string) {
    const invite = await this.prisma.communityInvite.findUnique({
      where: { id: inviteId },
      include: { community: true },
    })
    if (!invite || !invite.isActive) throw new BusinessException('邀请已失效', 4047)
    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
      throw new BusinessException('邀请已过期', 4047)
    }
    const [existing, claimCount] = await Promise.all([
      this.prisma.communityInviteClaim.findUnique({
        where: { inviteId_userId: { inviteId, userId } },
      }),
      this.prisma.communityInviteClaim.count({ where: { inviteId } }),
    ])
    if (existing) {
      return { claimed: true, alreadyClaimed: true, claimId: existing.id, requiresApproval: invite.community.joinMode === 'APPROVAL' }
    }
    if (invite.quota > 0 && claimCount >= invite.quota) {
      throw new BusinessException('邀请名额已满', 4048)
    }
    const claim = await this.prisma.communityInviteClaim.create({
      data: { inviteId, communityId: invite.communityId, userId },
    })
    return {
      claimed: true,
      claimId: claim.id,
      communityId: invite.communityId,
      kind: invite.kind,
      amount: invite.amount,
      requiresApproval: invite.community.joinMode === 'APPROVAL',
    }
  }

  async myInviteClaim(communityId: string, userId: string) {
    const claim = await this.findUsableClaim(communityId, userId)
    return claim ? this.claimSummary(claim) : null
  }

  /** 主理人创建社群：提交后进入平台审核；基础主理人最多 1 个 */
  async createByOwner(userId: string, input: CommunityInput) {
    if (!input.name?.trim()) throw new BusinessException('请填写社群名称', 4000)
    if (!input.slogan?.trim()) throw new BusinessException('请填写一句话定位', 4000)
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    const role = user?.communityHostRole || 'BASIC'
    const owned = await this.prisma.community.count({ where: { ownerUserId: userId } })
    if (role !== 'EXTENDED' && owned >= 1) {
      throw new BusinessException('基础主理人最多开设 1 个社群，请联系平台开通扩展主理人', 4030)
    }
    if (!user?.communityHostRole) {
      await this.prisma.user.update({ where: { id: userId }, data: { communityHostRole: 'BASIC' } })
    }
    const interestPool = this.sanitizePool(input.interestPool || input.tags || [])
    const created = await this.prisma.community.create({
      data: {
        name: input.name.trim(),
        slogan: input.slogan.trim(),
        category: input.category || '疗愈',
        coverUrl: input.coverUrl || null,
        coverFallback: input.coverFallback || null,
        ownerName: user?.nickname || '主理人',
        ownerAvatar: user?.avatar || null,
        ownerUserId: userId,
        yearlyFee: Number(input.yearlyFee) || 0,
        tags: JSON.stringify(input.tags || []),
        interestPool: JSON.stringify(interestPool),
        description: input.description || null,
        status: 'PENDING',
        visibility: 'PUBLIC',
        joinMode: 'OPEN',
      },
    })
    return { id: created.id, status: created.status, hostRole: role }
  }

  private sanitizePool(list: string[]) {
    const unique = Array.from(new Set((list || []).map((x) => String(x).trim()).filter(Boolean)))
    return unique.slice(0, POOL_LIMIT)
  }

  // ==================== 后台管理 ====================

  async adminList(status?: string, keyword?: string, hostUserId?: string) {
    const kw = (keyword || '').trim()
    const rows = await this.prisma.community.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(kw ? { name: { contains: kw } } : {}),
        ...(hostUserId ? { ownerUserId: hostUserId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
    if (!rows.length) return []
    const owners = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.ownerUserId).filter(Boolean) as string[] } },
      select: { id: true, nickname: true, communityHostRole: true },
    })
    const ownerMap = new Map(owners.map((u) => [u.id, u]))
    return rows.map((c) => ({
      ...c,
      tags: parseTags(c.tags),
      interestPool: parseJsonArray(c.interestPool),
      ownerRole: c.ownerUserId ? this.hostRoleLabel(ownerMap.get(c.ownerUserId)?.communityHostRole) : '平台直管',
      ownerNickname: c.ownerUserId ? ownerMap.get(c.ownerUserId)?.nickname || '' : '',
    }))
  }

  /** 后台创建/更新统一白名单过滤 */
  private pickInput(input: CommunityInput) {
    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slogan !== undefined ? { slogan: input.slogan } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl || null } : {}),
      ...(input.coverFallback !== undefined ? { coverFallback: input.coverFallback || null } : {}),
      ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId || null } : {}),
      ...(input.ownerName !== undefined ? { ownerName: input.ownerName } : {}),
      ...(input.ownerTitle !== undefined ? { ownerTitle: input.ownerTitle || null } : {}),
      ...(input.ownerAvatar !== undefined ? { ownerAvatar: input.ownerAvatar || null } : {}),
      ...(input.memberCount !== undefined ? { memberCount: Number(input.memberCount) || 0 } : {}),
      ...(input.yearlyFee !== undefined ? { yearlyFee: Number(input.yearlyFee) || 0 } : {}),
      ...(input.isOfficial !== undefined ? { isOfficial: Boolean(input.isOfficial) } : {}),
      ...(input.isNew !== undefined ? { isNew: Boolean(input.isNew) } : {}),
      ...(input.tags !== undefined ? { tags: JSON.stringify(input.tags || []) } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
      ...(input.growth30d !== undefined ? { growth30d: Number(input.growth30d) || 0 } : {}),
      ...(input.activeToday !== undefined ? { activeToday: Number(input.activeToday) || 0 } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility as any } : {}),
      ...(input.joinMode !== undefined ? { joinMode: input.joinMode as any } : {}),
      ...(input.interestPool !== undefined
        ? { interestPool: JSON.stringify(this.sanitizePool(input.interestPool || [])) }
        : {}),
    }
  }

  /**
   * 后台指派主理人时的角色约束：
   * - 扩展主理人：不限数量
   * - 基础主理人：仅 1 个（第 2 个需平台先升级角色）
   * - 未开通角色：仅当其首个社群时自动成为基础主理人
   */
  private async assertHostAssignment(ownerUserId?: string | null, currentCommunityId?: string) {
    if (!ownerUserId) return
    const user = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true, communityHostRole: true },
    })
    if (!user) throw new BusinessException('主理人用户不存在', 4040)
    const owned = await this.prisma.community.count({
      where: {
        ownerUserId,
        ...(currentCommunityId ? { id: { not: currentCommunityId } } : {}),
      },
    })
    if (user.communityHostRole === 'EXTENDED') return
    if (user.communityHostRole === 'BASIC') {
      if (owned >= 1) {
        throw new BusinessException('基础主理人仅可开设 1 个社群，请先在「主理人角色」升级为扩展主理人', 4000)
      }
      return
    }
    if (owned >= 1) throw new BusinessException('该用户尚未开通主理人权限', 4000)
    await this.prisma.user.update({
      where: { id: ownerUserId },
      data: { communityHostRole: 'BASIC' },
    })
  }

  async adminCreate(input: CommunityInput) {
    if (!input.name?.trim()) throw new BusinessException('请填写社群名称', 4000)
    await this.assertHostAssignment(input.ownerUserId)
    return this.prisma.community.create({
      data: {
        name: input.name.trim(),
        ...this.pickInput({ ...input, name: undefined }),
        // TEXT 列无默认值，创建时必须写入标签（覆盖 pickInput 的可能缺失）
        tags: JSON.stringify(input.tags || []),
        interestPool: JSON.stringify(this.sanitizePool(input.interestPool || input.tags || [])),
        status: (input.status as any) || 'APPROVED',
      },
    })
  }

  async adminUpdate(id: string, input: CommunityInput) {
    const exist = await this.prisma.community.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('社群不存在', 4040)
    if (input.visibility && !['PUBLIC', 'HIDDEN', 'INVITE_ONLY'].includes(input.visibility)) {
      throw new BusinessException('可见性不合法', 4000)
    }
    if (input.joinMode && !['OPEN', 'APPROVAL', 'INVITE'].includes(input.joinMode)) {
      throw new BusinessException('入群方式不合法', 4000)
    }
    if (input.ownerUserId && input.ownerUserId !== exist.ownerUserId) {
      await this.assertHostAssignment(input.ownerUserId, id)
    }
    return this.prisma.community.update({ where: { id }, data: this.pickInput(input) })
  }

  /** 审核：通过上架广场 / 驳回 */
  async audit(id: string, approved: boolean) {
    const exist = await this.prisma.community.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('社群不存在', 4040)
    return this.prisma.community.update({
      where: { id },
      data: { status: approved ? 'APPROVED' : 'REJECTED' },
    })
  }

  async setStatus(id: string, isActive: boolean) {
    const exist = await this.prisma.community.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('社群不存在', 4040)
    return this.prisma.community.update({ where: { id }, data: { isActive } })
  }

  async remove(id: string) {
    const exist = await this.prisma.community.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('社群不存在', 4040)
    await this.prisma.community.delete({ where: { id } })
    return { success: true }
  }

  // ----- 主理人角色 -----

  async adminListHosts(keyword?: string) {
    const kw = (keyword || '').trim()
    const ownerRows = await this.prisma.community.findMany({
      where: { ownerUserId: { not: null } },
      select: { ownerUserId: true },
    })
    const ownerIds = Array.from(new Set(ownerRows.map((r) => r.ownerUserId).filter(Boolean) as string[]))
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { communityHostRole: { not: null } },
              ...(ownerIds.length ? [{ id: { in: ownerIds } }] : []),
            ],
          },
          ...(kw ? [{ OR: [{ nickname: { contains: kw } }, { phone: { contains: kw } }] }] : []),
        ],
      },
      select: { id: true, nickname: true, phone: true, avatar: true, communityHostRole: true },
      take: 100,
      orderBy: { createdAt: 'desc' },
    })
    const counts = await this.prisma.community.groupBy({
      by: ['ownerUserId'],
      _count: { _all: true },
      where: { ownerUserId: { in: users.map((u) => u.id) } },
    })
    const countMap = new Map(counts.map((c) => [c.ownerUserId, c._count._all]))
    return users.map((u) => ({
      ...u,
      phone: u.phone ? `${u.phone.slice(0, 3)}****${u.phone.slice(-4)}` : '',
      communityCount: countMap.get(u.id) || 0,
      roleLabel: this.hostRoleLabel(u.communityHostRole) || '普通成员',
    }))
  }

  async adminSetHostRole(userId: string, role: 'BASIC' | 'EXTENDED' | null) {
    if (role !== null && role !== 'BASIC' && role !== 'EXTENDED') {
      throw new BusinessException('角色不合法', 4000)
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new BusinessException('用户不存在', 4040)
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { communityHostRole: role },
      select: { id: true, nickname: true, communityHostRole: true },
    })
    return { ...updated, roleLabel: this.hostRoleLabel(updated.communityHostRole) || '普通成员' }
  }

  // ----- 入群审核（后台/主理人） -----

  async adminListRequests(communityId?: string, status?: string, hostUserId?: string) {
    const rows = await this.prisma.communityJoinRequest.findMany({
      where: {
        ...(communityId ? { communityId } : {}),
        ...(status ? { status: status as any } : {}),
        ...(hostUserId
          ? { community: { ownerUserId: hostUserId } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { community: { select: { id: true, name: true } } },
      take: 200,
    })
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, nickname: true, avatar: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))
    return rows.map((r) => ({
      ...r,
      user: {
        id: r.userId,
        name: userMap.get(r.userId)?.nickname || '用户',
        avatar: userMap.get(r.userId)?.avatar || '',
      },
    }))
  }

  async reviewRequest(
    requestId: string,
    approved: boolean,
    note: string | undefined,
    actor: { id: string; name: string; type: 'HOST' | 'PLATFORM' },
    hostUserId?: string,
  ) {
    const request = await this.prisma.communityJoinRequest.findUnique({
      where: { id: requestId },
      include: { community: true },
    })
    if (!request) throw new BusinessException('申请不存在', 4040)
    if (actor.type === 'HOST') {
      await this.assertHost(request.communityId, actor.id)
    } else if (hostUserId && request.community.ownerUserId !== hostUserId) {
      throw new BusinessException('无权处理该申请', 4032)
    }
    const updated = await this.prisma.communityJoinRequest.update({
      where: { id: requestId },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewedBy: actor.id,
        reviewedByName: actor.name,
        reviewNote: note?.slice(0, 500) || null,
        reviewedAt: new Date(),
      },
    })
    return { id: updated.id, status: updated.status, reviewedAt: updated.reviewedAt }
  }

  // ----- 后台活动 -----

  async adminListEvents(communityId?: string, hostUserId?: string) {
    return this.prisma.communityEvent.findMany({
      where: {
        ...(communityId ? { communityId } : {}),
        ...(hostUserId ? { community: { ownerUserId: hostUserId } } : {}),
      },
      orderBy: [{ eventDate: 'desc' }, { time: 'asc' }],
      include: { community: { select: { id: true, name: true, ownerUserId: true } } },
    })
  }

  private eventPick(input: CommunityEventInput) {
    return {
      ...(input.communityId !== undefined ? { communityId: input.communityId } : {}),
      ...(input.eventDate !== undefined ? { eventDate: new Date(input.eventDate) } : {}),
      ...(input.time !== undefined ? { time: input.time } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime || null } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.type !== undefined ? { type: input.type as any } : {}),
      ...(input.venue !== undefined ? { venue: input.venue || null } : {}),
      ...(input.capacity !== undefined ? { capacity: Number(input.capacity) || 0 } : {}),
      ...(input.joined !== undefined ? { joined: Number(input.joined) || 0 } : {}),
      ...(input.courseId !== undefined ? { courseId: input.courseId || null } : {}),
      ...(input.scope !== undefined ? { scope: input.scope as any } : {}),
      ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
    }
  }

  async adminCreateEvent(input: CommunityEventInput) {
    if (!input.communityId) throw new BusinessException('请选择社群', 4000)
    if (!input.title?.trim()) throw new BusinessException('请填写活动标题', 4000)
    if (!input.eventDate) throw new BusinessException('请选择活动日期', 4000)
    const c = await this.prisma.community.findUnique({ where: { id: input.communityId } })
    if (!c) throw new BusinessException('社群不存在', 4040)
    return this.prisma.communityEvent.create({
      data: {
        communityId: input.communityId,
        eventDate: new Date(input.eventDate),
        time: input.time || '',
        endTime: input.endTime || null,
        title: input.title.trim(),
        type: (input.type as any) || 'OFFLINE',
        venue: input.venue || null,
        capacity: Number(input.capacity) || 0,
        joined: Number(input.joined) || 0,
        courseId: input.courseId || null,
        scope: (input.scope as any) || 'PUBLIC',
        isActive: input.isActive !== false,
        description: input.description || null,
      },
    })
  }

  async adminUpdateEvent(id: string, input: CommunityEventInput) {
    const exist = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('活动不存在', 4040)
    return this.prisma.communityEvent.update({ where: { id }, data: this.eventPick(input) })
  }

  async adminRemoveEvent(id: string) {
    const exist = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('活动不存在', 4040)
    await this.prisma.communityEvent.delete({ where: { id } })
    return { success: true }
  }

  // ----- 后台动态 -----

  async adminListPosts(status?: string, communityId?: string, hostUserId?: string) {
    return this.prisma.communityPost.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(communityId ? { communityId } : {}),
        ...(hostUserId ? { community: { ownerUserId: hostUserId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { community: { select: { id: true, name: true } } },
      take: 200,
    })
  }

  async auditPost(id: string, approved: boolean) {
    const exist = await this.prisma.communityPost.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('动态不存在', 4040)
    return this.prisma.communityPost.update({
      where: { id },
      data: { status: approved ? 'APPROVED' : 'REJECTED' },
    })
  }

  // ----- 后台邀请 -----

  async adminListInvites(communityId: string, hostUserId?: string) {
    const c = await this.prisma.community.findUnique({ where: { id: communityId } })
    if (!c) throw new BusinessException('社群不存在', 4040)
    if (hostUserId && c.ownerUserId !== hostUserId) throw new BusinessException('无权查看该社群', 4032)
    const rows = await this.prisma.communityInvite.findMany({
      where: { communityId },
      orderBy: { createdAt: 'desc' },
    })
    const counts = await this.prisma.communityInviteClaim.groupBy({
      by: ['inviteId'],
      _count: { _all: true },
      where: { inviteId: { in: rows.map((r) => r.id) } },
    })
    const countMap = new Map(counts.map((x) => [x.inviteId, x._count._all]))
    return rows.map((r) => ({ ...r, claimedCount: countMap.get(r.id) || 0 }))
  }

  /** 后台管理员操作：actor.type 恒为 PLATFORM；scopeHostUserId 仅约束数据范围 */
  private async assertScope(communityId: string, scopeHostUserId?: string) {
    if (!scopeHostUserId) return
    const c = await this.prisma.community.findUnique({ where: { id: communityId }, select: { ownerUserId: true } })
    if (!c || c.ownerUserId !== scopeHostUserId) throw new BusinessException('无权操作该社群', 4032)
  }

  async adminCreateInvite(
    communityId: string,
    input: { name?: string; kind?: string; amount?: number; expiresAt?: string | null; quota?: number; note?: string },
    actor: { id: string; type: 'HOST' | 'PLATFORM' },
    scopeHostUserId?: string,
  ) {
    if (actor.type === 'HOST') await this.assertHost(communityId, actor.id)
    else await this.assertScope(communityId, scopeHostUserId)
    if (!input.name?.trim()) throw new BusinessException('请填写邀请名称', 4000)
    if (!['NORMAL', 'WAIVER', 'REDUCE'].includes(input.kind || 'NORMAL')) {
      throw new BusinessException('邀请类型不合法', 4000)
    }
    if (input.kind === 'REDUCE' && !(Number(input.amount) > 0)) {
      throw new BusinessException('请填写减免金额', 4000)
    }
    return this.prisma.communityInvite.create({
      data: {
        communityId,
        name: input.name.trim().slice(0, 120),
        kind: (input.kind as any) || 'NORMAL',
        amount: input.kind === 'REDUCE' ? Math.round(Number(input.amount) || 0) : 0,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        quota: Math.max(0, Math.round(Number(input.quota) || 0)),
        note: input.note || null,
        createdBy: actor.id,
      },
    })
  }

  async adminUpdateInvite(
    inviteId: string,
    input: { name?: string; kind?: string; amount?: number; expiresAt?: string | null; quota?: number; note?: string; isActive?: boolean },
    actor: { id: string; type: 'HOST' | 'PLATFORM' },
    scopeHostUserId?: string,
  ) {
    const invite = await this.prisma.communityInvite.findUnique({ where: { id: inviteId } })
    if (!invite) throw new BusinessException('邀请不存在', 4040)
    if (actor.type === 'HOST') await this.assertHost(invite.communityId, actor.id)
    else await this.assertScope(invite.communityId, scopeHostUserId)
    return this.prisma.communityInvite.update({
      where: { id: inviteId },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim().slice(0, 120) } : {}),
        ...(input.kind !== undefined ? { kind: input.kind as any } : {}),
        ...(input.amount !== undefined
          ? { amount: input.kind === 'REDUCE' ? Math.round(Number(input.amount) || 0) : 0 }
          : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
        ...(input.quota !== undefined ? { quota: Math.max(0, Math.round(Number(input.quota) || 0)) } : {}),
        ...(input.note !== undefined ? { note: input.note || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
      },
    })
  }

  async adminRemoveInvite(
    inviteId: string,
    actor: { id: string; type: 'HOST' | 'PLATFORM' },
    scopeHostUserId?: string,
  ) {
    const invite = await this.prisma.communityInvite.findUnique({ where: { id: inviteId } })
    if (!invite) throw new BusinessException('邀请不存在', 4040)
    if (actor.type === 'HOST') await this.assertHost(invite.communityId, actor.id)
    else await this.assertScope(invite.communityId, scopeHostUserId)
    await this.prisma.communityInvite.update({ where: { id: inviteId }, data: { isActive: false } })
    return { success: true }
  }
}
