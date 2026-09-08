import { PrismaClient, MemberCardType, OrgType, DataScope, PermLevel } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { PERMISSIONS, BUILTIN_ROLES } from '@fullyu/shared'
import { seedBiz } from './seed-biz'

const prisma = new PrismaClient()

/**
 * 组织架构种子：全系统主数据。
 * id 使用可读主键，便于审批流与财务单据引用。
 */
const ORGANIZATIONS: {
  id: string
  name: string
  shortName: string
  code: string
  type: OrgType
  parentId: string | null
  leader: string
  phone: string
  accounting: boolean
  hasWarehouse: boolean
  canPurchase: boolean
  mgmtFeeRate: number
  trainFeeRate: number
  /** 月保底租金，与提成租金取高 */
  baseRent: number
  /** 提成租金比例，按当月收入计提 */
  rentRate: number
  /** 月物业费，固定额 */
  propertyFee: number
  sortOrder: number
}[] = [
  { id: 'HQ', name: '福愈健康管理集团有限公司', shortName: '总部', code: 'HQ', type: 'GROUP', parentId: null, leader: '田昊', phone: '13900000000', accounting: true, hasWarehouse: true, canPurchase: true, mgmtFeeRate: 0, trainFeeRate: 0, baseRent: 0, rentRate: 0, propertyFee: 0, sortOrder: 1 },
  { id: 'D-PUR', name: '总部采购部', shortName: '采购部', code: 'HQ-PUR', type: 'DEPT', parentId: 'HQ', leader: '刘志强', phone: '13900000001', accounting: false, hasWarehouse: false, canPurchase: true, mgmtFeeRate: 0, trainFeeRate: 0, baseRent: 0, rentRate: 0, propertyFee: 0, sortOrder: 2 },
  { id: 'D-FIN', name: '总部财务部', shortName: '财务部', code: 'HQ-FIN', type: 'DEPT', parentId: 'HQ', leader: '周雅琪', phone: '13900000002', accounting: false, hasWarehouse: false, canPurchase: false, mgmtFeeRate: 0, trainFeeRate: 0, baseRent: 0, rentRate: 0, propertyFee: 0, sortOrder: 3 },
  { id: 'C001', name: '深圳福田福愈健康管理有限公司', shortName: '福田分公司', code: 'SZ-FT', type: 'SUBSIDIARY', parentId: 'HQ', leader: '陈国栋', phone: '13900001001', accounting: false, hasWarehouse: false, canPurchase: false, mgmtFeeRate: 0, trainFeeRate: 0, baseRent: 0, rentRate: 0, propertyFee: 0, sortOrder: 4 },
  { id: 'S001', name: '深圳福田店', shortName: '福田店', code: 'SZ-FT-01', type: 'STORE', parentId: 'C001', leader: '李文静', phone: '13900001011', accounting: true, hasWarehouse: true, canPurchase: true, mgmtFeeRate: 0.15, trainFeeRate: 0.02, baseRent: 38000, rentRate: 0.06, propertyFee: 5600, sortOrder: 5 },
  { id: 'C002', name: '深圳南山福愈健康管理有限公司', shortName: '南山分公司', code: 'SZ-NS', type: 'SUBSIDIARY', parentId: 'HQ', leader: '黄伟', phone: '13900002001', accounting: false, hasWarehouse: false, canPurchase: false, mgmtFeeRate: 0, trainFeeRate: 0, baseRent: 0, rentRate: 0, propertyFee: 0, sortOrder: 6 },
  { id: 'S002', name: '深圳南山店', shortName: '南山店', code: 'SZ-NS-01', type: 'STORE', parentId: 'C002', leader: '王海涛', phone: '13900002011', accounting: true, hasWarehouse: true, canPurchase: true, mgmtFeeRate: 0.15, trainFeeRate: 0.02, baseRent: 12000, rentRate: 0.09, propertyFee: 4200, sortOrder: 7 },
  { id: 'C003', name: '广州天河福愈健康管理有限公司', shortName: '天河分公司', code: 'GZ-TH', type: 'SUBSIDIARY', parentId: 'HQ', leader: '赵鹏', phone: '13900003001', accounting: false, hasWarehouse: false, canPurchase: false, mgmtFeeRate: 0, trainFeeRate: 0, baseRent: 0, rentRate: 0, propertyFee: 0, sortOrder: 8 },
  { id: 'S003', name: '广州天河店', shortName: '天河店', code: 'GZ-TH-01', type: 'STORE', parentId: 'C003', leader: '孙晓芸', phone: '13900003011', accounting: true, hasWarehouse: true, canPurchase: true, mgmtFeeRate: 0.12, trainFeeRate: 0.02, baseRent: 26000, rentRate: 0.05, propertyFee: 3800, sortOrder: 9 },
]

