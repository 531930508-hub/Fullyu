/** 认证相关 API */
import { post } from '@/utils/request'

export interface LoginResult {
  token: string
  user: {
    id: string
    phone: string
    nickname: string
    avatar?: string
    isTrainer: boolean
  }
}

/** 微信手机号一键登录 */
export function wechatPhoneLogin(loginCode: string, phoneCode: string) {
  return post<LoginResult>('/auth/wechat/phone-login', { loginCode, phoneCode }, { auth: false })
}

/** 【仅本地开发】手机号快捷登录（后端 DEV_LOGIN_ENABLED 开启时可用） */
export function devLogin(phone: string) {
  return post<LoginResult>('/auth/dev/login', { phone }, { auth: false })
}
