<template>
  <el-drawer :visible.sync="showDrawer" :title="`${title}-疗愈师偏好`" size="600px" @close="reset">
    <div class="customer-therapist-drawer">
      <el-tabs v-model="activeTab" @tab-click="searchData">
        <el-tab-pane label="收藏的疗愈师" name="favorite"></el-tab-pane>
        <el-tab-pane label="暂别的疗愈师" name="block"></el-tab-pane>
      </el-tabs>

      <div v-if="activeTab === 'block'" class="tab-tip">
        暂别 = 该客户不想再被分配到这位疗愈师。对客建议话术：「帮您先避开这位疗愈师」。
        客户本人与门店后台都可设置，疗愈师端无感知。
      </div>

      <div class="toolbar">
        <el-button v-if="!adding" type="primary" size="small" icon="el-icon-plus" @click="startAdd">
          {{ activeTab === 'favorite' ? '代客户添加收藏' : '代客户添加暂别' }}
        </el-button>
        <div v-else class="add-row">
          <MassagistSelector v-model="addMassagistId" :filter-status="1" placeholder="选择疗愈师" clearable
                             style="flex: 1"></MassagistSelector>
          <el-button type="primary" size="small" :loading="saving" @click="handleAdd">添加</el-button>
          <el-button size="small" @click="cancelAdd">取消</el-button>
        </div>
      </div>

      <el-table :data="tableData" size="medium" border>
        <el-table-column label="疗愈师" min-width="120">
          <template slot-scope="scope">
            <span v-if="scope.row.massagist">{{ scope.row.massagist.name }}</span>
            <span v-else class="empty-text">已删除</span>
            <el-tag v-if="scope.row.massagist && scope.row.massagist.status === 0" size="mini" type="info"
                    style="margin-left: 6px">已离职</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="门店" min-width="120">
          <template slot-scope="scope">
            <span v-if="scope.row.massagist">{{ scope.row.massagist.shopId | shopNameFilter }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column v-if="activeTab === 'block'" label="来源" min-width="150">
          <template slot-scope="scope">
            <span v-if="scope.row.source === 1">客户本人</span>
            <span v-else-if="scope.row.source === 2">门店后台{{ scope.row.createBy ? '·' + scope.row.createBy : '' }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="设置时间" prop="createTime" min-width="150"></el-table-column>
        <el-table-column label="操作" width="90" align="center">
          <template slot-scope="scope">
            <span class="c-danger hover-click" @click="handleRemove(scope.row)">移除</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          background
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          layout="total, sizes, prev, pager, next"
          :page-size="searchForm.size"
          :page-sizes="[5, 10, 15]"
          hide-on-single-page
          :current-page.sync="searchForm.page"
          :total="total">
        </el-pagination>
      </div>
    </div>
  </el-drawer>
</template>

<script>
import MassagistSelector from '@/views/massagist/management/MassagitSelector'
import customerMassagistBlockApi from '@/api/customer/customerMassagistBlock'
import customerMassagistRelationApi from '@/api/customer/customerMassagistRelation'

export default {
  name: 'CustomerTherapistDrawer',
  components: {MassagistSelector},
  data() {
    return {
      showDrawer: false,
      customerId: null,
      title: '',
      activeTab: 'favorite',
      adding: false,
      addMassagistId: null,
      saving: false,
      searchForm: {
        page: 1,
        size: 10
      },
      tableData: [],
      total: 0
    }
  },
  methods: {
    open(customerId, title) {
      this.customerId = customerId
      this.title = title || ''
      this.activeTab = 'favorite'
      this.searchForm.page = 1
      this.adding = false
      this.addMassagistId = null
      this.showDrawer = true
      this.fetchData()
    },
    reset() {
      this.customerId = null
      this.tableData = []
      this.total = 0
      this.adding = false
      this.addMassagistId = null
    },
    searchData() {
      this.searchForm.page = 1
      this.adding = false
      this.addMassagistId = null
      this.fetchData()
    },
    async fetchData() {
      const res = this.activeTab === 'favorite'
        ? await customerMassagistRelationApi.page({...this.searchForm, customerId: this.customerId})
        : await customerMassagistBlockApi.page({...this.searchForm, customerId: this.customerId})
      const data = res.data || {}
      this.tableData = data.list || []
      this.total = data.total || 0
    },
    handleSizeChange(val) {
      this.searchForm.size = val
      this.searchData()
    },
    handleCurrentChange(val) {
      this.searchForm.page = val
      this.fetchData()
    },
    startAdd() {
      this.adding = true
      this.addMassagistId = null
    },
    cancelAdd() {
      this.adding = false
      this.addMassagistId = null
    },
    async handleAdd() {
      if (!this.addMassagistId) {
        this.notifyWarning('请选择疗愈师')
        return
      }
      const exist = this.tableData.some(row => String(row.massagistId) === String(this.addMassagistId))
      if (exist) {
        this.notifyWarning('该疗愈师已在当前列表中')
        return
      }
      this.saving = true
      try {
        if (this.activeTab === 'favorite') {
          await customerMassagistRelationApi.create({
            customerId: this.customerId,
            massagistId: this.addMassagistId
          })
        } else {
          await customerMassagistBlockApi.create({
            customerId: this.customerId,
            massagistId: this.addMassagistId,
            source: 2
          })
        }
        this.notifySuccess()
        this.cancelAdd()
        this.searchData()
        this.$emit('change')
      } finally {
        this.saving = false
      }
    },
    async handleRemove(row) {
      const content = this.activeTab === 'favorite'
        ? '确定移除该客户的这位收藏疗愈师吗？'
        : '确定解除该客户对这位疗愈师的暂别吗？'
      await this.notifyConfirm(content)
      if (this.activeTab === 'favorite') {
        await customerMassagistRelationApi.remove(row.id)
      } else {
        await customerMassagistBlockApi.remove(row.id)
      }
      this.notifySuccess()
      this.fetchData()
      this.$emit('change')
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.customer-therapist-drawer {
  padding: 0 20px;
}

.tab-tip {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #F4F1FA;
  color: #6750A4;
  font-size: 13px;
  line-height: 1.6;
}

.toolbar {
  margin-bottom: 12px;
  min-height: 32px;
}

.add-row {
  display: flex;
  align-items: center;
}

.add-row .el-button {
  margin-left: 8px;
}

.empty-text {
  color: #B3AFA9;
}
</style>
