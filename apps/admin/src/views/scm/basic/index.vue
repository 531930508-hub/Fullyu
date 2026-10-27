<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">基础档案</h2>
    </div>

    <a-tabs v-model:activeKey="tab">
      <!-- ============ 商品档案 ============ -->
      <a-tab-pane key="product" tab="商品档案">
        <a-card>
          <a-space style="margin-bottom: 16px" wrap>
            <a-input-search
              v-model:value="productKeyword"
              placeholder="搜索编码/名称"
              style="width: 220px"
              allow-clear
              @search="loadProducts"
            />
            <a-select v-model:value="productEnabled" style="width: 120px" allow-clear placeholder="状态" @change="loadProducts">
              <a-select-option :value="true">启用中</a-select-option>
              <a-select-option :value="false">已停用</a-select-option>
            </a-select>
            <a-button v-perm="'scm:po:update'" type="primary" @click="openProduct()">
              <template #icon><PlusOutlined /></template>
              新建商品
            </a-button>
          </a-space>

          <a-alert
            type="info"
            show-icon
            style="margin-bottom: 16px"
            message="商品档案是采购、入库、库存三处共用的基准。采购价用于采购单默认单价与库存成本核算，供货价用于总部向分公司供货，安全库存用于库存告警。"
          />

          <a-table
            :data-source="products"
            :columns="productColumns"
            row-key="id"
            :loading="productLoading"
            :scroll="{ x: 1100 }"
            size="small"
            :pagination="{ pageSize: 10, showTotal: (t: number) => `共 ${t} 个商品` }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'purchasePrice'">
                <template v-if="priceVisible">¥{{ money(record.purchasePrice) }}</template>
                <span v-else class="sub-text">—</span>
              </template>
              <template v-else-if="column.key === 'supplyPrice'">¥{{ money(record.supplyPrice) }}</template>
              <template v-else-if="column.key === 'enabled'">
                <a-tag :color="record.enabled ? 'green' : 'default'">{{ record.enabled ? '启用中' : '已停用' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space :size="12">
                  <a v-perm="'scm:po:update'" @click="openProduct(record)">编辑</a>
                  <a v-perm="'scm:po:update'" @click="doToggleProduct(record)">
                    {{ record.enabled ? '停用' : '启用' }}
                  </a>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>

      <!-- ============ 供应商档案 ============ -->
      <a-tab-pane key="supplier" tab="供应商档案">
        <a-card>
          <a-space style="margin-bottom: 16px" wrap>
            <a-input-search
              v-model:value="supplierKeyword"
              placeholder="搜索名称/联系人"
              style="width: 220px"
              allow-clear
              @search="loadSuppliers"
            />
            <a-button v-perm="'scm:po:update'" type="primary" @click="openSupplier()">
              <template #icon><PlusOutlined /></template>
              新建供应商
            </a-button>
          </a-space>

          <a-alert
            type="info"
            show-icon
            style="margin-bottom: 16px"
            message="仅「外部供应商」类型的采购单需要选供应商；向总部要货时供货方直接记为总部，不占用这里的档案。"
          />

          <a-table
            :data-source="suppliers"
            :columns="supplierColumns"
            row-key="id"
            :loading="supplierLoading"
            :scroll="{ x: 900 }"
            size="small"
            :pagination="{ pageSize: 10 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'enabled'">
                <a-tag :color="record.enabled ? 'green' : 'default'">{{ record.enabled ? '合作中' : '已停用' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space :size="12">
                  <a v-perm="'scm:po:update'" @click="openSupplier(record)">编辑</a>
                  <a v-perm="'scm:po:update'" @click="doToggleSupplier(record)">
                    {{ record.enabled ? '停用' : '启用' }}
                  </a>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>
    </a-tabs>

    <!-- 商品编辑 -->
    <a-modal
      v-model:open="productOpen"
      :title="editingProduct ? '编辑商品' : '新建商品'"
      width="640px"
      :confirm-loading="productSaving"
      @ok="submitProduct"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="商品编码" required>
              <a-input v-model:value="productForm.code" :disabled="!!editingProduct" placeholder="如 MT-001" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="商品名称" required>
              <a-input v-model:value="productForm.name" placeholder="如 一次性理疗巾" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="规格">
              <a-input v-model:value="productForm.spec" placeholder="如 60×80cm / 100片" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="单位" required>
              <a-input v-model:value="productForm.unit" placeholder="如 包 / 件 / 瓶" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col v-if="priceVisible" :span="8">
            <a-form-item label="采购价（元）">
              <a-input-number v-model:value="productForm.purchasePrice" :min="0" :precision="2" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="供货价（元）" help="总部供货给门店的价">
              <a-input-number v-model:value="productForm.supplyPrice" :min="0" :precision="2" style="width: 100%" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="安全库存" help="低于此数在库存页告警">
              <a-input-number v-model:value="productForm.safetyStock" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="备注">
          <a-textarea v-model:value="productForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 供应商编辑 -->
    <a-modal
      v-model:open="supplierOpen"
      :title="editingSupplier ? '编辑供应商' : '新建供应商'"
      width="560px"
      :confirm-loading="supplierSaving"
      @ok="submitSupplier"
    >
      <a-form layout="vertical">
        <a-form-item label="供应商名称" required>
          <a-input v-model:value="supplierForm.name" placeholder="如 杭州康泰医疗器械有限公司" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="联系人">
              <a-input v-model:value="supplierForm.contact" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="联系电话">
              <a-input v-model:value="supplierForm.phone" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="备注">
          <a-textarea v-model:value="supplierForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import {
  createProduct,
  createSupplier,
  listProducts,
  listSuppliers,
  toggleProduct,
  updateProduct,
  updateSupplier,
} from '@/api/scm'
import type { ScmProduct, ScmSupplier } from '@/api/scm'
import { money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
/** 采购价属于总部对外采购口径，无权限时列与输入框都不渲染 */
const priceVisible = computed(() => auth.hasPerm('scm:po:price'))

const tab = ref('product')

/* ===== 商品 ===== */
const products = ref<ScmProduct[]>([])
const productLoading = ref(false)
const productKeyword = ref('')
const productEnabled = ref<boolean | undefined>(undefined)

const productColumns = computed(() =>
  [
    { title: '编码', dataIndex: 'code', width: 120 },
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '规格', dataIndex: 'spec', width: 150 },
    { title: '单位', dataIndex: 'unit', width: 70 },
    ...(priceVisible.value ? [{ title: '采购价', key: 'purchasePrice', width: 100 }] : []),
    { title: '供货价', key: 'supplyPrice', width: 100 },
    { title: '安全库存', dataIndex: 'safetyStock', width: 90 },
    { title: '状态', key: 'enabled', width: 90 },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    { title: '操作', key: 'action', width: 120, fixed: 'right' as const },
  ],
)

async function loadProducts() {
  productLoading.value = true
  try {
    products.value = await listProducts({
      keyword: productKeyword.value || undefined,
      enabled: productEnabled.value,
    })
  } catch (e: any) {
    message.error(e?.message || '商品档案加载失败')
  } finally {
    productLoading.value = false
  }
}

const productOpen = ref(false)
const productSaving = ref(false)
const editingProduct = ref<ScmProduct | null>(null)
const productForm = reactive({
  code: '',
  name: '',
  spec: '',
  unit: '',
  purchasePrice: 0,
  supplyPrice: 0,
  safetyStock: 0,
  remark: '',
})

function openProduct(row?: ScmProduct) {
  editingProduct.value = row ?? null
  Object.assign(productForm, {
    code: row?.code ?? '',
    name: row?.name ?? '',
    spec: row?.spec ?? '',
    unit: row?.unit ?? '',
    purchasePrice: row?.purchasePrice ?? 0,
    supplyPrice: row?.supplyPrice ?? 0,
    safetyStock: row?.safetyStock ?? 0,
    remark: row?.remark ?? '',
  })
  productOpen.value = true
}

async function submitProduct() {
  if (!productForm.code.trim()) return message.warning('请填写商品编码')
  if (!productForm.name.trim()) return message.warning('请填写商品名称')
  if (!productForm.unit.trim()) return message.warning('请填写单位')

  const body = {
    code: productForm.code.trim(),
    name: productForm.name.trim(),
    spec: productForm.spec.trim(),
    unit: productForm.unit.trim(),
    ...(priceVisible.value ? { purchasePrice: productForm.purchasePrice ?? 0 } : {}),
    supplyPrice: productForm.supplyPrice ?? 0,
    safetyStock: productForm.safetyStock ?? 0,
    remark: productForm.remark,
  }
  productSaving.value = true
  try {
    if (editingProduct.value) {
      await updateProduct(editingProduct.value.id, body)
      message.success('商品已更新')
    } else {
      await createProduct(body)
      message.success('商品已创建')
    }
    productOpen.value = false
    await loadProducts()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    productSaving.value = false
  }
}

async function doToggleProduct(row: ScmProduct) {
  try {
    await toggleProduct(row.id, !row.enabled)
    message.success(row.enabled ? '已停用，后续采购单不能再选它' : '已启用')
    await loadProducts()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

/* ===== 供应商 ===== */
const suppliers = ref<ScmSupplier[]>([])
const supplierLoading = ref(false)
const supplierKeyword = ref('')

const supplierColumns = [
  { title: '供应商名称', dataIndex: 'name', width: 240 },
  { title: '联系人', dataIndex: 'contact', width: 110 },
  { title: '联系电话', dataIndex: 'phone', width: 140 },
  { title: '状态', key: 'enabled', width: 90 },
  { title: '备注', dataIndex: 'remark', ellipsis: true },
  { title: '操作', key: 'action', width: 120, fixed: 'right' },
]

async function loadSuppliers() {
  supplierLoading.value = true
  try {
    suppliers.value = await listSuppliers({ keyword: supplierKeyword.value || undefined })
  } catch (e: any) {
    message.error(e?.message || '供应商档案加载失败')
  } finally {
    supplierLoading.value = false
  }
}

const supplierOpen = ref(false)
const supplierSaving = ref(false)
const editingSupplier = ref<ScmSupplier | null>(null)
const supplierForm = reactive({ name: '', contact: '', phone: '', remark: '' })

function openSupplier(row?: ScmSupplier) {
  editingSupplier.value = row ?? null
  Object.assign(supplierForm, {
    name: row?.name ?? '',
    contact: row?.contact ?? '',
    phone: row?.phone ?? '',
    remark: row?.remark ?? '',
  })
  supplierOpen.value = true
}

async function submitSupplier() {
  if (!supplierForm.name.trim()) return message.warning('请填写供应商名称')
  const body = {
    name: supplierForm.name.trim(),
    contact: supplierForm.contact.trim(),
    phone: supplierForm.phone.trim(),
    remark: supplierForm.remark,
  }
  supplierSaving.value = true
  try {
    if (editingSupplier.value) {
      await updateSupplier(editingSupplier.value.id, body)
      message.success('供应商已更新')
    } else {
      await createSupplier(body)
      message.success('供应商已创建')
    }
    supplierOpen.value = false
    await loadSuppliers()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    supplierSaving.value = false
  }
}

/** 供应商没有单独的启停接口，直接走编辑接口改 enabled */
async function doToggleSupplier(row: ScmSupplier) {
  try {
    await updateSupplier(row.id, { enabled: !row.enabled })
    message.success(row.enabled ? '已停用' : '已启用')
    await loadSuppliers()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

onMounted(() => {
  loadProducts()
  loadSuppliers()
})
</script>