/**
 * 演示账号：供多角色权限验收使用。密码统一取 SEED_DEMO_PASSWORD（默认 Demo@123456）。
 * 生产环境可设 SEED_SKIP_DEMO_USERS=1 跳过。
 */
/**
 * 演示人员名册。
 *
 * 登录账号统一用手机号，不再用 store_ft 这类看不出是谁的自定义用户名。
 * 号段刷组织层级：139 000 00xx 总部、139 00X 0xx 分公司与旗下门店（末两位 01=负责人、11=店长、12=店员），
 * 与组织表里登记的联系电话保持一致，方便对帐。
 *
 * 分公司负责人用 BRANCH_MANAGER，门店店长用 STORE_MANAGER：
 * 两者数据范围都是「本组织及下级」，区别在于负责人额外能审批待办、看得到采购金额。
 */
const DEMO_ADMINS: { username: string; name: string; role: string; orgId: string }[] = [
  // 总部职能
  { username: '13900000001', name: '刘志强', role: 'HQ_PURCHASE', orgId: 'D-PUR' },
  { username: '13900000002', name: '周雅琪', role: 'HQ_FINANCE', orgId: 'D-FIN' },
  { username: '13900000010', name: '林晓霞', role: 'HQ_OPERATION', orgId: 'HQ' },
  { username: '13900000011', name: '吴倩', role: 'HQ_OPERATION', orgId: 'HQ' },
  { username: '13900000012', name: '郑辉', role: 'AUDITOR', orgId: 'HQ' },
  // 分公司负责人
  { username: '13900001001', name: '陈国栋', role: 'BRANCH_MANAGER', orgId: 'C001' },
  { username: '13900002001', name: '黄伟', role: 'BRANCH_MANAGER', orgId: 'C002' },
  { username: '13900003001', name: '赵鹏', role: 'BRANCH_MANAGER', orgId: 'C003' },
  // 门店店长
  { username: '13900001011', name: '李文静', role: 'STORE_MANAGER', orgId: 'S001' },
  { username: '13900002011', name: '王海涛', role: 'STORE_MANAGER', orgId: 'S002' },
  { username: '13900003011', name: '孙晓芸', role: 'STORE_MANAGER', orgId: 'S003' },
  // 门店店员
  { username: '13900001012', name: '张敏', role: 'STORE_STAFF', orgId: 'S001' },
  { username: '13900002012', name: '刘洋', role: 'STORE_STAFF', orgId: 'S002' },
  { username: '13900003012', name: '陈璐', role: 'STORE_STAFF', orgId: 'S003' },
]

/** 权限体系升级前的英文演示账号，已被上面的手机号名册取代，遇到就清掉 */
const LEGACY_DEMO_USERNAMES = [
  'finance',
  'purchase',
  'operation',
  'store_ft',
  'store_ns',
  'staff_ft',
  'auditor',
]

/** 默认值集字典 */
const DICT_SETS: {
  code: string
  name: string
  desc?: string
  items: { value: string; label: string; color?: string }[]
}[] = [
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
  {
    code: 'course_duration',
    name: '课程时长',
    desc: '单次课与多次课共用的单节时长选项（分钟）',
    items: [
      { value: '45', label: '45分钟' },
      { value: '60', label: '60分钟' },
      { value: '90', label: '90分钟' },
      { value: '120', label: '120分钟' },
      { value: '180', label: '180分钟' },
      { value: '360', label: '360分钟（全天）' },
    ],
  },
]

