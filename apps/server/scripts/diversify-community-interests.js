/**
 * 让社群演示成员的兴趣标签彼此不同。
 *
 * 背景：演示数据里同一社群的每个成员兴趣完全相同，于是「共同兴趣」筛选出
 * 的名单和「全部成员」一模一样，看起来像筛选没生效。真实社群里成员兴趣是
 * 有交集也有差异的，筛选才有意义。
 *
 * 做法：按加入时间顺序，从该社群自己的 interestPool 里轮转取 2 个标签
 * （步长 1，保证相邻成员有一个标签重合、至少一个不同），并保证整组里既有
 * 与首位成员重合的、也有完全不重合的。
 *
 * 安全边界：
 * - 只写 community_joins.interests 一列，只取该社群 interestPool 内的值；
 * - 不改隐私设置、加入时间、成员数与任何资金字段；
 * - 不执行 DDL。
 *
 * 用法：
 *   node scripts/diversify-community-interests.js dump
 *   node scripts/diversify-community-interests.js apply
 *   node scripts/diversify-community-interests.js restore <file>
 */
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const BACKUP_DIR = path.join(__dirname, '..', 'prisma', 'backups')

function parsePool(raw) {
  try {
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item) : []
  } catch {
    return []
  }
}

/** 第 index 个成员取 pool 里的第 index、index+1 个标签（环形） */
function pick(pool, index) {
  if (pool.length <= 1) return [...pool]
  return [pool[index % pool.length], pool[(index + 1) % pool.length]]
}

async function plan() {
  const communities = await prisma.community.findMany({
    select: { id: true, name: true, interestPool: true },
  })
  const result = []
  for (const community of communities) {
    const pool = parsePool(community.interestPool)
    if (pool.length < 2) continue
    const joins = await prisma.communityJoin.findMany({
      where: { communityId: community.id },
      orderBy: { joinedAt: 'asc' },
      select: { id: true, userId: true, interests: true },
    })
    joins.forEach((join, index) => {
      result.push({
        id: join.id,
        communityId: community.id,
        communityName: community.name,
        userId: join.userId,
        before: join.interests,
        after: JSON.stringify(pick(pool, index)),
      })
    })
  }
  return result
}

async function dump() {
  const rows = await plan()
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
    select: { id: true, nickname: true },
  })
  const name = new Map(users.map((u) => [u.id, u.nickname]))
  let current = ''
  for (const row of rows) {
    if (row.communityId !== current) {
      current = row.communityId
      console.log(`\n${row.communityId} ${row.communityName}`)
    }
    console.log(`  ${name.get(row.userId)}: ${row.before} -> ${row.after}`)
  }
}

async function apply() {
  const rows = await plan()
  if (!rows.length) {
    console.log('没有可调整的加入关系')
    return
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '')
  const file = path.join(BACKUP_DIR, `community-interests-${stamp}.json`)
  fs.writeFileSync(file, JSON.stringify(rows.map((r) => ({ id: r.id, interests: r.before })), null, 2))
  console.log(`备份：${file}`)
  for (const row of rows) {
    await prisma.communityJoin.update({ where: { id: row.id }, data: { interests: row.after } })
  }
  console.log(`已更新 ${rows.length} 条加入关系的兴趣标签`)
}

async function restore(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const row of data) {
    await prisma.communityJoin.update({ where: { id: row.id }, data: { interests: row.interests } })
  }
  console.log(`已回滚 ${data.length} 条加入关系`)
}

async function main() {
  const [mode, arg] = process.argv.slice(2)
  if (mode === 'apply') await apply()
  else if (mode === 'restore') {
    if (!arg) throw new Error('restore 需要备份文件路径')
    await restore(arg)
  } else await dump()
}

main()
  .catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
