import { ref } from 'vue'
import { listAdminOptions } from '@/api/rbac'
import type { AdminOption } from '@/api/rbac'

/**
 * 审批人名册。
 * 审批节点里存的是登录名（手机号），展示时要翻成「组织·姓名」，
 * 名册在模块级缓存一份，多个页面（审批中心/采购单/支出台账/库存调整）共用，避免各自重复拉。
 */
const options = ref<AdminOption[]>([])
let loaded = false
let loading: Promise<AdminOption[]> | null = null

export function useApprovers() {
  async function load(force = false) {
    if (loaded && !force) return options.value
    if (loading && !force) return loading
    loading = listAdminOptions()
      .then((list) => {
        options.value = Array.isArray(list) ? list : []
        loaded = true
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

  return { approverOptions: options, load, approverLabel, approverLabels }
}
