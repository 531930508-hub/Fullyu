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
            <a-select v-model:value="productType" style="width: 130px" allow-clear placeholder="物料类型" @change="loadProducts">
              <a-select-option v-for="(name, key) in PRODUCT_TYPE_NAMES" :key="key" :value="key">
                {{ name }}
              </a-select-option>
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
            message="商品档案是采购、入库、库存三处共用的基准。采购价用于采购单默认单价与库存成本核算，最近成交价来自实际验收入库，供货价用于总部向分公司供货，安全库存用于库存告警。"
          />

          <a-table
            :data-source="products"
            :columns="productColumns"
            row-key="id"
            :loading="productLoading"
            :scroll="{ x: 1280 }"
            size="small"
            :pagination="{ pageSize: 10, showTotal: (t: number) => `共 ${t} 个商品` }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'type'">
                <a-tag :color="PRODUCT_TYPE_META[record.type as ScmProductType]?.color">
                  {{ PRODUCT_TYPE_META[record.type as ScmProductType]?.text }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'purchasePrice'">
                <template v-if="priceVisible">¥{{ money(record.purchasePrice) }}</template>
                <span v-else class="sub-text">—</span>
              </template>
              <template v-else-if="column.key === 'latestPrice'">
                <template v-if="priceVisible">
                  <span v-if="record.latestPurchasePrice != null">¥{{ money(record.latestPurchasePrice) }}</span>
                  <span v-else class="sub-text">暂无成交</span>
                </template>
                <span v-else class="sub-text">—</span>
              </template>
              <template v-else-if="column.key === 'supplyPrice'">¥{{ money(record.supplyPrice) }}</template>
              <template v-else-if="column.key === 'shelfLife'">
                <span v-if="record.shelfLifeDays > 0">{{ record.shelfLifeDays }} 天</span>
                <span v-else class="sub-text">不管理</span>
              </template>
              <template v-else-if="column.key === 'enabled'">
                <a-tag :color="record.enabled ? 'green' : 'default'">{{ record.enabled ? '启用中' : '已停用' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space :size="12">
                  <a v-if="priceVisible" @click="openPrices(record)">价格</a>
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
              <template v-if="column.key === 'isProcessor'">
                <a-tag v-if="record.isProcessor" color="orange">代工厂</a-tag>
                <span v-else class="sub-text">—</span>
              </template>
              <template v-else-if="column.key === 'enabled'">
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

      <!-- ============ 库存地点 ============ -->
      <a-tab-pane v-if="canViewLocations" key="location" tab="库存地点">
        <a-card>
          <a-space style="margin-bottom: 16px" wrap>
            <a-input-search
              v-model:value="locationKeyword"
              placeholder="搜索地点名称"
              style="width: 220px"
              allow-clear
              @search="loadLocations"
            />
            <a-select v-model:value="locationType" style="width: 130px" allow-clear placeholder="类型" @change="loadLocations">
              <a-select-option v-for="(name, key) in LOCATION_TYPE_NAMES" :key="key" :value="key">
                {{ name }}
              </a-select-option>
            </a-select>
            <a-checkbox v-model:checked="locationIncludeDisabled" @change="loadLocations">含已停用</a-checkbox>
            <a-button v-perm="'scm:location:update'" type="primary" @click="openLocation()">
              <template #icon><PlusOutlined /></template>
              新建地点
            </a-button>
          </a-space>

          <a-alert
            type="info"
            show-icon
            style="margin-bottom: 16px"
            message="自有仓自动对应已开启仓库的组织；供应商处、代工厂处是「货在对方现场、但物权属于我们」的存放点；在途用于跨地点运输。库存、调拨、盘点都按地点记账，物权组织决定数据可见范围。"
          />

          <a-table
            :data-source="locations"
            :columns="locationColumns"
            row-key="id"
            :loading="locationLoading"
            :scroll="{ x: 950 }"
            size="small"
            :pagination="{ pageSize: 10 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'type'">
                <a-tag :color="LOCATION_TYPE_META[record.type as ScmLocationType]?.color">
                  {{ LOCATION_TYPE_META[record.type as ScmLocationType]?.text }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'enabled'">
                <a-tag :color="record.enabled ? 'green' : 'default'">{{ record.enabled ? '启用中' : '已停用' }}</a-tag>
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space :size="12">
                  <a v-perm="'scm:location:update'" @click="openLocation(record)">编辑</a>
                  <a v-perm="'scm:location:update'" @click="doToggleLocation(record)">
                    {{ record.enabled ? '停用' : '启用' }}
                  </a>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>

      <!-- ============ BOM 配方 ============ -->
      <a-tab-pane v-if="canViewBoms" key="bom" tab="BOM 配方">
        <a-card>
          <a-space style="margin-bottom: 16px" wrap>
            <a-input-search
              v-model:value="bomKeyword"
              placeholder="搜索成品编码/名称"
              style="width: 220px"
              allow-clear
              @search="loadBoms"
            />
            <a-select v-model:value="bomStatus" style="width: 130px" allow-clear placeholder="版本状态" @change="loadBoms">
              <a-select-option value="ACTIVE">生效中</a-select-option>
              <a-select-option value="ARCHIVED">已归档</a-select-option>
            </a-select>
            <a-button v-perm="'scm:bom:update'" type="primary" @click="openBom()">
              <template #icon><PlusOutlined /></template>
              新建/更新配方
            </a-button>
          </a-space>

          <a-alert
            type="info"
            show-icon
            style="margin-bottom: 16px"
            message="每个成品只保留一版生效配方，保存新配方会自动归档旧版并升版本号。生产工单下单时快照配方与用量，之后改配方不影响在产工单。单层 BOM：若半成品还要再拆，请给它单独维护一版配方。"
          />

          <a-table
            :data-source="boms"
            :columns="bomColumns"
            row-key="id"
            :loading="bomLoading"
            :scroll="{ x: 1000 }"
            size="small"
            :pagination="{ pageSize: 10 }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'status'">
                <a-tag :color="record.status === 'ACTIVE' ? 'green' : 'default'">
                  {{ record.status === 'ACTIVE' ? '生效中' : '已归档' }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'version'">v{{ record.version }}</template>
              <template v-else-if="column.key === 'itemCount'">{{ record.items.length }} 项</template>
              <template v-else-if="column.key === 'unitCost'">
                <template v-if="record.costVisible">¥{{ money(record.unitCost) }}</template>
                <span v-else class="sub-text">—</span>
              </template>
              <template v-else-if="column.key === 'createdAt'">{{ dt(record.createdAt) }}</template>
              <template v-else-if="column.key === 'action'">
                <a-space :size="12">
                  <a v-perm="'scm:bom:update'" @click="openBomFromRecord(record)">以新版重提</a>
                  <a
                    v-if="record.status === 'ACTIVE'"
                    v-perm="'scm:bom:update'"
                    class="danger-link"
                    @click="doArchiveBom(record)"
                  >
                    归档
                  </a>
                </a-space>
              </template>
            </template>
            <template #expandedRowRender="{ record }">
              <a-table
                :data-source="record.items"
                :columns="bomItemColumns"
                row-key="componentId"
                size="small"
                :pagination="false"
              >
                <template #bodyCell="{ column: itemColumn, record: item }">
                  <template v-if="itemColumn.key === 'qtyPerUnit'">
                    {{ item.qtyPerUnit }} {{ item.unit }} / {{ record.productUnit }}
                  </template>
                  <template v-else-if="itemColumn.key === 'lossRate'">
                    {{ (item.lossRate * 100).toFixed(2) }}%
                  </template>
                  <template v-else-if="itemColumn.key === 'unitPrice'">
                    <template v-if="record.costVisible">¥{{ money(item.unitPrice) }}</template>
                    <span v-else class="sub-text">—</span>
                  </template>
                  <template v-else-if="itemColumn.key === 'amount'">
                    <template v-if="record.costVisible">¥{{ money(item.amount) }}</template>
                    <span v-else class="sub-text">—</span>
                  </template>
                </template>
              </a-table>
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
          <a-col :span="8">
            <a-form-item label="物料类型" help="原料/包材用于 BOM；成品可生产入库">
              <a-select v-model:value="productForm.type">
                <a-select-option v-for="(name, key) in PRODUCT_TYPE_NAMES" :key="key" :value="key">
                  {{ name }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="规格">
              <a-input v-model:value="productForm.spec" placeholder="如 60×80cm / 100片" />
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="单位" required>
              <a-input v-model:value="productForm.unit" placeholder="如 包 / 件 / 瓶 / kg" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col v-if="priceVisible" :span="8">
            <a-form-item label="采购价（元）" help="没有历史成交价时作为默认单价">
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
        <a-row :gutter="16">
          <a-col :span="8">
            <a-form-item label="保质期（天）" help="0 表示不管理效期；入库未填到期日时按生产日期自动推算">
              <a-input-number v-model:value="productForm.shelfLifeDays" :min="0" :precision="0" style="width: 100%" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="备注">
          <a-textarea v-model:value="productForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 采购价历史 -->
    <a-drawer
      v-model:open="priceOpen"
      :title="`采购价记录 · ${priceProduct?.name ?? ''}`"
      width="760px"
    >
      <a-alert
        type="info"
        show-icon
        style="margin-bottom: 16px"
        message="外部验收入库会自动记录一条成交价；也可在这里手工补录。新采购单与工单取最近一条已生效价格，历史批次成本不受调价影响。"
      />
      <a-space style="margin-bottom: 16px" wrap>
        <a-select
          v-model:value="priceForm.supplierId"
          style="width: 200px"
          allow-clear
          placeholder="供应商（可选）"
          :options="supplierOptions.map((s) => ({ value: s.id, label: s.name }))"
          show-search
          option-filter-prop="label"
        />
        <a-input-number
          v-model:value="priceForm.price"
          :min="0"
          :precision="2"
          placeholder="单价（元）"
          style="width: 130px"
        />
        <a-date-picker
          v-model:value="priceForm.effectiveFrom"
          value-format="YYYY-MM-DD"
          style="width: 150px"
          placeholder="生效日期"
        />
        <a-input v-model:value="priceForm.remark" placeholder="备注" style="width: 160px" />
        <a-button type="primary" :loading="priceSaving" @click="submitPrice">记录价格</a-button>
      </a-space>
      <a-table
        :data-source="priceData?.rows ?? []"
        :columns="priceColumns"
        row-key="id"
        :loading="priceLoading"
        size="small"
        :pagination="{ pageSize: 10, showTotal: (t: number) => `共 ${t} 条` }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'price'">¥{{ money(record.price) }}</template>
          <template v-else-if="column.key === 'source'">
            <a-tag :color="record.source === 'RECEIPT' ? 'blue' : 'default'">
              {{ PRICE_SOURCE_NAMES[record.source as ScmPriceSource] }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'supplier'">
            {{ record.supplierName || '未指定' }}
          </template>
          <template v-else-if="column.key === 'effectiveFrom'">
            {{ record.effectiveFrom?.slice(0, 10) }}
          </template>
          <template v-else-if="column.key === 'createdAt'">{{ dt(record.createdAt) }}</template>
        </template>
      </a-table>
      <div class="archive-price">
        档案采购价：<template v-if="priceData">¥{{ money(priceData.archivePrice) }}</template>
      </div>
    </a-drawer>

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
        <a-form-item label="是否代工厂" help="勾选后可以为其建立「代工厂处」库存地点并下委外工单">
          <a-switch v-model:checked="supplierForm.isProcessor" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="supplierForm.remark" :rows="2" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 库存地点编辑 -->
    <a-modal
      v-model:open="locationOpen"
      :title="editingLocation ? '编辑库存地点' : '新建库存地点'"
      width="560px"
      :confirm-loading="locationSaving"
      @ok="submitLocation"
    >
      <a-form layout="vertical">
        <a-form-item label="地点类型" required>
          <a-select v-model:value="locationForm.type" :disabled="!!editingLocation" @change="onLocationTypeChange">
            <a-select-option v-for="(name, key) in LOCATION_TYPE_NAMES" :key="key" :value="key">
              {{ name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="物权归属组织" required help="库存数据按这个组织做行级可见性隔离">
          <a-select
            v-model:value="locationForm.orgId"
            :disabled="!!editingLocation"
            placeholder="选择组织"
            show-search
            option-filter-prop="label"
          >
            <a-select-option v-for="org in warehouseOrgs" :key="org.id" :value="org.id" :label="org.name">
              {{ org.shortName || org.name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="locationForm.type === 'SUPPLIER' || locationForm.type === 'FACTORY'" label="合作方" required>
          <a-select
            v-model:value="locationForm.supplierId"
            :disabled="!!editingLocation"
            placeholder="选择供应商或代工厂"
            show-search
            option-filter-prop="label"
          >
            <a-select-option
              v-for="sup in supplierOptions"
              :key="sup.id"
              :value="sup.id"
              :label="sup.name"
              :disabled="locationForm.type === 'FACTORY' && !sup.isProcessor"
            >
              {{ sup.name }}{{ sup.isProcessor ? '（可代工）' : '' }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="地点名称">
          <a-input v-model:value="locationForm.name" placeholder="留空则按组织/合作方自动命名" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="locationForm.remark" :rows="2" />
        </a-form-item>
        <a-form-item v-if="editingLocation" label="状态">
          <a-switch v-model:checked="locationForm.enabled" checked-children="启用" un-checked-children="停用" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- BOM 编辑 -->
    <a-modal
      v-model:open="bomOpen"
      title="新建/更新 BOM 配方"
      width="900px"
      :confirm-loading="bomSaving"
      @ok="submitBom"
    >
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="14">
            <a-form-item label="成品" required>
              <a-select
                v-model:value="bomForm.productId"
                placeholder="选择成品或半成品"
                show-search
                option-filter-prop="label"
              >
                <a-select-option
                  v-for="p in bomProducts"
                  :key="p.id"
                  :value="p.id"
                  :label="`${p.code} ${p.name}`"
                >
                  {{ p.code }} · {{ p.name }}{{ p.spec ? ` / ${p.spec}` : '' }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="10">
            <a-form-item label="预计单位成本">
              <div class="bom-cost">
                <template v-if="priceVisible">¥{{ money(bomUnitCost) }}</template>
                <span v-else class="sub-text">无价格权限，暂不可见</span>
              </div>
            </a-form-item>
          </a-col>
        </a-row>

        <a-form-item label="组件明细" required>
          <div v-for="(item, index) in bomForm.items" :key="index" class="bom-item-row">
            <a-select
              v-model:value="item.componentId"
              placeholder="组件"
              show-search
              option-filter-prop="label"
              style="flex: 2.4"
            >
              <a-select-option
                v-for="p in bomComponentOptions"
                :key="p.id"
                :value="p.id"
                :label="`${p.code} ${p.name}`"
              >
                {{ p.code }} · {{ p.name }}{{ p.spec ? ` / ${p.spec}` : '' }}
              </a-select-option>
            </a-select>
            <a-input-number
              v-model:value="item.qtyPerUnit"
              :min="0"
              :precision="4"
              placeholder="单位用量"
              style="flex: 1"
            />
            <a-input-number
              v-model:value="item.lossPercent"
              :min="0"
              :max="100"
              :precision="2"
              placeholder="损耗%"
              style="flex: 1"
            />
            <a-input v-model:value="item.remark" placeholder="备注" style="flex: 1.4" />
            <a-button type="text" danger :disabled="bomForm.items.length <= 1" @click="removeBomItem(index)">
              删除
            </a-button>
          </div>
          <a-button type="dashed" block style="margin-top: 8px" @click="addBomItem">
            <template #icon><PlusOutlined /></template>
            添加组件
          </a-button>
        </a-form-item>
        <a-alert
          type="info"
          show-icon
          message="单位用量按「每 1 个成品消耗多少组件」填写，支持小数（如 0.12 kg）；损耗率填百分比，系统按 用量 ×（1+损耗率）计算应领量。"
        />
        <a-form-item label="备注" style="margin-top: 16px">
          <a-textarea v-model:value="bomForm.remark" :rows="2" />
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
  archiveBom,
  createLocation,
  createProduct,
  createProductPrice,
  createSupplier,
  listBoms,
  listLocations,
  listProductPrices,
  listProducts,
  listSuppliers,
  saveBom,
  toggleProduct,
  updateLocation,
  updateProduct,
  updateSupplier,
} from '@/api/scm'
import type {
  ProductPriceHistory,
  ScmBom,
  ScmLocation,
  ScmProduct,
  ScmSupplier,
} from '@/api/scm'
import type { ScmLocationType, ScmPriceSource, ScmProductType } from '@fullyu/shared'
import {
  LOCATION_TYPE_META,
  LOCATION_TYPE_NAMES,
  PRICE_SOURCE_NAMES,
  PRODUCT_TYPE_META,
  PRODUCT_TYPE_NAMES,
} from '@fullyu/shared'
import { listOrgOptions } from '@/api/org'
import type { OrgOption } from '@/api/org'
import { dt, money } from '@/utils/format'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
/** 采购价属于总部对外采购口径，无权限时列与输入框都不渲染 */
const priceVisible = computed(() => auth.hasPerm('scm:po:price'))
/** 新增标签页各自有独立权限，没权限时不渲染也不请求，避免 403 打扰 */
const canViewLocations = computed(() => auth.hasPerm('scm:location:view'))
const canViewBoms = computed(() => auth.hasPerm('scm:bom:view'))

const tab = ref('product')

/* ===== 商品 ===== */
const products = ref<ScmProduct[]>([])
const productLoading = ref(false)
const productKeyword = ref('')
const productEnabled = ref<boolean | undefined>(undefined)
const productType = ref<ScmProductType | undefined>(undefined)

const productColumns = computed(() =>
  [
    { title: '编码', dataIndex: 'code', width: 120 },
    { title: '名称', dataIndex: 'name', width: 180 },
    { title: '类型', key: 'type', width: 90 },
    { title: '规格', dataIndex: 'spec', width: 150 },
    { title: '单位', dataIndex: 'unit', width: 70 },
    ...(priceVisible.value ? [{ title: '采购价', key: 'purchasePrice', width: 100 }] : []),
    ...(priceVisible.value ? [{ title: '最近成交', key: 'latestPrice', width: 100 }] : []),
    { title: '供货价', key: 'supplyPrice', width: 100 },
    { title: '安全库存', dataIndex: 'safetyStock', width: 90 },
    { title: '保质期', key: 'shelfLife', width: 90 },
    { title: '状态', key: 'enabled', width: 90 },
    { title: '备注', dataIndex: 'remark', ellipsis: true },
    { title: '操作', key: 'action', width: 160, fixed: 'right' as const },
  ],
)

async function loadProducts() {
  productLoading.value = true
  try {
    products.value = await listProducts({
      keyword: productKeyword.value || undefined,
      enabled: productEnabled.value,
      type: productType.value,
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
  type: 'CONSUMABLE' as ScmProductType,
  spec: '',
  unit: '',
  purchasePrice: 0,
  supplyPrice: 0,
  safetyStock: 0,
  shelfLifeDays: 0,
  remark: '',
})

function openProduct(row?: ScmProduct) {
  editingProduct.value = row ?? null
  Object.assign(productForm, {
    code: row?.code ?? '',
    name: row?.name ?? '',
    type: row?.type ?? 'CONSUMABLE',
    spec: row?.spec ?? '',
    unit: row?.unit ?? '',
    purchasePrice: row?.purchasePrice ?? 0,
    supplyPrice: row?.supplyPrice ?? 0,
    safetyStock: row?.safetyStock ?? 0,
    shelfLifeDays: row?.shelfLifeDays ?? 0,
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
    type: productForm.type,
    spec: productForm.spec.trim(),
    unit: productForm.unit.trim(),
    ...(priceVisible.value ? { purchasePrice: productForm.purchasePrice ?? 0 } : {}),
    supplyPrice: productForm.supplyPrice ?? 0,
    safetyStock: productForm.safetyStock ?? 0,
    shelfLifeDays: productForm.shelfLifeDays ?? 0,
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
    await Promise.all([loadProducts(), loadCatalog()])
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
    await Promise.all([loadProducts(), loadCatalog()])
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

/* ===== 采购价历史 ===== */
const priceOpen = ref(false)
const priceLoading = ref(false)
const priceSaving = ref(false)
const priceProduct = ref<ScmProduct | null>(null)
const priceData = ref<ProductPriceHistory | null>(null)
const priceForm = reactive({
  supplierId: undefined as string | undefined,
  price: 0,
  effectiveFrom: todayStr(),
  remark: '',
})

const priceColumns = [
  { title: '供应商', key: 'supplier', width: 170 },
  { title: '来源', key: 'source', width: 100 },
  { title: '单价', key: 'price', width: 100 },
  { title: '生效日期', key: 'effectiveFrom', width: 110 },
  { title: '备注', dataIndex: 'remark', ellipsis: true },
  { title: '记录时间', key: 'createdAt', width: 160 },
]

function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

async function openPrices(row: ScmProduct) {
  priceProduct.value = row
  priceData.value = null
  Object.assign(priceForm, {
    supplierId: undefined,
    price: row.latestPurchasePrice ?? row.purchasePrice ?? 0,
    effectiveFrom: todayStr(),
    remark: '',
  })
  priceOpen.value = true
  await loadPrices()
}

async function loadPrices() {
  if (!priceProduct.value) return
  priceLoading.value = true
  try {
    priceData.value = await listProductPrices(priceProduct.value.id)
  } catch (e: any) {
    message.error(e?.message || '价格记录加载失败')
  } finally {
    priceLoading.value = false
  }
}

async function submitPrice() {
  if (!priceProduct.value) return
  if (!(Number(priceForm.price) > 0)) return message.warning('请填写大于 0 的单价')
  priceSaving.value = true
  try {
    await createProductPrice(priceProduct.value.id, {
      supplierId: priceForm.supplierId,
      price: Number(priceForm.price),
      effectiveFrom: priceForm.effectiveFrom,
      remark: priceForm.remark,
    })
    message.success('价格已记录，后续新单据将优先取用')
    Object.assign(priceForm, { supplierId: undefined, remark: '' })
    await Promise.all([loadPrices(), loadProducts()])
  } catch (e: any) {
    message.error(e?.message || '记录失败')
  } finally {
    priceSaving.value = false
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
  { title: '代工厂', key: 'isProcessor', width: 90 },
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
const supplierForm = reactive({ name: '', contact: '', phone: '', isProcessor: false, remark: '' })

function openSupplier(row?: ScmSupplier) {
  editingSupplier.value = row ?? null
  Object.assign(supplierForm, {
    name: row?.name ?? '',
    contact: row?.contact ?? '',
    phone: row?.phone ?? '',
    isProcessor: row?.isProcessor ?? false,
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
    isProcessor: supplierForm.isProcessor,
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

/* ===== 库存地点 ===== */
const locations = ref<ScmLocation[]>([])
const locationLoading = ref(false)
const locationKeyword = ref('')
const locationType = ref<ScmLocationType | undefined>(undefined)
const locationIncludeDisabled = ref(false)
const warehouseOrgs = ref<OrgOption[]>([])

const locationColumns = [
  { title: '地点名称', dataIndex: 'name', width: 220 },
  { title: '类型', key: 'type', width: 110 },
  { title: '物权组织', dataIndex: 'orgName', width: 140 },
  { title: '合作方', dataIndex: 'supplierName', width: 180 },
  { title: '状态', key: 'enabled', width: 90 },
  { title: '备注', dataIndex: 'remark', ellipsis: true },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const },
]

const supplierOptions = computed(() => suppliers.value)

async function loadLocations() {
  locationLoading.value = true
  try {
    locations.value = await listLocations({
      keyword: locationKeyword.value || undefined,
      type: locationType.value,
      includeDisabled: locationIncludeDisabled.value,
    })
  } catch (e: any) {
    message.error(e?.message || '库存地点加载失败')
  } finally {
    locationLoading.value = false
  }
}

const locationOpen = ref(false)
const locationSaving = ref(false)
const editingLocation = ref<ScmLocation | null>(null)
const locationForm = reactive({
  type: 'SUPPLIER' as ScmLocationType,
  orgId: undefined as string | undefined,
  supplierId: undefined as string | undefined,
  name: '',
  remark: '',
  enabled: true,
})

function onLocationTypeChange() {
  if (locationForm.type === 'OWN' || locationForm.type === 'TRANSIT') {
    locationForm.supplierId = undefined
  }
}

function openLocation(row?: ScmLocation) {
  editingLocation.value = row ?? null
  Object.assign(locationForm, {
    type: row?.type ?? 'SUPPLIER',
    orgId: row?.orgId ?? auth.org?.id ?? undefined,
    supplierId: row?.supplierId ?? undefined,
    name: row?.name ?? '',
    remark: row?.remark ?? '',
    enabled: row?.enabled ?? true,
  })
  locationOpen.value = true
}

async function submitLocation() {
  if (!locationForm.orgId) return message.warning('请选择物权归属组织')
  if (
    (locationForm.type === 'SUPPLIER' || locationForm.type === 'FACTORY') &&
    !locationForm.supplierId
  ) {
    return message.warning('请选择合作方')
  }
  locationSaving.value = true
  try {
    if (editingLocation.value) {
      await updateLocation(editingLocation.value.id, {
        name: locationForm.name.trim() || undefined,
        remark: locationForm.remark,
        enabled: locationForm.enabled,
      })
      message.success('地点已更新')
    } else {
      await createLocation({
        type: locationForm.type,
        orgId: locationForm.orgId,
        supplierId: locationForm.supplierId,
        name: locationForm.name.trim() || undefined,
        remark: locationForm.remark,
      })
      message.success('地点已创建')
    }
    locationOpen.value = false
    await loadLocations()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    locationSaving.value = false
  }
}

async function doToggleLocation(row: ScmLocation) {
  try {
    await updateLocation(row.id, { enabled: !row.enabled })
    message.success(row.enabled ? '已停用' : '已启用')
    await loadLocations()
  } catch (e: any) {
    message.error(e?.message || '操作失败')
  }
}

/* ===== BOM ===== */
const boms = ref<ScmBom[]>([])
const bomLoading = ref(false)
const bomKeyword = ref('')
const bomStatus = ref<'ACTIVE' | 'ARCHIVED' | undefined>(undefined)
/** 全量启用商品，供 BOM 下拉用，不受商品页筛选影响 */
const productCatalog = ref<ScmProduct[]>([])

const bomColumns = [
  { title: '成品编码', dataIndex: 'productCode', width: 120 },
  { title: '成品名称', dataIndex: 'productName', width: 180 },
  { title: '规格', dataIndex: 'productSpec', width: 150 },
  { title: '版本', key: 'version', width: 80 },
  { title: '状态', key: 'status', width: 90 },
  { title: '组件数', key: 'itemCount', width: 80 },
  { title: '单位成本', key: 'unitCost', width: 110 },
  { title: '创建人', dataIndex: 'createdBy', width: 100 },
  { title: '创建时间', key: 'createdAt', width: 160 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const },
]

const bomItemColumns = computed(() => [
  { title: '组件编码', dataIndex: 'code', width: 120 },
  { title: '组件名称', dataIndex: 'name', width: 180 },
  { title: '规格', dataIndex: 'spec' },
  { title: '单位用量', key: 'qtyPerUnit', width: 180 },
  { title: '损耗率', key: 'lossRate', width: 90 },
  ...(priceVisible.value
    ? [
        { title: '参考单价', key: 'unitPrice', width: 110 },
        { title: '成本贡献', key: 'amount', width: 110 },
      ]
    : []),
  { title: '备注', dataIndex: 'remark' },
])

const bomProducts = computed(() =>
  productCatalog.value.filter((p) => p.type !== 'RAW' && p.type !== 'PACK'),
)
const bomComponentOptions = computed(() =>
  productCatalog.value.filter((p) => p.type !== 'FINISHED' && p.id !== bomForm.productId),
)

const bomOpen = ref(false)
const bomSaving = ref(false)
const bomForm = reactive({
  productId: '',
  remark: '',
  items: [{ componentId: undefined as string | undefined, qtyPerUnit: 1, lossPercent: 0, remark: '' }],
})

const bomUnitCost = computed(() =>
  bomForm.items.reduce((sum, item) => {
    const component = productCatalog.value.find((p) => p.id === item.componentId)
    if (!component || component.purchasePrice == null) return sum
    const qty = Number(item.qtyPerUnit) || 0
    const loss = (Number(item.lossPercent) || 0) / 100
    return sum + qty * (1 + loss) * Number(component.purchasePrice)
  }, 0),
)

function addBomItem() {
  bomForm.items.push({ componentId: undefined, qtyPerUnit: 1, lossPercent: 0, remark: '' })
}

function removeBomItem(index: number) {
  bomForm.items.splice(index, 1)
}

function resetBomForm() {
  bomForm.productId = ''
  bomForm.remark = ''
  bomForm.items = [{ componentId: undefined, qtyPerUnit: 1, lossPercent: 0, remark: '' }]
}

function openBom() {
  resetBomForm()
  bomOpen.value = true
}

function openBomFromRecord(row: ScmBom) {
  bomForm.productId = row.productId
  bomForm.remark = row.remark
  bomForm.items = row.items.map((it) => ({
    componentId: it.componentId,
    qtyPerUnit: it.qtyPerUnit,
    lossPercent: Number((it.lossRate * 100).toFixed(4)),
    remark: it.remark,
  }))
  bomOpen.value = true
}

async function loadBoms() {
  bomLoading.value = true
  try {
    boms.value = await listBoms({
      keyword: bomKeyword.value || undefined,
      status: bomStatus.value,
    })
  } catch (e: any) {
    message.error(e?.message || 'BOM 加载失败')
  } finally {
    bomLoading.value = false
  }
}

async function submitBom() {
  if (!bomForm.productId) return message.warning('请选择成品')
  const items = bomForm.items.filter((it) => it.componentId)
  if (!items.length) return message.warning('请至少添加一条组件')
  if (items.some((it) => !(Number(it.qtyPerUnit) > 0))) {
    return message.warning('单位用量必须大于 0')
  }
  if (new Set(items.map((it) => it.componentId)).size !== items.length) {
    return message.warning('同一组件只能出现一次，请合并用量')
  }
  bomSaving.value = true
  try {
    await saveBom({
      productId: bomForm.productId,
      remark: bomForm.remark,
      items: items.map((it) => ({
        componentId: it.componentId!,
        qtyPerUnit: Number(it.qtyPerUnit),
        lossRate: (Number(it.lossPercent) || 0) / 100,
        remark: it.remark,
      })),
    })
    message.success('配方已保存，旧版本已自动归档')
    bomOpen.value = false
    await loadBoms()
  } catch (e: any) {
    message.error(e?.message || '保存失败')
  } finally {
    bomSaving.value = false
  }
}

async function doArchiveBom(row: ScmBom) {
  try {
    await archiveBom(row.id)
    message.success('已归档，不再用于新工单')
    await loadBoms()
  } catch (e: any) {
    message.error(e?.message || '归档失败')
  }
}

async function loadCatalog() {
  try {
    productCatalog.value = await listProducts({ enabled: true })
  } catch {
    productCatalog.value = []
  }
}

onMounted(() => {
  loadProducts()
  loadSuppliers()
  if (canViewBoms.value) {
    loadCatalog()
    loadBoms()
  }
  if (canViewLocations.value) {
    loadLocations()
    listOrgOptions({ warehouse: 1 })
      .then((rows) => {
        warehouseOrgs.value = rows
      })
      .catch(() => {
        warehouseOrgs.value = []
      })
  }
})
</script>

<style scoped>
.bom-item-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.bom-cost {
  font-size: 20px;
  font-weight: 600;
  line-height: 32px;
}

.sub-text {
  color: #999;
}

.danger-link {
  color: #ff4d4f;
}

.archive-price {
  margin-top: 16px;
  color: #999;
  font-size: 12px;
}
</style>
