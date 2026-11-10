<template>
  <div class="index">
    <div class="flex flex-wrap operate-container" style="gap:10px">
      <!-- <div> -->
      <el-date-picker :clearable="false"
                      v-model="dateTime" @change="searchDateTime"
                      type="daterange" value-format="yyyy-MM-dd HH:mm:ss"
                      range-separator="至" :default-time="['00:00:00','23:59:59']"
                      start-placeholder="收支开始日期"
                      end-placeholder="收支结束日期">
      </el-date-picker>
      <shop-selector v-model="searchForm.shopId" clearable placeholder="请选择所属门店" @change="searchData"
                     style="width: 180px;"></shop-selector>
      <el-select v-model="searchForm.type" clearable placeholder="收支类型" @change="searchData" style="width: 120px;">
        <el-option v-for="item in constant.revenueType" :key="item" :label="item" :value="item"></el-option>
      </el-select>
      <el-select v-model="searchForm.businessType" clearable placeholder="流水类型" @change="searchData"
                 style="width: 120px;">
        <el-option v-for="item in constant.revenueBusinessType" :key="item" :label="item" :value="item"></el-option>
      </el-select>
      <el-select v-model="searchForm.payState" clearable placeholder="支付状态" @change="searchData" style="width: 120px;">
        <el-option v-for="item in constant.revenuePayState" :key="item" :label="item" :value="item"></el-option>
      </el-select>
      <el-select v-model="searchForm.consumptionState" clearable placeholder="消费状态" @change="searchData"
                 style="width: 140px;">
        <el-option v-for="item in constant.revenueConsumptionState" :key="item" :label="item"
                   :value="item"></el-option>
      </el-select>
      <el-select v-model="searchForm.payType" clearable placeholder="收支渠道" @change="searchData" style="width: 180px;">
        <el-option v-for="item in constant.revenuePayType" :key="item" :label="item" :value="item"></el-option>
      </el-select>
      <!-- </div>
      <div> -->
      <el-button @click="exportExcel" icon="el-icon-paperclip" type="primary">导出</el-button>
      <el-button @click="exportDaily" icon="el-icon-date" type="primary" plain>导出日报</el-button>
      <!-- </div> -->
    </div>
    <div class="flex justify-between m-t-10">
      <el-popover style="width: 100%"
                  placement="bottom-end"
                  trigger="click">
        <el-table :data="topData.amountList" show-summary border style="width: 600px"
                  :summary-method="getSummaries">
          <el-table-column property="title" label="流水类型"></el-table-column>
          <el-table-column property="amount" label="预收款">
            <template slot-scope="scope">
              <span>{{ scope.row.amount }}元</span>
            </template>
          </el-table-column>
          <el-table-column property="totalAmount" label="收款合计">
            <template slot-scope="scope">
              <span>{{ scope.row.totalAmount }}元</span>
            </template>
          </el-table-column>
          <el-table-column property="refundAmount" label="退款">
            <template slot-scope="scope">
              <span>{{ scope.row.refundAmount }}元</span>
            </template>
          </el-table-column>
          <el-table-column property="refundingAmount" label="待退款">
            <template slot-scope="scope">
              <span>{{ scope.row.refundingAmount }}元</span>
            </template>
          </el-table-column>
        </el-table>
        <el-card slot="reference" class="top-card card-1">
          <div class="top-title">预收款</div>
          <div class="mce-text-center m-t-10">
            {{ topData.totalAmount || 0 }}元
          </div>
        </el-card>
      </el-popover>
      <el-popover style="width: 100%"
                  placement="bottom-start"
                  trigger="click">
        <el-table :data="topData.actualAmountList" show-summary border style="width: 600px"
                  :summary-method="getSummaries">
          <el-table-column property="title" label="流水类型"></el-table-column>
          <el-table-column property="amount" label="实际收入">
            <template slot-scope="scope">
              <span>{{ scope.row.amount }}元</span>
            </template>
          </el-table-column>
          <el-table-column property="totalAmount" label="预收款">
            <template slot-scope="scope">
              <span>{{ scope.row.totalAmount }}元</span>
            </template>
          </el-table-column>
          <el-table-column property="otherAmount" label="待入账">
            <template slot-scope="scope">
              <span>{{ scope.row.otherAmount }}元</span>
            </template>
          </el-table-column>
        </el-table>
        <el-card slot="reference" class="top-card card-2">
          <div class="top-title">实际收入</div>
          <div class="mce-text-center m-t-10">
            {{ topData.totalActualAmount || 0 }}元
          </div>
        </el-card>
      </el-popover>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column label="所属门店" prop="shopId" show-overflow-tooltip>
          <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
        </el-table-column>
        <el-table-column label="收支类型" prop="type"></el-table-column>
        <el-table-column label="流水类型" prop="businessType"></el-table-column>
        <el-table-column label="动账金额" prop="amount"></el-table-column>
        <el-table-column label="支付状态" prop="payState"></el-table-column>
        <el-table-column label="收支时间" prop="finishTime"></el-table-column>
        <el-table-column label="支付时间" prop="payTime"></el-table-column>
        <el-table-column label="收支渠道" prop="payType"></el-table-column>
        <el-table-column label="消费状态" prop="consumptionState"></el-table-column>
        <el-table-column label="客户称呼" prop="nickname">
          <template slot-scope="scope">
            <span>{{ customerTitle(scope.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="关联订单" prop="orderId">
          <template slot-scope="scope"><span class="c-primary" @click="showOrderDetail(scope.row.orderId)">查看详情</span>
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
        :current-page.sync="searchForm.page"
        :total="total">
      </el-pagination>
    </div>
    <order-detail ref="refOrderDetail"></order-detail>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import statisticsApi from "@/api/statistics";
import OrderDetail from "@/views/order/OrderDetail";
import dateUtil from "@/utils/dateUtil";
import ShopSelector from "@/views/shop/shopList/ShopSelector";

export default {
  name: 'index',
  components: {ShopSelector, OrderDetail},
  props: {},
  data() {
    return {
      dataList: [],
      listLoading: false,
      searchForm: {page: 1, size: 10},
      total: 0,
      dateTime: [],
      topData: {}
    }
  },
  computed: {
    ...mapGetters(['shopId','shopListAll'])
  },
  created() {
    this.$store.dispatch('setShopList')
    this.$store.dispatch('setShopAllList')
    this.searchForm.shopId = this.shopId
    this.$set(this.searchForm, 'startPayTime', dateUtil.getCurrentDateCode() + " 00:00:00")
    this.$set(this.searchForm, 'endPayTime', dateUtil.getCurrentDateCode() + " 23:59:59")
    this.dateTime = [dateUtil.getCurrentDateCode() + " 00:00:00", dateUtil.getCurrentDateCode() + " 23:59:59"]
    this.searchData()
  },
  methods: {
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
      this.fetchTopData()
    },
    async fetchTopData() {
      let res = await statisticsApi.operatingRevenueTop(this.searchForm)
      let data = res.data
      this.topData = data || {}
    },
    async fetchData() {
      let res = await statisticsApi.operatingRevenue(this.searchForm)
      let {list, total} = res.data
      this.dataList = list || []
      this.total = total || 0
    },
    async exportExcel() {
      await this.notifyConfirm("将按照当前筛选条件进行导出，是否确定导出？")
      this.showFullLoading('正在导出文件', true)
      await statisticsApi.operatingRevenueExport(this.searchForm)
      this.hideFullLoading()
    },
    dailyExportParams(form) {
      const params = {}
      Object.keys(form || {}).forEach(key => {
        if (key === 'page' || key === 'size') return
        const value = form[key]
        if (value !== undefined && value !== null && value !== '') params[key] = value
      })
      params.type = '收入'
      return params
    },
    dailyExportError(form) {
      const start = form && form.startPayTime ? String(form.startPayTime).slice(0, 10) : ''
      const end = form && form.endPayTime ? String(form.endPayTime).slice(0, 10) : ''
      if (start.length < 10 || end.length < 10) return '请先选择收支日期区间'
      const toUtc = s => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
      const days = Math.round((toUtc(end) - toUtc(start)) / 86400000) + 1
      if (days < 1) return '结束日期不能早于开始日期'
      if (days > 366) return '日报单次最多导出 366 天，请缩小日期区间'
      return null
    },
    async exportDaily() {
      const error = this.dailyExportError(this.searchForm)
      if (error) {
        this.$message.warning(error)
        return
      }
      await this.notifyConfirm('将按当前门店、流水类型、渠道等筛选条件，逐日汇总“收入”流水（不扣退款，无收入的日期记 0），是否导出日报？')
      this.showFullLoading('正在导出日报', true)
      try {
        await statisticsApi.operatingRevenueDailyExport(this.dailyExportParams(this.searchForm))
      } finally {
        this.hideFullLoading()
      }
    },
    handleSizeChange(val) {
      this.searchForm.size = val;
      this.searchData();
    },
    handleCurrentChange(val) {
      this.searchForm.page = val;
      this.fetchData();
    },
    searchDateTime(val) {
      if (val && val.length > 0) {
        this.$set(this.searchForm, 'startPayTime', val[0])
        this.$set(this.searchForm, 'endPayTime', val[1])
      } else {
        this.dateTime = [dateUtil.getCurrentDateCode() + " 00:00:00", dateUtil.getCurrentDateCode() + " 23:59:59"]
        this.$set(this.searchForm, 'startPayTime', dateUtil.getCurrentDateCode() + " 00:00:00")
        this.$set(this.searchForm, 'endPayTime', dateUtil.getCurrentDateCode() + " 23:59:59")
      }
      this.searchData()
    },
    showOrderDetail(id) {
      this.$refs.refOrderDetail.open({id})
    },
    getSummaries(param) {
      const {columns, data} = param;
      const sums = []
      columns.forEach((column, index) => {
        if (index === 0) {
          sums[index] = '合计'
          return
        }
        const values = data.map(item => Number(item[column.property]));
        if (!values.every(value => isNaN(value))) {
          const total = values.reduce((prev, curr) => {
            const value = Number(curr)
            if (!isNaN(value)) {
              return prev + value
            } else {
              return prev
            }
          }, 0)
          // 四舍五入并保留两位小数
          sums[index] = (total).toFixed(2) + ' 元'
        } else {
          sums[index] = 'N/A'
        }
      })
      return sums
    },
    customerTitle(customer) {
      if (!customer) {
        return
      }
      const {comment, nickname, phone, gender} = customer
      if (comment && gender) {
        return comment + (gender == 1 ? '先生' : gender == 2 ? '女士' : '')
      }
      if (nickname && nickname == '用户' + phone) {
        return phone
      }
      return nickname
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 0 20px;

  .top-card {
    padding: 0 24px;
    flex: 1;
    margin: 0 8px;
    text-align: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border: none;
    font-size: 18px;
    font-weight: 600;
  }

  .card-1 {
    background-color: #f0f9ff;
    color: #409EFF;
  }

  .card-2 {
    background-color: #e7fced;
    color: #90c776;
  }

  .card-5 {
    background-color: #e6fce3;
    color: #57c421;
  }

  .card-3 {
    background-color: #fef0f0;
    color: #F56C6C;
  }

  .card-4 {
    background-color: #fef6e6;
    color: #E6A23C;
  }

  .top-title {
    font-size: 14px;
    font-weight: 600;
    color: #606266
  }
}
</style>