/** 导师等级默认配置（等级 -> 名称 -> 默认时薪，单位：元） */
const TRAINER_LEVELS: { level: number; name: string; hourlyRate: number }[] = [
  { level: 1, name: 'LV1 初级导师', hourlyRate: 200 },
  { level: 2, name: 'LV2 中级导师', hourlyRate: 300 },
  { level: 3, name: 'LV3 高级导师', hourlyRate: 450 },
  { level: 4, name: 'LV4 资深导师', hourlyRate: 600 },
  { level: 5, name: 'LV5 首席导师', hourlyRate: 800 },
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

  // 0. 组织架构（先建父后建子，ORGANIZATIONS 已按层级排序）
  for (const org of ORGANIZATIONS) {
    const { id, ...rest } = org
    await prisma.organization.upsert({
      where: { id },
      update: rest,
      create: { id, ...rest },
    })
  }
  console.log(`✅ 组织节点: ${ORGANIZATIONS.length}`)

  // 1. 权限点（含粒度 level 与分组，源于 @fullyu/shared 单一定义）
  for (let i = 0; i < PERMISSIONS.length; i++) {
    const p = PERMISSIONS[i]
    const data = {
      name: p.name,
      module: p.module,
      level: p.level as PermLevel,
      groupName: p.group,
      sortOrder: i,
    }
    await prisma.permission.upsert({
      where: { code: p.code },
      update: data,
      create: { code: p.code, ...data },
    })
  }
  // 清理已从定义中移除的历史权限点，避免权限树出现孤立项
  const validCodes = PERMISSIONS.map((p) => p.code)
  const stale = await prisma.permission.findMany({ where: { code: { notIn: validCodes } } })
  if (stale.length) {
    await prisma.rolePermission.deleteMany({ where: { permissionId: { in: stale.map((s) => s.id) } } })
    await prisma.permission.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } })
    console.log(`🧹 清理废弃权限点: ${stale.map((s) => s.code).join(', ')}`)
  }
  const allPermissions = await prisma.permission.findMany()
  const permIdByCode = new Map(allPermissions.map((p) => [p.code, p.id]))
  console.log(`✅ 权限点: ${allPermissions.length}`)

  // 2. 内置角色（含数据行级范围）
  const roleIdByName = new Map<string, string>()
  for (const def of BUILTIN_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: def.name },
      update: {
        description: `${def.label} · ${def.description}`,
        dataScope: def.dataScope as DataScope,
        isBuiltin: true,
      },
      create: {
        name: def.name,
        description: `${def.label} · ${def.description}`,
        dataScope: def.dataScope as DataScope,
        isBuiltin: true,
      },
    })
    roleIdByName.set(def.name, role.id)

    // 内置角色的权限以定义为准全量重置（'*' 表示全部）
    const codes = def.permissions.includes('*') ? validCodes : def.permissions
    const permissionIds = codes
      .map((c) => permIdByCode.get(c))
      .filter((v): v is string => Boolean(v))
    const missing = codes.filter((c) => !permIdByCode.has(c))
    if (missing.length) console.warn(`⚠️  角色 ${def.name} 存在未定义的权限码: ${missing.join(', ')}`)

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    })
    console.log(`✅ 角色: ${def.name}（${def.dataScope}，${permissionIds.length} 个权限）`)
  }
  const superRoleId = roleIdByName.get('SUPER_ADMIN')!

  // 3. 超级管理员账号（默认 admin / 123456，测试阶段所有账号统一初始密码）
  const passwordHash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || '123456', 10)
  const admin = await prisma.adminUser.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', password: passwordHash, name: '超级管理员' },
  })
  await prisma.adminUserRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superRoleId } },
    update: {},
    create: { userId: admin.id, roleId: superRoleId },
  })
  console.log('✅ 超级管理员: admin')

  // 3.1 各角色演示账号（绑定归属组织，用于验收细粒度与行级权限）
  if (process.env.SEED_SKIP_DEMO_USERS !== '1') {
    // 先清掉升级前的英文演示账号，避免两套命名并存。
    // 只限定在这份名单内，不会误删 admin 与真实管理员账号。
    const legacy = await prisma.adminUser.findMany({
      where: { username: { in: LEGACY_DEMO_USERNAMES } },
      select: { id: true, username: true },
    })
    if (legacy.length) {
      const ids = legacy.map((u) => u.id)
      await prisma.adminUserRole.deleteMany({ where: { userId: { in: ids } } })
      await prisma.adminUser.deleteMany({ where: { id: { in: ids } } })
      console.log(`♻️  已清理旧演示账号: ${legacy.map((u) => u.username).join(', ')}`)
    }

    const demoHash = await bcrypt.hash(process.env.SEED_DEMO_PASSWORD || '123456', 10)
    for (const d of DEMO_ADMINS) {
      const roleId = roleIdByName.get(d.role)
      if (!roleId) continue
      const user = await prisma.adminUser.upsert({
        where: { username: d.username },
        // 手机号即登录名，两个字段必须一致
        update: { name: d.name, phone: d.username, orgId: d.orgId, isActive: true },
        create: {
          username: d.username,
          password: demoHash,
          name: d.name,
          phone: d.username,
          orgId: d.orgId,
          mustChangePassword: false,
        },
      })
      await prisma.adminUserRole.deleteMany({ where: { userId: user.id } })
      await prisma.adminUserRole.create({ data: { userId: user.id, roleId } })
    }
    console.log(`✅ 演示账号 ${DEMO_ADMINS.length} 人（登录名即手机号）`)
  }

  // 3.2 总部负责人本人的账号补上组织归属，否则选审批人时他不带组织前缀。
  // 只补空值，不覆盖已有绑定；数据范围仍由角色决定（超管为 ALL），不因此变窄。
  const hqLeaderName = ORGANIZATIONS.find((o) => o.id === 'HQ')?.leader
  if (hqLeaderName) {
    const bound = await prisma.adminUser.updateMany({
      where: { name: hqLeaderName, orgId: null, username: { not: 'admin' } },
      data: { orgId: 'HQ' },
    })
    if (bound.count) console.log(`✅ 总部负责人账号已绑定总部（${bound.count} 个）`)
  }

  // 3.3 存量账号的手机号字段回填：登录名本身已经是手机号、但 phone 是空的，
  // 两个字段补成一致，否则系统用户页编辑时手机号栏是空的，一保存就当成「改号」处理。
  const phoneless = await prisma.adminUser.findMany({
    where: { OR: [{ phone: null }, { phone: '' }] },
    select: { id: true, username: true },
  })
  const fixable = phoneless.filter((u) => /^1[3-9]\d{9}$/.test(u.username))
  for (const u of fixable) {
    await prisma.adminUser.update({ where: { id: u.id }, data: { phone: u.username } })
  }
  if (fixable.length) console.log(`✅ 回填手机号字段（${fixable.length} 个）`)

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

  // 4.1 导师等级配置
  for (const lv of TRAINER_LEVELS) {
    await prisma.trainerLevel.upsert({
      where: { level: lv.level },
      update: { name: lv.name, hourlyRate: lv.hourlyRate, sort: lv.level },
      create: { level: lv.level, name: lv.name, hourlyRate: lv.hourlyRate, sort: lv.level },
    })
  }
  console.log(`✅ 导师等级: ${TRAINER_LEVELS.length}`)

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

  // 8. 进销存 / 财务 / 审批流基础数据
  await seedBiz(prisma)

  // 9. 社群（国内版 Skool）演示数据：幂等，重跑不重复
  const communitySeeds = [
    {
      id: 'cm-1',
      name: '正念疗愈空间',
      slogan: '每天 10 分钟，把注意力还给自己',
      category: '疗愈',
      coverUrl: 'https://assets.skool.com/f/0e9208b549284e05864369f827fcb8ce/ab30f6f6cd6c42319097daf620cf979c89ec713a87314987ae35152bf73f562a-md.jpg',
      coverFallback: 'linear-gradient(135deg, #6D5934 0%, #A78E70 100%)',
      ownerName: '林悦',
      ownerTitle: '认证导师',
      ownerAvatar: 'https://randomuser.me/api/portraits/women/65.jpg',
      ownerUserId: null,
      memberCount: 1286,
      yearlyFee: 99900,
      isOfficial: true,
      isNew: false,
      tags: JSON.stringify(['良好健康', '身心疗愈', '正念', '共修']),
      description: '围绕正念冥想与声音疗愈的共修社群。每周两次共修直播，每月一次线下静心工作坊。在这里你会得到：系统的正念练习路径、同修的陪伴督促、导师的一对一答疑。',
      status: 'APPROVED',
      growth30d: 64,
      activeToday: 86,
    },
    {
      id: 'cm-2',
      name: '瑜伽精进营',
      slogan: '从垫上练习到生活方式',
      category: '瑜伽',
      coverUrl: 'https://assets.skool.com/f/4cb1f36aa6d440e6b40dc38bdd17c415/d25d1778b18a4118bf408ebea2b1b48f1927c6a556f74951bcf0aec734281f7e-md.jpg',
      coverFallback: 'linear-gradient(135deg, #6D5934 0%, #A78E70 100%)',
      ownerName: '苏晴',
      ownerTitle: 'RYT500 认证',
      ownerAvatar: 'https://randomuser.me/api/portraits/women/44.jpg',
      ownerUserId: null,
      memberCount: 843,
      yearlyFee: 0,
      isOfficial: false,
      isNew: false,
      tags: JSON.stringify(['良好健康', '身体疗愈', '打卡']),
      description: '面向有基础练习者的瑜伽进阶社群。体式精讲、呼吸法、练习日志打卡，导师每周点评。免费加入，线下工作坊另行报名。',
      status: 'APPROVED',
      growth30d: 31,
      activeToday: 52,
    },
    {
      id: 'cm-3',
      name: '芳疗师成长圈',
      slogan: '从爱好者到职业芳疗师的进阶之路',
      category: '身心成长',
      coverUrl: 'https://assets.skool.com/f/789b7b4c43ce456db3213ad965875a5f/4bafbf784c224399aa6d58d6e0b3a68f5ec132b05eb74075814e8ce34325ee81-md.jpg',
      coverFallback: 'linear-gradient(135deg, #584219 0%, #6D5934 100%)',
      ownerName: '示例导师',
      ownerTitle: 'Full愈主理人',
      ownerAvatar: 'https://randomuser.me/api/portraits/men/32.jpg',
      ownerUserId: trainerUser.id,
      memberCount: 326,
      yearlyFee: 199900,
      isOfficial: true,
      isNew: false,
      tags: JSON.stringify(['优质教育', '职业成长', '个案督导']),
      description: '由主理人亲自运营的职业成长社群。精油化学系统课、个案督导、门店见习机会，优秀成员可获得签约导师面试资格。',
      status: 'APPROVED',
      growth30d: 18,
      activeToday: 31,
    },
    {
      id: 'cm-4',
      name: '手作香薰实验室',
      slogan: '一起把季节调进香气里',
      category: '手作',
      coverUrl: 'https://assets.skool.com/f/c5290af831e3446e8ff32127c0777bf8/a51570c9f65b4abf90f758262fd2b913f37372ac3ccf47ff967d0f6cb6addb35-md.jpg',
      coverFallback: 'linear-gradient(135deg, #6D5934 0%, #A78E70 100%)',
      ownerName: '阿澈',
      ownerTitle: '独立调香师',
      ownerAvatar: 'https://randomuser.me/api/portraits/men/75.jpg',
      ownerUserId: null,
      memberCount: 217,
      yearlyFee: 39900,
      isOfficial: false,
      isNew: true,
      tags: JSON.stringify(['责任消费', '复愈特色', '手作']),
      description: '香薰蜡烛、扩香石、线香的手作社群，每月一次线下材料包共创。',
      status: 'APPROVED',
      growth30d: 58,
      activeToday: 12,
    },
  ] as const
  for (const c of communitySeeds) {
    await prisma.community.upsert({
      where: { id: c.id },
      update: { ...c },
      create: { ...c },
    })
  }
  console.log(`✅ 社群: ${communitySeeds.length}`)

  // 9.1 社群活动（活动日历）：官方课程活动关联真实课程，可跳转报名
  const sampleCourse = await prisma.course.findFirst({ orderBy: { createdAt: 'asc' } })
  const eventSeeds = [
    { id: 'ce-1', communityId: 'cm-1', eventDate: '2026-09-10', time: '20:00', title: '共修直播 · 身体扫描', type: 'LIVE', venue: null, capacity: 200, joined: 96, courseId: null },
    { id: 'ce-2', communityId: 'cm-1', eventDate: '2026-09-12', time: '20:00', title: '共修直播 · 慈心冥想', type: 'LIVE', venue: null, capacity: 200, joined: 71, courseId: null },
    { id: 'ce-3', communityId: 'cm-1', eventDate: '2026-09-20', time: '14:00', title: '线下静心工作坊 · 颂钵体验', type: 'OFFLINE', venue: '总店·瑜伽馆', capacity: 12, joined: 8, courseId: sampleCourse?.id ?? null },
    { id: 'ce-4', communityId: 'cm-1', eventDate: '2026-09-26', time: '10:00', title: '晨间正念共修', type: 'OFFLINE', venue: '总店·瑜伽馆', capacity: 20, joined: 6, courseId: null },
    { id: 'ce-5', communityId: 'cm-2', eventDate: '2026-09-11', time: '19:30', title: '体式答疑直播 · 倒立准备', type: 'LIVE', venue: null, capacity: 100, joined: 45, courseId: null },
    { id: 'ce-6', communityId: 'cm-3', eventDate: '2026-09-13', time: '15:00', title: '个案督导小组会（LV3+）', type: 'ONLINE', venue: null, capacity: 8, joined: 6, courseId: null },
  ] as const
  for (const e of eventSeeds) {
    const data = { ...e, eventDate: new Date(e.eventDate) } as any
    await prisma.communityEvent.upsert({
      where: { id: e.id },
      update: data,
      create: data,
    })
  }
  console.log(`✅ 社群活动: ${eventSeeds.length}`)

  // 9.2 社群动态（已发布）
  const now = Date.now()
  const postSeeds = [
    { id: 'cp-1', communityId: 'cm-1', authorName: '林悦', authorAvatar: 'https://randomuser.me/api/portraits/women/65.jpg', authorRole: '主理人', authorLevel: 5, content: '本周共修主题：身体扫描。周四周六晚 8 点直播间见，建议提前找一个不会被打扰的 20 分钟。新成员第一次参加可以先复习《正念入门》第 2 节。', images: null, likes: 46, comments: 12, at: 2 * 3600e3 },
    { id: 'cp-2', communityId: 'cm-1', authorName: '陈璐', authorAvatar: 'https://randomuser.me/api/portraits/women/68.jpg', authorRole: '成员', authorLevel: 3, content: '连续打卡 21 天达成！从坐不住 3 分钟到现在每天早晨 15 分钟，谢谢大家的陪伴', images: JSON.stringify(['https://loremflickr.com/640/420/meditation,morning/lock?lock=61']), likes: 38, comments: 9, at: 5 * 3600e3 },
    { id: 'cp-3', communityId: 'cm-1', authorName: '林悦', authorAvatar: 'https://randomuser.me/api/portraits/women/65.jpg', authorRole: '主理人', authorLevel: 5, content: '9 月线下静心工作坊定档：9 月 20 日（周日）14:00-17:00，总店·瑜伽馆，限 12 人。活动日历已开放报名，社群成员优先。', images: JSON.stringify(['https://loremflickr.com/640/420/workshop,zen/lock?lock=62']), likes: 52, comments: 21, at: 26 * 3600e3 },
    { id: 'cp-4', communityId: 'cm-2', authorName: '苏晴', authorAvatar: 'https://randomuser.me/api/portraits/women/44.jpg', authorRole: '主理人', authorLevel: 4, content: '本周体式精讲：战士三式的三个常见代偿。视频已上传，练习打卡时带上你的侧面视频，我逐一点评。', images: JSON.stringify(['https://loremflickr.com/640/420/yoga,pose/lock?lock=63']), likes: 27, comments: 6, at: 3 * 3600e3 },
    { id: 'cp-5', communityId: 'cm-3', authorName: '示例导师', authorAvatar: 'https://randomuser.me/api/portraits/men/32.jpg', authorRole: '主理人', authorLevel: 5, content: '本月个案督导名额还剩 2 个，想带个案来讨论的成员在评论区接龙。另：精油化学第 3 模块「酯类」已解锁，LV3 以上成员可看。', images: null, likes: 18, comments: 15, at: 1 * 3600e3 },
  ] as const
  for (const p of postSeeds) {
    const data = {
      id: p.id,
      communityId: p.communityId,
      authorName: p.authorName,
      authorAvatar: p.authorAvatar,
      authorRole: p.authorRole,
      authorLevel: p.authorLevel,
      content: p.content,
      images: p.images,
      likes: p.likes,
      comments: p.comments,
      status: 'APPROVED' as const,
      createdAt: new Date(now - p.at),
    }
    await prisma.communityPost.upsert({
      where: { id: p.id },
      update: data,
      create: data,
    })
  }
  console.log(`✅ 社群动态: ${postSeeds.length}`)

  // 9.3 演示用户加入社群（示例导师：管理 cm-3，加入 cm-1）
  const joinExist = await prisma.communityJoin.findUnique({
    where: { communityId_userId: { communityId: 'cm-1', userId: trainerUser.id } },
  })
  if (!joinExist) {
    await prisma.communityJoin.create({ data: { communityId: 'cm-1', userId: trainerUser.id } })
  }
  console.log('✅ 社群成员关系')

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
