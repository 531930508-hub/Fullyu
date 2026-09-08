<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">审批中心</h2>
    </div>

    <a-tabs v-model:activeKey="tab" @change="onTabChange">
      <!-- ============ 流程配置 ============ -->
      <a-tab-pane v-if="auth.hasPerm('flow:config:view')" key="flow" tab="流程配置">
        <a-card :loading="ruleLoading">
          <div class="biz-bar">
            <a-radio-group v-model:value="activeBiz" button-style="solid">
              <a-radio-button v-for="(v, k) in BIZ_TYPE_META" :key="k" :value="k">
                {{ v.text }}
                <span class="biz-count">{{ rulesOf(k as ApprovalBizType).length }}</span>
              </a-radio-button>
            </a-radio-group>
            <a-button v-perm="'flow:config:edit'" type="primary" @click="openFlow()">
              <template #icon><PlusOutlined /></template>
              新建审批流
            </a-button>
          </div>

          <a-alert
            type="warning"
            show-icon
            style="margin-bottom: 16px"
            :message="`${BIZ_TYPE_META[activeBiz].text}：${BIZ_TYPE_META[activeBiz].desc}。匹配规则为「自上而下取第一条启用且适用范围 + 金额区间同时命中的流程」，未命中任何流程则免审直接生效。`"
          />

          <a-empty v-if="!rulesOf(activeBiz).length" description="该单据类型暂未配置审批流（当前免审）" />

          <div v-for="rule in rulesOf(activeBiz)" :key="rule.id" class="flow-card" :class="{ off: !rule.enabled }">
            <div class="flow-head">
              <span class="flow-name">{{ rule.name }}</span>
              <a-tag color="geekblue">{{ amountRangeText(rule.minAmount, rule.maxAmount) }}</a-tag>
              <a-tag :color="FLOW_SCOPE_META[rule.scope].color">{{ FLOW_SCOPE_META[rule.scope].text }}</a-tag>
              <a-tag :color="rule.enabled ? 'green' : 'default'">{{ rule.enabled ? '已启用' : '已停用' }}</a-tag>
              <span class="flow-ops">
                <a-switch
                  v-perm="'flow:config:toggle'"
                  size="small"
                  :checked="rule.enabled"
                  checked-children="启"
                  un-checked-children="停"
                  @change="(v: any) => toggle(rule, !!v)"
                />
                <a v-perm="'flow:config:edit'" @click="openFlow(rule)">编辑</a>
                <a v-perm="'flow:config:edit'" @click="copyFlow(rule)">复制</a>
                <a v-perm="'flow:config:edit'" class="danger" @click="removeFlow(rule)">删除</a>
              </span>
            </div>
            <div class="flow-chain">
              <div class="chain-node start">提交</div>
              <template v-for="(n, i) in rule.nodes" :key="n.id || i">
                <span class="chain-arrow">→</span>
                <div class="chain-node">
                  <div class="cn-title">{{ i + 1 }}. {{ n.name }}</div>
                  <div class="cn-mode">{{ n.mode === 'ALL' ? '会签' : '或签' }} · {{ n.approvers.length }} 人</div>
                  <div class="cn-people">{{ approverLabels(n.approvers) }}</div>
                </div>
              </template>
              <span class="chain-arrow">→</span>
              <div class="chain-node end">生效</div>
            </div>
            <div v-if="rule.remark" class="flow-remark">{{ rule.remark }}</div>
          </div>
        </a-card>
      </a-tab-pane>

      <!-- ============ 我的待办 ============ -->
      <a-tab-pane v-if="auth.hasPerm('flow:todo:view')" key="todo">
        <template #tab>
          我的待办
          <a-badge :count="todoCount" :offset="[4, -2]" />
        </template>
        <a-card :loading="todoLoading">
          <a-empty v-if="!todoList.length" description="当前没有待你审批的单据" />
          <a-table
            v-else
            :data-source="todoList"
            :columns="todoColumns"
            row-key="id"
            :scroll="{ x: 1000 }"
            size="small"
            :pagination="{ pageSize: 10 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'bizType'">
                <a-tag :color="BIZ_TYPE_META[record.bizType as ApprovalBizType].color">
                  {{ BIZ_TYPE_META[record.bizType as ApprovalBizType].text }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'amount'">¥{{ money(record.amount) }}</template>
              <template v-else-if="column.key === 'node'">
                {{ record.currentIndex + 1 }}/{{ record.nodes.length }} {{ record.nodes[record.currentIndex]?.name }}
              </template>
              <template v-else-if="column.key === 'createdAt'">{{ dt(record.createdAt) }}</template>
              <template v-else-if="column.key === 'action'">
                <a @click="openDetail(record.id)">去审批</a>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>

      <!-- ============ 审批记录 ============ -->
      <a-tab-pane v-if="auth.hasPerm('flow:instance:view')" key="instance" tab="审批记录">
        <a-card>
          <a-space style="margin-bottom: 16px" wrap>
            <a-select v-model:value="query.status" style="width: 130px" placeholder="状态" allow-clear>
              <a-select-option v-for="(v, k) in INSTANCE_STATUS_META" :key="k" :value="k">{{ v.text }}</a-select-option>
            </a-select>
            <a-select v-model:value="query.bizType" style="width: 150px" placeholder="单据类型" allow-clear>
              <a-select-option v-for="(v, k) in BIZ_TYPE_META" :key="k" :value="k">{{ v.text }}</a-select-option>
            </a-select>
            <a-input-search
              v-model:value="query.keyword"
              placeholder="搜索单据号/摘要/申请人"
              style="width: 240px"
              allow-clear
              @search="loadInstances"
            />
            <a-button @click="loadInstances">查询</a-button>
          </a-space>

          <a-table
            :data-source="instances"
            :columns="instanceColumns"
            row-key="id"
            :loading="instLoading"
            :scroll="{ x: 1100 }"
            size="small"
            :pagination="{ pageSize: 10 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'bizType'">
                <a-tag :color="BIZ_TYPE_META[record.bizType as ApprovalBizType].color">
                  {{ BIZ_TYPE_META[record.bizType as ApprovalBizType].text }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'amount'">¥{{ money(record.amount) }}</template>
              <template v-else-if="column.key === 'requester'">{{ record.requesterName || approverLabel(record.requester) }}</template>
              <template v-else-if="column.key === 'node'">
                <span v-if="record.status === 'PENDING'">
                  {{ record.currentIndex + 1 }}/{{ record.nodes.length }} {{ record.nodes[record.currentIndex]?.name }}
                </span>
                <span v-else style="color: #999">-</span>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="INSTANCE_STATUS_META[record.status as ApprovalInstanceStatus].color">
                  {{ INSTANCE_STATUS_META[record.status as ApprovalInstanceStatus].text }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'createdAt'">{{ dt(record.createdAt) }}</template>
              <template v-else-if="column.key === 'action'">
                <a @click="openDetail(record.id)">查看</a>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>
    </a-tabs>

    <!-- 流程编辑 -->
    <a-modal
      v-model:open="flowOpen"
      :title="editingFlow ? '编辑审批流' : '新建审批流'"
      width="760px"
      :confirm-loading="flowSaving"
      @ok="submitFlow"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="10">
            <a-form-item label="单据类型" required>
              <a-select v-model:value="flowForm.bizType">
                <a-select-option v-for="(v, k) in BIZ_TYPE_META" :key="k" :value="k">{{ v.text }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="14">
            <a-form-item label="流程名称" required>
              <a-input v-model:value="flowForm.name" placeholder="如：总部对外采购（5万元以上）" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="适用组织范围">
              <a-select v-model:value="flowForm.scope">
                <a-select-option v-for="(v, k) in FLOW_SCOPE_META" :key="k" :value="k">{{ v.text }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item :label="`${BIZ_TYPE_META[flowForm.bizType].amountLabel}下限（含）`">
              <a-input-number v-model:value="flowForm.minAmount" :min="0" style="width: 100%" placeholder="不限" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="金额上限（不含）">
              <a-input-number v-model:value="flowForm.maxAmount" :min="0" style="width: 100%" placeholder="不限" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="16">
            <a-form-item label="备注">
              <a-input v-model:value="flowForm.remark" placeholder="选填，展示在流程卡片下方" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="排序" help="数字越小越先匹配">
              <a-input-number v-model:value="flowForm.sortOrder" :min="0" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="审批节点（按顺序逐级推进）">
          <div v-for="(n, i) in flowForm.nodes" :key="i" class="node-edit">
            <div class="node-edit-head">
              <b>节点 {{ i + 1 }}</b>
              <a-space :size="8">
                <a :class="{ dis: i === 0 }" @click="moveNode(i, -1)">上移</a>
                <a :class="{ dis: i === flowForm.nodes.length - 1 }" @click="moveNode(i, 1)">下移</a>
                <a class="danger" @click="flowForm.nodes.splice(i, 1)">移除</a>
              </a-space>
            </div>
            <a-row :gutter="12">
              <a-col :span="9">
                <a-input v-model:value="n.name" placeholder="节点名称，如 总部财务复核" />
              </a-col>
              <a-col :span="6">
                <a-select v-model:value="n.mode" style="width: 100%">
                  <a-select-option v-for="(t, k) in NODE_MODE_NAMES" :key="k" :value="k">{{ t }}</a-select-option>
                </a-select>
              </a-col>
              <a-col :span="9">
                <a-select
                  v-model:value="n.approvers"
                  mode="multiple"
                  placeholder="选择审批人"
                  style="width: 100%"
                  show-search
                  option-filter-prop="label"
                  :options="approverOptions"
                />
              </a-col>
            </a-row>
          </div>
          <a-button block type="dashed" @click="addNode">+ 添加审批节点</a-button>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 审批详情 -->
    <a-drawer v-model:open="detailOpen" title="审批详情" width="620px">
      <a-spin v-if="detailLoading" />
      <template v-else-if="current">
        <a-descriptions :column="1" bordered size="small" style="margin-bottom: 16px">
          <a-descriptions-item label="单据类型">
            <a-tag :color="BIZ_TYPE_META[current.bizType].color">{{ BIZ_TYPE_META[current.bizType].text }}</a-tag>
            {{ current.bizId }}
          </a-descriptions-item>
          <a-descriptions-item label="摘要">{{ current.summary }}</a-descriptions-item>
          <a-descriptions-item label="金额">¥{{ money(current.amount) }}</a-descriptions-item>
          <a-descriptions-item label="申请人">{{ current.requesterName || approverLabel(current.requester) }}</a-descriptions-item>
          <a-descriptions-item label="命中流程">{{ current.flowName || '免审直通' }}</a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="INSTANCE_STATUS_META[current.status].color">{{ INSTANCE_STATUS_META[current.status].text }}</a-tag>
            <span v-if="current.resultNote" style="color: #999; font-size: 12px">{{ current.resultNote }}</span>
          </a-descriptions-item>
        </a-descriptions>

        <ApprovalTimeline :instance="current" />

        <div v-if="canApprove(current)" class="approve-box">
          <a-textarea v-model:value="comment" placeholder="审批意见（可选）" :rows="2" style="margin-bottom: 12px" />
          <a-space>
            <a-button type="primary" :loading="deciding" @click="doDecide('APPROVE')">同意</a-button>
            <a-button danger :loading="deciding" @click="doDecide('REJECT')">驳回</a-button>
          </a-space>
          <div class="tl-sub" style="margin-top: 8px">当前以「{{ approverLabel(me) }}」的身份审批</div>
        </div>
        <a-alert
          v-else-if="current.status === 'PENDING'"
          type="info"
          show-icon
          :message="`当前节点审批人为 ${approverLabels(current.nodes[current.currentIndex]?.approvers ?? [])}，你不在其中，只能查看进度`"
          style="margin-top: 16px"
        />
        <a-button
          v-if="current.status === 'PENDING' && current.requester === me"
          danger
          style="margin-top: 16px"
          @click="doCancel(current)"
        >
          撤销申请
        </a-button>
      </template>
    </a-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import {
  BIZ_TYPE_META,
  FLOW_SCOPE_META,
  INSTANCE_STATUS_META,
  NODE_MODE_NAMES,
  amountRangeText,
} from '@fullyu/shared'
import type {
  ApprovalBizType,
  ApprovalFlowScope,
  ApprovalInstanceStatus,
  ApprovalNodeMode,
} from '@fullyu/shared'
import {
  approveInstance,
  cancelInstance,
  createFlowRule,
  getInstance,
  getTodoCount,
  listFlowRules,
  listInstances,
  listMyTodo,
  rejectInstance,
  removeFlowRule,
  toggleFlowRule,
  updateFlowRule,
} from '@/api/approval'
import type { ApprovalInstance, FlowNode, FlowRule } from '@/api/approval'
import ApprovalTimeline from '@/components/ApprovalTimeline.vue'
import { useApprovers } from '@/composables/useApprovers'
import { dt, money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { approverOptions, load: loadApprovers, approverLabel, approverLabels } = useApprovers()

/** 节点里存的审批人就是登录名（手机号），与当前登录人同一套标识 */
const me = computed(() => auth.username)

// 没有流程配置权限时落到待办，避免首屏空白
const tab = ref(
  auth.hasPerm('flow:config:view') ? 'flow' : auth.hasPerm('flow:todo:view') ? 'todo' : 'instance',
)

/* ===== 流程配置 ===== */
const activeBiz = ref<ApprovalBizType>('PURCHASE_ORDER')
const rules = ref<FlowRule[]>([])
const ruleLoading = ref(false)
const rulesOf = (biz: ApprovalBizType) => rules.value.filter((r) => r.bizType === biz)

async function loadRules() {
  ruleLoading.value = true
  try {
    rules.value = await listFlowRules()
  } catch (e: any) {
    message.error(e?.message || '流程规则加载失败')
  } finally {
    ruleLoading.value = false
  }
}

const flowOpen = ref(false)
const flowSaving = ref(false)
const editingFlow = ref<FlowRule | null>(null)
const flowForm = reactive({
  bizType: 'PURCHASE_ORDER' as ApprovalBizType,
  name: '',
  scope: 'ALL' as ApprovalFlowScope,
  minAmount: undefined as number | undefined,
  maxAmount: undefined as number | undefined,
  remark: '',
  sortOrder: 0,
  nodes: [] as FlowNode[],
})

function openFlow(rule?: FlowRule) {
  editingFlow.value = rule ?? null
  Object.assign(flowForm, {
    bizType: rule?.bizType ?? activeBiz.value,
    name: rule?.name ?? '',
    scope: rule?.scope ?? 'ALL',
    minAmount: rule?.minAmount ?? undefined,
    maxAmount: rule?.maxAmount ?? undefined,
    remark: rule?.remark ?? '',
    sortOrder: rule?.sortOrder ?? 0,
    nodes: rule
      ? rule.nodes.map((n) => ({ name: n.name, mode: n.mode, approvers: [...n.approvers] }))
      : [{ name: '', mode: 'ANY' as ApprovalNodeMode, approvers: [] }],
  })
  flowOpen.value = true
}

function addNode() {
  flowForm.nodes.push({ name: '', mode: 'ANY', approvers: [] })
}

function moveNode(i: number, dir: number) {
  const j = i + dir
  if (j < 0 || j >= flowForm.nodes.length) return
  const arr = flowForm.nodes
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

async function submitFlow() {
  if (!flowForm.name.trim()) return message.warning('请填写流程名称')
  if (!flowForm.nodes.length) return message.warning('至少配置一个审批节点')
  if (flowForm.nodes.some((n) => !n.name.trim() || !n.approvers.length))
    return message.warning('每个节点都需填写名称并指定审批人')
  if (flowForm.minAmount != null && flowForm.maxAmount != null && flowForm.minAmount >= flowForm.maxAmount)
    return message.warning('金额下限需小于上限')

  const payload = {
    bizType: flowForm.bizType,
    name: flowForm.name.trim(),
    scope: flowForm.scope,
    minAmount: flowForm.minAmount ?? null,
    maxAmount: flowForm.maxAmount ?? null,
    remark: flowForm.remark,
    sortOrder: flowForm.sortOrder,
    // 后端是整单覆盖，不带 enabled 会把停用的流程改改着就重新启用了
    enabled: editingFlow.value?.enabled ?? true,
    nodes: flowForm.nodes.map((n) => ({ name: n.name.trim(), mode: n.mode, approvers: [...n.approvers] })),
  }

  flowSaving.value = true
  try {
    if (editingFlow.value) {
      await updateFlowRule(editingFlow.value.id, payload)
      message.success('审批流已更新，后续新提交的单据按新流程走')
    } else {
      await createFlowRule(payload)
      message.success('审批流已创建')
    }
    activeBiz.value = payload.bizType
    flowOpen.value = false
    await loadRules()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    flowSaving.value = false
  }
}

/** 复制成停用状态，避免两条同区间的流程同时生效抢匹配 */
async function copyFlow(rule: FlowRule) {
  try {
    await createFlowRule({
      bizType: rule.bizType,
      name: `${rule.name}（副本）`,
      scope: rule.scope,
      minAmount: rule.minAmount,
      maxAmount: rule.maxAmount,
      remark: rule.remark,
      sortOrder: rule.sortOrder + 1,
      enabled: false,
      nodes: rule.nodes.map((n) => ({ name: n.name, mode: n.mode, approvers: [...n.approvers] })),
    })
    message.success('已复制为停用状态，调整后再启用')
    await loadRules()
  } catch (e: any) {
    message.error(e?.message || '复制失败')
  }
}

async function toggle(rule: FlowRule, enabled: boolean) {
  try {
    await toggleFlowRule(rule.id, enabled)
    rule.enabled = enabled
  } catch (e: any) {
    message.error(e?.message || '操作失败')
    await loadRules()
  }
}

function removeFlow(rule: FlowRule) {
  Modal.confirm({
    title: `确认删除「${rule.name}」？`,
    content: '删除后该金额区间的单据将落到其他匹配流程，若无匹配则免审直接生效。已在审批中的单据不受影响。',
    okType: 'danger',
    async onOk() {
      try {
        await removeFlowRule(rule.id)
        message.success('已删除')
        await loadRules()
      } catch (e: any) {
        message.error(e?.message || '删除失败')
      }
    },
  })
}

/* ===== 我的待办 ===== */
const todoList = ref<ApprovalInstance[]>([])
const todoCount = ref(0)
const todoLoading = ref(false)

async function loadTodo() {
  todoLoading.value = true
  try {
    todoList.value = await listMyTodo()
    todoCount.value = todoList.value.length
  } catch (e: any) {
    message.error(e?.message || '待办加载失败')
  } finally {
    todoLoading.value = false
  }
}

const todoColumns = [
  { title: '单据类型', key: 'bizType', width: 110 },
  { title: '单据号', dataIndex: 'bizId', width: 170 },
  { title: '摘要', dataIndex: 'summary' },
  { title: '金额', key: 'amount', width: 120 },
  { title: '申请人', dataIndex: 'requesterName', width: 100 },
  { title: '当前节点', key: 'node', width: 170 },
  { title: '提交时间', key: 'createdAt', width: 140 },
  { title: '操作', key: 'action', width: 80 },
]

/* ===== 审批记录 ===== */
const instances = ref<ApprovalInstance[]>([])
const instLoading = ref(false)
const query = reactive({
  status: undefined as ApprovalInstanceStatus | undefined,
  bizType: undefined as ApprovalBizType | undefined,
  keyword: '',
})

async function loadInstances() {
  instLoading.value = true
  try {
    instances.value = await listInstances({
      status: query.status,
      bizType: query.bizType,
      keyword: query.keyword.trim() || undefined,
    })
  } catch (e: any) {
    message.error(e?.message || '审批记录加载失败')
  } finally {
    instLoading.value = false
  }
}

const instanceColumns = [
  { title: '单据类型', key: 'bizType', width: 110 },
  { title: '单据号', dataIndex: 'bizId', width: 170 },
  { title: '摘要', dataIndex: 'summary' },
  { title: '金额', key: 'amount', width: 120 },
  { title: '申请人', key: 'requester', width: 110 },
  { title: '命中流程', dataIndex: 'flowName', width: 170 },
  { title: '当前节点', key: 'node', width: 160 },
  { title: '状态', key: 'status', width: 90 },
  { title: '提交时间', key: 'createdAt', width: 140 },
  { title: '操作', key: 'action', width: 70 },
]

/* ===== 详情与审批 ===== */
const detailOpen = ref(false)
const detailLoading = ref(false)
const current = ref<ApprovalInstance | null>(null)
const comment = ref('')
const deciding = ref(false)

async function openDetail(id: string) {
  detailOpen.value = true
  detailLoading.value = true
  current.value = null
  comment.value = ''
  try {
    current.value = await getInstance(id)
  } catch (e: any) {
    message.error(e?.message || '详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

/** 只有当前节点的审批人、且本人还没表态时才给按钮 */
function canApprove(inst: ApprovalInstance): boolean {
  if (inst.status !== 'PENDING' || !auth.hasPerm('flow:todo:approve')) return false
  const node = inst.nodes[inst.currentIndex]
  if (!node) return false
  return node.approvers.includes(me.value) && !node.decisions.some((d) => d.approver === me.value)
}

async function doDecide(action: 'APPROVE' | 'REJECT') {
  if (!current.value) return
  const id = current.value.id
  deciding.value = true
  try {
    const result =
      action === 'APPROVE' ? await approveInstance(id, comment.value) : await rejectInstance(id, comment.value)
    comment.value = ''
    if (result.status === 'APPROVED') message.success('审批通过，单据已生效')
    else if (result.status === 'REJECTED') message.warning('已驳回，单据回到驳回状态')
    else message.success('已提交审批意见，流程进入下一节点')
    current.value = result
    await Promise.all([loadTodo(), tab.value === 'instance' ? loadInstances() : Promise.resolve()])
  } catch (e: any) {
    message.error(e?.message || '审批失败')
  } finally {
    deciding.value = false
  }
}

function doCancel(inst: ApprovalInstance) {
  Modal.confirm({
    title: '确认撤销该申请？',
    content: '撤销后单据回到可编辑状态，需重新提交才会再次进入审批。',
    okType: 'danger',
    async onOk() {
      try {
        current.value = await cancelInstance(inst.id)
        message.success('已撤销')
        await Promise.all([loadTodo(), loadInstances()])
      } catch (e: any) {
        message.error(e?.message || '撤销失败')
      }
    },
  })
}

/* ===== 初始化 ===== */
function onTabChange(key: string) {
  if (key === 'flow' && !rules.value.length) loadRules()
  if (key === 'todo') loadTodo()
  if (key === 'instance' && !instances.value.length) loadInstances()
}

onMounted(async () => {
  // 名册用于把节点里的手机号翻成姓名，也供流程配置选审批人
  try {
    const list = await loadApprovers()
    if (!list.length) message.warning('暂无可选审批人，请先在「系统用户」中添加人员')
  } catch (e: any) {
    message.error(e?.message || '加载审批人列表失败')
  }
  if (auth.hasPerm('flow:config:view')) loadRules()
  if (auth.hasPerm('flow:todo:view')) {
    // 待办条数决定 Tab 上的红点，无论当前在哪个 Tab 都先取一次
    loadTodo().catch(() => {})
    getTodoCount()
      .then((r) => (todoCount.value = r.count))
      .catch(() => {})
  }
  if (tab.value === 'instance') loadInstances()
})
</script>

<style scoped>
.biz-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.biz-count {
  margin-left: 4px;
  font-size: 11px;
  opacity: 0.7;
}
.flow-card {
  border: 1px solid #ede5db;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 14px;
  background: #fffdfa;
}
.flow-card.off {
  opacity: 0.6;
}
.flow-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.flow-name {
  font-weight: 600;
  color: #4b3621;
}
.flow-ops {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
.flow-ops .danger,
.node-edit-head .danger {
  color: #cf1322;
}
.flow-chain {
  display: flex;
  align-items: stretch;
  gap: 6px;
  flex-wrap: wrap;
}
.chain-node {
  min-width: 150px;
  padding: 8px 10px;
  border: 1px solid #ede5db;
  border-radius: 8px;
  background: #fff;
}
.chain-node.start,
.chain-node.end {
  min-width: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5e8d8;
  color: #6b463c;
  font-size: 12px;
}
.cn-title {
  font-size: 13px;
  font-weight: 600;
  color: #4b3621;
}
.cn-mode {
  font-size: 11px;
  color: #6b463c;
  margin: 2px 0;
}
.cn-people {
  font-size: 11px;
  color: #999;
}
.chain-arrow {
  align-self: center;
  color: #c8b6a6;
}
.flow-remark {
  margin-top: 10px;
  font-size: 12px;
  color: #999;
}
.node-edit {
  border: 1px dashed #ede5db;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.node-edit-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}
.node-edit-head .dis {
  color: #ccc;
  pointer-events: none;
}
.tl-sub {
  font-size: 12px;
  color: #999;
}
.approve-box {
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #ede5db;
  border-radius: 12px;
  background: #fffdfa;
}
</style>
