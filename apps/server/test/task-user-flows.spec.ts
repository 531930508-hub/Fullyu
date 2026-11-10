import { buildTestContext, Seeder, TestContext } from './helpers'
import { TaskService } from '../src/modules/task/task.service'
import { UserService } from '../src/modules/user/user.service'
import { BusinessException } from '../src/common/exceptions/business.exception'
import { BadRequestException } from '@nestjs/common'

/** 构造一个满足最小体积与文件头校验的 PNG data URL（内容无需真实可解码） */
function pngDataUrl(bytes = 600) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const body = Buffer.alloc(Math.max(0, bytes - header.length), 1)
  return `data:image/png;base64,${Buffer.concat([header, body]).toString('base64')}`
}

/**
 * 任务与用户资料非资金流程：
 * - 任务可见范围（全员/指定导师）、领取名额与重复领取、取消后不可领
 * - 完成奖励只发一次（含并发审核），余额原子累加
 * - 资料编辑白名单、昵称/语言/头像/照片校验，核验照片不下发客户端
 */
describe('任务与用户资料非资金流程', () => {
  let ctx: TestContext
  let seeder: Seeder
  let tasks: TaskService
  let users: UserService
  const taskIds: string[] = []
  const userIds: string[] = []

  beforeAll(async () => {
    ctx = await buildTestContext()
    seeder = new Seeder(ctx.prisma)
    tasks = new TaskService(ctx.prisma)
    users = new UserService(ctx.prisma, { enabled: false } as any)
  })

  afterAll(async () => {
    await ctx.prisma.seedsRecord.deleteMany({ where: { trainer: { userId: { in: userIds } } } })
    await ctx.prisma.taskClaim.deleteMany({ where: { OR: [{ taskId: { in: taskIds } }, { userId: { in: userIds } }] } })
    await ctx.prisma.task.deleteMany({ where: { id: { in: taskIds } } })
    await seeder.cleanup()
    await ctx.app.close()
  })

  async function newTask(data: Partial<Parameters<TaskService['create']>[0]> = {}) {
    const task = await tasks.create({
      title: `任务${Date.now()}${Math.floor(Math.random() * 1000)}`,
      description: '测试任务',
      seedsReward: 10,
      maxParticipants: 2,
      scope: 'ALL',
      specificTrainerIds: [],
      status: 'PUBLISHED',
      ...data,
    })
    taskIds.push(task.id)
    return task
  }

  async function newTrainer() {
    const trainer = await seeder.trainer()
    userIds.push(trainer.userId)
    return trainer
  }

  it('任务可见范围：全员任务所有人可见，指定导师仅目标可见，取消后不可见', async () => {
    const a = await newTrainer()
    const b = await newTrainer()
    const all = await newTask()
    const specific = await newTask({ scope: 'SPECIFIC', specificTrainerIds: [a.id] })
    const cancelled = await newTask()
    await tasks.cancel(cancelled.id)

    const forA = await tasks.listForTrainer(a.id)
    expect(forA.map((t) => t.id)).toEqual(expect.arrayContaining([all.id, specific.id]))
    expect(forA.map((t) => t.id)).not.toContain(cancelled.id)

    const forB = await tasks.listForTrainer(b.id)
    expect(forB.map((t) => t.id)).toContain(all.id)
    expect(forB.map((t) => t.id)).not.toContain(specific.id)

    const defaults = await tasks.create({ title: '默认字段任务', maxParticipants: 1 })
    taskIds.push(defaults.id)
    expect(defaults.specificTrainerIds).toEqual([])
    expect(defaults.scope).toBe('ALL')
  })

  it('任务领取：重复领取、名额满、已结束均拦截，并发领取不超额', async () => {
    const trainers = await Promise.all([newTrainer(), newTrainer(), newTrainer()])
    const task = await newTask({ maxParticipants: 2 })

    await tasks.claim(task.id, trainers[0].userId)
    await expect(tasks.claim(task.id, trainers[0].userId)).rejects.toBeInstanceOf(BusinessException)

    // 并发抢最后一个名额：只能有一人成功
    const results = await Promise.allSettled([
      tasks.claim(task.id, trainers[1].userId),
      tasks.claim(task.id, trainers[2].userId),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await ctx.prisma.taskClaim.count({ where: { taskId: task.id } })).toBe(2)

    const ended = await newTask({ maxParticipants: 1 })
    await tasks.cancel(ended.id)
    await expect(tasks.claim(ended.id, trainers[0].userId)).rejects.toBeInstanceOf(BusinessException)
  })

  it('完成任务：奖励只发一次，重复与并发审核不会重复记积分', async () => {
    const trainer = await newTrainer()
    const task = await newTask({ maxParticipants: 5, seedsReward: 30 })
    const claim = await tasks.claim(task.id, trainer.userId)

    await tasks.complete(claim.id)
    await tasks.complete(claim.id)
    let profile = await ctx.prisma.trainerProfile.findUnique({ where: { id: trainer.id } })
    expect(profile!.seedsBalance).toBe(30)
    expect(await ctx.prisma.seedsRecord.count({ where: { trainerId: trainer.id } })).toBe(1)

    const secondTrainer = await newTrainer()
    const secondClaim = await tasks.claim(task.id, secondTrainer.userId)
    await Promise.all([tasks.complete(secondClaim.id), tasks.complete(secondClaim.id)])
    profile = await ctx.prisma.trainerProfile.findUnique({ where: { id: secondTrainer.id } })
    expect(profile!.seedsBalance).toBe(30)
    expect(await ctx.prisma.seedsRecord.count({ where: { trainerId: secondTrainer.id } })).toBe(1)

    const record = await ctx.prisma.seedsRecord.findFirst({ where: { trainerId: secondTrainer.id } })
    expect(record).toMatchObject({ amount: 30, balance: 30, type: 'TASK_REWARD', relatedId: task.id })
  })

  it('用户资料：昵称/语言/头像校验，核验照片不下发且用户不可自助修改', async () => {
    const user = await seeder.user()
    userIds.push(user.id)
    const photo = pngDataUrl(700)
    await ctx.prisma.user.update({ where: { id: user.id }, data: { photo } })

    const profile = await users.findById(user.id)
    expect(profile).toBeTruthy()
    expect(profile).not.toHaveProperty('photo')
    expect(profile).toMatchObject({ hasVerificationPhoto: true })

    await expect(users.updateProfile(user.id, { nickname: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(
      users.updateProfile(user.id, { nickname: '超'.repeat(21) }),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(users.updateProfile(user.id, { language: 'fr' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(users.updateProfile(user.id, { avatar: 'tmp://avatar' })).rejects.toBeInstanceOf(
      BadRequestException,
    )

    const updated = await users.updateProfile(user.id, {
      nickname: '  新昵称  ',
      language: 'en',
      avatar: pngDataUrl(600),
      // 非白名单字段应被忽略
      photo: pngDataUrl(800),
    } as any)
    expect(updated).toMatchObject({ nickname: '新昵称', language: 'en', hasVerificationPhoto: true })
    const stored = await ctx.prisma.user.findUnique({ where: { id: user.id } })
    expect(stored!.photo).toBe(photo)
    expect(stored!.avatar!.startsWith('data:image/png;base64,')).toBe(true)

    await expect(users.adminUpdatePhoto(user.id, 'not-an-image')).rejects.toBeInstanceOf(
      BadRequestException,
    )
    const withNewPhoto = await users.adminUpdatePhoto(user.id, pngDataUrl(900))
    expect(withNewPhoto.hasVerificationPhoto).toBe(true)
    expect(withNewPhoto).not.toHaveProperty('photo')
  })
})
