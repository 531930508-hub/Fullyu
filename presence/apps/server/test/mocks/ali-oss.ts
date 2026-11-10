/**
 * 测试用 ali-oss 替身。
 *
 * ali-oss 6.x 的发布包里混有未编译的 .ts 源文件（如
 * lib/common/utils/lowercaseKeyHeader.ts），而 Jest 默认不转译
 * node_modules，于是 `import OSS from 'ali-oss'` 直接抛
 * SyntaxError: Cannot use import statement outside a module，
 * 让所有间接引用 StorageService 的用例整体加载失败。
 *
 * 集成测试不访问真实 OSS（StorageService 的 client 是懒加载，
 * 未配置 OSS_BUCKET 时根本不会实例化），这里只需提供同形状的
 * 最小替身，保证模块可被导入。
 */
export default class AliOssStub {
  constructor(public readonly options: Record<string, unknown> = {}) {}

  async put(key: string) {
    return { name: key, url: `https://oss-stub.invalid/${key}` }
  }

  signatureUrl(key: string) {
    return `https://oss-stub.invalid/${key}`
  }

  async delete(key: string) {
    return { name: key, res: { status: 204 } }
  }

  async head(key: string) {
    return { name: key, res: { status: 200 } }
  }
}
