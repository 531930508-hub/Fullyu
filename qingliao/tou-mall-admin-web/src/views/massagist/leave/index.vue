<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div class="flex flex-wrap" style="gap:10px;flex: 1">
<!--        <el-select v-model="searchForm.state" style="width: 300px"
                   @change="searchData" placeholder="审核状态" clearable>
          <el-option
            v-for="item in constant.approvalState"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>-->
      </div>
      <div class="flex flex-wrap" style="gap:10px;width: 540px;justify-content: right;">
        <el-button icon="el-icon-plus" @click="handleAdd" type="primary">申请休息</el-button>
      </div>
    </div>
    <el-alert v-if="listError" :title="listError" type="error" show-icon :closable="false" class="list-error">
      <el-button type="text" @click="fetchData">重新加载</el-button>
    </el-alert>

    <div class="table-container">
      <el-table :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column label="审批类别" prop="approval.categoryTitle"></el-table-column>
<!--        <el-table-column label="当前审批人" prop="approvingUserId">
          <template slot-scope="scope">{{ scope.row.approvingUserId | adminUsernameFilter }}</template>
        </el-table-column>-->
        <!--        <el-table-column label="审批人" prop="targetUserId"></el-table-column>-->
        <el-table-column label="审批状态" prop="approval.state">

          <template slot-scope="scope">{{ scope.row.approval.state | approvalStateFilter }}</template>
        </el-table-column>
        <el-table-column label="创建时间" prop="createTime"></el-table-column>
        <el-table-column label="创建人" prop="createUser">
          <template slot-scope="scope">{{ scope.row.createUser | adminUsernameFilter }}</template>
        </el-table-column>
        <el-table-column label="操作">
          <template slot-scope="scope">
            <el-row>
              <el-button type="text"
                         @click="info(scope.row,scope.$index)">
                详情
              </el-button>
              <el-button type="text"
                         v-if="scope.row.targetUserId==userId
                         && (scope.row.approval.state==constant.approvalStateMap.rejected || scope.row.approval.state==constant.approvalStateMap.withdraw)"
                         @click="resetSubmit(scope.row,scope.$index)">再次提交
              </el-button>
              <el-button type="text" v-if="scope.row.approval.state!=3"
                         :loading="cancellingId===scope.row.approvalId"
                         :disabled="cancellingId!==null"
                         @click="cancelLeave(scope.row,scope.$index)">
                撤销
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
    <approval-progress ref="refApprovalProgress" @submit="searchData"></approval-progress>
    <massagist-leave-form ref="refMassagistLeaveForm" @submit-success="searchData"></massagist-leave-form>

  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import approvalDetailApi from "@/api/approvalDetail";
import approvalCategoryApi from "@/api/shop/approvalCategory";
import massagistLeaveApi from "@/api/massagistLeave";
import ApprovalProgress from "@/views/order/approval/ApprovalProgress";
import RefundForm from "@/views/order/RefundForm";
import ApprovalCategorySelector from "@/views/ums/approvalCategory/ApprovalCategorySelector";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import MassagistLeaveForm from "@/views/massagist/leave/MassagistLeaveForm";
import {getInfoNew} from "@/api/login";

export default {
  name: 'index',
  components: {ApprovalCategorySelector, RefundForm, ApprovalProgress,ShopSelector,MassagistLeaveForm},
  props: {},
  data() {
    return {
      dataList: [],
      listLoading: false,
      searchForm: {
        targetUserId: this.userId,
        flowUserType: 1,
        order: '-id',
       /* shopId:this.shopId*/
      },
      total: 0,
      listError: '',
      cancellingId: null,
      fetchSeq: 0
    }
  },
  computed: {
    ...mapGetters(['userId','shopId','massagistId'])
  },
  created() {
    this.searchForm.shopId=this.shopId
    this.$store.dispatch('setAdminUserList')
    this.$store.dispatch('setShopList')
    this.getApprovalCategory();
  },
  methods: {
    handleAdd(){
       this.$refs.refMassagistLeaveForm.open()
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async getApprovalCategory() {
      console.log(this.massagistId)
      //获取疗愈师真正的店铺id
      let memberInfo=await getInfoNew()
      let res = await approvalCategoryApi.listByShopId({shopId:memberInfo.data.shopId})
      let list = res.data;
      if (list.length) {
        list.forEach(item => {
          if(item.title=='请假审批'){
            this.searchForm.categoryId=item.id
          }
        });
      }
      this.searchData()
    },
    async fetchData() {
      const seq = ++this.fetchSeq
      this.showFullLoading()
      try {
        this.searchForm.targetUserId = this.userId
        const res = await approvalDetailApi.page({...this.searchForm})
        if (seq !== this.fetchSeq) return
        const {list, total} = (res && res.data) || {}
        this.dataList = list || []
        this.total = total || 0
        this.listError = ''
      } catch (e) {
        if (seq !== this.fetchSeq) return
        this.listError = '休息申请列表加载失败，请重试'
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
    async resetSubmit(row, index) {
      const resMassagistLeave = await massagistLeaveApi.findMassagistLeaveDetailByApprovalId(row.approvalId)
      let detailData = resMassagistLeave.data || {}
      this.$refs.refMassagistLeaveForm.open(detailData)
    },
    async cancelLeave(row, index) {
      if (this.cancellingId !== null || !row || row.approvalId == null) return false
      this.cancellingId = row.approvalId
      try {
        try {
          await this.notifyConfirm("将撤销本次休息申请，是否确定撤销？")
        } catch (e) {
          return false
        }
        try {
          await massagistLeaveApi.cancelLeave(row.approvalId)
        } catch (e) {
          this.$message.error('撤销失败：' + ((e && e.message) || '请稍后重试'))
          return false
        }
        this.$notify.success("撤销成功")
        this.searchData()
        return true
      } finally {
        this.cancellingId = null
      }
    },
    info(row) {
      this.$refs.refApprovalProgress.open(row)
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
}
.button-container {
  text-align: right; /* 或者使用 flex 布局 */
}
</style>
