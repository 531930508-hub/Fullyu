import { buildTestContext, Seeder, TestContext } from './helpers'
import { CommunityService } from '../src/modules/community/community.service'
import { RedisService } from '../src/common/redis.service'
import { BusinessException } from '../src/common/exceptions/business.exception'

/**
 * 社群非资金流程：
 * - 审核入群：申请 → 待审核 → 通过/驳回 → 重新申请
 * - 邀请入群：无邀请不可申请、领取幂等、名额/过期拦截、邀请公开信息
 * - 内容：成员才可发帖、评论计数、主理人治理（隐藏/恢复/删除）与留痕
 * - 活动：成员专属校验、名额上限、重复报名不重复计数、取消后可重报、已结束拦截
 * - 隐私兴趣：枚举、数量上限、兴趣池校验
 */
describe('社群非资金流程', () => {
  let ctx: TestContext
  let seeder: Seeder
  let service: CommunityService
  const communityIds: string[] = []

  async function newCommunity(
    opts: {
      yearlyFee?: number
      joinMode?: 'OPEN' | 'INVITE' | 'APPROVAL'
      ownerUserId?: string
      visibility?: 'PUBLIC' | 'INVITE_ONLY'
      interestPool?: string[]
    } = {},
  ) {
    const community = await ctx.prisma.community.create({
      data: {
        name: `流程社群${Date.now()}${Math.floor(Math.random() * 10000)}`,
        tags: '[]',
        yearlyFee: opts.yearlyFee ?? 0,
        joinMode: opts.joinMode ?? 'OPEN',
        visibility: opts.visibility ?? 'PUBLIC',
        ownerUserId: opts.ownerUserId ?? null,
        interestPool: opts.interestPool ? JSON.stringify(opts.interestPool) : null,
        status: 'APPROVED',
        isActive: true,
        memberCount: 0,
      },
    })
    communityIds.push(community.id)
    return community
  }

  const joinOf = (communityId: string, userId: string) =>
    ctx.prisma.communityJoin.findUnique({
      where: { communityId_userId: { communityId, userId } },
    })

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    service = new CommunityService(ctx.prisma, ctx.moduleRef.get(RedisService))
  })

  afterAll(async () => {
    await seeder.cleanup()
    await ctx.prisma.community.deleteMany({ where: { id: { in: communityIds } } })
    await ctx.app.close()
  })

  it('审核社群：未通过前不可加入，通过后免费加入，驳回可重新申请', async () => {
    const community = await newCommunity({ joinMode: 'APPROVAL' })
    const user = await seeder.user()

    const first = await service.join(community.id, user.id)
    expect(first).toMatchObject({ joined: false, requiresApproval: true, requestStatus: null })
    expect(await service.myRequest(community.id, user.id)).toBeNull()

    const applied = await service.applyJoin(community.id, user.id, '想加入')
    expect(applied.status).toBe('PENDING')
    const pending = await service.join(community.id, user.id)
    expect(pending).toMatchObject({ joined: false, requiresApproval: true, requestStatus: 'PENDING' })

    const request = await ctx.prisma.communityJoinRequest.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: user.id } },
    })
    const reviewed = await service.reviewRequest(
      request!.id,
      true,
      '欢迎',
      { id: 'admin-flow', name: '平台运营', type: 'PLATFORM' },
    )
    expect(reviewed.status).toBe('APPROVED')
    expect((await service.myRequest(community.id, user.id))!.reviewNote).toBe('欢迎')

    const joined = await service.join(community.id, user.id)
    expect(joined.joined).toBe(true)
    expect((await joinOf(community.id, user.id))!.source).toBe('FREE')

    // 第二个用户被驳回后可重新提交申请
    const other = await seeder.user()
    await service.applyJoin(community.id, other.id)
    const otherReq = await ctx.prisma.communityJoinRequest.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: other.id } },
    })
    await service.reviewRequest(
      otherReq!.id,
      false,
      '暂不开放',
      { id: 'admin-flow', name: '平台运营', type: 'PLATFORM' },
    )
    const rejected = await service.join(community.id, other.id)
    expect(rejected).toMatchObject({ joined: false, requestStatus: 'REJECTED' })
    const reapplied = await service.applyJoin(community.id, other.id)
    expect(reapplied.status).toBe('PENDING')
  })

  it('邀请社群：无邀请不可申请，领取幂等，名额与过期拦截', async () => {
    const community = await newCommunity({ joinMode: 'INVITE', visibility: 'INVITE_ONLY' })
    const user = await seeder.user()
    const invite = await ctx.prisma.communityInvite.create({
      data: {
        communityId: community.id,
        name: '邀请礼遇',
        kind: 'WAIVER',
        amount: 0,
        quota: 1,
        isActive: true,
      },
    })

    expect(await service.join(community.id, user.id)).toMatchObject({
      joined: false,
      requiresInvite: true,
    })
    await expect(service.applyJoin(community.id, user.id)).rejects.toBeInstanceOf(BusinessException)

    const publicInfo = await service.getInvitePublic(invite.id)
    expect(publicInfo).toMatchObject({ available: true, claimedCount: 0 })
    expect(publicInfo.community.slogan).toBe('')

    const claimed = await service.claimInvite(invite.id, user.id)
    expect(claimed.claimed).toBe(true)
    const again = await service.claimInvite(invite.id, user.id)
    expect(again).toMatchObject({ claimed: true, alreadyClaimed: true, claimId: claimed.claimId })
    expect(await ctx.prisma.communityInviteClaim.count({ where: { inviteId: invite.id } })).toBe(1)

    expect((await service.getInvitePublic(invite.id)).available).toBe(false)
    const late = await seeder.user()
    await expect(service.claimInvite(invite.id, late.id)).rejects.toBeInstanceOf(BusinessException)

    const expired = await ctx.prisma.communityInvite.create({
      data: {
        communityId: community.id,
        name: '过期邀请',
        kind: 'REDUCE',
        amount: 100,
        quota: 0,
        isActive: true,
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    })
    expect((await service.getInvitePublic(expired.id)).available).toBe(false)
    await expect(service.claimInvite(expired.id, late.id)).rejects.toBeInstanceOf(BusinessException)

    // 已领取邀请可直接进入付费/免费加入流程
    const joined = await service.join(community.id, user.id)
    expect(joined.joined).toBe(true)
    expect((await joinOf(community.id, user.id))!.source).toBe('WAIVER')
  })

  it('内容：非成员不可发帖，成员发帖评论，主理人隐藏/恢复/删除均留痕', async () => {
    const host = await seeder.user()
    const community = await newCommunity({ ownerUserId: host.id, interestPool: ['瑜伽', '冥想', '茶'] })
    const member = await seeder.user()
    await service.join(community.id, member.id)

    const before = await service.listPosts(community.id, host.id)
    expect(before).toHaveLength(0)

    const outsider = await seeder.user()
    await expect(service.createPost(community.id, outsider.id, '外部人')).rejects.toBeInstanceOf(
      BusinessException,
    )
    await expect(service.createPost(community.id, member.id, '   ')).rejects.toBeInstanceOf(
      BusinessException,
    )

    const created = await service.createPost(community.id, member.id, '今天练习很舒服', ['a.jpg'])
    const posts = await service.listPosts(community.id, member.id)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ id: created.id, content: '今天练习很舒服' })
    expect(posts[0].images).toEqual(['a.jpg'])

    const comment = await service.createComment(community.id, created.id, host.id, '欢迎')
    expect(comment.content).toBe('欢迎')
    let stored = await ctx.prisma.communityPost.findUnique({ where: { id: created.id } })
    expect(stored!.comments).toBe(1)

    await expect(
      service.moderate(
        community.id,
        { targetType: 'POST', targetId: created.id, action: 'HIDE', reason: '' },
        { id: host.id, name: '主理人', type: 'HOST' },
      ),
    ).rejects.toBeInstanceOf(BusinessException)
    await expect(
      service.moderateAsHost(community.id, member.id, {
        targetType: 'POST',
        targetId: created.id,
        action: 'HIDE',
        reason: '测试',
      }),
    ).rejects.toBeInstanceOf(BusinessException)

    await service.moderateAsHost(community.id, host.id, {
      targetType: 'POST',
      targetId: created.id,
      action: 'HIDE',
      reason: '含广告',
    })
    stored = await ctx.prisma.communityPost.findUnique({ where: { id: created.id } })
    expect(stored!.isHidden).toBe(true)
    expect(stored!.hiddenReason).toBe('含广告')
    expect(await service.listPosts(community.id, member.id)).toHaveLength(0)
    await expect(
      service.createComment(community.id, created.id, member.id, '看不到还能评论吗'),
    ).rejects.toBeInstanceOf(BusinessException)

    await service.moderateAsHost(community.id, host.id, {
      targetType: 'POST',
      targetId: created.id,
      action: 'RESTORE',
      reason: '误判恢复',
    })
    expect(await service.listPosts(community.id, member.id)).toHaveLength(1)

    await service.moderateAsHost(community.id, host.id, {
      targetType: 'COMMENT',
      targetId: comment.id,
      action: 'DELETE',
      reason: '评论违规',
    })
    const logs = await service.listModerationLogs(community.id, host.id)
    expect(logs).toHaveLength(3)
    expect(logs.map((l) => l.action).sort()).toEqual(['DELETE', 'HIDE', 'RESTORE'])
    await expect(service.listModerationLogs(community.id, member.id)).rejects.toBeInstanceOf(
      BusinessException,
    )
  })

  it('活动：成员专属与名额限制、重复报名不重复计数、取消后可重报、已结束拦截', async () => {
    const host = await seeder.user()
    const community = await newCommunity({ ownerUserId: host.id })
    const member = await seeder.user()
    await service.join(community.id, member.id)

    const future = new Date(Date.now() + 2 * 86400 * 1000)
    const internal = await ctx.prisma.communityEvent.create({
      data: {
        communityId: community.id,
        eventDate: future,
        time: '20:00',
        endTime: '21:00',
        title: '成员专属冥想',
        capacity: 1,
        scope: 'INTERNAL',
      },
    })

    const outsider = await seeder.user()
    await expect(service.signupEvent(community.id, internal.id, outsider.id)).rejects.toBeInstanceOf(
      BusinessException,
    )
    const signed = await service.signupEvent(community.id, internal.id, member.id)
    expect(signed.signed).toBe(true)
    // 重复报名直接幂等返回，不重复累加
    await service.signupEvent(community.id, internal.id, member.id)
    expect((await ctx.prisma.communityEvent.findUnique({ where: { id: internal.id } }))!.joined).toBe(1)

    const second = await seeder.user()
    await service.join(community.id, second.id)
    await expect(service.signupEvent(community.id, internal.id, second.id)).rejects.toBeInstanceOf(
      BusinessException,
    )

    await service.cancelSignup(community.id, internal.id, member.id)
    expect((await ctx.prisma.communityEvent.findUnique({ where: { id: internal.id } }))!.joined).toBe(0)
    await service.cancelSignup(community.id, internal.id, member.id)
    expect((await ctx.prisma.communityEvent.findUnique({ where: { id: internal.id } }))!.joined).toBe(0)
    expect((await service.signupEvent(community.id, internal.id, member.id)).signed).toBe(true)

    const ended = await ctx.prisma.communityEvent.create({
      data: {
        communityId: community.id,
        eventDate: new Date(Date.now() - 86400 * 1000),
        time: '10:00',
        endTime: '11:00',
        title: '已结束活动',
        capacity: 0,
        scope: 'PUBLIC',
      },
    })
    await expect(service.signupEvent(community.id, ended.id, member.id)).rejects.toBeInstanceOf(
      BusinessException,
    )
  })

  it('隐私兴趣：枚举、数量上限与兴趣池校验', async () => {
    const community = await newCommunity({ interestPool: ['瑜伽', '冥想', '茶'] })
    const member = await seeder.user()
    await service.join(community.id, member.id)

    await expect(
      service.updatePrivacy(community.id, member.id, 'PUBLIC', ['瑜伽']),
    ).rejects.toBeInstanceOf(BusinessException)
    await expect(
      service.updatePrivacy(community.id, member.id, 'ALL', ['瑜伽', '冥想', '茶', '瑜伽']),
    ).resolves.toMatchObject({ privacy: 'ALL', interests: ['瑜伽', '冥想', '茶'] })
    await expect(
      service.updatePrivacy(community.id, member.id, 'ALL', ['瑜伽', '冥想', '茶', '其他']),
    ).rejects.toBeInstanceOf(BusinessException)
    await expect(
      service.updatePrivacy(community.id, member.id, 'ALL', ['其他']),
    ).rejects.toBeInstanceOf(BusinessException)

    const updated = await service.updatePrivacy(community.id, member.id, 'COMPLETED', ['瑜伽'])
    expect(updated).toMatchObject({ privacy: 'COMPLETED', interests: ['瑜伽'] })
  })
})
