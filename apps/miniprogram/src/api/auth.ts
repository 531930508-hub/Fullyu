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
