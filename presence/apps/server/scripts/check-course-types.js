/**
 * 课程类型枚举漂移巡检（只读，不改数据）。
 *
 * 背景：courses.type 在 MySQL 里是 varchar(32)，而 Prisma 侧是 enum CourseType(SINGLE|SERIES)。
 * 库里一旦出现枚举外的历史值（如 'camp'），后台 course.findMany 在反序列化时会整条挂掉，
 * 表现为「后台课程列表 / 发券选课程 一律 400」，且错误信息离数据很远（Invalid prisma.course.findMany）。
 *
 * 用法：
 *   node scripts/check-course-types.js      # 有漂移 exit 1，并打印修复 SQL 建议
 *   pnpm --filter @fullyu/server db:check-course-types
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const ALLOWED = ['SINGLE', 'SERIES']

async function main() {
  // 用原生 SQL 读原始字符串，绕过 Prisma 的枚举反序列化，否则脏值本身就查不出来
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, title, type, status, start_date, end_date FROM courses WHERE type NOT IN (${ALLOWED.map((v) => `'${v}'`).join(',')}) ORDER BY created_at DESC`,
  )
  if (!rows.length) {
    console.log('course types ok')
    return
  }
  console.error(`发现 ${rows.length} 条 CourseType 漂移（会导致后台课程列表整体 400）：`)
  for (const row of rows) {
    console.error(`- ${row.id} | ${row.title} | type=${row.type} | status=${row.status} | ${row.start_date} ~ ${row.end_date}`)
  }
  console.error('修复建议（单日单场改 SINGLE；跨多日/连报课程改 SERIES）：')
  for (const row of rows) {
    console.error(`UPDATE courses SET type='SINGLE' WHERE id='${row.id}' AND type='${row.type}';`)
  }
  process.exitCode = 1
}

main()
  .catch((error) => {
    console.error('巡检失败：', error.message)
    process.exitCode = 2
  })
  .finally(() => prisma.$disconnect())