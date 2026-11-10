/**
 * 增量同步进销存一期新增权限点。
 *
 * 不跑完整 seed（会重置演示数据与账号），只做：
 * 1) 把 packages/shared 里定义的权限点补齐到 permission 表；
 * 2) 给内置角色补上缺失的权限关联，不删除任何已有授权。
 *
 * 用法：cd apps/server && set -a && . ./.env.local; set +a && node scripts/sync-scm-permissions.js
 */
const { PrismaClient } = require('@prisma/client')
const { ALL_PERMISSION_CODES, BUILTIN_ROLES, PERMISSIONS } = require('@fullyu/shared')
const fs = require('fs')
const path = require('path')

const prisma = new PrismaClient()

async function backup() {
  const dir = path.join(__dirname, '..', 'prisma', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `scm-permissions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  const [permissions, rolePermissions, roles] = await Promise.all([
    prisma.permission.findMany(),
    prisma.rolePermission.findMany(),
    prisma.role.findMany(),
  ])
  fs.writeFileSync(file, JSON.stringify({ permissions, rolePermissions, roles }, null, 2))
  console.log(`💾 权限备份: ${file}`)
}

async function main() {
  await backup()

  for (let i = 0; i < PERMISSIONS.length; i++) {
    const p = PERMISSIONS[i]
    const data = {
      name: p.name,
      module: p.module,
      level: p.level,
      groupName: p.group,
      sortOrder: i,
    }
    await prisma.permission.upsert({
      where: { code: p.code },
      update: data,
      create: { code: p.code, ...data },
    })
  }
  console.log(`✅ 权限点已同步: ${PERMISSIONS.length}`)

  const all = await prisma.permission.findMany({ select: { id: true, code: true } })
  const byCode = new Map(all.map((p) => [p.code, p.id]))

  for (const def of BUILTIN_ROLES) {
    const role = await prisma.role.findUnique({ where: { name: def.name } })
    if (!role) {
      console.log(`⚠️  角色不存在，跳过: ${def.name}`)
      continue
    }
    const codes = def.permissions.includes('*') ? ALL_PERMISSION_CODES : def.permissions
    const ids = [...new Set(codes.map((c) => byCode.get(c)).filter(Boolean))]
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    })
    const owned = new Set(existing.map((e) => e.permissionId))
    const add = ids.filter((id) => !owned.has(id))
    if (add.length) {
      await prisma.rolePermission.createMany({
        data: add.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      })
    }
    console.log(`✅ 角色 ${def.name}: 新增 ${add.length} 个权限`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
