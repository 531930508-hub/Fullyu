import { PrismaClient, MemberCardType } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

/** 权限点定义：module 用于后台分组展示 */
const PERMISSIONS: { code: string; name: string; module: string }[] = [
  // 教务
  { code: 'course:view', name: '课程查看', module: 'education' },
  { code: 'course:create', name: '课程创建', module: 'education' },
  { code: 'course:update', name: '课程编辑', module: 'education' },
  { code: 'course:delete', name: '课程删除', module: 'education' },
  { code: 'trainer:view', name: '导师查看', module: 'education' },
  { code: 'trainer:create', name: '导师创建', module: 'education' },
  { code: 'trainer:update', name: '导师编辑', module: 'education' },
  { code: 'venue:view', name: '场地查看', module: 'education' },
  { code: 'venue:create', name: '场地创建', module: 'education' },
  { code: 'venue:update', name: '场地编辑', module: 'education' },
  { code: 'venue:delete', name: '场地删除', module: 'education' },
  { code: 'checkin:view', name: '签到查看', module: 'education' },
  { code: 'checkin:create', name: '手工签到', module: 'education' },
  { code: 'review:view', name: '评价查看', module: 'education' },
  { code: 'review:delete', name: '评价删除', module: 'education' },
  // 运营/销售
  { code: 'voucher:view', name: '代金券查看', module: 'sales' },
  { code: 'voucher:create', name: '代金券发放', module: 'sales' },
  { code: 'voucher:update', name: '代金券管理', module: 'sales' },
  { code: 'task:view', name: '任务查看', module: 'sales' },
  { code: 'task:create', name: '任务发布', module: 'sales' },
  { code: 'task:update', name: '任务编辑', module: 'sales' },
  { code: 'material:view', name: '物料查看', module: 'sales' },
  { code: 'material:create', name: '物料创建', module: 'sales' },
  { code: 'material:update', name: '物料编辑', module: 'sales' },
  { code: 'material:delete', name: '物料删除', module: 'sales' },
  { code: 'settlement:view', name: '结算查看', module: 'sales' },
  { code: 'settlement:create', name: '结算生成', module: 'sales' },
  { code: 'analytics:view', name: '数据分析', module: 'sales' },
  { code: 'upload:create', name: '文件上传', module: 'sales' },
  { code: 'membercard:view', name: '会员卡查看', module: 'sales' },
  { code: 'membercard:create', name: '会员卡商品创建', module: 'sales' },
  { code: 'membercard:update', name: '会员卡管理', module: 'sales' },
  { code: 'order:view', name: '订单查看', module: 'sales' },
  { code: 'order:update', name: '订单管理', module: 'sales' },
  { code: 'user:view', name: '用户查看', module: 'sales' },
  { code: 'user:update', name: '用户管理', module: 'sales' },
  // 系统
  { code: 'rbac:view', name: '权限查看', module: 'system' },
  { code: 'rbac:create', name: '权限创建', module: 'system' },
  { code: 'rbac:update', name: '权限编辑', module: 'system' },
  { code: 'rbac:delete', name: '权限删除', module: 'system' },
  { code: 'dict:view', name: '值集查看', module: 'system' },
  { code: 'dict:create', name: '值集创建', module: 'system' },
  { code: 'dict:update', name: '值集编辑', module: 'system' },
  { code: 'dict:delete', name: '值集删除', module: 'system' },
]

/** 默认值集字典 */
const DICT_SETS: {
  code: string
  name: string
  desc?: string
  items: { value: string; label: string; color?: string }[]
}[] = [
  {
    code: 'trainer_specialty',
    name: '导师擅长领域',
    items: [
      { value: 'hatha', label: '哈他瑜伽' },
      { value: 'vinyasa', label: '流瑜伽' },
      { value: 'yin', label: '阴瑜伽' },
      { value: 'aerial', label: '空中瑜伽' },
      { value: 'meditation', label: '冥想' },
    ],
  },
  {
    code: 'course_type',
    name: '课程类型',
    items: [
      { value: 'group', label: '团课' },
      { value: 'private', label: '私教' },
      { value: 'workshop', label: '工作坊' },
      { value: 'camp', label: '训练营' },
    ],
  },
  {
    code: 'voucher_source',
    name: '代金券来源',
    items: [
      { value: 'activity', label: '活动发放' },
      { value: 'compensation', label: '补偿发放' },
      { value: 'invite', label: '邀请奖励' },
    ],
  },
]

