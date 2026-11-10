<template>
  <div class="index">
    <el-tabs v-model="activeName">
      <el-tab-pane label="待我处理" name="second"></el-tab-pane>
      <el-tab-pane label="我已提交" name="first"></el-tab-pane>
      <el-tab-pane label="我已处理" name="third"></el-tab-pane>
      <el-tab-pane label="抄送我的" name="fourth"></el-tab-pane>
    </el-tabs>
    <div class="" style="gap:10px;">
      <shop-selector v-model="searchForm.shopId" style="width: 180px" @change="handleShopChange"
                     placeholder="请选择所属门店" class="m-r-10"></shop-selector>
      <approval-category-selector v-model="searchForm.categoryId" :shop-id="searchForm.shopId"
                                  ref="refApprovalCategorySelector"
                                  @change="searchData"></approval-category-selector>
      <div style="gap:10px;float: right">&nbsp;
        <el-button @click="handlePass(1)"
                   v-if="selectIdList && selectIdList.length>0">批量通过
        </el-button>
        <el-button @click="handlePass(0)"
                   v-if="selectIdList && selectIdList.length>0">批量拒绝
        </el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table :data="dataList"
                style="width: 100%;"
                @selection-change="handleSelectionChange"
                v-loading="listLoading" border>
        <el-table-column  type="selection"
                          v-if="activeName=='second'">
        </el-table-column>
        <el-table-column label="当前审批人" prop="approvingUserId"
                         v-if="activeName=='second'">
          <template slot-scope="scope">{{ scope.row.approvingUserId | adminUsernameFilter }}</template>
        </el-table-column>
        <el-table-column label="审批类别" prop="approval.categoryTitle"></el-table-column>
        <!--        <el-table-column label="审批人" prop="targetUserId"></el-table-column>-->
        <el-table-column label="审批状态" prop="approval.state">

          <template slot-scope="scope">{{ scope.row.approval.state | approvalStateFilter }}</template>
        </el-table-column>
        <el-table-column label="创建时间" prop="createTime"></el-table-column>
        <el-table-column label="创建人" prop="createUser">
          <template slot-scope="scope"><span v-if="scope.row.createUser === 0">系统自动发起</span><span v-else>{{ scope.row.createUser | adminUsernameFilter }}</span></template>
        </el-table-column>
        <el-table-column label="操作">
          <template slot-scope="scope">
            <el-row>
              <el-button type="text"
                         @click="info(scope.row,scope.$index)">
                详情
              </el-button>
              <el-button type="text"
                         v-if="activeName=='second' && scope.row.state == constant.approvalStateMap.approving && scope.row.targetUserId == userId && scope.row.flowUserType==constant.flowUserTypeMap.approval"
                         @click="pass(scope.row,scope.$index)">
                通过
              </el-button>
              <el-button type="text"
                         v-if="activeName=='second' && scope.row.state == constant.approvalStateMap.approving && scope.row.targetUserId == userId && scope.row.flowUserType==constant.flowUserTypeMap.approval"
                         @click="rejected(scope.row,scope.$index)">
                拒绝
              </el-button>

              <el-button type="text"
                         v-if="activeName=='first' && scope.row.targetUserId==userId && (scope.row.approval.categoryTitle == '退款审批'|| scope.row.approval.categoryTitle == '请假审批')
                         && (scope.row.approval.state==constant.approvalStateMap.rejected || scope.row.approval.state==constant.approvalStateMap.withdraw)"
                         @click="resetSubmit(scope.row,scope.$index)">再次提交
              </el-button>
<!--              <el-button type="text" v-if="scope.row.approval.categoryTitle == '请假审批'&&activeName!='first'&&activeName!='fourth'"
                         @click="cancelLeave(scope.row,scope.$index)">
                撤销
              </el-button>-->
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
    <refund-form ref="refRefundForm" @submit-success="searchData"></refund-form>
    <massagist-leave-form ref="refMassagistLeaveForm" @submit-success="searchData"></massagist-leave-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import approvalDetailApi from "@/api/approvalDetail";
import ApprovalProgress from "@/views/order/approval/ApprovalProgress";
import RefundForm from "@/views/order/RefundForm";
import ApprovalCategorySelector from "@/views/ums/approvalCategory/ApprovalCategorySelector";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import MassagistLeaveForm from "@/views/massagist/leave/MassagistLeaveForm";
import massagistLeaveApi from "@/api/massagistLeave";

