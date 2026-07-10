import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import { message } from 'ant-design-vue'

/** 后端统一响应结构 { code, message, data } */
export interface ApiEnvelope<T = any> {
  code: number
  message: string
  data: T
}

const service: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 20000,
})

/** 请求拦截器：注入 Bearer token */
service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('admin_token')
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

/** 跳转登录（去重，避免重复提示） */
let redirecting = false
function goLogin() {
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin_name')
  localStorage.removeItem('admin_permissions')
  if (redirecting) return
  redirecting = true
  const hash = window.location.hash
  if (!hash.startsWith('#/login')) {
    window.location.hash = '#/login'
  }
  setTimeout(() => {
    redirecting = false
  }, 1000)
}

/** 响应拦截器：解包 envelope，统一错误处理，401 跳登录 */
service.interceptors.response.use(
  (response) => {
    const body = response.data as ApiEnvelope
    // 非标准结构（如文件流）直接返回原始 data
    if (body == null || typeof body !== 'object' || !('code' in body)) {
      return body
    }
    if (body.code === 0) {
      return body.data
    }
    // 业务错误
    message.error(body.message || '请求失败')
    return Promise.reject(new Error(body.message || '请求失败'))
  },
  (error) => {
    const status = error?.response?.status
    if (status === 401) {
      message.error('登录已过期，请重新登录')
      goLogin()
    } else if (status === 403) {
      message.error('没有权限执行该操作')
    } else {
      const msg = error?.response?.data?.message || error.message || '网络错误'
      message.error(msg)
    }
    return Promise.reject(error)
  },
)

/** 泛型请求封装：返回解包后的 data */
export function request<T = any>(config: AxiosRequestConfig): Promise<T> {
  return service.request<any, T>(config)
}

export function get<T = any>(url: string, params?: any): Promise<T> {
  return request<T>({ method: 'GET', url, params })
}

export function post<T = any>(url: string, data?: any): Promise<T> {
  return request<T>({ method: 'POST', url, data })
}

export function put<T = any>(url: string, data?: any): Promise<T> {
  return request<T>({ method: 'PUT', url, data })
}

export function del<T = any>(url: string, params?: any): Promise<T> {
  return request<T>({ method: 'DELETE', url, params })
}

export default service
