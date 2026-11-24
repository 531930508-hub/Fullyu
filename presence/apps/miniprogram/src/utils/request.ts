/**
 * Full愈 小程序请求封装
 * 基于 uni.request，对接后端 NestJS（全局前缀 api/v1）
 * - 注入 Bearer token
 * - 解包统一响应结构 { code, message, data }
 * - 统一错误提示，401 清除登录态并跳转登录
 */

// 后端基础地址：mp-weixin 需完整域名并在小程序后台配置合法域名；H5 可走相对路径
// 正式域名以 docs/deploy/domains.tsv 为准：在场 = presence.fullyu.cn（不是"去掉 test- 前缀"）。
// 小程序后台（appid wxa7572dea26f5f4e4）两个域名都必须加进 request / uploadFile 合法域名：
//   presence.fullyu.cn（生产）+ test-presence.fullyu.cn（测试）——域名白名单不分版本，一份配置对所有版本生效。
//
// 环境判定（运行时，不是编译期）：同一份代码包按微信用途自动选后端
//   release（正式版 / 提审中的版本）  → 生产 presence.fullyu.cn
//   trial（体验版） / develop（开发者工具·预览）→ 测试 test-presence.fullyu.cn
// 判定依据 wx.getAccountInfoSync().miniProgram.envVersion。
// ⚠️ 正式版永远走生产：release 判定放在 VITE_API_BASE 注入之前，任何构建期注入都改不了它。
// 2026-11-24 事故：QA 用 build:mp-weixin:test 打的包被发布成正式版，线上全部读测试库。
// 因此 VITE_API_BASE 只对 trial / develop / H5 生效；发布包必须用 pnpm build:mp-weixin，
// 构建后 scripts/verify-mp-release.mjs 会再校验一次，测试包无法通过。
const PROD_API_BASE = 'https://presence.fullyu.cn/api/v1'
const TEST_API_BASE = 'https://test-presence.fullyu.cn/api/v1'

/** 微信运行环境：release | trial | develop；取不到时按 develop（测试）处理，避免误写生产数据 */
export const ENV_VERSION: string = (() => {
  try {
    // #ifdef MP
    return (uni.getAccountInfoSync() as any)?.miniProgram?.envVersion || 'develop'
    // #endif
  } catch (e) {
    /* 忽略，走下面的兜底 */
  }
  return 'develop'
})()

function resolveBaseUrl(): string {
  // #ifdef MP
  // 正式版（含提审版本）锁定生产：先于注入判断，测试包被误发布也不会把线上数据打回测试库
  if (ENV_VERSION === 'release') return PROD_API_BASE
  // #endif

  const injected = ((import.meta as any).env?.VITE_API_BASE as string | undefined) || ''
  if (injected) return injected

  // #ifdef H5
  // H5 同源，由 nginx 反代 /api
  return '/api/v1'
  // #endif

  // #ifndef H5
  // 到这里只剩体验版 / 开发者工具：release 已在函数开头返回生产
  return TEST_API_BASE
  // #endif
}

export const BASE_URL = resolveBaseUrl()
console.info(`[env] envVersion=${ENV_VERSION} api=${BASE_URL}`)

/** 请求层通用提示：直接读本地语言，避免与 store / locale 形成循环依赖 */
function uiText(zh: string, en: string): string {
  return uni.getStorageSync('language') === 'en' ? en : zh
}

/** 后端统一响应结构 */
export interface ApiEnvelope<T = any> {
  code: number
  message: string
  data: T
}

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: any
  /** 是否静默（不弹出错误 toast） */
  silent?: boolean
  /** 是否需要登录态（默认 true），未登录直接 reject */
  auth?: boolean
  header?: Record<string, string>
}

/** 跳转登录（去重） */
let redirecting = false
function goLogin() {
  uni.removeStorageSync('token')
  uni.removeStorageSync('userInfo')
  if (redirecting) return
  redirecting = true
  uni.showToast({ title: uiText('登录已过期，请重新登录', 'Session expired. Please log in again.'), icon: 'none' })
  setTimeout(() => {
    redirecting = false
  }, 1500)
}

/** 核心请求方法：返回解包后的 data */
export function request<T = any>(options: RequestOptions): Promise<T> {
  const { url, method = 'GET', data, silent = false, header = {} } = options
  const token = uni.getStorageSync('token')

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...header,
      },
      success: (res) => {
        const status = res.statusCode
        const body = res.data as ApiEnvelope<T>

        // HTTP 层错误
        if (status === 401) {
          // 静默请求（未登录预加载等）不打扰用户，仅清理本地登录态
          if (silent) {
            uni.removeStorageSync('token')
            uni.removeStorageSync('userInfo')
          } else {
            goLogin()
          }
          reject(new Error('未授权'))
          return
        }
        if (status === 403) {
          if (!silent) uni.showToast({ title: uiText('没有权限执行该操作', 'You do not have permission to do that.'), icon: 'none' })
          reject(new Error(uiText('无权限', 'No permission')))
          return
        }
        if (status < 200 || status >= 300) {
          const msg = (body && body.message) || uiText(`请求失败(${status})`, `Request failed (${status})`)
          if (!silent) uni.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
          return
        }

        // 非标准结构直接返回
        if (body == null || typeof body !== 'object' || !('code' in body)) {
          resolve(body as unknown as T)
          return
        }

        // 业务成功
        if (body.code === 0) {
          resolve(body.data)
          return
        }

        // 业务错误
        const msg = body.message || uiText('请求失败', 'Request failed')
        if (!silent) uni.showToast({ title: msg, icon: 'none' })
        reject(new Error(msg))
      },
      fail: (err) => {
        if (!silent) uni.showToast({ title: uiText('网络异常，请稍后重试', 'Network error. Please try again.'), icon: 'none' })
        reject(err)
      },
    })
  })
}

export function get<T = any>(url: string, data?: any, options?: Partial<RequestOptions>): Promise<T> {
  return request<T>({ url, method: 'GET', data, ...options })
}

export function post<T = any>(url: string, data?: any, options?: Partial<RequestOptions>): Promise<T> {
  return request<T>({ url, method: 'POST', data, ...options })
}

export function put<T = any>(url: string, data?: any, options?: Partial<RequestOptions>): Promise<T> {
  return request<T>({ url, method: 'PUT', data, ...options })
}

export function del<T = any>(url: string, data?: any, options?: Partial<RequestOptions>): Promise<T> {
  return request<T>({ url, method: 'DELETE', data, ...options })
}

/** 文件上传（OSS 直传或后端代传）：返回解包后的 data */
export function uploadFile<T = any>(url: string, filePath: string, name = 'file', formData?: Record<string, any>): Promise<T> {
  const token = uni.getStorageSync('token')
  return new Promise<T>((resolve, reject) => {
    uni.uploadFile({
      url: `${BASE_URL}${url}`,
      filePath,
      name,
      formData,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        try {
          const body = JSON.parse(res.data) as ApiEnvelope<T>
          if (body.code === 0) {
            resolve(body.data)
          } else {
            uni.showToast({ title: body.message || uiText('上传失败', 'Upload failed'), icon: 'none' })
            reject(new Error(body.message || uiText('上传失败', 'Upload failed')))
          }
        } catch (e) {
          reject(e)
        }
      },
      fail: (err) => {
        uni.showToast({ title: uiText('上传失败', 'Upload failed'), icon: 'none' })
        reject(err)
      },
    })
  })
}

/** 兼容旧代码引用的 api 对象 */
export const api = { get, post, put, del }