export default {
  name: 'index',
  components: {ApprovalCategorySelector, RefundForm, ApprovalProgress,ShopSelector,MassagistLeaveForm},
  props: {},
  watch: {
    activeName: {
      handler(newVal, oldVal) {
        if (newVal == 'first') {
          this.searchForm = {targetUserId: this.userId, flowUserType: 1, order: '-id',shopId:this.searchForm.shopId}
        } else if (newVal == 'second') {
          this.searchForm = {targetUserId: this.userId, flowUserType: 2, state: 2, order: '-id',shopId:this.searchForm.shopId}
        } else if (newVal == 'third') {
          this.searchForm = {targetUserId: this.userId, flowUserType: 2, state: '3,0', order: '-id',shopId:this.searchForm.shopId}
        } else if (newVal == 'fourth') {
          this.searchForm = {targetUserId: this.userId, flowUserType: 3, state: null, order: '-id',shopId:this.searchForm.shopId}
        }
        this.searchForm.page = 1
        this.searchForm.size = 10
        this.selectIdList = []
        this.searchData()
      },
      immediate: true
    }
  },
  data() {
    return {
      dataList: [],
      activeName: 'second',
      listLoading: false,
      submitting: false,
      requestId: 0,
      searchForm: {},
      total: 0,
      selectIdList:[]
    }
  },
  computed: {
    ...mapGetters(['userId','shopId'])
  },
  created() {
    this.searchForm.shopId=this.shopId
    this.$store.dispatch('setAdminUserList')
    this.activeName = 'second'
  },
  methods: {
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async handlePass(optiontype, selectedIds = this.selectIdList) {
      if (this.submitting || !selectedIds.length) return
      const ids = [...selectedIds]
      this.submitting = true
      let loadingShown = false
      let completed = 0
      try {
        let reason
        try {
          if (optiontype === 1) await this.notifyConfirm('确定要通过此审批吗？')
          else {
            const answer = await this.$prompt('请输入拒绝原因', '提示', {
              confirmButtonText: '确定', cancelButtonText: '取消',
              inputPattern: /\S+/, inputErrorMessage: '原因不能为空'
            })
            reason = answer.value.trim()
          }
        } catch (error) {
          if (error === 'cancel' || error === 'close') return
          throw error
        }
        this.showFullLoading()
        loadingShown = true
        for (const id of ids) {
          if (optiontype === 1) await approvalDetailApi.pass(id)
          else await approvalDetailApi.reject(id, reason)
          completed++
        }
        this.selectIdList = []
        this.searchForm.page = 1
        await this.fetchData()
        this.notifySuccess()
      } catch (error) {
        if (completed > 0) {
          this.selectIdList = []
          this.$notify.warning(`已处理 ${completed} 条，其余未确认完成。请刷新列表后重试。`)
        }
        throw error
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.submitting = false
      }
    },
    handleSelectionChange(valueList) {
      if (valueList && valueList.length > 0) {
        this.selectIdList = valueList.map(e => e.id)
      } else {
        this.selectIdList = []
      }
      console.log(this.selectIdList)
    },
    async fetchData() {
      const requestId = ++this.requestId
      this.listLoading = true
      try {
        const res = await approvalDetailApi.page({...this.searchForm})
        if (requestId !== this.requestId) return
        const {list, total} = res.data || {}
        this.dataList = list || []
        this.total = total || 0
        this.selectIdList = []
      } catch (error) {
        if (requestId === this.requestId) throw error
      } finally {
        if (requestId === this.requestId) this.listLoading = false
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
    async pass(row) {
      await this.handlePass(1, [row.id])
    },
    async rejected(row) {
      await this.handlePass(0, [row.id])
    },
    async resetSubmit(row, index) {
      if (row.approval.categoryTitle == '退款审批') {
        const resCategoryDetail = await approvalDetailApi.findApprovalCategoryDetail(row.approvalId)
        let detailData = resCategoryDetail.data || {}
        this.$refs.refRefundForm.resetOpen(detailData)
        console.log("打开退款申请表单")
      }
      if (row.approval.categoryTitle == "请假审批") {
        const resMassagistLeave = await massagistLeaveApi.findMassagistLeaveDetailByApprovalId(row.approvalId)
        let detailData = resMassagistLeave.data || {}
        this.$refs.refMassagistLeaveForm.open(detailData)
        console.log("打开请假审批表单")
      }
    },
    info(row) {
      this.$refs.refApprovalProgress.open(row)
    },
    async cancelLeave(row, index) {
      await this.notifyConfirm("将撤销本次请假记录，是否确定撤销？")
      await massagistLeaveApi.cancelLeave(row.approvalId)
      this.$notify.success("操作成功")
      this.searchData()
    },
    handleShopChange() {
      console.log("this.searchForm");
      this.$nextTick(() => {
        this.$refs.refApprovalCategorySelector.changeShopId(this.searchForm.shopId)
      })
       this.searchData()
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 0 20px;
}
</style>
