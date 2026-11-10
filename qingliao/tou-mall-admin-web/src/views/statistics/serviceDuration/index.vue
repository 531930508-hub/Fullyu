<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex duration-filters">
        <shop-selector v-if="!massagist" v-model="searchForm.shopId" class="m-r-10" style="width: 220px" :clearable="true" :disabled="massagist"
                       @change="searchData"></shop-selector>
        <massagist-selector v-if="!massagist" v-model="searchForm.massagistId" class="m-r-10" style="width: 220px" clearable
                            :disabled="massagist" :shop-id="searchForm.shopId" :filter-status="searchForm.status"
                            @change="searchData"></massagist-selector>
        <el-select v-model="searchForm.status" class="m-r-10" aria-label="合作状态" @change="changeStatus">
          <el-option label="合作中" :value="1"></el-option>
          <el-option label="暂停合作" :value="2"></el-option>
          <el-option label="已结束合作" :value="0"></el-option>
          <el-option label="全部合作状态" :value="-1"></el-option>
        </el-select>
        <el-date-picker :clearable="false"
                        v-model="dateTime" @change="searchDateTime"
                        type="daterange" value-format="yyyy-MM-dd HH:mm:ss"
                        range-separator="至" :default-time="['00:00:00','23:59:59']"
                        start-placeholder="开始日期"
                        end-placeholder="结束日期">
        </el-date-picker>
      </div>
      <div>
        <el-button @click="exportExcel" :loading="exporting" :disabled="exporting" icon="el-icon-paperclip" type="primary">导出全部结果</el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column v-if="!massagist" label="所属门店" prop="shopId" width="220">
          <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
        </el-table-column>
        <el-table-column label="疗愈师" prop="massagistId" width="120" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.massagistId | massagistNameFilter }}
          </template>
        </el-table-column>
        <el-table-column label="所属周期" prop="periodCode"></el-table-column>
        <el-table-column label="服务数量" prop="serviceCount"></el-table-column>
        <el-table-column label="排班时长(小时)" prop="workTime" width="240">
          <template slot-scope="scope">
            {{ scope.row.dateRangeWorkTime || 0 }}小时
            <span v-if="scope.row.currentDateWorkTime">
              （当天排班{{ scope.row.currentDateWorkTime }}小时）
            </span>
          </template>
        </el-table-column>
        <el-table-column label="服务时长(分钟)" prop="serviceDuration" width="120" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.serviceDuration }}分钟
          </template>
        </el-table-column>
        <el-table-column label="接待时长(分钟)" prop="receptionDuration" width="170" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.receptionDuration }}分钟
            <div v-if="scope.row.receptionCapApplied" class="cap-hint">
              上限 {{ scope.row.receptionCapMinutes }} 分钟
              <span v-if="scope.row.receptionExcessDuration > 0" class="cap-excess">
                · 超出 {{ scope.row.receptionExcessDuration }} 分钟
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="服务工时(分钟)" prop="serviceWorkingHours" width="120" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.serviceWorkingHours }}分钟
          </template>
        </el-table-column>
        <el-table-column label="接待工时(分钟)" prop="receptionWorkingHours" width="150" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.receptionWorkingHours }}分钟
            <div v-if="scope.row.receptionCapApplied" class="cap-hint">已按封顶计入</div>
          </template>
        </el-table-column>
        <el-table-column label="调整工时(分钟)" prop="adjustDuration" width="120" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.adjustDuration }}分钟
          </template>
        </el-table-column>
        <el-table-column label="工时(分钟)" prop="totalWorkingHours" width="120" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.totalWorkingHours }}分钟
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160">
          <template slot-scope="scope">
            <el-row>
              <el-button
                type="text"
                @click="showDetail(scope.row,scope.$index)">详情
              </el-button>
              <el-button v-if="!massagist"
                type="text"
                @click="showAdjustForm(scope.row,scope.$index)">调整工时
              </el-button>
            </el-row>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="pagination-container">
      <el-pagination :current-page="searchForm.page" :page-size="searchForm.size" :total="total"
                     :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next, jumper"
                     @current-change="handleCurrentChange" @size-change="handleSizeChange"></el-pagination>
    </div>
    <service-duration-detail ref="refServiceDurationDetail"></service-duration-detail>
    <adjust-form ref="refAdjustForm" @submit-success="fetchData"></adjust-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import statisticsApi from "@/api/statistics";
