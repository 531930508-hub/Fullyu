<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
<!--        <shop-selector v-model="searchForm.shopId" style="width: 280px" @change="searchData"
                       placeholder="请选择所属门店"
                       clearable class="m-r-10"></shop-selector>-->
        <el-select v-model="searchForm.shopIdArrNew"  :style="'width: 100%'"
                   multiple  @change="searchData" clearable
                   placeholder="可多选门店">
          <el-option
            v-for="item in shopListAll"
            :key="item.id"
            :label="item.name"
            :value="item.id">
          </el-option>
        </el-select>
&nbsp;&nbsp;&nbsp;&nbsp;
        <template>
          <el-date-picker  :clearable="false"
            v-model="searchForm.monthNumber" @change="searchData"
            type="month"
            value-format="yyyy-MM-dd"
            placeholder="选择月份">
          </el-date-picker>
        </template>

      </div>
      <div>
        <el-button icon="el-icon-plus" @click="addMonthlyForm" type="primary">添加支出</el-button>
        <el-button icon="el-icon-paperclip" @click="exportExcelXinZi" type="primary">导出疗愈师劳务服务费</el-button>
        <el-button icon="el-icon-paperclip" @click="exportExcelFuWu"  type="primary">导出疗愈师服务时长</el-button>
      </div>
    </div>
    <div class="flex justify-between m-t-10">
        <el-card slot="reference" class="top-card card-1">
          <div class="top-title">预收款</div>
          <div class="mce-text-center m-t-10">
            {{ totalAmount }}元
          </div>
        </el-card>
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">实际收入</div>
        <div class="mce-text-center m-t-10">
          {{ totalActualAmount }}元
        </div>
      </el-card>
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">疗愈师劳务服务费总和</div>
        <div class="mce-text-center m-t-10">
          {{ actualIncome }}元
        </div>
      </el-card>
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">疗愈师服务时长总和</div>
        <div class="mce-text-center m-t-10">
          {{ totalWorkingHours }}分钟
        </div>
      </el-card>
    </div>
    <div class="flex justify-between m-t-10">

      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">疗愈师服务客次总和</div>
        <div class="mce-text-center m-t-10">
          {{ serviceCount }}次
        </div>
      </el-card>
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">疗愈师劳务服务费占实际收入的%</div>
        <div class="mce-text-center m-t-10">
          {{ percentage }}
        </div>
      </el-card>
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">其他支出</div>
        <div class="mce-text-center m-t-10">
          {{ payoutMoneyPriceSum }}元
        </div>
      </el-card>
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">毛利</div>
        <div class="mce-text-center m-t-10">
          {{ maoliPrice }}元
        </div>
      </el-card>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column label="所属门店" prop="shopId" show-overflow-tooltip>
          <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
        </el-table-column>
        <el-table-column label="支出金额" prop="moneyprice"></el-table-column>
        <el-table-column label="支出时间" prop="dtime" >
        </el-table-column>
        <el-table-column label="支出说明" prop="marks" >
        </el-table-column>
        <el-table-column label="操作" prop="id">
          <template slot-scope="scope"><span class="c-primary" @click="deleteData(scope.row.id)">删除</span>
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
    <monthly-form ref="refMonthlyForm" @submit-success="fetchData"></monthly-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import statisticsApi from "@/api/statistics";
import MonthlyForm from "@/views/statistics/monthly/monthlyForm";
import dateUtil from "@/utils/dateUtil";
import ShopSelector from "@/views/shop/shopList/ShopSelector";

export default {
  name: 'index',
  components: {MonthlyForm},
  props: {},
  data() {
    return {
      dataList: [],
      listLoading: false,
      searchForm: {page: 1, size: 10,monthNumber:new Date().toLocaleTimeString()},
      total: 0,
      dateTime: [],
      topData: {},
      value: '',
      payoutMoneyPriceSum:0,
      totalWorkingHours:0,
      serviceCount:0,
      totalAmount:0,
      totalActualAmount:0,
      actualIncome:0,
      percentage:'0%',
      maoliPrice:0,
    }
  },
  computed: {
    ...mapGetters(['shopId','shopListAll'])
  },
  created() {
    this.$store.dispatch('setShopAllList')
    this.searchForm.shopId = this.shopId
    this.searchForm.shopIdArrNew =[parseInt(this.shopId)]
    this.$set(this.searchForm, 'startPayTime', dateUtil.getCurrentDateCode() + " 00:00:00")
    this.$set(this.searchForm, 'endPayTime', dateUtil.getCurrentDateCode() + " 23:59:59")
    this.dateTime = [dateUtil.getCurrentDateCode() + " 00:00:00", dateUtil.getCurrentDateCode() + " 23:59:59"]
    this.searchForm.monthNumber = dateUtil.getCurrentMonthCode()+"-01"
    this.searchData()
  },
  methods: {
   async searchData() {
      console.log("searchData");
      console.log(this.searchForm);
      this.searchForm.page = 1
      this.showFullLoading()
      await  this.fetchData()
     // this.fetchTopData()
      await this.topAlldata();
      this.hideFullLoading()
    },
    async topAlldata(){
      let res = await statisticsApi.topAlldata(this.searchForm)
      const data = res.data || {}
      this.payoutMoneyPriceSum = data.payoutMoneyPriceSum || 0
      this.totalWorkingHours = data.totalWorkingHours || 0
      this.serviceCount = data.serviceCount || 0
      this.totalAmount = data.totalAmount || 0
      this.totalActualAmount = data.totalActualAmount || 0
      this.actualIncome = data.actualIncome || 0
      const percentage = Number(data.percentage)
      this.percentage = (Number.isFinite(percentage) ? percentage : 0).toFixed(2) + '%'
      this.maoliPrice = data.maoliPrice || 0
    },
    async exportExcelXinZi() {
      await this.notifyConfirm("将按照当前筛选条件进行导出，是否确定导出？")
      this.showFullLoading('正在导出文件', true)
      await statisticsApi.operatingRevenueExportXinZi(this.searchForm)
      this.hideFullLoading()
    },
    async exportExcelFuWu() {
      await this.notifyConfirm("将按照当前筛选条件进行导出，是否确定导出？")
      this.showFullLoading('正在导出文件', true)
      await statisticsApi.operatingRevenueExportFuWu(this.searchForm)
      this.hideFullLoading()
    },
    async deleteData(id){
      await this.notifyConfirm('确定要删除吗')
      this.showFullLoading()
      await statisticsApi.deletePayoutData(id)
      this.hideFullLoading()
      this.searchData()
    },
    async fetchTopData() {
      let res = await statisticsApi.operatingRevenueTop(this.searchForm)
      let data = res.data
      this.topData = data || {}
    },
    async fetchData() {
      let res = await statisticsApi.payoutpage(this.searchForm)
      let {list, total} = res.data
      this.dataList = list || []
      this.total = total || 0

      this.topAlldata();
    },
    async addMonthlyForm() {
      this.$refs.refMonthlyForm.open()
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
