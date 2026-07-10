/**
 * Full愈 小程序请求封装
 * 基于 uni.request，对接后端 NestJS（全局前缀 api/v1）
 * - 注入 Bearer token
 * - 解包统一响应结构 { code, message, data }
 * - 统一错误提示，401 清除登录态并跳转登录
 */

// 后端基础地址：mp-weixin 需完整域名并在小程序后台配置合法域名；H5 可走相对路径
// 生产环境请替换为正式域名，例如 https://api.yourdomain.com/api/v1
let baseUrl = 'https://api.yourdomain.com/api/v1'
// #ifdef H5
baseUrl = '/api/v1'
// #endif
export const BASE_URL = baseUrl

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
  uni.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
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
          goLogin()
          reject(new Error('未授权'))
          return
        }
        if (status === 403) {
          if (!silent) uni.showToast({ title: '没有权限执行该操作', icon: 'none' })
          reject(new Error('无权限'))
          return
        }
        if (status < 200 || status >= 300) {
          const msg = (body && body.message) || `请求失败(${status})`
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
        const msg = body.message || '请求失败'
        if (!silent) uni.showToast({ title: msg, icon: 'none' })
        reject(new Error(msg))
      },
      fail: (err) => {
        if (!silent) uni.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
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
            uni.showToast({ title: body.message || '上传失败', icon: 'none' })
            reject(new Error(body.message || '上传失败'))
          }
        } catch (e) {
          reject(e)
        }
      },
      fail: (err) => {
        uni.showToast({ title: '上传失败', icon: 'none' })
        reject(err)
      },
    })
  })
}

/** 兼容旧代码引用的 api 对象 */
export const api = { get, post, put, del }
