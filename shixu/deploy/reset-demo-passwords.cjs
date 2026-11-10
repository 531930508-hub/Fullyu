/**
 * 测试环境：把所有手机号账号的登录密码统一重置为 123456（幂等）。
 *
 * 用途：仅用于 staging / 测试环境，方便联调。生产环境默认拒绝执行。
 * - 只处理 username 为 6–20 位纯数字（手机号）的账号
 * - 重置 passwordHash 并 tokenVersion + 1（旧会话立即失效）
 * - 不输出任何哈希；只打印账号、角色、门店范围
 *
 * 运行（服务器）：
 *   cd /opt/teahour/app/apps/server
 *   NODE_ENV=staging TEAHOUR_ALLOW_PASSWORD_RESET=1 \
 *     /opt/teahour/runtime/bin/node /path/to/reset-demo-passwords.cjs
 */
const path = require('node:path');
const { createRequire } = require('node:module');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:/var/lib/teahour/teahour.db';

if (process.env.NODE_ENV === 'production' && process.env.TEAHOUR_ALLOW_PASSWORD_RESET !== '1') {
  console.error('拒绝执行：NODE_ENV=production。确需重置请显式设置 TEAHOUR_ALLOW_PASSWORD_RESET=1。');
  process.exit(2);
}

const serverDir = process.env.TEAHOUR_SERVER_DIR || '/opt/teahour/app/apps/server';
const serverRequire = createRequire(path.join(serverDir, 'package.json'));
const bcrypt = serverRequire('bcryptjs');
const { PrismaClient } = serverRequire('@prisma/client');

const PASSWORD = '123456';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: { roles: { include: { role: true } }, userStores: true },
    orderBy: { username: 'asc' }
  });

  const phoneUsers = users.filter((user) => /^\d{6,20}$/.test(user.username));
  const skipped = users.filter((user) => !/^\d{6,20}$/.test(user.username));

  const hash = bcrypt.hashSync(PASSWORD, 10);
  let updated = 0;
  for (const user of phoneUsers) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, tokenVersion: { increment: 1 } }
    });
    updated += 1;
  }

  console.log(`已重置 ${updated} 个手机号账号密码（长度 ${PASSWORD.length}）。`);
  if (skipped.length) {
    console.log(`跳过非手机号账号 ${skipped.length} 个：${skipped.map((u) => u.username).join(', ')}`);
  }
  console.log('');
  console.log('账号清单：');
  for (const user of phoneUsers) {
    const roles = user.roles.map((link) => {
      let perms = [];
      try {
        perms = JSON.parse(link.role.permsJson || '[]');
      } catch {
        perms = [];
      }
      const admin = perms.includes('*') || link.role.id === 'r-super';
      return `${link.role.name}${admin ? '（管理员）' : ''}`;
    });
    const scope = user.allStores
      ? '全部门店'
      : user.userStores.length
        ? user.userStores.map((row) => row.storeId).join(',')
        : '未分配门店';
    console.log(
      `- ${user.username}  ${user.name}  角色：${roles.join(' / ') || '无'}  范围：${scope}  ${user.active ? '启用' : '停用'}`
    );
  }
}

main()
  .catch((error) => {
    console.error('重置失败：', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
