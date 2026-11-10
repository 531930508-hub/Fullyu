<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex">
        <shop-selector v-model="searchForm.shopId" style="width: 180px" @change="handleShopChange" :clearable="true"
                       placeholder="请选择所属门店" class="m-r-10"></shop-selector>
        <massagist-selector v-model="searchForm.massagistId" style="width: 180px;margin-right: 10px" @selected="selectedMassagit"
                            :shop-id="searchForm.shopId" clearable
                            placeholder="请选择疗愈师"></massagist-selector>
        <el-date-picker
          v-model="searchForm.daymonth"
          align="right" style="width: 180px" class="m-r-10"
          type="month" @change="searchData"
          placeholder="选择月份"
          value-format="yyyy-MM-dd">
        </el-date-picker>

      </div>
      <div>
        <el-button icon="el-icon-edit" @click="updateSalaryCoefficient" type="primary">劳务服务费系数</el-button>
        <el-button icon="el-icon-plus" @click="addSalaryOtherAmount" type="primary">劳务服务费调整</el-button>
        <el-button icon="el-icon-paperclip" @click="showSalaryOtherAmountDialog" type="primary">劳务服务费导入</el-button>
      </div>
    </div>
    <div class="flex justify-between m-t-10">
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">0至7200</div>
        <div class="mce-text-center m-t-10">
          {{ onevalue }}元
        </div>
      </el-card>
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">7200至8400</div>
        <div class="mce-text-center m-t-10">
          {{ twovalue }}元
        </div>
      </el-card>
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">8400至9600</div>
        <div class="mce-text-center m-t-10">
          {{ threevalue }}元
        </div>
      </el-card>
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">9600以上</div>
        <div class="mce-text-center m-t-10">
          {{ fourvalue }}元
        </div>
      </el-card>
      <el-card slot="reference" class="top-card card-1">
        <div class="top-title">实习期</div>
        <div class="mce-text-center m-t-10">
          {{ samllvalue }}元
        </div>
      </el-card>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column label="技术姓名" prop="massagistName" >
        </el-table-column>
        <el-table-column label="月份" prop="monthCode"></el-table-column>
        <el-table-column label="金额" prop="amount"></el-table-column>
        <el-table-column label="类型" prop="type">
          <template slot-scope="scope">{{scope.row.type==1?"增加":"减少"}}</template>
        </el-table-column>
        <el-table-column label="标题" prop="title" >
        </el-table-column>
        <el-table-column label="说明" prop="content" >
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
    <salary-coefficient-form ref="refSalaryCoefficientForm" @submit-success="getSalaryCoefficient"></salary-coefficient-form>
    <salary-other-amount-form ref="refsalaryOtherAmountForm" @submit-success="searchData"></salary-other-amount-form>
    <salary-other-amount-dialog ref="refSalaryOtherAmountDialog" @submit-success="searchData"></salary-other-amount-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import salaryOtherAmountApi from "@/api/salaryOtherAmount";
import statisticsApi from "@/api/statistics";
import dateUtil from "@/utils/dateUtil";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import MassagistSelector from "@/views/massagist/management/MassagitSelector";
import salaryCoefficientForm from "@/views/statistics/salaryDetail/salaryCoefficientForm";
import salaryOtherAmountForm from "@/views/statistics/salaryDetail/salaryOtherAmountForm";
import SalaryOtherAmountDialog from "./SalaryOtherAmountDialog.vue";
export default {
  name: 'index',
  components: {SalaryOtherAmountDialog, ShopSelector,MassagistSelector,salaryCoefficientForm,salaryOtherAmountForm},
  props: {},
  computed:{
    ...mapGetters(['shopId']),
  },
  data() {
    return {
      dataList: [],
      listLoading: false,
      total: 0,
      searchForm: {
        page: 1,
        size: 10,
        daymonth: null,
        status: 1,
        order: '-create_time',
      },
      onevalue:0,
      twovalue:0,
      threevalue:0,
      fourvalue:0,
      samllvalue:0,
    }
  },
  created() {
    this.$store.dispatch('setShopList')
    this.searchForm.shopId = this.shopId
    //this.searchForm.daymonth = dateUtil.getCurrentMonthCode()+"-01"
    this.searchData()
    this.getSalaryCoefficient()
  },
  methods: {
    async getSalaryCoefficient() {
      let res = {}
      try {
        res = await salaryOtherAmountApi.getSalaryCoefficient() || {}
      } catch (e) {
        res = {}
      }
      const rows = Array.isArray(res.data) ? res.data : []
      const pick = index => (rows[index] ? rows[index].coefficient : 0)
      this.onevalue = pick(0)
      this.twovalue = pick(1)
      this.threevalue = pick(2)
      this.fourvalue = pick(3)
      this.samllvalue = pick(4)
    },
    showSalaryOtherAmountDialog() {
      this.$refs.refSalaryOtherAmountDialog.open()
    },
   async searchData() {
      console.log(this.searchForm);
      this.searchForm.page = 1
      let res=await salaryOtherAmountApi.getSalaryOtherAmount(this.searchForm);

     let {list, total} = res.data || {}
     this.dataList = list || []
     this.listLoading = false
     console.log(this.dataList);
     this.total = total || 0
    },
    async handleShopChange(obj) {
      this.searchForm.shopId=obj
      this.$set(this.searchForm, 'massagistId', null)
      await  this.searchData()
    },
    async deleteData(id){
      await this.notifyConfirm('确定要删除吗')
      this.showFullLoading()
      await salaryOtherAmountApi.deleteSalaryOtherAmount(id)
      this.hideFullLoading()
     await this.searchData()
    },
    selectedMassagit(item) {
      if (item) {
        this.$set(this.searchForm, 'shopId', item.shopId)
      }
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
    async fetchData() {
      console.log(this.searchForm);
      let res=await salaryOtherAmountApi.getSalaryOtherAmount(this.searchForm);

      let {list, total} = res.data
      this.dataList = list || []
      this.listLoading = false
      console.log(this.dataList);
      this.total = total || 0
    },
    updateSalaryCoefficient(){
      this.$refs.refSalaryCoefficientForm.open()
    },
    addSalaryOtherAmount(){
      this.$refs.refsalaryOtherAmountForm.open()
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
