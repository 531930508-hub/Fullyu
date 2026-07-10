import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { wxLogin } from '@/utils/wechat'
import { wechatPhoneLogin } from '@/api/auth'

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

  const isLoggedIn = computed(() => !!token.value)
  const isTrainer = computed(() => userInfo.value?.isTrainer ?? false)

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

  return {
    token,
    userInfo,
    language,
    isLoggedIn,
    isTrainer,
    initFromStorage,
    setLogin,
    logout,
    switchLanguage,
    login,
  }
})
