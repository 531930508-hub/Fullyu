import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getMe, type TrainerMe } from '@/api/trainer-portal'
import {
  clearTrainerToken,
  getTrainerToken,
  PORTAL_LOGIN_PATH,
  setTrainerToken,
} from '@/utils/trainer-request'

/**
 * 导师门户会话：令牌与学员会话完全隔离。
 * me 缓存放在内存 + 本地，首页/资料页复用同一份，避免每次 onShow 都打接口。
 */
export const useTrainerPortalStore = defineStore('trainerPortal', () => {
  const me = ref<TrainerMe | null>(null)
  const loading = ref(false)
  const loggedIn = computed(() => !!getTrainerToken())

  function restore() {
    if (!me.value) {
      const cached = uni.getStorageSync('trainer_me')
      if (cached && cached.id) me.value = cached as TrainerMe
    }
  }

  function setSession(token: string) {
    setTrainerToken(token)
    me.value = null
    uni.removeStorageSync('trainer_me')
  }

  async function loadMe(force = false) {
    restore()
    if (me.value && !force) return me.value
    loading.value = true
    try {
      const data = await getMe()
      me.value = data
      uni.setStorageSync('trainer_me', data)
      return data
    } finally {
      loading.value = false
    }
  }

  function patchMe(patch: Partial<TrainerMe>) {
    if (!me.value) return
    me.value = { ...me.value, ...patch }
    uni.setStorageSync('trainer_me', me.value)
  }

  function logout() {
    clearTrainerToken()
    me.value = null
    uni.reLaunch({ url: PORTAL_LOGIN_PATH })
  }

  return { me, loading, loggedIn, setSession, loadMe, patchMe, logout }
})