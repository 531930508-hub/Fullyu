/**
 * 管理员权限状态
 *
 * 权威源是后端 /auth/admin/profile。localStorage 只做首屏闪烁的兜底缓存，
 * 任何鉴权判定都以 store 里的 permissions 为准；真正的拦截仍在后端 Guard。
 */
import { defineStore } from 'pinia'
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  type DataScope,
} from '@fullyu/shared'
import { adminLogin, adminProfile, type AdminOrgInfo } from '@/api/auth'

const TOKEN_KEY = 'admin_token'
const NAME_KEY = 'admin_name'
const PERM_KEY = 'admin_permissions'
const PROFILE_KEY = 'admin_profile'

interface CachedProfile {
  id: string
  username: string
  name: string
  permissions: string[]
  roles: string[]
  roleLabels: string[]
  dataScope: DataScope
  org: AdminOrgInfo | null
  visibleOrgIds: string[] | null
}

function readCache(): CachedProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as CachedProfile) : null
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const cached = readCache()
    return {
      token: localStorage.getItem(TOKEN_KEY) || '',
      id: cached?.id || '',
      username: cached?.username || '',
      name: cached?.name || localStorage.getItem(NAME_KEY) || '',
      permissions: cached?.permissions || [],
      roles: cached?.roles || [],
      roleLabels: cached?.roleLabels || [],
      dataScope: (cached?.dataScope || 'SELF') as DataScope,
      org: cached?.org || null,
      visibleOrgIds: cached?.visibleOrgIds ?? null,
      /** profile 是否已从后端拉取过，路由守卫用它决定是否需要等待 */
      loaded: false,
      loading: false,
    }
  },

  getters: {
    isLoggedIn: (state) => Boolean(state.token),
    /** 超级管理员：拥有通配权限 */
    isSuper: (state) => state.permissions.includes('*'),
    /** 组织归属展示名 */
    orgLabel: (state) => state.org?.shortName || '未绑定组织',
  },

  actions: {
    /** 单权限判定，支持 '*' 与 'scm:*' 通配 */
    hasPerm(code?: string | null): boolean {
      if (!code) return true
      return hasPermission(this.permissions, code)
    },

    /** 任一命中 */
    hasAny(codes: string[]): boolean {
      if (!codes.length) return true
      return hasAnyPermission(this.permissions, codes)
    },

    /** 全部命中 */
    hasAll(codes: string[]): boolean {
      if (!codes.length) return true
      return hasAllPermissions(this.permissions, codes)
    },

    async login(username: string, password: string) {
      const data = await adminLogin(username, password)
      this.token = data.token
      localStorage.setItem(TOKEN_KEY, data.token)
      this.applyProfile({
        id: data.admin.id,
        username: data.admin.username,
        name: data.admin.name,
        permissions: data.admin.permissions,
        roles: data.admin.roles || [],
        roleLabels: [],
        dataScope: data.admin.dataScope,
        org: data.admin.org,
        visibleOrgIds: null,
      })
      return data
    },

    /** 拉取权限画像；失败时不清空缓存，交由 401 拦截器处理 */
    async fetchProfile() {
      if (!this.token) return
      this.loading = true
      try {
        const p = await adminProfile()
        this.applyProfile({
          id: p.id,
          username: p.username,
          name: p.name,
          permissions: p.permissions,
          roles: p.roles,
          roleLabels: p.roleLabels,
          dataScope: p.dataScope,
          org: p.org,
          visibleOrgIds: p.visibleOrgIds,
        })
        this.loaded = true
        return p
      } finally {
        this.loading = false
      }
    },

    /** 确保权限已就绪，路由守卫入口调用 */
    async ensureProfile() {
      if (this.loaded || !this.token) return
      await this.fetchProfile()
    },

    applyProfile(p: CachedProfile) {
      this.id = p.id
      this.username = p.username
      this.name = p.name
      this.permissions = p.permissions
      this.roles = p.roles
      this.roleLabels = p.roleLabels
      this.dataScope = p.dataScope
      this.org = p.org
      this.visibleOrgIds = p.visibleOrgIds
      localStorage.setItem(NAME_KEY, p.name)
      localStorage.setItem(PERM_KEY, JSON.stringify(p.permissions))
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
    },

    logout() {
      this.token = ''
      this.id = ''
      this.username = ''
      this.name = ''
      this.permissions = []
      this.roles = []
      this.roleLabels = []
      this.dataScope = 'SELF'
      this.org = null
      this.visibleOrgIds = null
      this.loaded = false
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(NAME_KEY)
      localStorage.removeItem(PERM_KEY)
      localStorage.removeItem(PROFILE_KEY)
    },
  },
})
