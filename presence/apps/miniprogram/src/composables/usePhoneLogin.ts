/**
 * 手机号登录的共用逻辑：登录页（pages/login）与「我的」登录弹层都用这一份，行为不能各写一套。
 *
 * 协议闸门（现场反馈「点登录/取消后没反应」的修复）：
 * 旧做法是未勾选时把按钮换成普通按钮、点按只在底部弹层里标一行红字。底部弹层一滚动、
 * 或者顾客根本没注意到那行小字，主观上就是「点了没反应」，随后取消授权也停在原地。
 * 现在的顺序是：
 *   1. 点「手机号一键登录」→ 未勾选协议先弹系统确认框（不会被弹层遮住）；
 *   2. 点「同意并登录」→ 记为已同意，直接继续登录，不需要再点第二次；
 *   3. 点「取消」→ 明确提示「需同意用户协议后才能登录」，而不是静默留在原地。
 * 协议默认不勾选（合规要求），每次登录成功后重置，下一次登录重新征求同意。
 */
import { ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { tr } from '@/locale'
import { readPhoneAuthEvent, phoneAuthMessage } from '@/utils/phone-auth'

export function usePhoneLogin() {
  const userStore = useUserStore()
  const agreed = ref(false)
  const loggingIn = ref(false)
  const loginError = ref('')
  const loginPhone = ref('')

  /** 打开登录入口时清掉上一次的报错与残留手机号 */
  function resetLoginState() {
    loginError.value = ''
    loginPhone.value = ''
  }

  function toggleAgreement() {
    agreed.value = !agreed.value
    if (agreed.value) loginError.value = ''
  }

  /** 协议闸门：返回 true 表示已同意协议、可以继续登录 */
  async function ensureConsent(): Promise<boolean> {
    if (agreed.value) return true
    const confirmed = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: tr('同意用户协议', 'Terms & privacy'),
        content: tr(
          '登录前请先阅读并同意《用户协议》与《隐私政策》。',
          'Please read and agree to the Terms of Service and Privacy Policy before signing in.',
        ),
        confirmText: tr('同意并登录', 'Agree & sign in'),
        cancelText: tr('取消', 'Cancel'),
        success: res => resolve(!!(res && res.confirm)),
        fail: () => resolve(false),
      })
    })
    if (!confirmed) {
      // 顾客点了取消也要有回音：告诉他差在哪一步，而不是让按钮看起来失灵
      uni.showToast({ title: tr('需同意用户协议后才能登录', 'Agree to the terms to sign in'), icon: 'none' })
      return false
    }
    agreed.value = true
    loginError.value = ''
    return true
  }

  /** 真正的登录请求：成功后重置协议勾选，失败原因留在原位供重试 */
  async function runLogin(action: () => Promise<unknown>): Promise<boolean> {
    loggingIn.value = true
    loginError.value = ''
    try {
      await action()
      agreed.value = false
      loginPhone.value = ''
      uni.showToast({ title: tr('登录成功', 'Logged in'), icon: 'success' })
      return true
    } catch (error: any) {
      // 服务端已按微信 errcode 归类（微信登录失败 / 获取手机号失败 / 会员身份冲突），
      // 这里再糊成一句「登录未完成」会把唯一可执行的线索也丢掉。
      loginError.value = (error && error.message) || tr('登录未完成，请重试', 'Login was not completed. Please retry.')
      return false
    } finally {
      loggingIn.value = false
    }
  }

  /** 微信一键登录：open-type="getPhoneNumber" 的回调，先过协议闸门再换号 */
  async function handlePhoneAuth(event: any): Promise<boolean> {
    if (loggingIn.value) return false
    if (!(await ensureConsent())) return false
    const auth = readPhoneAuthEvent(event)
    if (!auth.code) {
      // 微信把「用户取消」和「手机号快速验证不可用（隐私指引未声明手机号 / 未开通 / 未认证 / 额度不足）」
      // 都从这个回调返回，且都没有 code。所有情况都报「已取消登录」= 当场断案成用户的问题，
      // 顾客只会反复点同一个按钮，门店也拿不到线索；这里必须分档，并把微信原文写进日志。
      console.warn('[login] getPhoneNumber 未返回 code', auth.reason, auth.errno ?? '', auth.raw)
      const message = phoneAuthMessage(auth)
      if (auth.reason === 'cancelled') {
        uni.showToast({ title: tr(message.zh, message.en), icon: 'none' })
        return false
      }
      // 配置类失败停在原地给原因，勾选与按钮都保留，修好后可直接重试
      loginError.value = tr(message.zh, message.en)
      return false
    }
    return runLogin(() => userStore.login(auth.code))
  }

  /** H5 预览环境的手机号登录（服务端开关控制），同样先过协议闸门 */
  async function handleDevLogin(): Promise<boolean> {
    if (loggingIn.value) return false
    if (!(await ensureConsent())) return false
    const phone = loginPhone.value.trim()
    if (!/^1\d{10}$/.test(phone)) {
      loginError.value = tr('请输入正确的11位手机号', 'Enter a valid 11-digit phone number')
      return false
    }
    return runLogin(() => userStore.devLogin(phone))
  }

  return {
    agreed,
    loggingIn,
    loginError,
    loginPhone,
    resetLoginState,
    toggleAgreement,
    ensureConsent,
    handlePhoneAuth,
    handleDevLogin,
  }
}