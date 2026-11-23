/**
 * getPhoneNumber 事件解析与失败归一。
 *
 * 微信把「用户主动取消」和「手机号快速验证不可用」都从同一个 getphonenumber 回调返回：
 * 隐私保护指引未声明手机号、能力未开通、主体未认证、额度不足时，detail 里既没有 code，
 * 也只有一句英文 errMsg。页面若把它当成「用户取消」，顾客会对着同一个按钮反复点，
 * 门店与研发也拿不到任何线索，所以这里把原因分档，并保留原文供日志与现场排查。
 */
export type PhoneAuthReason = 'cancelled' | 'privacy' | 'permission' | 'legacy' | 'unknown'

export interface PhoneAuthEvent {
  /** 手机号快速验证返回的动态令牌；服务端 getuserphonenumber 换号必须用它 */
  code: string
  /** 成功为 null */
  reason: PhoneAuthReason | null
  /** 微信原始 errMsg，写日志用 */
  raw: string
  /** 新版基础库会带 errno，方便对照开放平台错误码 */
  errno: number | null
}

export interface PhoneAuthMessage {
  zh: string
  en: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function readPhoneAuthEvent(event: any): PhoneAuthEvent {
  const detail = (event && (event.detail || event)) || {}
  const raw = String(detail.errMsg || '')
  const errno = typeof detail.errno === 'number' ? detail.errno : null
  const code = typeof detail.code === 'string' ? detail.code : ''
  if (code) return { code, reason: null, raw, errno }

  // 基础库 < 2.21.2 只有 encryptedData/iv，errMsg 仍是 ok：这不是取消，是微信版本太旧。
  if (raw.indexOf(':ok') !== -1) return { code: '', reason: 'legacy', raw, errno }
  if (/deny|cancel|取消/i.test(raw)) return { code: '', reason: 'cancelled', raw, errno }
  if (/api scope is not declared|privacy agreement|privacy/i.test(raw)) return { code: '', reason: 'privacy', raw, errno }
  if (/no permission|not authorized|access denied|permission|未开通|未认证|1400001|banned/i.test(raw)) {
    return { code: '', reason: 'permission', raw, errno }
  }
  return { code: '', reason: 'unknown', raw, errno }
}

/** 失败原因 → 顾客能看懂、门店能照着办的文案；未知档附上微信原文便于定责 */
export function phoneAuthMessage(event: { reason: PhoneAuthReason | null; raw?: string }): PhoneAuthMessage {
  switch (event.reason) {
    case 'cancelled':
      return { zh: '已取消登录', en: 'Login cancelled' }
    case 'privacy':
      return {
        zh: '登录前需要先同意小程序的隐私授权，请再点一次；仍失败请联系门店伙伴',
        en: 'Please accept the mini program privacy authorisation and retry. Contact a store partner if it still fails.',
      }
    case 'permission':
      return {
        zh: '当前小程序还未开通手机号快速验证，暂不能一键登录，请联系门店伙伴',
        en: 'Phone number verification is not enabled for this mini program yet. Please contact a store partner.',
      }
    case 'legacy':
      return { zh: '微信版本过低，请升级微信后重试', en: 'Please update WeChat and try again.' }
    default:
      return {
        zh: `手机号授权失败，请重试（微信返回：${event.raw || '未知'}）`,
        en: `Phone authorisation failed. Please try again. (WeChat: ${event.raw || 'unknown'})`,
      }
  }
}