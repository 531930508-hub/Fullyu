import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { wxLogin } from '@/utils/wechat'
import { wechatPhoneLogin, devLogin as devLoginApi } from '@/api/auth'

export const useUserStore = defineStore('user', () => {
  const token = ref('')
  const userInfo = ref<{
    id: string
    phone: string
    nickname: string
    avatar?: string
    isTrainer: boolean
  } | null>(null)
  const language = ref<'zh' | 'en'>('zh')
  /**
   * 端内视角（Skool 式双视角）：
   * student = 课程视角（我想上什么课），trainer = 导师视角（经营我的社群）。
   * 只有 isTrainer 的用户才能切到导师视角；非导师强制回落学员视角。
   */
  const viewMode = ref<'student' | 'trainer'>(
    (uni.getStorageSync('viewMode') as 'student' | 'trainer') || 'student',
  )

  const isLoggedIn = computed(() => !!token.value)
  const isTrainer = computed(() => userInfo.value?.isTrainer ?? false)
  /** 当前生效视角：非导师身份永远按学员视角渲染 */
  const activeView = computed<'student' | 'trainer'>(() => (isTrainer.value ? viewMode.value : 'student'))

  function setViewMode(mode: 'student' | 'trainer') {
    viewMode.value = mode
    uni.setStorageSync('viewMode', mode)
  }

  function initFromStorage() {
    const storedToken = uni.getStorageSync('token')
    const storedUser = uni.getStorageSync('userInfo')
    const storedLang = uni.getStorageSync('language')

    if (storedToken) token.value = storedToken
    if (storedUser) userInfo.value = JSON.parse(storedUser)
    if (storedLang) language.value = storedLang
  }

  function setLogin(data: { token: string; user: any }) {
    token.value = data.token
    userInfo.value = data.user
    uni.setStorageSync('token', data.token)
    uni.setStorageSync('userInfo', JSON.stringify(data.user))
  }

  function logout() {
    token.value = ''
    userInfo.value = null
    uni.removeStorageSync('token')
    uni.removeStorageSync('userInfo')
  }

  function switchLanguage() {
    language.value = language.value === 'zh' ? 'en' : 'zh'
    uni.setStorageSync('language', language.value)
  }

  /**
   * 微信一键登录：uni.login 拿 loginCode + getPhoneNumber 拿 phoneCode
   * @param phoneCode 手机号授权按钮回调返回的动态令牌 code
   */
  async function login(phoneCode: string) {
    const loginCode = await wxLogin()
    const res = await wechatPhoneLogin(loginCode, phoneCode)
    setLogin({ token: res.token, user: res.user })
    return res
  }

  /**
   * 【仅本地开发】手机号快捷登录，跳过微信授权（仅 H5 联调用）
   */
  async function devLogin(phone: string) {
    const res = await devLoginApi(phone)
    setLogin({ token: res.token, user: res.user })
    return res
  }

  return {
    token,
    userInfo,
    language,
    viewMode,
    isLoggedIn,
    isTrainer,
    activeView,
    initFromStorage,
    setLogin,
    logout,
    switchLanguage,
    setViewMode,
    login,
    devLogin,
  }
})
