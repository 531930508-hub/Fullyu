<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <shop-selector v-model="searchForm.shopId" style="width: 180px" @change="handleShopChange"
                       placeholder="请选择所属门店" class="m-r-10"></shop-selector>
        <el-date-picker
          v-model="searchForm.day"
          align="right" style="width: 180px" class="m-r-10"
          type="date" @change="searchData"
          placeholder="排班日期"
          value-format="yyyy-MM-dd">
        </el-date-picker>
        <el-select v-model="searchForm.status" style="width: 140px" class="m-r-10" @change="handleStatusChange" aria-label="合作状态">
          <el-option :value="1" label="合作中"></el-option>
          <el-option :value="2" label="暂挂"></el-option>
          <el-option :value="0" label="已结束合作"></el-option>
        </el-select>
        <massagist-selector v-model="searchForm.massagistId" style="width: 180px" @selected="selectedMassagit"
                            :shop-id="searchForm.shopId" :filter-status="searchForm.status" clearable
                            placeholder="请选择疗愈师"></massagist-selector>
        <el-button type="primary" icon="el-icon-search" size="medium" style="margin-left: 10px" @click="searchData">查询
        </el-button>
      </div>
      <div>
        <el-button icon="el-icon-plus" @click="handleAdd" type="primary">添加</el-button>
        <el-button icon="el-icon-plus" @click="handleAddTargetShop" type="primary">调店</el-button>
        <el-button icon="el-icon-sort" @click="handleSort" type="primary">排班顺序</el-button>
        <el-button icon="el-icon-delete" @click="handleClearFuture" :loading="clearLoading" :disabled="!searchForm.massagistId || !searchForm.shopId">清除未来排班</el-button>
        <el-button icon="el-icon-document" @click="openChangeLogs">操作记录</el-button>
      </div>
    </div>
    <el-alert v-if="listError" :title="listError" type="error" show-icon :closable="false" class="list-error">
      <el-button type="text" @click="fetchData">重新加载</el-button>
    </el-alert>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column label="所属门店" prop="shopId" width="180">
          <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
        </el-table-column>
        <el-table-column label="接单门店" prop="targetShopId" width="180">
          <template slot-scope="scope">
            <div v-if="!scope.row.targetShopId">
              {{ scope.row.shopId | shopNameFilter }}
            </div>
            <div v-else>
              {{ scope.row.targetShopId | shopNameFilter }}
            </div>

          </template>
        </el-table-column>
        <el-table-column label="疗愈师姓名" prop="massagistName" width="180"></el-table-column>
        <el-table-column label="排班日期" prop="day" width="100"></el-table-column>
        <el-table-column label="排班顺序" prop="sequence">
          <template slot-scope="scope">
            <span>{{ scope.row.sequence || '—' }}</span>
            <span v-if="scope.row.schedulesType==1" class="c-danger">（调店优先）</span>
          </template>
        </el-table-column>
        <el-table-column label="接单开始" prop="startTime">
          <template slot-scope="scope">{{ scope.row.startTime | formatTime }}</template>
        </el-table-column>
        <el-table-column label="接单结束" prop="endTime">
          <template slot-scope="scope">{{ scope.row.endTime | formatTime }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template slot-scope="scope">
            <el-row>
              <el-button
                type="text" icon="el-icon-edit" v-if="scope.row.schedulesType!=1"
                @click="handleUpdate(scope.row,scope.$index)">
                编辑
              </el-button>
              <el-button
                type="text" icon="el-icon-delete"
                @click="handleDelete(scope.row,scope.$index)">删除
              </el-button>
            </el-row>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="pagination-container">
      <el-pagination
        background
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
        layout="total, sizes,prev, pager, next,jumper"
        :page-size="searchForm.size"
        :page-sizes="[5,10,15]"
        hide-on-single-page
        :current-page.sync="searchForm.page"
        :total="total">
      </el-pagination>
    </div>
    <el-drawer title="排班操作记录" :visible.sync="logVisible" size="75%">
      <div class="log-content" v-loading="logLoading">
        <p>门店：{{ logQuery.shopId | shopNameFilter }}。记录保留修改前后值、操作人及操作时间。</p>
        <el-table :data="changeLogs" border>
          <el-table-column type="expand">
            <template slot-scope="scope">
              <div class="snapshot-grid">
                <div><h4>修改前</h4><pre>{{ formatSnapshot(scope.row.before) }}</pre></div>
                <div><h4>修改后</h4><pre>{{ formatSnapshot(scope.row.after) }}</pre></div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="action" label="操作" min-width="120"></el-table-column>
          <el-table-column prop="massagistId" label="疗愈师编号" width="110"></el-table-column>
          <el-table-column prop="operatorName" label="操作人" min-width="120"></el-table-column>
          <el-table-column prop="createTime" label="操作时间" min-width="180"></el-table-column>
        </el-table>
        <el-pagination class="log-pagination" background layout="total, prev, pager, next" :current-page="logQuery.page" :page-size="logQuery.size" :total="logTotal" @current-change="changeLogPage"></el-pagination>
      </div>
    </el-drawer>
    <massagist-schedules-form ref="refMassagistSchedulesForm" @submit-success="searchData"></massagist-schedules-form>
    <massagist-sort-drawer ref="refMassagistSortDrawer" @submit-success="fetchData"></massagist-sort-drawer>
    <massagist-schedules-target-shop-form ref="refMassagistSchedulesTargetShopForm" @submit-success="fetchData"></massagist-schedules-target-shop-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import massagistSchedulesApi from "@/api/massagistSchedules";
import MassagistForm from "@/views/massagist/management/MassagistForm";
import MassagistSchedulesForm from "@/views/massagist/schedules/MassagistSchedulesForm";
import MassagistSchedulesTargetShopForm from "@/views/massagist/schedules/MassagistSchedulesTargetShopForm";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import MassagistSelector from "@/views/massagist/management/MassagitSelector";
import MassagistSortDrawer from './MassagistSortDrawer.vue'
import dateUtil from '../../../utils/dateUtil'

export default {
  name: 'index',
  components: {MassagistSortDrawer, MassagistSelector, ShopSelector, MassagistSchedulesForm, MassagistForm,MassagistSchedulesTargetShopForm},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        day: '',
        status: 1,
        order: '-day',
      },
      dataList: [],
      listLoading: false,
      listError: '',
      listSeq: 0,
      total: 0,
      clearLoading: false,
      logVisible: false,
      logLoading: false,
      changeLogs: [],
      logTotal: 0,
      logQuery: {page: 1, size: 10},
      logRequestId: 0,
    }
  },
  computed: {
    ...mapGetters(['shopId','shopListAll'])
  },
  created() {
    this.$store.dispatch('setShopList')
    this.$store.dispatch('setShopAllList')
    this.searchForm.shopId = this.shopId
    this.searchForm.day = dateUtil.getCurrentDateCode()
    this.searchData()
  },
  methods: {
    searchData() {
      this.searchForm.page = 1
      this.fetchData()

    },
    async fetchData() {
      const seq = ++this.listSeq
      this.listLoading = true
      try {
        const res = await massagistSchedulesApi.page({...this.searchForm})
        if (seq !== this.listSeq) return
        const {list, total} = (res && res.data) || {}
        this.dataList = list || []
        this.total = total || 0
        this.listError = ''
      } catch (e) {
        if (seq !== this.listSeq) return
        this.dataList = []
        this.total = 0
        this.listError = '排班列表加载失败，请重试'
      } finally {
        if (seq === this.listSeq) this.listLoading = false
      }
    },
    async handleClearFuture() {
      if (this.clearLoading) return
      const {massagistId, shopId} = this.searchForm
      if (!massagistId || !shopId) {
        this.$message.warning('请先选择门店和一位疗愈师，不支持整店清除')
        return
      }
      try {
        await this.$confirm('仅清除此疗愈师在所选门店、开始时间尚未到达的排班。历史及已经开始的排班保留。此操作不可撤销，是否确认？', '清除未来排班', {
          confirmButtonText: '确认清除', cancelButtonText: '取消', type: 'warning'
        })
      } catch (error) {
        if (error === 'cancel' || error === 'close') return
        throw error
      }
      this.clearLoading = true
      try {
        const res = await massagistSchedulesApi.clearFuture(massagistId, shopId)
        this.$message.success('已清除 ' + Number(res.data || 0) + ' 条未来排班')
        this.searchData()
      } finally {
        this.clearLoading = false
      }
    },
    async openChangeLogs() {
      if (!this.searchForm.shopId) {
        this.$message.warning('请先选择门店')
        return
      }
      this.logQuery = {shopId: this.searchForm.shopId, massagistId: this.searchForm.massagistId || undefined, page: 1, size: 10}
      this.changeLogs = []
      this.logTotal = 0
      this.logVisible = true
      await this.fetchChangeLogs()
    },
    async fetchChangeLogs() {
      const requestId = ++this.logRequestId
      this.logLoading = true
      try {
        const res = await massagistSchedulesApi.changeLogs({...this.logQuery})
        if (requestId !== this.logRequestId) return
        this.changeLogs = res.data.list || []
        this.logTotal = res.data.total || 0
      } finally {
        if (requestId === this.logRequestId) this.logLoading = false
      }
    },
    changeLogPage(page) {
      this.logQuery.page = page
      this.fetchChangeLogs()
    },
    formatSnapshot(value) {
      return value == null ? '无排班记录' : JSON.stringify(value, null, 2)
    },
    handleStatusChange() {
      this.$set(this.searchForm, 'massagistId', null)
      this.searchData()
    },
    handleSizeChange(val) {
      this.searchForm.size = val;
      this.searchData();
    },
    handleCurrentChange(val) {
      this.searchForm.page = val;
      this.fetchData();
    },
    handleAdd() {
      this.$refs.refMassagistSchedulesForm.open({massagistIdList: []})
    },
    handleSort() {
      this.$refs.refMassagistSortDrawer.open(this.searchForm.day, this.searchForm.shopId)
    },
    handleUpdate(row, index) {
    //  this.$refs.refMassagistSchedulesForm.open({...row, shopId: row.massagistShopId})
      if(row.targetShopId==0){
        this.$refs.refMassagistSchedulesForm.open(row)
      }else {
        this.$refs.refMassagistSchedulesTargetShopForm.open(row)
      }
    },
    async handleDelete(row, index) {
      await this.notifyDelete()
      await massagistSchedulesApi.remove(row.id)
      this.searchData()
      this.notifySuccess()
    },
    handleShopChange() {
      this.$set(this.searchForm, 'massagistId', null)
      this.searchData()
    },
    handleAddTargetShop(){
      this.$refs.refMassagistSchedulesTargetShopForm.open({massagistIdList: []})

    },
    selectedMassagit(item) {
      if (item) {
        this.$set(this.searchForm, 'shopId', item.shopId)
      }
      this.searchData()
    }
  },
  filters: {
    formatTime(timeStr) {
      if (!timeStr) return '';
      const parts = timeStr.split(':');
      if (parts.length < 2) return '';
      const hours = parts[0].padStart(2, '0');
      const minutes = parts[1].padStart(2, '0');
      return `${hours}:${minutes}`;
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 0 20px;
  .operate-container, .operate-container > .flex { flex-wrap: wrap; gap: 10px; }
  .list-error { margin-top: 12px; }
  .log-content { padding: 0 24px 24px; }
  .snapshot-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
  .log-pagination { margin-top: 24px; }
}
@media (max-width: 900px) {
  .index .snapshot-grid { grid-template-columns: 1fr; }
}
</style>
