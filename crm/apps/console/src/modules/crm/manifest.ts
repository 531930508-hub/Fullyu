/**
 * CRM 模块（会员、积分账本）。
 *
 * 本批次只迁概览 / 会员 / 积分流水三个只读页；其余页面仍在旧零构建后台，
 * 迁完一页下线一页，避免一次性重写 16 个页面。
 */
import { CRM_PERMISSIONS } from '@fullyu/crm-shared'
import type { ModuleManifest } from '@/shell/types'

const manifest: ModuleManifest = {
  id: 'crm',
  name: '会员与积分',
  order: 10,
  permissions: [...CRM_PERMISSIONS],
  routes: [
    {
      path: 'overview',
      name: 'CrmOverview',
      component: () => import('./views/OverviewView.vue'),
      meta: { title: '概览', group: '工作台' }
    },
    {
      path: 'members',
      name: 'CrmMembers',
      component: () => import('./views/MembersView.vue'),
      meta: { title: '会员', group: '会员与积分', perm: 'crm:member:view' }
    },
    {
      path: 'ledger',
      name: 'CrmLedger',
      component: () => import('./views/LedgerView.vue'),
      meta: { title: '积分流水', group: '会员与积分', perm: 'crm:member:view' }
    }
  ]
}

export default manifest
