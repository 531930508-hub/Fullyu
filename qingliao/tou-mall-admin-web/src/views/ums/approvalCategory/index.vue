<template>
  <div class="index">
    <div class="flex justify-between operate-container">
      <div>
        审批流程
        <span class="page-tip">节点按顺序流转；身份节点会自动匹配本店或全部门店当前在职人员，可组合或签与会签。</span>
      </div>
      <div>
        <el-button @click="add" type="primary" icon="el-icon-plus">添加配置</el-button>
      </div>
    </div>

    <el-card v-for="item in dataList" :key="item.id" class="box-card" shadow="never">
      <div class="card-header">
        <div class="card-title">
          <el-tag>{{ categoryTitle(item) }}</el-tag>
          <span class="card-scope" v-if="item.shopId">旧门店配置：{{ item.shopId | shopNameFilter }}</span>
          <span class="card-scope" v-else>全门店</span>
        </div>
        <el-button icon="el-icon-edit" type="text" @click="handleUpdate(item)">配置</el-button>
      </div>

      <div class="flow-line" v-if="item.nodes && item.nodes.length">
        <template v-for="(node, index) in item.nodes">
          <div class="flow-node" :key="node.id || index">
            <div class="flow-node-head">
              <span class="flow-node-index">{{ index + 1 }}</span>
              <span class="flow-node-name">{{ node.nodeName }}</span>
              <el-tag size="mini" :type="node.approveMode === 'ALL' ? 'warning' : 'success'">
                {{ node.approveMode === 'ALL' ? '会签' : '或签' }}
              </el-tag>
            </div>
            <div class="flow-node-targets">
              <el-tag v-for="(target, tIndex) in node.targets"
                      :key="tIndex"
                      size="mini"
                      type="info"
                      class="target-tag">{{ targetText(target) }}</el-tag>
            </div>
          </div>
          <i v-if="index < item.nodes.length - 1" class="el-icon-right flow-arrow" :key="'arrow' + index"></i>
        </template>
      </div>
      <div class="legacy-line" v-else>
        当前审批人：{{ legacyText(item) }}
        <span class="muted">（旧版逐级审批，点“配置”可改为流程节点）</span>
      </div>

      <div class="cc-line" v-if="parseIds(item.ccIds).length">
        抄送：{{ ccText(item) }}
      </div>
    </el-card>

    <div v-if="!dataList.length" class="empty-config">
      <span class="empty-config__mark">审</span>
      <p class="empty-config__title">还没有审批配置</p>
      <p class="empty-config__desc">添加配置后，对应业务会按流程节点自动流转。</p>
      <el-button type="primary" icon="el-icon-plus" @click="add">添加配置</el-button>
    </div>

    <approval-category-form ref="refApprovalCategoryForm" @submit-success="initData"></approval-category-form>
  </div>
</template>

<script>
import ApprovalCategoryForm from '@/views/ums/approvalCategory/ApprovalCategoryForm';
import {mapGetters} from 'vuex'
import approvalCategoryApi from '@/api/shop/approvalCategory';
import massagistApi from '@/api/massagist';

const FALLBACK_IDENTITIES = [
  {value: 'SHOP_MANAGER', label: '店长'},
  {value: 'TRAINER', label: '内训师'},
]

export default {
  name: 'index',
  components: {ApprovalCategoryForm},
  props: {},
  data() {
    return {
      dataList: [],
      identityOptions: FALLBACK_IDENTITIES.slice(),
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
    this.$store.dispatch('setAdminUserList')
    this.$store.dispatch('setShopAllList')
    this.loadIdentityOptions()
    this.initData()
  },
  methods: {
    async initData() {
      let res = await approvalCategoryApi.list()
      const data = res.data
      this.dataList = Array.isArray(data)
        ? data
        : (data && (data.list || data.records)) || []
    },
    async loadIdentityOptions() {
      try {
        let res = await massagistApi.identityOptions()
        if (res.data && res.data.length) this.identityOptions = res.data
      } catch (e) {
        // 接口异常时使用内置身份
      }
    },
    categoryTitle(item) {
      if (item.title) return item.title
      const hit = (this.constant.approvalCategory || []).find(option => option.value === item.code)
      return hit ? hit.label : '未命名审批'
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
    adminName(id) {
      const filter = this.$options.filters['adminUsernameFilter']
      return filter ? filter(id) : ('账号#' + id)
    },
    identityLabel(code) {
      const hit = this.identityOptions.find(item => item.value === code)
      return hit ? hit.label : code
    },
    targetText(target) {
      if (!target) return '—'
      if (target.type === 'IDENTITY') {
        return `${this.identityLabel(target.code)}（${target.scope === 'ALL' ? '全部门店' : '本店'}）`
      }
      return this.adminName(target.adminId)
    },
    legacyText(item) {
      const ids = this.parseIds(item.approvalIds)
      return ids.length ? ids.map(id => this.adminName(id)).join(' → ') : '未配置'
    },
    ccText(item) {
      return this.parseIds(item.ccIds).map(id => this.adminName(id)).join('、')
    },
    handleUpdate(item) {
      this.$refs.refApprovalCategoryForm.open(item)
    },
    add() {
      this.$refs.refApprovalCategoryForm.open({
        code: this.constant.approvalCategory[0].value,
        title: this.constant.approvalCategory[0].label
      })
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.index {
  padding: 20px;
}

.page-tip {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
  letter-spacing: 0.05em;
}

.box-card {
  margin-bottom: 16px;
}

.empty-config {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 52px 20px 56px;
  border: 1px dashed #d9d2e6;
  border-radius: 14px;
  background: rgba(255, 255, 255, .62);
}

.empty-config__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: #f0ebff;
  color: #6a4bc4;
  font-size: 18px;
  font-weight: 600;
}

.empty-config__title {
  margin: 14px 0 6px;
  color: #302a3d;
  font-size: 15px;
  font-weight: 600;
}

.empty-config__desc {
  margin: 0 0 18px;
  color: #918a9f;
  font-size: 12.5px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.card-title {
  display: flex;
  align-items: center;
}

.card-scope {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}

.flow-line {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 10px;
}

.flow-node {
  min-width: 200px;
  max-width: 320px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fafafa;
}

.flow-node-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.flow-node-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #1e6abc;
  color: #fff;
  font-size: 12px;
  flex: none;
}

.flow-node-name {
  font-size: 13px;
  color: #303133;
}

.flow-node-targets {
  margin-top: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.target-tag {
  margin: 0;
}

.flow-arrow {
  align-self: center;
  color: #c0c4cc;
  font-size: 18px;
}

.legacy-line {
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
}

.cc-line {
  margin-top: 12px;
  font-size: 12px;
  color: #909399;
}

.muted {
  color: #909399;
}
</style>
