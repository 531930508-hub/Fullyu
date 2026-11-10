/**
 * 集成测试配置：
 * - 真实连接阿里云 RDS（DATABASE_URL 来自 .env.local，由 setup-env 注入）
 * - Redis / 微信支付 / 通知 均在用例中以 mock 注入
 * - isolatedModules 逐文件转译，跳过跨包类型检查（类型安全由 tsc --noEmit 单独保障）
 */
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
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 60000,
}
