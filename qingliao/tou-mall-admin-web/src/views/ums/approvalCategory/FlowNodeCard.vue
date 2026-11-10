<template>
  <div class="flow-node-card">
    <div class="node-header">
      <span class="node-index">节点 {{ index + 1 }}</span>
      <el-input v-model="node.nodeName"
                class="node-name"
                size="small"
                maxlength="20"
                show-word-limit
                placeholder="节点名称，如：店长审批"></el-input>
      <el-radio-group v-model="node.approveMode" size="mini">
        <el-radio-button label="ANY">或签</el-radio-button>
        <el-radio-button label="ALL">会签</el-radio-button>
      </el-radio-group>
      <div class="node-actions">
        <el-button type="text" icon="el-icon-top" :disabled="index === 0" title="上移" @click="$emit('move-up')"></el-button>
        <el-button type="text" icon="el-icon-bottom" :disabled="index === total - 1" title="下移" @click="$emit('move-down')"></el-button>
        <el-button type="text" icon="el-icon-delete" title="删除节点" @click="$emit('remove')"></el-button>
      </div>
    </div>

    <div class="target-list">
      <div v-for="(target, tIndex) in node.targets" :key="tIndex" class="target-row">
        <el-select v-model="target.type" size="small" class="target-type" @change="changeType(target)">
          <el-option label="指定人员" value="USER"></el-option>
          <el-option label="按身份" value="IDENTITY"></el-option>
        </el-select>
        <admin-user-selector v-if="target.type === 'USER'"
                             v-model="target.adminId"
                             class="target-value"
                             placeholder="选择审批人"></admin-user-selector>
        <template v-else>
          <el-select v-model="target.code" size="small" class="target-identity" placeholder="选择身份">
            <el-option v-for="opt in identityOptions"
                       :key="opt.value"
                       :label="opt.label"
                       :value="opt.value"></el-option>
          </el-select>
          <el-select v-model="target.scope" size="small" class="target-scope">
            <el-option label="本店" value="SHOP"></el-option>
            <el-option label="全部门店" value="ALL"></el-option>
          </el-select>
        </template>
        <el-button type="text" icon="el-icon-remove-outline" title="删除该审批对象"
                   class="target-remove"
                   :disabled="node.targets.length === 1"
                   @click="node.targets.splice(tIndex, 1)"></el-button>
      </div>
    </div>

    <div class="node-footer">
      <el-button type="text" icon="el-icon-plus" @click="addTarget">添加审批对象</el-button>
      <span class="node-tip">{{ modeTip }}</span>
    </div>
  </div>
</template>

<script>
import AdminUserSelector from '@/views/ums/approvalCategory/AdminUserSelector'

export default {
  name: 'FlowNodeCard',
  components: {AdminUserSelector},
  props: {
    node: {type: Object, required: true},
    index: {type: Number, required: true},
    total: {type: Number, required: true},
    identityOptions: {type: Array, default: () => []},
  },
  computed: {
    modeTip() {
      return this.node.approveMode === 'ALL'
        ? '会签：本节点所有审批人都通过后才进入下一节点'
        : '或签：本节点任意一人通过即进入下一节点'
    }
  },
  methods: {
    addTarget() {
      this.node.targets.push({type: 'USER', adminId: null})
    },
    changeType(target) {
      target.adminId = null
      target.code = null
      target.scope = 'SHOP'
      if (target.type === 'IDENTITY') {
        const first = this.identityOptions[0]
        if (first) target.code = first.value
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.flow-node-card {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 12px;
  background: #fff;
}

.node-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.node-index {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
}

.node-name {
  width: 180px;
}

.node-actions {
  margin-left: auto;
  white-space: nowrap;
}

.target-list {
  margin-top: 10px;
}

.target-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.target-type {
  width: 116px;
  flex: none;
}

.target-value {
  flex: 1;
}

.target-identity {
  width: 140px;
  flex: none;
}

.target-scope {
  width: 120px;
  flex: none;
}

.target-remove {
  flex: none;
}

.node-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.node-tip {
  font-size: 12px;
  color: #909399;
  letter-spacing: 0.05em;
}
</style>
