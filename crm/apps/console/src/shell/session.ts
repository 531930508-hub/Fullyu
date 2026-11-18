/**
 * 登录态存储。
 *
 * 存储键与旧零构建后台完全一致（fullyu.crm.session），同源同键，
 * 换壳后已登录的员工不会被强制重登。
 */
import { defineStore } from 'pinia'

export const SESSION_KEY = 'fullyu.crm.session'

export interface CrmStaff {
  id?: string
  name: string
  username: string
  perms: string[]
}

export interface CrmSession {
  token: string
  staff: CrmStaff
}

export function readSession(): CrmSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as CrmSession) : null
  } catch {
    return null
  }
}

export function writeSession(next: CrmSession | null): void {
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* 隐私模式下写入失败不影响本次会话 */
  }
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    session: readSession() as CrmSession | null
  }),
  getters: {
    token: (state): string => state.session?.token || '',
    staff: (state): CrmStaff | null => state.session?.staff || null,
    perms: (state): string[] => state.session?.staff?.perms || [],
    isAuthed: (state): boolean => Boolean(state.session?.token && state.session?.staff)
  },
  actions: {
    set(next: CrmSession | null) {
      this.session = next
      writeSession(next)
    },
    logout() {
      this.set(null)
    },
    /** 权限判定：与旧后台一致，'*' 视为全权限 */
    can(perm: string): boolean {
      const list = this.perms
      return list.includes('*') || list.includes(perm)
    },
    canAny(list: string[]): boolean {
      return (list || []).some((perm) => this.can(perm))
    },
    canAll(list: string[]): boolean {
      return (list || []).every((perm) => this.can(perm))
    }
  }
})
