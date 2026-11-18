/**
 * 请求层：CRM 服务端的契约是「裸 JSON + 错误体 {message, error}」，
 * 不是在场后台那套 {code, message, data} 信封，不要混用。
 */
import axios, { type AxiosResponse } from 'axios'
import { message } from 'ant-design-vue'
import { readSession, useSessionStore } from './session'

export class ApiError extends Error {
  status: number
  code?: string

  constructor(text: string, status = 0, code?: string) {
    super(text)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const http = axios.create({
  baseURL: '/api',
  timeout: 20000,
  validateStatus: () => true
})

let redirecting = false

function toLogin() {
  // 清 store 而不是只清 localStorage：路由守卫读的是 store，只清存储会被弹回业务页。
  useSessionStore().logout()
  if (redirecting) return
  redirecting = true
  if (!window.location.hash.startsWith('#/login')) {
    window.location.hash = '#/login'
  }
  setTimeout(() => {
    redirecting = false
  }, 1000)
}

export interface RequestOptions {
  params?: object
  body?: unknown
}

export async function request<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const session = readSession()
  let response: AxiosResponse
  try {
    response = await http.request({
      method,
      url: path,
      params: options.params,
      data: options.body,
      headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {}
    })
  } catch {
    throw new ApiError('无法连接服务，请确认 CRM 服务已启动', 0, 'NETWORK')
  }

  if (response.status >= 200 && response.status < 300) {
    return response.data as T
  }

  const body = response.data as { message?: string; error?: string } | null
  // 登录接口的 401 是「账号密码不对」，不能当成登录过期去清态跳转。
  const isLoginCall = path === '/auth/login'
  if (response.status === 401 && !isLoginCall) {
    toLogin()
    message.warning('登录已过期，请重新登录')
    throw new ApiError('登录已过期', 401, 'UNAUTHORIZED')
  }
  throw new ApiError(body?.message || response.statusText || '请求失败', response.status, body?.error)
}

export const api = {
  get: <T>(path: string, params?: object) => request<T>('GET', path, { params }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body })
}
