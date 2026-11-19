import { TrainerService } from '../src/modules/trainer/trainer.service'
import { BusinessException } from '../src/common/exceptions/business.exception'

/**
 * 后台「添加导师」的绑定逻辑：
 * 后台 UI 只能拿到手机号（任何页面都不展示 User.id），所以创建档案必须按手机号
 * 找/建用户；历史入参 userId 保留兼容，但 id 不存在时要给业务提示，不能把
 * Prisma 的 P2025（Invalid `prisma.user.update()` invocation）透给运营。
 */
describe('TrainerService.create 用户绑定', () => {
  function makeService() {
    const prisma: any = {
      trainerProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'tp-1', ...data })),
      },
      trainerLevel: { findUnique: jest.fn().mockResolvedValue({ level: 1, hourlyRate: 180 }) },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'user-new' }),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    }
    const service = new (TrainerService as any)(prisma)
    return { service, prisma }
  }

  it('手机号未注册时自动建号（昵称取导师姓名）并绑定档案', async () => {
    const { service, prisma } = makeService()

    const res = await service.create({ phone: '13800000001', displayName: '林一', level: 1 })

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { phone: '13800000001', nickname: '林一' },
      select: { id: true },
    })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-new' },
      data: { isTrainer: true },
    })
    expect(prisma.trainerProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-new', displayName: '林一' }),
    })
    expect(res).toEqual(expect.objectContaining({ id: 'tp-1' }))
  })

  it('手机号已注册时直接绑定该账号，不再建号', async () => {
    const { service, prisma } = makeService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-old',
      phone: '13800000002',
      trainerProfile: null,
    })

    await service.create({ phone: '13800000002', displayName: '林二' })

    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-old' },
      data: { isTrainer: true },
    })
  })

  it('旧入参 userId 不存在时抛业务提示，而不是 Prisma P2025', async () => {
    const { service, prisma } = makeService()

    const err = await service.create({ userId: 'user-not-exist', displayName: '林三' }).catch((e) => e)

    expect(err).toBeInstanceOf(BusinessException)
    expect(err.message).toBe('关联用户不存在，请按手机号添加导师')
    expect(err.bizCode).toBe(4041)
    expect(prisma.trainerProfile.create).not.toHaveBeenCalled()
  })

  it('并发添加同一手机号撞唯一键时回读已有账号', async () => {
    const { service, prisma } = makeService()
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'user-race' })
    prisma.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))

    await service.create({ phone: '13800000004', displayName: '林七' })

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-race' },
      data: { isTrainer: true },
    })
  })

  it('手机号已绑定导师档案时拒绝重复建档', async () => {
    const { service, prisma } = makeService()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-old',
      phone: '13800000003',
      trainerProfile: { id: 'tp-old' },
    })

    const err = await service.create({ phone: '13800000003', displayName: '林四' }).catch((e) => e)

    expect(err).toBeInstanceOf(BusinessException)
    expect(err.bizCode).toBe(4009)
    expect(prisma.trainerProfile.create).not.toHaveBeenCalled()
  })

  it('手机号格式不合法时拒绝，且不打开事务', async () => {
    const { service, prisma } = makeService()

    await expect(service.create({ phone: '1380000', displayName: '林五' })).rejects.toThrow(
      '手机号格式不正确',
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('手机号和 userId 都没传时提示补手机号', async () => {
    const { service } = makeService()

    await expect(service.create({ displayName: '林六' })).rejects.toThrow('请填写导师手机号')
  })
})
