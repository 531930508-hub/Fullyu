<template>
  <div class="todo-center">
    <div class="todo-head">
      <div class="todo-title">
        <h2>待办中心</h2>
        <p>审批按人流转，不再受门店限制。这里汇总所有需要你处理的审批。</p>
      </div>
      <div class="todo-actions">
        <span class="pending-pill" v-if="pendingCount > 0">待处理 {{ pendingCount }} 项</span>
        <el-button size="small" @click="$refs.refNoticeSettings.open()">我的审批通知</el-button>
        <el-button size="small" icon="el-icon-refresh" @click="refreshAll">刷新</el-button>
      </div>
    </div>

    <el-tabs v-model="activeName" @tab-click="handleTabChange">
      <el-tab-pane name="pending">
        <span slot="label">待我审批 <b class="tab-count" v-if="tabTotals.pending > 0">{{ tabTotals.pending }}</b></span>
      </el-tab-pane>
      <el-tab-pane name="done">
        <span slot="label">我已处理</span>
      </el-tab-pane>
      <el-tab-pane name="cc">
        <span slot="label">抄送我的</span>
      </el-tab-pane>
    </el-tabs>

    <div class="table-card">
      <el-table :data="dataList" v-loading="listLoading" border style="width: 100%;">
        <el-table-column label="审批类别" prop="approval.categoryTitle" min-width="140">
          <template slot-scope="scope">{{ scope.row.approval && scope.row.approval.categoryTitle || '—' }}</template>
        </el-table-column>
        <el-table-column label="发起人" min-width="110">
          <template slot-scope="scope">{{ scope.row.createUser | adminUsernameFilter }}</template>
        </el-table-column>
        <el-table-column label="审批状态" min-width="110">
          <template slot-scope="scope">
            <span :class="['state-tag', stateClass(scope.row)]">{{ scope.row.approval && scope.row.approval.state | approvalStateFilter }}</span>
          </template>
        </el-table-column>
        <el-table-column label="发起时间" prop="createTime" min-width="160"></el-table-column>
        <el-table-column v-if="activeName === 'done'" label="处理时间" prop="finishTime" min-width="160"></el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template slot-scope="scope">
            <el-button type="text" @click="openDetail(scope.row)">详情</el-button>
            <template v-if="activeName === 'pending'">
              <el-button type="text" class="pass-btn" @click="handlePass(scope.row)">通过</el-button>
              <el-button type="text" class="reject-btn" @click="handleReject(scope.row)">拒绝</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="empty-tip" v-if="!listLoading && dataList.length === 0">
        <template v-if="activeName === 'pending'">当前没有待你处理的审批，保持轻松。</template>
        <template v-else-if="activeName === 'done'">还没有处理记录。</template>
        <template v-else>暂时没有抄送给你的审批。</template>
      </div>

      <div class="pager">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next, jumper"
          :page-sizes="[10, 20, 50]"
          :page-size="searchForm.size"
          :current-page="searchForm.page"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handlePageChange">
        </el-pagination>
      </div>
    </div>

    <admin-notice-settings ref="refNoticeSettings" :key="userId" />
    <approval-progress ref="refApprovalProgress" @submit="refreshAll"></approval-progress>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import approvalTodoApi from '@/api/approvalTodo'
import ApprovalProgress from '@/views/order/approval/ApprovalProgress'
import AdminNoticeSettings from './AdminNoticeSettings'

export default {
  name: 'todoCenter',
  components: {ApprovalProgress, AdminNoticeSettings},
  data() {
    return {
      activeName: 'pending',
      listLoading: false,
      dataList: [],
      total: 0,
      tabTotals: {pending: 0},
      searchForm: {page: 1, size: 10}
    }
  },
  computed: {
    ...mapGetters(['userId', 'todoCount']),
    pendingCount() {
      return this.todoCount
    }
  },
  watch: {
    userId: {
      handler(val) {
        if (val) {
          this.searchData()
        }
      },
      immediate: true
    }
  },
  created() {
    this.$store.dispatch('setAdminUserList')
    this.refreshAll()
  },
  methods: {
    buildQuery() {
      const base = {targetUserId: this.userId, flowUserType: 2, order: '-id'}
      if (this.activeName === 'pending') {
        return {...base, state: 2}
      }
      if (this.activeName === 'done') {
        return {...base, state: '3,0'}
      }
      return {...base, flowUserType: 3, state: null}
    },
    refreshAll() {
      this.searchData()
      this.refreshCount()
    },
    refreshCount() {
      this.$store.dispatch('RefreshTodoCount').then(count => {
        this.tabTotals.pending = count
      })
    },
    searchData() {
      if (!this.userId) {
        return
      }
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.listLoading = true
      try {
        const params = {...this.buildQuery(), page: this.searchForm.page, size: this.searchForm.size}
        const res = await approvalTodoApi.page(params)
        const data = res.data || {}
        this.dataList = data.list || []
        this.total = data.total || 0
        if (this.activeName === 'pending') {
          this.tabTotals.pending = this.total
        }
      } finally {
        this.listLoading = false
      }
    },
    handleTabChange() {
      this.searchData()
      this.refreshCount()
    },
    handleSizeChange(size) {
      this.searchForm.size = size
      this.searchData()
    },
    handlePageChange(page) {
      this.searchForm.page = page
      this.fetchData()
    },
    stateClass(row) {
      const state = row.approval && row.approval.state
      if (state === 3) return 'is-passed'
      if (state === 0) return 'is-rejected'
      if (state === 2) return 'is-approving'
      return 'is-default'
    },
    openDetail(row) {
      this.$refs.refApprovalProgress.open(row)
    },
    async handlePass(row) {
      await this.notifyConfirm('确认通过该审批？通过后将进入下一审批人或直接生效。')
      await approvalTodoApi.pass(row.id)
      this.notifySuccess()
      this.refreshAll()
    },
    handleReject(row) {
      this.$prompt('请输入拒绝原因', '拒绝审批', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /^.+$/,
        inputErrorMessage: '原因不能为空'
      }).then(async ({value}) => {
        await approvalTodoApi.reject(row.id, value)
        this.notifySuccess()
        this.refreshAll()
      }).catch(() => {
      })
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
.todo-center {
  padding: 20px 24px 32px;
  letter-spacing: 0.05em;

  .todo-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 8px;

    .todo-title h2 {
      margin: 0 0 6px;
      font-size: 20px;
      font-weight: 600;
      color: #322f35;
      letter-spacing: 0.06em;
    }

    .todo-title p {
      margin: 0;
      font-size: 12px;
      color: #79747e;
      line-height: 1.7;
    }
  }

  .todo-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pending-pill {
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 12px;
    color: #584219;
    background: #fbf4e8;
    border: 1px solid #e4c892;
  }

  .tab-count {
    display: inline-block;
    min-width: 18px;
    margin-left: 4px;
    padding: 0 5px;
    border-radius: 9px;
    font-size: 11px;
    line-height: 18px;
    text-align: center;
    color: #584219;
    background: #e4c892;
  }

  .table-card {
    background: #fff;
    border: 1px solid #f0edef;
    border-radius: 10px;
    padding: 4px 16px 16px;
  }

  .state-tag {
    font-size: 12px;

    &.is-passed { color: #2f7d52; }
    &.is-rejected { color: #c4562f; }
    &.is-approving { color: #8a6a40; }
    &.is-default { color: #79747e; }
  }

  .pass-btn { color: #2f7d52; }
  .reject-btn { color: #c4562f; }

  .empty-tip {
    padding: 40px 0;
    text-align: center;
    font-size: 13px;
    color: #9a96a2;
  }

  .pager {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
}
</style>
