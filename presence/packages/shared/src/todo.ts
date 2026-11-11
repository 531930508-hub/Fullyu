/**
 * 统一待办中心共享定义。
 *
 * 后台原先的待办散落在审批中心、订单列表、社群工作台、库存页，
 * 工作台里的「退款待办」又直接跳订单页，用户点进去看不到审批动作。
 * 这里把「需要我处理的事」收敛成一套排序与展示口径：
 * - 审批：当前节点指派给我、我还没表决的审批实例（可直接同意/驳回）
 * - 退款：已提交网关、等待退款结果的订单（运营跟进，不是审批）
 * - 社群：待审核的入群申请
 * - 库存：低于安全库存的仓品
 *
 * 前端只认 TodoSource 与 action，不再按来源自己猜路由。
 */

export type TodoSource = 'APPROVAL' | 'REFUND' | 'COMMUNITY' | 'STOCK'

export const TODO_SOURCE_META: Record<TodoSource, { text: string; color: string }> = {
  APPROVAL: { text: '审批', color: 'blue' },
  REFUND: { text: '退款', color: 'volcano' },
  COMMUNITY: { text: '社群', color: 'green' },
  STOCK: { text: '库存', color: 'gold' },
}

/**
 * 待办的处理方式：
 * - APPROVE：打开审批详情抽屉，可直接同意/驳回
 * - REVIEW：打开审核弹窗（目前用于入群申请）
 * - NAVIGATE：跳转到对应业务页继续处理（退款跟进、库存补货）
 */
export type TodoAction = 'APPROVE' | 'REVIEW' | 'NAVIGATE'

export interface TodoItem {
  id: string
  source: TodoSource
  action: TodoAction
  /** 业务类型标识，如 PURCHASE_ORDER / REFUND / JOIN_REQUEST / STOCK_ALERT */
  bizType: string
  /** 业务类型中文名，直接展示 */
  bizLabel: string
  title: string
  summary: string
  /** 金额（元）；无金额为 null */
  amount: number | null
  requesterName: string
  orgName: string
  /** ISO 时间串 */
  createdAt: string
  /** 是否紧急（审批、退款默认紧急） */
  urgent: boolean
  /** 审批节点文案，如 1/2 总部财务复核；非审批为空串 */
  nodeText: string
  /** 审批实例 id / 订单 id / 入群申请 id / 仓库 id */
  detailId: string
  /** 补充说明，如库存剩余量 */
  hint?: string
  /** NAVIGATE 类待办的兜底跳转地址 */
  link?: string
}

export interface TodoCounts {
  all: number
  approval: number
  refund: number
  community: number
  stock: number
}

export interface TodoListResult {
  counts: TodoCounts
  items: TodoItem[]
  /** 服务端生成时间，前端用于提示数据新鲜度 */
  generatedAt: string
}

/** 审批详情里的通用信息行 */
export interface ApprovalContextRow {
  label: string
  value: string
}

/** 审批详情里的商品/调整明细行 */
export interface ApprovalContextItem {
  name: string
  spec?: string
  unit?: string
  qty?: number
  price?: number
  /** 小计（元） */
  amount?: number
}

/** 退款审批关联的订单快照 */
export interface ApprovalContextOrder {
  id: string
  orderNo: string
  userName: string
  itemName: string
  orderType: string
  status: string
  statusLabel: string
  /** 实付（元） */
  actualPaid: number
  /** 已申请退款金额（元） */
  refundAmount: number | null
  createTime: string
  payTime: string | null
}

/** 审批单的业务上下文，供详情抽屉展示「批的是什么」 */
export interface ApprovalBizContext {
  title: string
  rows: ApprovalContextRow[]
  items: ApprovalContextItem[]
  /** 跳转业务单据列表页 */
  link?: string
  order?: ApprovalContextOrder
}

/** 审批详情接口返回 */
export interface ApprovalDetailResult {
  /** 与 /approvals/instances/:id 同构，避免前端再定义一份 */
  instance: {
    id: string
    bizType: string
    bizId: string
    summary: string
    amount: number
    orgId: string | null
    requester: string
    requesterName: string
    flowId: string | null
    flowName: string
    currentIndex: number
    status: string
    resultNote: string | null
    finishedAt: string | Date | null
    createdAt: string | Date
    nodes: Array<{
      id: string
      name: string
      mode: string
      approvers: string[]
      status: string
      decisions: Array<{
        approver: string
        approverName: string
        action: string
        comment: string
        createdAt: string | Date
      }>
    }>
  }
  context: ApprovalBizContext
  /** 当前登录人是否可在此单上表决 */
  canApprove: boolean
  /** 当前登录人是否可撤销（仅发起人） */
  canCancel: boolean
  /** 不能表决时的原因，便于前端解释 */
  reason: string
}

/** 退款跟进详情 */
export interface RefundDetailResult {
  order: {
    id: string
    orderNo: string
    orderType: string
    userName: string
    userPhone: string
    itemName: string
    status: string
    statusLabel: string
    originalPrice: number
    actualPaid: number
    refundAmount: number | null
    cancelReason: string
    createTime: string
    payTime: string | null
    refundTime: string | null
  }
  /** 是否有正在审批中的强制退款单，避免重复发起 */
  pendingApprovalId: string | null
  link: string
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: '待支付',
  PAID: '已支付',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  REFUNDING: '退款中',
  REFUNDED: '已退款',
}
