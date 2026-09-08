import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma.service'
import { BusinessException } from '../../common/exceptions/business.exception'

/** 社群创建/编辑入参（后台与主理人创建共用，字段白名单过滤） */
export interface CommunityInput {
  name?: string
  slogan?: string
  category?: string
  coverUrl?: string
  coverFallback?: string
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
}

/** 活动入参 */
export interface CommunityEventInput {
  communityId?: string
  /** YYYY-MM-DD */
  eventDate?: string
  time?: string
  title?: string
  /** OFFLINE | LIVE | ONLINE */
  type?: string
  venue?: string
  capacity?: number
  joined?: number
  courseId?: string
}

/** 广场排序口径（内部逻辑，不向 C 端透出）：
 * 推荐 = 新社群流量扶持 + 老社群按增长/活跃表现加权；
 * 最新 = 新社群优先；热门 = 成员规模 + 近 30 天增长。 */
export type CommunitySort = 'recommend' | 'newest' | 'hot'

function parseTags(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== 公共查询（C 端） ====================

  /** 社群广场：仅审核通过且启用的社群；isNew 仅参与排序不返回 */
  async listPublic(category?: string, keyword?: string, sort: CommunitySort = 'recommend') {
    const rows = await this.prisma.community.findMany({
      where: { status: 'APPROVED', isActive: true },
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
      memberCount: c.memberCount,
      yearlyFee: c.yearlyFee,
      isOfficial: c.isOfficial,
      tags: parseTags(c.tags),
      description: c.description || '',
      activeToday: c.activeToday,
      createdAt: c.createdAt,
    }
  }

  async getPublic(id: string) {
    const c = await this.prisma.community.findFirst({
      where: { id, status: 'APPROVED', isActive: true },
    })
    if (!c) throw new BusinessException('社群不存在或已下架', 4040)
    return this.toPublicDTO(c)
  }

  /** 当前用户与社群的关系（是否已加入 / 是否主理人） */
  async getMembership(id: string, userId: string) {
    const c = await this.prisma.community.findUnique({ where: { id } })
    if (!c) throw new BusinessException('社群不存在', 4040)
    const join = await this.prisma.communityJoin.findUnique({
      where: { communityId_userId: { communityId: id, userId } },
    })
    return { joined: Boolean(join), managed: c.ownerUserId === userId }
  }

  /** 我的社群：我管理的 + 我加入的 */
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
    return {
      managed: managed.map((c) => this.toPublicDTO(c)),
      joined: joins
        .map((j) => (joinedMap.has(j.communityId) ? this.toPublicDTO(joinedMap.get(j.communityId)) : null))
        .filter(Boolean),
    }
  }

  /** 活动日历数据：按日期升序 */
  async listEvents(id: string) {
    const events = await this.prisma.communityEvent.findMany({
      where: { communityId: id },
      orderBy: [{ eventDate: 'asc' }, { time: 'asc' }],
    })
    return events.map((e) => ({
      id: e.id,
      date: this.fmtDate(e.eventDate),
      fullDate: this.fmtDate(e.eventDate),
      time: e.time,
      title: e.title,
      type: e.type,
      venue: e.venue || '',
      joined: e.joined,
      capacity: e.capacity,
      courseId: e.courseId || '',
    }))
  }

  /** 社群动态：仅已发布 */
  async listPosts(id: string) {
    const posts = await this.prisma.communityPost.findMany({
      where: { communityId: id, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    })
    return posts.map((p) => this.toPostDTO(p))
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
      author: { name: p.authorName, role: p.authorRole, avatar: p.authorAvatar || '', level: p.authorLevel },
      time: p.createdAt,
      content: p.content,
      images,
      likes: p.likes,
      comments: p.comments,
      liked: false,
    }
  }

  /** 成员列表（加入过的用户） */
  async listMembers(id: string) {
    const joins = await this.prisma.communityJoin.findMany({
      where: { communityId: id },
      orderBy: { joinedAt: 'asc' },
    })
    if (!joins.length) return []
    const users = await this.prisma.user.findMany({
      where: { id: { in: joins.map((j) => j.userId) } },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))
    return joins
      .filter((j) => userMap.has(j.userId))
      .map((j) => {
        const u = userMap.get(j.userId)!
        return { id: u.id, name: u.nickname, avatar: u.avatar || '', joinedAt: j.joinedAt }
      })
  }

  // ==================== 用户操作（小程序，需登录） ====================

  async join(id: string, userId: string) {
    const c = await this.prisma.community.findFirst({
      where: { id, status: 'APPROVED', isActive: true },
    })
    if (!c) throw new BusinessException('社群不存在或已下架', 4040)
    const exist = await this.prisma.communityJoin.findUnique({
      where: { communityId_userId: { communityId: id, userId } },
    })
    if (exist) return { joined: true }
    await this.prisma.$transaction([
      this.prisma.communityJoin.create({ data: { communityId: id, userId } }),
      this.prisma.community.update({ where: { id }, data: { memberCount: { increment: 1 } } }),
    ])
    return { joined: true }
  }

  async leave(id: string, userId: string) {
    const exist = await this.prisma.communityJoin.findUnique({
      where: { communityId_userId: { communityId: id, userId } },
    })
    if (!exist) return { joined: false }
    await this.prisma.$transaction([
      this.prisma.communityJoin.delete({ where: { id: exist.id } }),
      this.prisma.community.update({ where: { id }, data: { memberCount: { decrement: 1 } } }),
    ])
    return { joined: false }
  }

  /** 主理人创建社群：提交后进入平台审核 */
  async createByOwner(userId: string, input: CommunityInput) {
    if (!input.name?.trim()) throw new BusinessException('请填写社群名称', 4000)
    if (!input.slogan?.trim()) throw new BusinessException('请填写一句话定位', 4000)
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
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
        description: input.description || null,
        status: 'PENDING',
      },
    })
    return { id: created.id, status: created.status }
  }

  /** 发布动态：先审后发 */
  async createPost(id: string, userId: string, content: string) {
    if (!content?.trim()) throw new BusinessException('内容不能为空', 4000)
    const c = await this.prisma.community.findFirst({
      where: { id, status: 'APPROVED', isActive: true },
    })
    if (!c) throw new BusinessException('社群不存在或已下架', 4040)
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    await this.prisma.communityPost.create({
      data: {
        communityId: id,
        authorId: userId,
        authorName: user?.nickname || '成员',
        authorAvatar: user?.avatar || null,
        authorRole: c.ownerUserId === userId ? '主理人' : '成员',
        content: content.trim(),
        status: 'PENDING',
      },
    })
    return { success: true }
  }

  // ==================== 后台管理 ====================

  async adminList(status?: string, keyword?: string) {
    const kw = (keyword || '').trim()
    return this.prisma.community.findMany({
      where: {
        ...(status ? { status: status as any } : {}),
        ...(kw ? { name: { contains: kw } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** 后台创建/更新统一白名单过滤 */
  private pickInput(input: CommunityInput) {
    return {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slogan !== undefined ? { slogan: input.slogan } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl || null } : {}),
      ...(input.coverFallback !== undefined ? { coverFallback: input.coverFallback || null } : {}),
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
    }
  }

  async adminCreate(input: CommunityInput) {
    if (!input.name?.trim()) throw new BusinessException('请填写社群名称', 4000)
    return this.prisma.community.create({
      data: {
        name: input.name.trim(),
        ...this.pickInput({ ...input, name: undefined }),
        // TEXT 列无默认值，创建时必须写入标签（覆盖 pickInput 的可能缺失）
        tags: JSON.stringify(input.tags || []),
        status: (input.status as any) || 'APPROVED',
      },
    })
  }

  async adminUpdate(id: string, input: CommunityInput) {
    const exist = await this.prisma.community.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('社群不存在', 4040)
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

  // ----- 活动（后台） -----

  async adminListEvents(communityId?: string) {
    return this.prisma.communityEvent.findMany({
      where: { ...(communityId ? { communityId } : {}) },
      orderBy: [{ eventDate: 'desc' }, { time: 'asc' }],
      include: { community: { select: { name: true } } },
    })
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
        title: input.title.trim(),
        type: (input.type as any) || 'OFFLINE',
        venue: input.venue || null,
        capacity: Number(input.capacity) || 0,
        joined: Number(input.joined) || 0,
        courseId: input.courseId || null,
      },
    })
  }

  async adminUpdateEvent(id: string, input: CommunityEventInput) {
    const exist = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('活动不存在', 4040)
    return this.prisma.communityEvent.update({
      where: { id },
      data: {
        ...(input.communityId !== undefined ? { communityId: input.communityId } : {}),
        ...(input.eventDate !== undefined ? { eventDate: new Date(input.eventDate) } : {}),
        ...(input.time !== undefined ? { time: input.time } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.type !== undefined ? { type: input.type as any } : {}),
        ...(input.venue !== undefined ? { venue: input.venue || null } : {}),
        ...(input.capacity !== undefined ? { capacity: Number(input.capacity) || 0 } : {}),
        ...(input.joined !== undefined ? { joined: Number(input.joined) || 0 } : {}),
        ...(input.courseId !== undefined ? { courseId: input.courseId || null } : {}),
      },
    })
  }

  async adminRemoveEvent(id: string) {
    const exist = await this.prisma.communityEvent.findUnique({ where: { id } })
    if (!exist) throw new BusinessException('活动不存在', 4040)
    await this.prisma.communityEvent.delete({ where: { id } })
    return { success: true }
  }

  // ----- 动态审核（后台） -----

  async adminListPosts(status?: string) {
    return this.prisma.communityPost.findMany({
      where: { ...(status ? { status: status as any } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { community: { select: { name: true } } },
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

  // ==================== 工具 ====================

  private fmtDate(d: Date): string {
    const m = `${d.getMonth() + 1}`.padStart(2, '0')
    const day = `${d.getDate()}`.padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  }
}
