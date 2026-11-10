<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center">
      <h2 class="page-title">组织架构</h2>
      <a-space>
        <a-radio-group v-model:value="viewMode" button-style="solid">
          <a-radio-button value="tree">架构树</a-radio-button>
          <a-radio-button value="table">明细表</a-radio-button>
        </a-radio-group>
        <a-button v-perm="'org:create'" type="primary" @click="openCreate()">
          <template #icon><PlusOutlined /></template>
          新建组织
        </a-button>
      </a-space>
    </div>

    <!-- 概览 -->
    <a-row :gutter="16" style="margin-bottom: 16px">
      <a-col :xs="12" :md="6">
        <a-card><a-statistic title="子公司" :value="countBy('SUBSIDIARY')" suffix="家" /></a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card><a-statistic title="门店" :value="countBy('STORE')" suffix="家" /></a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card><a-statistic title="核算主体" :value="accountingCount" suffix="个" /></a-card>
      </a-col>
      <a-col :xs="12" :md="6">
        <a-card><a-statistic title="库存仓库" :value="warehouseCount" suffix="个" /></a-card>
      </a-col>
    </a-row>

    <!-- 架构树 -->
    <a-card v-if="viewMode === 'tree'" :loading="loading">
      <div class="org-tree">
        <OrgTreeItem
          v-for="node in tree"
          :key="node.id"
          :node="node"
          :depth="0"
          @add="openCreate"
          @edit="openEdit"
          @remove="remove"
        />
        <a-empty v-if="!loading && !tree.length" description="暂无组织" />
      </div>
    </a-card>

    <!-- 明细表 -->
    <a-card v-else>
      <a-table
        :data-source="list"
        :columns="columns"
        row-key="id"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 1100 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'path'">{{ orgPath(record.id) }}</template>
          <template v-else-if="column.key === 'type'">
            <a-tag :color="orgTypeMap[record.type as OrgType].color">{{ orgTypeMap[record.type as OrgType].text }}</a-tag>
          </template>
          <template v-else-if="column.key === 'flags'">
            <a-space :size="4" wrap>
              <a-tag v-if="record.accounting" color="gold">财务核算</a-tag>
              <a-tag v-if="record.hasWarehouse" color="cyan">独立仓库</a-tag>
              <a-tag v-if="record.canPurchase" color="blue">可采购</a-tag>
            </a-space>
          </template>
          <template v-else-if="column.key === 'rate'">
            <span v-if="record.mgmtFeeRate === undefined">-</span>
            <span v-else>{{ rateToPercent(record.mgmtFeeRate) }}% / {{ rateToPercent(record.trainFeeRate) }}%</span>
          </template>
          <template v-else-if="column.key === 'rent'">
            <span v-if="!record.baseRent && !record.rentRate && !record.propertyFee" style="color: #bfbfbf">未设置</span>
            <a-space v-else :size="4" wrap>
              <a-tag color="orange">保底 ¥{{ money(record.baseRent) }}</a-tag>
              <a-tag color="blue">提成 {{ rateToPercent(record.rentRate) }}%</a-tag>
              <a-tag color="default">物业 ¥{{ money(record.propertyFee) }}</a-tag>
            </a-space>
          </template>
          <template v-else-if="column.key === 'status'">
            <a-tag :color="record.status === 'ACTIVE' ? 'green' : 'default'">
              {{ record.status === 'ACTIVE' ? '启用' : '停用' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a v-perm="'org:update'" @click="openEdit(record)">编辑</a>
              <a v-perm="'org:update'" @click="toggleStatus(record)">{{ record.status === 'ACTIVE' ? '停用' : '启用' }}</a>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建/编辑 -->
    <a-modal
      v-model:open="editOpen"
      :title="editing ? '编辑组织' : '新建组织'"
      width="680px"
      :confirm-loading="submitting"
      @ok="submit"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="组织类型" required>
              <a-select v-model:value="form.type">
                <a-select-option v-for="(v, k) in orgTypeMap" :key="k" :value="k">{{ v.text }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="上级组织">
              <a-select v-model:value="form.parentId" placeholder="不选则为顶级" allow-clear>
                <a-select-option
                  v-for="o in list.filter((n) => n.id !== editing?.id)"
                  :key="o.id"
                  :value="o.id"
                >
                  {{ orgPath(o.id) }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="14">
            <a-form-item label="组织全称" required>
              <a-input v-model:value="form.name" placeholder="如：深圳福田福愈健康管理有限公司" />
            </a-form-item>
          </a-col>
          <a-col :span="10">
            <a-form-item label="简称" required>
              <a-input v-model:value="form.shortName" placeholder="如：福田店" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="组织编码" required :help="editing ? '' : '编码同时作为组织 ID，创建后不建议修改'">
              <a-input v-model:value="form.code" placeholder="如 S004" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="负责人">
              <a-input v-model:value="form.leader" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="联系电话">
              <a-input v-model:value="form.phone" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row v-if="canEditRate" :gutter="16">
          <a-col :span="12">
            <a-form-item label="管理费比例（%）" help="总部按门店当月营收比例收取">
              <a-input-number v-model:value="form.mgmtFeePercent" :min="0" :max="100" :precision="2" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="培训费比例（%）">
              <a-input-number v-model:value="form.trainFeePercent" :min="0" :max="100" :precision="2" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="租金设置" :help="rentHint">
          <a-row :gutter="16">
            <a-col :span="8">
              <a-input-number
                v-model:value="form.baseRent"
                :min="0"
                :precision="2"
                :step="1000"
                addon-before="月保底租金"
                addon-after="元"
                style="width: 100%"
              />
            </a-col>
            <a-col :span="8">
              <a-input-number
                v-model:value="form.rentRatePercent"
                :min="0"
                :max="100"
                :precision="2"
                addon-before="提成比例"
                addon-after="%"
                style="width: 100%"
              />
            </a-col>
            <a-col :span="8">
              <a-input-number
                v-model:value="form.propertyFee"
                :min="0"
                :precision="2"
                :step="100"
                addon-before="月物业费"
                addon-after="元"
                style="width: 100%"
              />
            </a-col>
          </a-row>
        </a-form-item>
        <a-form-item label="业务属性">
          <a-space direction="vertical">
            <a-checkbox v-model:checked="form.accounting">独立财务核算主体（进入财务看板利润维度）</a-checkbox>
            <a-checkbox v-model:checked="form.hasWarehouse">拥有独立仓库（进入进销存库存维度）</a-checkbox>
            <a-checkbox v-model:checked="form.canPurchase">可发起采购（向上级/供应商下单）</a-checkbox>
          </a-space>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { percentToRate, rateToPercent } from '@fullyu/shared'
import OrgTreeItem from './OrgTreeItem.vue'
import { createOrg, getOrgTree, listOrgs, orgTypeMap, removeOrg, updateOrg } from '@/api/org'
import type { OrgNode, OrgTreeNode, OrgType } from '@/api/org'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const canEditRate = computed(() => auth.hasPerm('org:rate'))

/** 看板里房租就是这三个数算出来的，表单上先把口径说清楚 */
const rentHint =
  '房租 = 月保底租金 与 当月收入×提成比例 取高，再加固定的月物业费；财务看板的房租/物业成本直接按此现算，无需再录支出单'

const money = (n?: number) => (Number(n) || 0).toLocaleString('zh-CN')

const viewMode = ref<'tree' | 'table'>('tree')
const loading = ref(false)
const submitting = ref(false)
const list = ref<OrgNode[]>([])
const tree = ref<OrgTreeNode[]>([])

const countBy = (t: OrgType) => list.value.filter((o) => o.type === t).length
const accountingCount = computed(() => list.value.filter((o) => o.accounting).length)
const warehouseCount = computed(() => list.value.filter((o) => o.hasWarehouse).length)

/** 逐级向上拼简称，明细表与上级下拉都靠它辨认层级 */
function orgPath(id: string): string {
  const names: string[] = []
  let cursor: string | null | undefined = id
  const guard = new Set<string>()
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor)
    const node = list.value.find((o) => o.id === cursor)
    if (!node) break
    names.unshift(node.shortName)
    cursor = node.parentId
  }
  return names.join(' / ')
}

const columns = [
  { title: '组织路径', key: 'path', fixed: 'left', width: 220 },
  { title: '全称', dataIndex: 'name' },
  { title: '编码', dataIndex: 'code', width: 100 },
  { title: '类型', key: 'type', width: 100 },
  { title: '负责人', dataIndex: 'leader', width: 90 },
  { title: '业务属性', key: 'flags', width: 210 },
  { title: '管理费/培训费', key: 'rate', width: 130 },
  { title: '租金参数', key: 'rent', width: 260 },
  { title: '状态', key: 'status', width: 80 },
  { title: '操作', key: 'action', width: 110 },
]

async function load() {
  loading.value = true
  try {
    const [flat, treeData] = await Promise.all([listOrgs(), getOrgTree()])
    list.value = flat
    tree.value = treeData
  } catch (e: any) {
    message.error(e?.message || '组织架构加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

/* 新建 / 编辑 */
const editOpen = ref(false)
const editing = ref<OrgNode | null>(null)
const form = reactive({
  type: 'STORE' as OrgType,
  parentId: undefined as string | undefined,
  name: '',
  shortName: '',
  code: '',
  leader: '',
  phone: '',
  mgmtFeePercent: 15,
  trainFeePercent: 2,
  baseRent: 0,
  rentRatePercent: 0,
  propertyFee: 0,
  accounting: true,
  hasWarehouse: true,
  canPurchase: true,
})

function openCreate(parent?: OrgNode) {
  editing.value = null
  Object.assign(form, {
    type: parent?.type === 'SUBSIDIARY' ? 'STORE' : 'SUBSIDIARY',
    parentId: parent?.id,
    name: '',
    shortName: '',
    code: '',
    leader: '',
    phone: '',
    mgmtFeePercent: 15,
    trainFeePercent: 2,
    baseRent: 0,
    rentRatePercent: 0,
    propertyFee: 0,
    accounting: true,
    hasWarehouse: true,
    canPurchase: true,
  })
  editOpen.value = true
}

function openEdit(node: OrgNode) {
  editing.value = node
  Object.assign(form, {
    type: node.type,
    parentId: node.parentId ?? undefined,
    name: node.name,
    shortName: node.shortName,
    code: node.code,
    leader: node.leader,
    phone: node.phone,
    mgmtFeePercent: rateToPercent(node.mgmtFeeRate ?? 0),
    trainFeePercent: rateToPercent(node.trainFeeRate ?? 0),
    baseRent: Number(node.baseRent ?? 0),
    rentRatePercent: rateToPercent(node.rentRate ?? 0),
    propertyFee: Number(node.propertyFee ?? 0),
    accounting: node.accounting,
    hasWarehouse: node.hasWarehouse,
    canPurchase: node.canPurchase,
  })
  editOpen.value = true
}

async function submit() {
  if (!form.name.trim()) { message.warning('请填写组织全称'); return }
  if (!form.shortName.trim()) { message.warning('请填写简称'); return }
  if (!form.code.trim()) { message.warning('请填写组织编码'); return }

  const body: Partial<OrgNode> = {
    type: form.type,
    parentId: form.parentId ?? null,
    name: form.name.trim(),
    shortName: form.shortName.trim(),
    code: form.code.trim(),
    leader: form.leader,
    phone: form.phone,
    accounting: form.accounting,
    hasWarehouse: form.hasWarehouse,
    canPurchase: form.canPurchase,
    baseRent: Number(form.baseRent) || 0,
    rentRate: percentToRate(form.rentRatePercent),
    propertyFee: Number(form.propertyFee) || 0,
  }
  // 比例字段无权限时不提交，后端也会忽略，双向兜住
  if (canEditRate.value) {
    body.mgmtFeeRate = percentToRate(form.mgmtFeePercent)
    body.trainFeeRate = percentToRate(form.trainFeePercent)
  }

  submitting.value = true
  try {
    if (editing.value) {
      await updateOrg(editing.value.id, body)
      message.success('组织信息已更新')
    } else {
      await createOrg(body)
      message.success('组织已创建，进销存与财务模块可立即选用')
    }
    editOpen.value = false
    await load()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

async function toggleStatus(node: OrgNode) {
  const next = node.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  try {
    await updateOrg(node.id, { status: next })
    message.success(next === 'ACTIVE' ? '已启用' : '已停用（不再出现在业务下拉中）')
    await load()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

function remove(node: OrgNode) {
  Modal.confirm({
    title: `确认删除「${node.shortName}」？`,
    content: '有下级组织或已绑定账号的组织无法删除，只能停用。',
    okType: 'danger',
    async onOk() {
      try {
        await removeOrg(node.id)
        message.success('已删除')
        await load()
      } catch (e: any) {
        message.error(e?.message || '删除失败')
      }
    },
  })
}
</script>

<style scoped>
.org-tree {
  padding: 8px 0;
}
</style>
