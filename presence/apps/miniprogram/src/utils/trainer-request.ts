/**
 * 导师门户请求封装
 *
 * 与学员请求（utils/request.ts）彻底分开：
 * - 令牌单独存 trainer_token，学员登录/过期互不影响；
 * - 401 不清学员 token，只清导师令牌并回到门户登录页；
 * - 错误提示同样跟随语言设置。
 *
 * 导师门户是「另一套账号」：教务给导师发的手机号 + 密码，不是微信登录。
 */
import { BASE_URL } from './request'

export const TRAINER_TOKEN_KEY = 'trainer_token'
/** 门户登录页路径：401 时统一回到这里 */
export const PORTAL_LOGIN_PATH = '/pages/trainer-portal/login/index'

export function getTrainerToken(): string {
  return uni.getStorageSync(TRAINER_TOKEN_KEY) || ''
}

export function setTrainerToken(token: string) {
  uni.setStorageSync(TRAINER_TOKEN_KEY, token)
}

export function clearTrainerToken() {
  uni.removeStorageSync(TRAINER_TOKEN_KEY)
  uni.removeStorageSync('trainer_me')
}

function uiText(zh: string, en: string): string {
  return uni.getStorageSync('language') === 'en' ? en : zh
}

interface TrainerRequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT'
  data?: any
  silent?: boolean
  /** 默认需要导师令牌；登录/申请等公开接口传 false */
  auth?: boolean
}

interface ApiEnvelope<T = any> {
  code: number
  message: string
  data: T
}

/** 过期回登录页：防止多个并发请求同时跳转 */
let redirecting = false
function backToLogin() {
  clearTrainerToken()
  if (redirecting) return
  redirecting = true
  uni.showToast({ title: uiText('登录已过期，请重新登录', 'Session expired. Please log in again.'), icon: 'none' })
  setTimeout(() => {
    redirecting = false
    uni.reLaunch({ url: PORTAL_LOGIN_PATH })
  }, 600)
}

export function trainerRequest<T = any>(options: TrainerRequestOptions): Promise<T> {
  const { url, method = 'GET', data, silent = false, auth = true } = options
  const token = getTrainerToken()

  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      success: (res) => {
        const status = res.statusCode
        const body = res.data as ApiEnvelope<T>

        if (status === 401) {
          if (auth) backToLogin()
          reject(new Error(uiText('未授权', 'Unauthorized')))
          return
        }
        if (status < 200 || status >= 300) {
          const msg = (body && body.message) || uiText(`请求失败(${status})`, `Request failed (${status})`)
          if (!silent) uni.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
          return
        }
        if (body == null || typeof body !== 'object' || !('code' in body)) {
          resolve(body as unknown as T)
          return
        }
        if (body.code === 0) {
          resolve(body.data)
          return
        }
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

export const trainerGet = <T = any>(url: string, data?: any, options?: Partial<TrainerRequestOptions>) =>
  trainerRequest<T>({ url, method: 'GET', data, ...options })

export const trainerPost = <T = any>(url: string, data?: any, options?: Partial<TrainerRequestOptions>) =>
  trainerRequest<T>({ url, method: 'POST', data, ...options })

export const trainerPut = <T = any>(url: string, data?: any, options?: Partial<TrainerRequestOptions>) =>
  trainerRequest<T>({ url, method: 'PUT', data, ...options })

/**
 * 图片上传：门户图片统一走服务端中转，避免把 OSS 直传签名暴露给前端。
 * dir 只能是 avatar / cover / portfolio，后端会兜底非法值。
 */
export function trainerUploadImage(filePath: string, dir: 'avatar' | 'cover' | 'portfolio') {
  const token = getTrainerToken()
  return new Promise<{ key: string; url: string }>((resolve, reject) => {
    uni.uploadFile({
      url: `${BASE_URL}/trainer-portal/upload`,
      filePath,
      name: 'file',
      formData: { dir },
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        let body: ApiEnvelope<{ key: string; url: string }> | null = null
        try {
          body = JSON.parse(res.data)
        } catch {
          body = null
        }
        if (res.statusCode === 401) {
          backToLogin()
          reject(new Error(uiText('未授权', 'Unauthorized')))
          return
        }
        if (res.statusCode < 200 || res.statusCode >= 300 || !body || body.code !== 0) {
          const msg = body?.message || uiText('图片上传失败', 'Upload failed')
          uni.showToast({ title: msg, icon: 'none' })
          reject(new Error(msg))
          return
        }
        resolve(body.data)
      },
      fail: (err) => {
        uni.showToast({ title: uiText('图片上传失败', 'Upload failed'), icon: 'none' })
        reject(err)
      },
    })
  })
}

/** 选图 + 上传一步到位；用户取消返回 null */
export async function pickAndUploadImage(dir: 'avatar' | 'cover' | 'portfolio') {
  const picked = await new Promise<string | null>((resolve) => {
    uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => resolve((res.tempFilePaths as string[])[0] || null),
      fail: () => resolve(null),
    })
  })
  if (!picked) return null
  uni.showLoading({ title: uiText('上传中', 'Uploading'), mask: true })
  try {
    return await trainerUploadImage(picked, dir)
  } finally {
    uni.hideLoading()
  }
}

/** 无导师令牌时回登录页；页面 onShow/onLoad 统一调用 */
export function ensureTrainerAuth(): boolean {
  if (getTrainerToken()) return true
  uni.reLaunch({ url: PORTAL_LOGIN_PATH })
  return false
}