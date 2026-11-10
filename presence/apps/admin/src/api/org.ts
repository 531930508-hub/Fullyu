import { get, post, put, del } from './request'

export type OrgType = 'GROUP' | 'DEPT' | 'SUBSIDIARY' | 'STORE'
export type OrgStatus = 'ACTIVE' | 'DISABLED'

/** 组织类型展示元数据，组织架构页与树节点共用一份 */
export const orgTypeMap: Record<OrgType, { text: string; color: string }> = {
  GROUP: { text: '集团总部', color: 'purple' },
  DEPT: { text: '总部部门', color: 'blue' },
  SUBSIDIARY: { text: '分公司', color: 'geekblue' },
  STORE: { text: '门店', color: 'green' },
}

export interface OrgNode {
  id: string
  name: string
  shortName: string
  code: string
  type: OrgType
  parentId: string | null
  leader: string
  phone: string
  accounting: boolean
  hasWarehouse: boolean
  canPurchase: boolean
  status: OrgStatus
  sortOrder: number
  createdAt: string
  /** 仅 org:rate 权限可见 */
  mgmtFeeRate?: number
  trainFeeRate?: number
  /** 月保底租金（元） */
  baseRent: number
  /** 提成租金比例（0~1） */
  rentRate: number
  /** 月物业费（元） */
  propertyFee: number
  adminCount?: number
}

export interface OrgTreeNode extends OrgNode {
  children: OrgTreeNode[]
}

export interface OrgOption {
  id: string
  name: string
  shortName: string
  code: string
  type: OrgType
  parentId: string | null
}

/** 组织列表（扁平，已按数据范围过滤） */
export function listOrgs(params?: { keyword?: string; type?: OrgType; status?: OrgStatus }) {
  return get<OrgNode[]>('/organizations', params)
}

/** 组织树 */
export function getOrgTree(params?: { status?: OrgStatus }) {
  return get<OrgTreeNode[]>('/organizations/tree', params)
}

/** 组织下拉选项 */
export function listOrgOptions(params?: { warehouse?: 1; purchase?: 1; accounting?: 1 }) {
  return get<OrgOption[]>('/organizations/options', params)
}

export function getOrg(id: string) {
  return get<OrgNode>(`/organizations/${id}`)
}

export function createOrg(body: Partial<OrgNode>) {
  return post<OrgNode>('/organizations', body)
}

export function updateOrg(id: string, body: Partial<OrgNode>) {
  return put<OrgNode>(`/organizations/${id}`, body)
}

export function removeOrg(id: string) {
  return del(`/organizations/${id}`)
}
