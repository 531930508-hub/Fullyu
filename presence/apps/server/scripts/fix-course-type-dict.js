/**
 * 把 course_type 值集校正为与 CourseType 枚举一致（SINGLE/SERIES）。
 *
 * 背景：值集里残留 group/private/workshop/camp，与 Prisma 枚举 CourseType
 * (SINGLE|SERIES) 不一致；后台发布课程若按值集渲染下拉，提交这些值会被
 * mapCourseType 拒绝（400 不支持的课程类型）。本脚本删除枚举外的项并补回
 * SINGLE/SERIES 的中英文文案，幂等，可重复执行。
 *
 * 用法：node scripts/fix-course-type-dict.js
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const ITEMS = [
  { value: 'SINGLE', label: '单次课程', labelEn: 'Single class', sort: 0 },
  { value: 'SERIES', label: '系列课程', labelEn: 'Series', sort: 1 },
]

async function main() {
  const set = await prisma.dictSet.upsert({
    where: { code: 'course_type' },
    update: { name: '课程类型' },
    create: { code: 'course_type', name: '课程类型', system: true },
  })

  const removed = await prisma.dictItem.deleteMany({
    where: { setId: set.id, value: { notIn: ITEMS.map((i) => i.value) } },
  })

  for (const item of ITEMS) {
    await prisma.dictItem.upsert({
      where: { setId_value: { setId: set.id, value: item.value } },
      update: { label: item.label, labelEn: item.labelEn, sort: item.sort, enabled: true },
      create: { setId: set.id, ...item },
    })
  }

  const items = await prisma.dictItem.findMany({
    where: { setId: set.id },
    orderBy: { sort: 'asc' },
    select: { value: true, label: true, enabled: true },
  })
  console.log(`course_type 已校正：删除 ${removed.count} 项；现有 ${items.map((i) => `${i.value}=${i.label}`).join(', ')}`)
}

main()
  .catch((error) => {
    console.error('校正失败：', error.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