import dateUtil from "@/utils/dateUtil";
import ServiceDurationDetail from "@/views/statistics/serviceDuration/ServiceDurationDetail";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import AdjustForm from "@/views/statistics/serviceDuration/AdjustForm";
import constant from "@/consts/constant";
import MassagistSelector from "@/views/massagist/management/MassagitSelector";

export default {
  name: 'index',
  components: {MassagistSelector, AdjustForm, ShopSelector, ServiceDurationDetail},
  props: {},
  data() {
    return {
      searchForm: {
        startTime: '',
        endTime: '',
        shopId: '',
        massagistId: '',
        status: 1,
        page: 1,
        size: 10,
      },
      dateTime: [],
      dataList: [],
      listLoading: false,
      exporting: false,
      requestSequence: 0,
      destroyed: false,
      total: 0
    }
  },
  computed: {
    ...mapGetters(['userId', 'roles', 'massagistId', 'shopId']),
    massagist() {
      return this.roles.filter(s => s == '疗愈师').length > 0
    }
  },
  created() {
    this.$store.dispatch("setMassagistList")
    this.$store.dispatch('setShopList')
    this.$store.dispatch('setShopAllList')
    if (this.massagist) {
      this.searchForm.massagistId = this.massagistId
    }else {
      //当疗愈师登录时不需要传门店id
      this.searchForm.shopId = this.shopId
    }
    this.searchForm.startTime = dateUtil.getCurrentMonthCode() + "-01 00:00:00"
    this.searchForm.endTime = dateUtil.getCurrentDateCode() + " 23:59:59"
    this.dateTime = [dateUtil.getCurrentMonthCode() + "-01 00:00:00", dateUtil.getCurrentDateCode() + " 23:59:59"]
    this.searchData()
  },
  beforeDestroy() {
    this.destroyed = true
    this.requestSequence++
  },
  methods: {
    searchData() {
      this.searchForm.page = 1
      return this.fetchData()
    },
    changeStatus() {
      if (!this.massagist) this.searchForm.massagistId = ''
      return this.searchData()
    },
    handleCurrentChange(page) {
      this.searchForm.page = page
      return this.fetchData()
    },
    handleSizeChange(size) {
      this.searchForm.size = size
      return this.searchData()
    },
    async fetchData() {
      const sequence = ++this.requestSequence
      const filters = {...this.searchForm}
      this.listLoading = true
      try {
        const res = await statisticsApi.serviceDuration(filters)
        if (this.destroyed || sequence !== this.requestSequence) return
        this.dataList = (res.data && res.data.list) || []
        this.total = Number(res.data && res.data.total) || 0
      } finally {
        if (!this.destroyed && sequence === this.requestSequence) this.listLoading = false
      }
    },
    showDetail(row, index) {
      this.$refs.refServiceDurationDetail.open(row)
    },
    async exportExcel() {
      if (this.exporting) return
      const filters = {...this.searchForm}
      delete filters.page
      delete filters.size
      this.exporting = true
      let loadingShown = false
      try {
        await this.notifyConfirm("将导出当前筛选条件下的全部结果，是否确定？")
        if (this.destroyed) return
        this.showFullLoading('正在导出文件', true)
        loadingShown = true
        await statisticsApi.serviceDurationExport(filters)
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.exporting = false
      }
    },
    showAdjustForm(row, index) {
      let form = {
        massagistId: row.massagistId,
        shopId: row.shopId,
        createUser: this.userId,
        status: constant.adjustStatus[1].value
      }
      this.$refs.refAdjustForm.open(form, row.periodCode)
    },
    searchDateTime(val) {
      if (val && val.length > 0) {
        this.$set(this.searchForm, 'startTime', val[0])
        this.$set(this.searchForm, 'endTime', val[1])
      } else {
        this.dateTime = [dateUtil.getCurrentMonthCode() + "-01 00:00:00", dateUtil.getCurrentDateCode() + " 23:59:59"]
        this.searchForm.startTime = dateUtil.getCurrentMonthCode() + "-01 00:00:00"
        this.searchForm.endTime = dateUtil.getCurrentDateCode() + " 23:59:59"
      }
      this.searchData()
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 0 20px;

  .operate-container {
    gap: 10px;
    flex-wrap: wrap;
  }

  .duration-filters {
    flex-wrap: wrap;
    gap: 10px 0;
    min-width: 0;
  }

  .pagination-container {
    overflow-x: auto;
  }

  .cap-hint {
    color: #909399;
    font-size: 12px;
    line-height: 18px;
  }

  .cap-excess {
    color: #E6A23C;
  }
}
</style>
