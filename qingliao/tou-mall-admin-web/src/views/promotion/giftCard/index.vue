<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex flex-wrap" style="gap:10px;flex: 1">
        <!--        <shop-selector v-model="searchForm.shopId" style="width: 280px" @change="searchData"
                               placeholder="请选择所属门店"
                               clearable class="m-r-10"></shop-selector>-->
        <el-select v-model="searchForm.status" style="width: 120px"
                   @change="searchData" placeholder="礼品卡状态" clearable>
          <el-option
            v-for="item in constant.giftCardStatus"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-input placeholder="礼品卡密码" v-model.trim="searchForm.password" clearable @clear="searchData"
                  @keyup.enter.native="searchData" style="width: 120px;">
        </el-input>
        <el-date-picker
          v-model="createRange" style="width: 260px"
          type="daterange" @change="createRangeChange"
          range-separator="-"
          value-format="yyyy-MM-dd HH:mm:ss"
          start-placeholder="创建日期起" :default-time="['00:00:00','23:59:59']"
          end-placeholder="创建日期止">
        </el-date-picker>
        <el-date-picker
          v-model="receiveRange" style="width: 260px"
          type="daterange" @change="receiveRangeChange"
          range-separator="-"
          value-format="yyyy-MM-dd HH:mm:ss"
          start-placeholder="领取日期起" :default-time="['00:00:00','23:59:59']"
          end-placeholder="领取日期起止">
        </el-date-picker>
        <el-input placeholder="请输入客户手机号" v-model.trim="searchForm.phone" clearable @clear="searchData"
                  @keyup.enter.native="searchData" style="width: 220px;">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
        <span v-show="!moreSearch" @click="moreSearch = true" style="cursor: pointer;margin-top: 10px;font-size: 18px"><i class="el-icon-arrow-down"></i></span>
        <span v-show="moreSearch" @click="moreSearch = false" style="cursor: pointer;margin-top: 10px;font-size: 18px"><i class="el-icon-arrow-up"></i></span>
        <div v-show="moreSearch" class="flex flex-wrap" style="gap:10px;">
          <el-input placeholder="礼品卡编码" v-model.trim="searchForm.code" clearable @clear="searchData"
                    @keyup.enter.native="searchData" style="width: 120px;">
          </el-input>
          <el-select v-model="searchForm.type" style="width: 120px"
                     @change="searchData" placeholder="礼品卡类型" clearable>
            <el-option
              v-for="item in constant.giftCardType"
              :key="item.value"
              :label="item.label"
              :value="item.value">
            </el-option>
          </el-select>
          <el-select v-model.number="searchForm.activityId" placeholder="请选择用途" style="width: 160px"
                     filterable clearable>
            <el-option
              v-for="item in activityDoingList || []"
              :value="item.id"
              :label="`${item.title}`" :key="item.id">
              <span>{{ item.title }}-<span style="color: #9E9E9E">{{ item.code }}</span></span>
            </el-option>
          </el-select>
        </div>
      </div>
      <div class="flex flex-wrap" style="gap:10px;width: 540px;justify-content: right;">
        <el-button icon="el-icon-plus" @click="handleAdd">添加</el-button>
        <el-button icon="el-icon-download" @click="importGiftCardShow">导入</el-button>
        <el-button icon="el-icon-upload2" @click="exportExcel">导出</el-button>
        <el-button icon="el-icon-notebook-2" @click="openPrepaidLedger">预收台账</el-button>
        <el-button @click="handleDistribution(null,true)"
                   v-if="selectIdList && selectIdList.length>0">批量发放
        </el-button>
        <el-button @click="handleFailure(null,true)"
                   v-if="selectIdList && selectIdList.length>0">批量失效
        </el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                @selection-change="handleSelectionChange"
                style="width: 100%;" border>
        <el-table-column
          type="selection"
          width="55">
        </el-table-column>
        <!--        <el-table-column label="所属门店" prop="shopId" show-overflow-tooltip min-width="180">-->
        <!--          <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>-->
        <!--        </el-table-column>-->
        <el-table-column label="用途/活动" prop="activityId" show-overflow-tooltip>
          <template slot-scope="scope">{{ scope.row.activityId | activityFilter }}</template>
        </el-table-column>
        <el-table-column label="编码" prop="code" show-overflow-tooltip></el-table-column>
        <el-table-column label="密码" prop="password" show-overflow-tooltip></el-table-column>
        <el-table-column label="类型" prop="type" width="100">
          <template slot-scope="scope">{{ scope.row.type | giftCardTypeFilter }}</template>
        </el-table-column>
        <el-table-column label="面值" prop="amount" width="100" show-overflow-tooltip>
          <template slot-scope="scope">{{ scope.row.amount }}元</template>
        </el-table-column>
        <el-table-column label="兑券数量" prop="number" width="100" show-overflow-tooltip>
          <template slot-scope="scope">{{ scope.row.number }}张</template>
        </el-table-column>
        <el-table-column label="券过期天数" prop="validDate" width="100" show-overflow-tooltip>
          <template slot-scope="scope">
            <span v-if="!scope.row.validDate">永久</span>
            <span v-else-if="scope.row.validDate">{{ scope.row.validDate }}天</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" prop="status" width="100">
          <template slot-scope="scope">{{ scope.row.status | giftCardStatusFilter }}
          </template>
        </el-table-column>
        <el-table-column label="发放时间" prop="distributionTime" show-overflow-tooltip></el-table-column>
        <el-table-column label="领取时间" prop="receiveTime" show-overflow-tooltip></el-table-column>
        <el-table-column label="失效时间" prop="failureTime" show-overflow-tooltip></el-table-column>
        <el-table-column label="领取客户" prop="customerId" show-overflow-tooltip>
          <template slot-scope="scope">
            <span v-if="!scope.row.customerId">无</span>
            <span v-else-if="scope.row.customer">{{ scope.row.customer.nickname }}：{{
                scope.row.customer.phone
              }}</span>
          </template>
        </el-table-column>
        <el-table-column label="使用限制" prop="limitations" min-width="100" show-overflow-tooltip></el-table-column>
        <el-table-column label="操作" width="160">
          <template slot-scope="scope">
            <el-row>
              <el-button
                type="text" v-if="scope.row.status==1"
                @click="handleDistribution(scope.row,false)">
                发放
              </el-button>
              <el-button
                type="text" v-if="scope.row.status==1 || scope.row.status==2"
                @click="handleFailure(scope.row,false)">失效
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
    <gift-card-form ref="refGiftCardForm" @submit-success="searchData"></gift-card-form>
    <import-gift-card-form ref="refImportGiftCardForm" @submit-success="searchData"></import-gift-card-form>
    <prepaid-ledger-dialog ref="refPrepaidLedger"></prepaid-ledger-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import giftCardApi from "@/api/promotion/giftCard";
