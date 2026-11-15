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
        <el-table-column label="审批类别" prop="approval.categoryTitle">
          <template slot-scope="scope">
            {{ scope.row.approval.categoryTitle }}
            <span v-if="scope.row.leaveSameDay" class="same-day-tag">当天请假</span>
          </template>
        </el-table-column>
<!--        <el-table-column label="当前审批人" prop="approvingUserId">
          <template slot-scope="scope">{{ scope.row.approvingUserId | adminUsernameFilter }}</template>
        </el-table-column>-->
        <!--        <el-table-column label="审批人" prop="targetUserId"></el-table-column>-->
        <el-table-column label="审批状态" prop="approval.state">

          <template slot-scope="scope">{{ scope.row.approval.state | approvalStateFilter }}</template>
        </el-table-column>
        <el-table-column label="抄送人员" min-width="160">
          <template slot-scope="scope">
            <span v-if="ccNames(scope.row).length">{{ ccNames(scope.row).join('、') }}</span>
            <span v-else class="c-info">未抄送</span>
          </template>
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
import massagistLeaveApi from "@/api/massagistLeave";
import ApprovalProgress from "@/views/order/approval/ApprovalProgress";
import MassagistLeaveForm from "@/views/massagist/leave/MassagistLeaveForm";

export default {
  name: 'index',
  components: {ApprovalProgress, MassagistLeaveForm},
  props: {},
  data() {
    return {
      dataList: [],
      listLoading: false,
      searchForm: {
        targetUserId: this.userId,
        flowUserType: 1,
        order: '-id',
      },
      total: 0,
      listError: '',
      cancellingId: null,
      fetchSeq: 0
    }
  },
  computed: {
    ...mapGetters(['userId', 'adminUserList'])
  },
  created() {
    this.$store.dispatch('setAdminUserList')
    this.searchData()
  },
  methods: {
    handleAdd(){
       this.$refs.refMassagistLeaveForm.open()
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      const seq = ++this.fetchSeq
      this.showFullLoading()
      try {
        this.searchForm.targetUserId = this.userId
        const res = await approvalDetailApi.pageLeave({...this.searchForm})
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
    },
    //抄送人id转姓名，账号已删除时显示ID
    ccNames(row) {
      const ids = (row && row.ccUserIdList) || []
      const list = this.adminUserList || []
      return ids.map(id => (list.find(u => u.id == id) || {}).nickName || ('#' + id))
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
.same-day-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 18px;
  color: #a33a12;
  background: #fdf0e9;
  border: 1px solid #f0bfa6;
}
</style>
