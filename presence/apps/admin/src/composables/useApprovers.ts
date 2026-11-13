import { ref } from 'vue'
import { listAdminOptions } from '@/api/rbac'
import type { AdminOption } from '@/api/rbac'

/**
 * 审批人名册。
 * 审批节点里存的是登录名（手机号），展示时要翻成「组织·姓名」。
 *
 * 缓存策略（这里的坑踩过一次：新加的同事在审批中心选不到）：
 * - 名册在模块级缓存，多个页面共用，避免各自重复拉；
 * - 但缓存必须有 TTL，且「系统用户/权限管理」里改完人要先失效再进审批中心，
 *   否则要在浏览器里整页刷新才会出现新人。见 invalidateApprovers()。
 */
const CACHE_TTL = 30_000
const options = ref<AdminOption[]>([])
let loadedAt = 0
let loading: Promise<AdminOption[]> | null = null

export function useApprovers() {
  async function load(force = false) {
    const fresh = options.value.length > 0 && Date.now() - loadedAt < CACHE_TTL
    if (!force && fresh) return options.value
    if (loading && !force) return loading
    loading = listAdminOptions()
      .then((list) => {
        options.value = Array.isArray(list) ? list : []
        loadedAt = Date.now()
        return options.value
      })
      .finally(() => {
        loading = null
      })
    return loading
  }

  /** 名册没加载到或人已离职时原样输出手机号，不隐藏信息 */
  function approverLabel(value?: string | null): string {
    if (!value) return '-'
    return options.value.find((a) => a.value === value)?.label || value
  }

  function approverLabels(values?: string[] | null): string {
    if (!values?.length) return '未指定'
    return values.map((v) => approverLabel(v)).join('、')
  }

  /** 搜索：姓名、组织、手机号都能命中（下拉里只显示「组织·姓名」，但用手机号找人的场景更多） */
  function filterApprover(input: string, option: any): boolean {
    const q = String(input ?? '').trim().toLowerCase()
    if (!q) return true
    const o = option?.data ?? option ?? {}
    return [o.label, o.name, o.username, o.orgName].some((s) =>
      String(s ?? '').toLowerCase().includes(q),
    )
  }

  return { approverOptions: options, load, approverLabel, approverLabels, filterApprover }
}

/**
 * 人员增删改后调用：让名册立即失效。
 * 供「系统用户」「权限管理」等会改动 admin_users 的页面使用，
 * 这样切到审批中心时不会还拿着旧名单。
 */
export function invalidateApprovers() {
  loadedAt = 0
}

/** 名册是否已失效（需要重新拉） */
export function isApproversStale() {
  return !options.value.length || Date.now() - loadedAt >= CACHE_TTL
}