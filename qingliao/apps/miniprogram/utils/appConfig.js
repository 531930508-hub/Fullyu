// API 基础路径（编译期选环境）
// 生产构建/正式版：https://cityretreat.fullyu.cn/api
// 开发构建：测试域名（避免本地调试误写生产）
// 测试构建：pnpm build:mp:test（注入 VITE_API_BASE=https://test-cityretreat.fullyu.cn/api）
const injected = (import.meta.env && import.meta.env.VITE_API_BASE) || ''
const fallback = import.meta.env.DEV
  ? 'https://test-cityretreat.fullyu.cn/api'
  : 'https://cityretreat.fullyu.cn/api'
export const API_BASE_URL = injected || fallback