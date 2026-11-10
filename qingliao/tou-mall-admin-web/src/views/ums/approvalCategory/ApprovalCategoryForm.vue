<template>
  <div class="ApprovalCategoryForm">
    <el-dialog
      :title="form.id ? '配置审批流程':'新增审批流程'"
      :visible.sync="dialogVisible"
      width="min(760px, calc(100vw - 32px))"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="90px" label-position="top" class="form-body">
        <el-form-item label="审批类型">
          <el-select v-model="form.code" placeholder="请选择审批类型" @change="changeCode" :disabled="!!form.id">
            <el-option
              v-for="item in constant.approvalCategory"
              :key="item.value"
              :label="item.label"
              :value="item.value">
            </el-option>
          </el-select>
        </el-form-item>

        <div class="section-title">
          审批流程
          <span class="section-tip">按节点顺序依次流转；节点内可混合“指定人员”和“按身份”，身份会解析为本店或全部门店当前在职人员。</span>
        </div>

        <flow-node-card v-for="(node, index) in form.nodes"
                        :key="index"
                        :node="node"
                        :index="index"
                        :total="form.nodes.length"
                        :identity-options="identityOptions"
                        @move-up="moveNode(index, -1)"
                        @move-down="moveNode(index, 1)"
                        @remove="removeNode(index)"></flow-node-card>

        <el-button type="primary" plain icon="el-icon-plus" class="add-node" @click="addNode">添加审批节点</el-button>

        <el-form-item label="抄送人（可选）" class="cc-item">
          <el-select v-model="form.ccIdList" multiple filterable placeholder="审批结束后抄送，可多选" style="width: 100%">
            <el-option v-for="item in adminUserList"
                       :key="item.id"
                       :label="item.nickName"
                       :value="item.id"></el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">确 定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import FlowNodeCard from '@/views/ums/approvalCategory/FlowNodeCard'
import approvalCategoryApi from '@/api/shop/approvalCategory'
import massagistApi from '@/api/massagist'

const FALLBACK_IDENTITIES = [
  {value: 'SHOP_MANAGER', label: '店长'},
  {value: 'TRAINER', label: '内训师'},
]

