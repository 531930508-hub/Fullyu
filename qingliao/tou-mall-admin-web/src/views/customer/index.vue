<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex flex-wrap" style="gap:10px;width: 70%" >
        <el-select v-model="searchForm.gender" style="width: 110px" placeholder="客户性别" clearable @change="searchData">
          <el-option v-for="item in constant.gender"
                     :value="item.value"
                     :label="item.label" :key="item.value">
            <span>{{ item.label }}</span>
          </el-option>
        </el-select>
        <el-input placeholder="请输入客户昵称" v-model="searchForm.nickname" clearable @keyup.enter.native="searchData"
                  style="width: 180px;display: inline-block" @clear="searchData">
        </el-input>
        <el-input placeholder="请输入称呼" v-model="searchForm.comment" clearable @keyup.enter.native="searchData"
                  style="width: 180px;display: inline-block" @clear="searchData">
        </el-input>
        <el-date-picker :clearable="false" clearable style="width: 400px;"
                        v-model="dateTime" @change="searchDateTime"
                        type="daterange" value-format="yyyy-MM-dd HH:mm:ss"
                        range-separator="至" :default-time="['00:00:00','23:59:59']"
                        start-placeholder="注册日期起"
                        end-placeholder="注册日期止"/>
        <el-date-picker :clearable="false" clearable style="width: 400px;"
                        v-model="dateTime2" @change="searchDateTime2"
                        type="daterange" value-format="yyyy-MM-dd HH:mm:ss"
                        range-separator="至" :default-time="['00:00:00','23:59:59']"
                        start-placeholder="更新日期起"
                        end-placeholder="更新日期止"/>
        <basic-customer-tag-selector v-model="searchForm.customerTag" @change="searchData" multiple placeholder="客户标签"
                                     clearable style="width: 200px;"/>
        <el-input placeholder="请输入手机号查询" v-model="searchForm.phone" clearable
                  style="width: 220px;height: 100%" @keyup.enter.native="searchData" @clear="searchData">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
      </div>
      <div style="width: 30%" class="flex justify-end">
        <el-popover
          placement="bottom"
          width="200"
          trigger="click">
          <el-button slot="reference">导出</el-button>
          <div class="flex justify-center">请选择要导出的类型</div>
          <div class="flex justify-center m-t-10">
            <el-button type="primary" size="mini" @click="handleExport('excel')">Excel</el-button>
            <el-button type="primary" size="mini" @click="handleExport('vcf')">vCard</el-button>
          </div>
        </el-popover>
        <el-button @click="openBasicCustomerTag" icon="el-icon-files" style="margin-left: 20px">
          基础标签
        </el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="refTable" :data="dataList" style="width: 100%;" border>
        <!--        <el-table-column label="账号" min-width="200" header-align="center" align="left" prop="userName"
                                  show-overflow-tooltip></el-table-column>-->

        <el-table-column label="手机号" header-align="center" align="center" prop="phone"
                         min-width="200"></el-table-column>
        <el-table-column label="昵称" header-align="center" align="left" prop="nickname" min-width="200"
                         show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.nickname }}
          </template>
        </el-table-column>
        <el-table-column label="称呼 Name" header-align="center" align="left" prop="comment" min-width="120"
                         show-overflow-tooltip>
          <template slot-scope="scope">
            <span class="hover-click" @click="handleEditCustomer(scope.row)">
              {{ scope.row.comment }}
              <i class="el-icon-edit"></i>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="性别 Gender" header-align="center" align="left" prop="gender" min-width="120"
                         show-overflow-tooltip>
          <template slot-scope="scope">
            <span class="hover-click" @click="handleEditCustomer(scope.row)">
              <span v-if="scope.row.gender">
                <i v-if="scope.row.gender == 1" class="el-icon-male c-blue bold"></i>
                <i v-else-if="scope.row.gender == 2" class="el-icon-female c-danger bold"></i>
              </span>
              <i class="el-icon-edit"></i>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="备注 Note" header-align="center" align="left" prop="comment" min-width="120"
                         show-overflow-tooltip>
          <template slot-scope="scope">
            <span class="hover-click" @click="handleEditCustomer(scope.row)">
              {{ scope.row.note }}
              <i class="el-icon-edit"></i>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="头像" header-align="center" align="center" min-width="100" prop="coverImageUrls">
          <template slot-scope="scope">
            <el-image v-if="scope.row.avatar" style="height: 40px;width: 40px"
                      :src="scope.row.avatar" :preview-src-list="[scope.row.avatar]"
                      fit="fill"></el-image>
            <span v-else>无</span>
          </template>
        </el-table-column>
        <el-table-column label="可用券数" header-align="center" align="center" prop="couponCount"
                         width="140">
          <template slot-scope="scope">
            <el-tag class="hover-click" size="mini" @click="openCustomerCoupon(scope.row)">
              {{ scope.row.couponCount || 0 }}张
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="积分" header-align="center" align="center" prop="integration"
                         width="140">
        </el-table-column>
        <el-table-column label="品牌会员" header-align="center" align="center" width="140">
          <template slot-scope="scope">
            <el-tag v-if="scope.row.brandCardLocked === 1" size="mini" type="danger">已锁定</el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" header-align="center" align="center" prop="createTime"
                         width="155"></el-table-column>
        <el-table-column label="疗愈师偏好" header-align="center" align="center" min-width="160">
          <template slot-scope="scope">
            <span class="hover-click" @click.stop="openTherapistDrawer(scope.row)">
              收藏 {{ getPreference(scope.row.id).favorite }} · 暂别 {{ getPreference(scope.row.id).block }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="客户标签" header-align="center" align="center" min-width="100">
          <template slot-scope="scope">
            <span v-if="scope.row.customerTagList && scope.row.customerTagList.length" class="hover-click"
                  @click="openCustomerTag(scope.row)">
              <el-tag size="mini">{{ scope.row.customerTagList.length }}个标签</el-tag>
            </span>
            <span v-else class="hover-click" @click="openCustomerTag(scope.row)">点击添加</span>
          </template>
        </el-table-column>
        <el-table-column label="推荐人" min-width="200" header-align="center" align="center"
                         prop="referrerCustomerName">
        </el-table-column>
        <el-table-column label="更新时间" header-align="center" align="center" prop="updateTime"
                         width="155"></el-table-column>
        <!--        <el-table-column label="操作" width="140" header-align="center" align="center">
                  <template slot-scope="scope">

                  </template>
                </el-table-column>-->
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
    <basic-customer-tag-drawer ref="refBasicCustomerTagDrawer"></basic-customer-tag-drawer>
    <customer-tag-drawer ref="refCustomerTagDrawer"></customer-tag-drawer>
    <customer-coupon-drawer ref="refCustomerCouponDrawer" @submit-success="fetchData"></customer-coupon-drawer>
    <customer-form-dialog ref="refCustomerFormDialog" @submit-success="fetchData"></customer-form-dialog>
    <customer-therapist-drawer ref="refCustomerTherapistDrawer" @change="loadPreferenceCounts(dataList)"/>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import customerApi from '@/api/customer';
import BasicCustomerTagDrawer from './components/BasicCustomerTagDrawer.vue'
import BasicCustomerTagCascader from './components/BasicCustomerTagCascader.vue'
import CustomerTagDrawer from './components/CustomerTagDrawer.vue'
import CustomerCouponDrawer from "./components/CustomerCouponDrawer"
import CustomerFormDialog from "../home/CustomerFormDialog";
import BasicCustomerTagSelector from "./components/BasicCustomerTagSelector";
import fileUtil from "@/utils/fileUtil"
import CustomerTherapistDrawer from "./components/CustomerTherapistDrawer"
import customerMassagistBlockApi from "@/api/customer/customerMassagistBlock"
import dateUtil from "../../utils/dateUtil"

export default {
  name: 'index',
  components: {
    CustomerTherapistDrawer,
    BasicCustomerTagSelector,
    CustomerFormDialog,
    CustomerCouponDrawer, CustomerTagDrawer, BasicCustomerTagCascader, BasicCustomerTagDrawer
  },
  props: {},
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        order: '-id'
      },
      total: 0,
      dataList: [],
      preferenceCountMap: {},
      dateTime: [],
      dateTime2: []
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
    this.searchData()
  },
  methods: {
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.showFullLoading()
      let res = await customerApi.page({
        ...this.searchForm,
        customerTag: this.searchForm.customerTag != null ? this.searchForm.customerTag.join(",") : ''
      })
      this.hideFullLoading()
      let {list, total} = res.data
      this.dataList = list || []
      this.total = total || 0
      this.loadPreferenceCounts(this.dataList)
    },
    async loadPreferenceCounts(customers) {
      const customerIds = (customers || []).map(c => c.id).filter(id => id != null)
      if (!customerIds.length) {
        this.preferenceCountMap = {}
        return
      }
      try {
        const res = await customerMassagistBlockApi.count(customerIds)
        this.preferenceCountMap = res.data || {}
      } catch (e) {
        this.preferenceCountMap = {}
      }
    },
    getPreference(customerId) {
      const item = this.preferenceCountMap[customerId] || {}
      return {
        favorite: item.favorite || 0,
        block: item.block || 0
      }
    },
    openTherapistDrawer(row) {
      this.$refs.refCustomerTherapistDrawer.open(row.id, row.nickname)
    },
    handleSizeChange(val) {
      this.searchForm.size = val;
      this.searchData();
    },
    handleCurrentChange(val) {
      this.searchForm.page = val;
      this.fetchData();
    },
    openBasicCustomerTag() {
      this.$refs.refBasicCustomerTagDrawer.open()
    },
    openCustomerTag(row) {
      let nickname = this.customerTitle(row)
      this.$refs.refCustomerTagDrawer.open(row, nickname)
    },
    openCustomerCoupon(row) {
      let nickname = this.customerTitle(row)
      this.$refs.refCustomerCouponDrawer.open(row.id, nickname)
    },
    handleEditCustomer(customer) {
      this.$refs.refCustomerFormDialog.open(customer)
    },
    async handleExport(exportType) {
      await this.notifyConfirm("将按照当前筛选条件进行导出，是否确定导出？")
      this.showFullLoading('正在导出文件', true)
      let fileName = "导出客户信息"
      if (this.searchForm.startCreateTime) {
        fileName += "&注册时间:" + dateUtil.toDate(this.searchForm.startCreateTime) + "到" + dateUtil.toDate(this.searchForm.endCreateTime)
      }
      if (this.searchForm.startUpdateTime) {
        fileName += "&更新时间:" + dateUtil.toDate(this.searchForm.startUpdateTime) + "到" + dateUtil.toDate(this.searchForm.endUpdateTime)
      }
      await customerApi.exportExcel({
        ...this.searchForm,
        customerTag: this.searchForm.customerTag != null ? this.searchForm.customerTag.join(",") : '',
        exportType: exportType
      }).then(res => {
        if (exportType == 'vcf') {
          fileUtil.exportZipSave(res, fileName + ".zip")
        } else {
          fileUtil.exportSave(res, fileName + ".xlsx")
        }
      })
      this.hideFullLoading()
    },
    searchDateTime(val) {
      if (this.dateTime) {
        this.searchForm.startCreateTime = val[0]
        this.searchForm.endCreateTime = val[1]
      } else {
        this.searchForm.startCreateTime = ''
        this.searchForm.endCreateTime = ''
      }
      this.searchData()
    },
    searchDateTime2(val) {
      if (this.dateTime2) {
        this.searchForm.startUpdateTime = val[0]
        this.searchForm.endUpdateTime = val[1]
      } else {
        this.searchForm.startUpdateTime = ''
        this.searchForm.endUpdateTime = ''
      }
      this.searchData()
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
}
</style>