import GiftCardForm from "@/views/promotion/giftCard/GiftCardForm";
import ImportGiftCardForm from "@/views/promotion/giftCard/importGiftCardForm";
import PrepaidLedgerDialog from "@/views/promotion/giftCard/PrepaidLedgerDialog";

export default {
  name: 'index',
  components: {ImportGiftCardForm, GiftCardForm, ShopSelector, PrepaidLedgerDialog},
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        shopId: null,
        order: '-id'
      },
      dataList: [],
      total: 0,
      moreSearch: false,
      createRange: [],
      receiveRange: [],
      selectIdList: [],
    }
  },
  computed: {
    ...mapGetters(['userId', 'shopId', 'activityDoingList'])
  },
  created() {
    this.$store.dispatch('setShopList')
    this.$store.dispatch('setActivityDoingList')
    this.initData()
  },
  mounted() {

  },
  methods: {
    handleSelectionChange(valueList) {
      if (valueList && valueList.length > 0) {
        this.selectIdList = valueList.map(e => e.id)
      } else {
        this.selectIdList = []
      }
    },
    initData() {
      if (this.$route.query.shopId) {
        this.searchForm.shopId = parseInt(this.$route.query.shopId)
      } else if (this.shopId) {
        this.searchForm.shopId = parseInt(this.shopId)
      }
      this.searchData()
    },
    createRangeChange(value) {
      if (value && value.length > 0) {
        this.$set(this.searchForm, 'startCreateTime', value[0])
        this.$set(this.searchForm, 'endCreateTime', value[1])
      } else {
        this.$set(this.searchForm, 'startCreateTime', null)
        this.$set(this.searchForm, 'endCreateTime', null)
      }
      this.searchData()
    },
    receiveRangeChange(value) {
      if (value && value.length > 0) {
        this.$set(this.searchForm, 'startReceiveTime', value[0])
        this.$set(this.searchForm, 'endReceiveTime', value[1])
      } else {
        this.$set(this.searchForm, 'startReceiveTime', null)
        this.$set(this.searchForm, 'endReceiveTime', null)
      }
      this.searchData()
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.showFullLoading()
      let res = await giftCardApi.page(this.searchForm)
      this.hideFullLoading()
      let {list, total} = res.data
      this.dataList = list || []
      this.total = total || 0
    },
    handleSizeChange(val) {
      this.searchForm.size = val;
      this.searchData();
    },
    handleCurrentChange(val) {
      this.searchForm.page = val;
      this.fetchData();
    },
    openPrepaidLedger() {
      this.$refs.refPrepaidLedger.open()
    },
    importGiftCardShow() {
      this.$refs.refImportGiftCardForm.open()
    },
    async exportExcel() {
      await this.notifyConfirm("将按照当前筛选条件进行导出，是否确定导出？")
      this.showFullLoading('正在导出文件', true)
      await giftCardApi.exportExcel(this.searchForm)
      this.hideFullLoading()
    },
    handleAdd() {
      this.$refs.refGiftCardForm.open()
    },
    async handleDistribution(row, batch = false) {
      await this.notifyConfirm("此操作将" + (batch ? '批量发放' : '发放此') + "礼品卡，是否继续？", '发放礼品卡')
      if (batch) {
        await giftCardApi.batchDistribution(this.userId, this.selectIdList)
      } else {
        await giftCardApi.distribution(row.id, this.userId)
      }
      this.fetchData()
      this.notifySuccess()
    },
    async handleFailure(row, batch = false) {
      await this.notifyConfirm("此操作将" + (batch ? '批量失效' : '失效此') + "礼品卡，是否继续？", '失效礼品卡')
      if (batch) {
        await giftCardApi.batchFailure(this.selectIdList)
      } else {
        await giftCardApi.failure(row.id)
      }
      this.fetchData()
      this.notifySuccess()
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 20px;
}
</style>