export default {
  name: 'ApprovalCategoryForm',
  components: {FlowNodeCard},
  data() {
    return {
      form: {
        nodes: [],
        ccIdList: [],
      },
      identityOptions: FALLBACK_IDENTITIES.slice(),
      dialogVisible: false,
      submitting: false,
    }
  },
  computed: {
    ...mapGetters(['adminUserList'])
  },
  created() {
    this.$store.dispatch('setAdminUserList')
    this.loadIdentityOptions()
  },
  methods: {
    async loadIdentityOptions() {
      try {
        let res = await massagistApi.identityOptions()
        if (res.data && res.data.length) this.identityOptions = res.data
      } catch (e) {
        // 接口异常时使用内置身份，不影响配置
      }
    },
    open(form = {}) {
      this.form = {shopId: null, ...form}
      this.$set(this.form, 'ccIdList', this.parseIds(form.ccIds))
      this.$set(this.form, 'nodes', this.buildNodes(form))
      this.dialogVisible = true
    },
    parseIds(json) {
      if (!json) return []
      try {
        const ids = JSON.parse(json)
        return Array.isArray(ids) ? ids : []
      } catch (e) {
        return []
      }
    },
    /**
     * 已有流程节点直接编辑；旧版按“级”配置的审批人转换成同名节点，保存后即迁移为新流程。
     */
    buildNodes(form) {
      if (Array.isArray(form.nodes) && form.nodes.length) {
        return form.nodes.map((node, index) => ({
          nodeName: node.nodeName || `审批节点${index + 1}`,
          approveMode: node.approveMode === 'ALL' ? 'ALL' : 'ANY',
          targets: (node.targets || []).map(target => this.normalizeTarget(target)),
        }))
      }
      const legacyApprovers = this.parseIds(form.approvalIds)
      if (legacyApprovers.length) {
        return legacyApprovers.map((adminId, index) => ({
          nodeName: `审批节点${index + 1}`,
          approveMode: 'ANY',
          targets: [{type: 'USER', adminId}],
        }))
      }
      return [this.emptyNode(0)]
    },
    normalizeTarget(target) {
      if (target && target.type === 'IDENTITY') {
        return {type: 'IDENTITY', code: target.code || null, scope: target.scope === 'ALL' ? 'ALL' : 'SHOP'}
      }
      return {type: 'USER', adminId: target ? target.adminId : null}
    },
    emptyNode(index) {
      const first = this.identityOptions[0]
      return {
        nodeName: `审批节点${index + 1}`,
        approveMode: 'ANY',
        targets: [{type: 'IDENTITY', code: first ? first.value : 'SHOP_MANAGER', scope: 'SHOP'}],
      }
    },
    addNode() {
      this.form.nodes.push(this.emptyNode(this.form.nodes.length))
    },
    removeNode(index) {
      this.form.nodes.splice(index, 1)
    },
    moveNode(index, offset) {
      const target = index + offset
      if (target < 0 || target >= this.form.nodes.length) return
      const nodes = this.form.nodes
      const temp = nodes[target]
      this.$set(nodes, target, nodes[index])
      this.$set(nodes, index, temp)
    },
    handleClose() {
      this.dialogVisible = false
      this.form = {nodes: [], ccIdList: []}
    },
    changeCode(code) {
      let findIndex = this.constant.approvalCategory.findIndex(e => e.value == code)
      if (findIndex < 0) return
      this.$set(this.form, 'code', this.constant.approvalCategory[findIndex].value)
      this.$set(this.form, 'title', this.constant.approvalCategory[findIndex].label)
    },
    validateNodes() {
      if (!this.form.nodes.length) return '请至少配置一个审批节点'
      for (let i = 0; i < this.form.nodes.length; i++) {
        const node = this.form.nodes[i]
        const label = node.nodeName || `节点${i + 1}`
        if (!node.targets || !node.targets.length) return `${label}：请至少添加一位审批人或一个身份`
        for (const target of node.targets) {
          if (target.type === 'IDENTITY') {
            if (!target.code) return `${label}：请选择身份`
            if (!target.scope) return `${label}：请选择身份范围`
          } else if (!target.adminId) {
            return `${label}：请选择审批人`
          }
        }
      }
      return null
    },
    async onSubmit() {
      if (this.submitting) return
      const message = this.validateNodes()
      if (message) {
        this.$message.warning(message)
        return
      }
      this.submitting = true
      let loadingShown = false
      try {
        const request = {
          id: this.form.id,
          code: this.form.code,
          title: this.form.title,
          shopId: this.form.shopId,
          processingTime: this.form.processingTime,
          ccIdList: this.form.ccIdList || [],
          nodes: this.form.nodes.map((node, index) => ({
            nodeName: (node.nodeName || '').trim() || `审批节点${index + 1}`,
            approveMode: node.approveMode === 'ALL' ? 'ALL' : 'ANY',
            targets: node.targets.map(target => target.type === 'IDENTITY'
              ? {type: 'IDENTITY', code: target.code, scope: target.scope}
              : {type: 'USER', adminId: target.adminId}),
          })),
        }
        this.showFullLoading()
        loadingShown = true
        if (request.id) await approvalCategoryApi.update(request)
        else await approvalCategoryApi.add(request)
        this.handleClose()
        this.$notify.success('操作成功')
        this.$emit('submit-success')
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.submitting = false
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ApprovalCategoryForm {
  .form-body {
    max-height: 62vh;
    overflow-y: auto;
    padding-right: 6px;
  }

  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: #303133;
    margin: 4px 0 12px;
    line-height: 1.7;
  }

  .section-tip {
    display: block;
    font-size: 12px;
    font-weight: 400;
    color: #909399;
    letter-spacing: 0.05em;
  }

  .add-node {
    margin-bottom: 18px;
  }

  .cc-item {
    margin-top: 4px;
  }
}
</style>
