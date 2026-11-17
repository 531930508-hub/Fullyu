/**
 * 集成测试配置：
 * - 库地址由 test/setup-env.ts 注入，**必须是测试库**（库名含 _test）：TEST_DATABASE_URL
 *   优先，其次 .env.local；setupFiles 阶段会拦下非测试库，避免 `npx jest` 打到生产 RDS。
 * - Redis / 微信支付 / 通知 均在用例中以 mock 注入
 * - isolatedModules 逐文件转译，跳过跨包类型检查（类型安全由 tsc --noEmit 单独保障）
 */
const path = require('path')

// pnpm 下 @prisma/client 只存在于 .pnpm 软链里，jest-resolve 跟不进去，
// 现解析真实路径再交给 moduleNameMapper（否则 42 个套件只有纯逻辑的能跑）。
const prismaClientEntry = require.resolve('@prisma/client', { paths: [__dirname] })
const prismaClientDir = path.dirname(prismaClientEntry)

module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/test/**/*.spec.ts', '<rootDir>/test/**/*-spec.ts'],
  transform: {
    '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^@fullyu/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    // ali-oss 发布包混有未编译的 .ts，Jest 不转译 node_modules，必须替身
    '^ali-oss$': '<rootDir>/test/mocks/ali-oss.ts',
    '^@prisma/client$': prismaClientEntry,
    '^@prisma/client/(.*)$': path.join(prismaClientDir, '$1'),
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 60000,
}
