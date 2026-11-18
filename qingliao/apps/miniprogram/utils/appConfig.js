// API 基础路径（运行时选环境，不再依赖编译期注入）
// 小程序：同一份代码包按微信用途自动选后端
//   release（正式版 / 提审中的版本）      → https://cityretreat.fullyu.cn/api
//   trial（体验版） / develop（预览码）  → https://test-cityretreat.fullyu.cn/api
//   判定依据微信 getAccountInfoSync().miniProgram.envVersion，取不到时按测试处理，避免误写生产数据
// H5：与 API 同源，用相对路径 /api 跟随页面部署域名（test-cityretreat / cityretreat 均适用）
// VITE_API_BASE 只在开发构建、以及 H5 显式部署时生效；小程序生产构建一律忽略注入。
const PROD_API_BASE = 'https://cityretreat.fullyu.cn/api'
const TEST_API_BASE = 'https://test-cityretreat.fullyu.cn/api'
const INJECTED_API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE) || ''
const IS_DEV_BUILD = Boolean(import.meta.env && import.meta.env.DEV)

function resolveEnvVersion() {
  // #ifdef MP-WEIXIN
  try {
    // 直接用 wx 原生 API：不依赖当前 uni 运行时是否代理了该方法
    return wx.getAccountInfoSync().miniProgram.envVersion || 'develop'
  } catch (error) {
    return 'develop'
  }
  // #endif
  // #ifndef MP-WEIXIN
  return 'h5'
  // #endif
}

function resolveApiBase() {
  // #ifdef H5
  return (IS_DEV_BUILD && INJECTED_API_BASE) || INJECTED_API_BASE || '/api'
  // #endif
  // #ifdef MP-WEIXIN
  if (IS_DEV_BUILD && INJECTED_API_BASE) return INJECTED_API_BASE
  return ENV_VERSION === 'release' ? PROD_API_BASE : TEST_API_BASE
  // #endif
  return INJECTED_API_BASE || PROD_API_BASE
}

/** 微信运行环境：release | trial | develop；H5 固定为 h5 */
export const ENV_VERSION = resolveEnvVersion()
export const API_BASE_URL = resolveApiBase()
console.info(`[env] envVersion=${ENV_VERSION} api=${API_BASE_URL}`)