/** 会员卡商品：¥699/1980/5980 */
const MEMBER_PRODUCTS: {
  type: MemberCardType
  name: string
  price: number
  durationDays: number
  benefits: string[]
  sort: number
}[] = [
  { type: 'MONTHLY', name: '月卡', price: 699, durationDays: 30, benefits: ['会员折扣', '优先候补席位'], sort: 1 },
  { type: 'QUARTERLY', name: '季卡', price: 1980, durationDays: 90, benefits: ['会员折扣', '优先候补席位', '专属活动'], sort: 2 },
  { type: 'YEARLY', name: '年卡', price: 5980, durationDays: 365, benefits: ['会员折扣', '优先候补席位', '专属活动', '生日礼遇'], sort: 3 },
]

async function main() {
  console.log('🌱 开始初始化种子数据...')

  // 1. 权限点
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, module: p.module },
      create: p,
    })
  }
  const allPermissions = await prisma.permission.findMany()
  console.log(`✅ 权限点: ${allPermissions.length}`)

  // 2. 超级管理员角色（授予全部权限）
  const superRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    update: { description: '超级管理员' },
    create: { name: 'SUPER_ADMIN', description: '超级管理员' },
  })
  await prisma.rolePermission.deleteMany({ where: { roleId: superRole.id } })
  await prisma.rolePermission.createMany({
    data: allPermissions.map((p) => ({ roleId: superRole.id, permissionId: p.id })),
    skipDuplicates: true,
  })
  console.log('✅ 角色: SUPER_ADMIN')

  // 3. 超级管理员账号（默认 admin / Admin@123456，请首次登录后修改）
  const passwordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'Admin@123456', 10)
  const admin = await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: passwordHash, name: '超级管理员' },
  })
  await prisma.adminUserRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
    update: {},
    create: { userId: admin.id, roleId: superRole.id },
  })
  console.log('✅ 超级管理员: admin')

  // 4. 值集字典
  for (const set of DICT_SETS) {
    const dictSet = await prisma.dictSet.upsert({
      where: { code: set.code },
      update: { name: set.name, desc: set.desc, system: true },
      create: { code: set.code, name: set.name, desc: set.desc, system: true },
    })
    for (let i = 0; i < set.items.length; i++) {
      const item = set.items[i]
      await prisma.dictItem.upsert({
        where: { setId_value: { setId: dictSet.id, value: item.value } },
        update: { label: item.label, color: item.color, sort: i },
        create: { setId: dictSet.id, value: item.value, label: item.label, color: item.color, sort: i },
      })
    }
  }
  console.log(`✅ 值集字典: ${DICT_SETS.length}`)

  // 5. 会员卡商品
  for (const prod of MEMBER_PRODUCTS) {
    const existing = await prisma.memberCardProduct.findFirst({ where: { type: prod.type } })
    if (existing) {
      await prisma.memberCardProduct.update({ where: { id: existing.id }, data: prod })
    } else {
      await prisma.memberCardProduct.create({ data: prod })
    }
  }
  console.log(`✅ 会员卡商品: ${MEMBER_PRODUCTS.length}`)

  // 6. 示例场地
  const venue = await prisma.venue.findFirst({ where: { name: '总店·瑜伽馆' } })
  if (!venue) {
    await prisma.venue.create({
      data: {
        name: '总店·瑜伽馆',
        address: '上海市徐汇区示例路 1 号',
        images: [],
        businessHours: JSON.stringify({ mon_fri: '09:00-21:00', sat_sun: '09:00-18:00' }),
      },
    })
  }
  console.log('✅ 示例场地')

  // 7. 示例导师（含关联用户）
  const trainerPhone = '13800000001'
  let trainerUser = await prisma.user.findUnique({ where: { phone: trainerPhone } })
  if (!trainerUser) {
    trainerUser = await prisma.user.create({
      data: { phone: trainerPhone, nickname: '示例导师', isTrainer: true },
    })
  }
  const existingTrainer = await prisma.trainerProfile.findUnique({ where: { userId: trainerUser.id } })
  if (!existingTrainer) {
    await prisma.trainerProfile.create({
      data: {
        userId: trainerUser.id,
        displayName: '示例导师',
        level: 3,
        specialties: ['hatha', 'vinyasa'],
        bio: '资深瑜伽导师，专注体式与呼吸。',
        hourlyRate: 300,
      },
    })
  }
  console.log('✅ 示例导师')

  console.log('🎉 种子数据初始化完成')
}

main()
  .catch((e) => {
    console.error('❌ 种子数据初始化失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
