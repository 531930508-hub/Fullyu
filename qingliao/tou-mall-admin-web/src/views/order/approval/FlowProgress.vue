<template>
  <div class="flow-progress-root">
    <div class="flow-progress" v-if="nodes.length">
      <template v-for="(node, index) in nodes">
        <el-tooltip :key="'node' + index" placement="top" effect="dark">
          <div slot="content">
            <div>{{ nodeTitle(node) }}</div>
            <div>处理人：{{ nodeUser(node) }}</div>
            <div>时间：{{ node.finishTime || node.startTime || '—' }}</div>
            <div>结果：{{ nodeStateText(node) }}</div>
            <div v-if="nodeRejectReason(node)">驳回原因：{{ nodeRejectReason(node) }}</div>
          </div>
          <span class="flow-node" :class="nodeClass(node)">{{ nodeShort(node) }}</span>
        </el-tooltip>
        <span v-if="index < nodes.length - 1" :key="'arrow' + index" class="flow-arrow">→</span>
      </template>
    </div>
    <span v-else class="flow-empty">暂无流转记录</span>
  </div>
</template>

<script>
/**
 * 审批流转进度：按「节点名·处理人」展示提交→各审批节点→完成/驳回的顺序，
 * 悬浮显示处理人、时间、结果与驳回原因。数据由列表接口的 flowNodes 提供。
 */
export default {
  name: 'FlowProgress',
  props: {
    //列表行：审批详情行（approval 在 row.approval 里）或审批单行（rejectReason 直接挂在行上）
    row: {
      type: Object,
      default: () => ({})
    }
  },
  computed: {
    nodes() {
      return Array.isArray(this.row.flowNodes) ? this.row.flowNodes : []
    },
    approvalStateMap() {
      return this.constant.approvalStateMap
    },
    flowUserTypeMap() {
      return this.constant.flowUserTypeMap
    }
  },
  methods: {
    nodeUser(node) {
      if (node.targetUserId === 0 || node.targetUserId === null || node.targetUserId === undefined) return '系统自动发起'
      return this.$options.filters['adminUsernameFilter'](node.targetUserId)
    },
    nodeTitle(node) {
      const isCreate = node.flowUserType === this.flowUserTypeMap.create
      return node.nodeName || (isCreate ? '提交申请' : '审批')
    },
    nodeShort(node) {
      return `${this.nodeTitle(node)}·${this.nodeUser(node)}`
    },
    nodeStateText(node) {
      const map = this.approvalStateMap
      if (node.flowUserType === this.flowUserTypeMap.create) {
        return node.state === map.withdraw ? '已撤回' : '已提交'
      }
      switch (node.state) {
        case map.passed:
          return '已同意'
        case map.rejected:
          return '已驳回'
        case map.approving:
          return '审批中'
        case map.withdraw:
          return '已撤回'
        case map.skipped:
          return '已跳过'
        default:
          return '待审批'
      }
    },
    nodeClass(node) {
      const map = this.approvalStateMap
      if (node.state === map.rejected) return 'is-rejected'
      if (node.state === map.approving) return 'is-approving'
      if (node.state === map.passed) return 'is-passed'
      if (node.state === map.skipped || node.state === map.withdraw) return 'is-skipped'
      return ''
    },
    //驳回原因存在审批单的 rejectReason（JSON 数组）里，按节点处理人匹配
    nodeRejectReason(node) {
      if (node.state !== this.approvalStateMap.rejected) return ''
      const raw = (this.row.approval && this.row.approval.rejectReason) || this.row.rejectReason
      if (!raw) return ''
      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return ''
        const hit = parsed.find(item => String(item.userId) === String(node.targetUserId))
        return hit ? (hit.rejectReason || '') : ''
      } catch (e) {
        return ''
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
/* 节点胶囊 + 箭头，超长时换行不撑破表格 */
.flow-progress {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  line-height: 22px;
}

.flow-node {
  display: inline-block;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 12px;
  color: #606266;
  background: #f4f4f5;
  border: 1px solid #e9e9eb;
  cursor: default;
}

.flow-node.is-approving {
  color: #b26a00;
  background: #fdf6ec;
  border-color: #f5dab1;
}

.flow-node.is-passed {
  color: #2f7a3d;
  background: #f0f9eb;
  border-color: #c8e6c9;
}

.flow-node.is-rejected {
  color: #b02020;
  background: #fef0f0;
  border-color: #fbc4c4;
}

.flow-node.is-skipped {
  color: #909399;
  background: #f7f7f7;
  border-style: dashed;
}

.flow-arrow {
  margin: 0 4px;
  color: #c0c4cc;
  font-size: 12px;
}

.flow-empty {
  color: #909399;
  font-size: 12px;
}
</style>