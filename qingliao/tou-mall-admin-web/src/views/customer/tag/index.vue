<template>
  <div class="tag-page">
    <div class="page-header">
      <div class="page-header__main">
        <div class="page-title">标签管理</div>
        <div class="page-subtitle">
          维护客户基础标签（当前 {{ totalCount }} 个），客户列表的标签筛选、客户资料与商品/活动标签都取自这里
        </div>
      </div>
      <div class="page-actions">
        <el-input v-model="filterText" clearable size="small" placeholder="搜索标签"
                  prefix-icon="el-icon-search" style="width: 200px"/>
        <el-button type="primary" size="small" icon="el-icon-plus" @click="openCreate(null)">新建一级标签</el-button>
      </div>
    </div>

    <div class="tag-page__body">
      <div class="page-card tag-page__tree">
        <el-tree
          ref="refTree"
          :data="tagList"
          :props="treeProps"
          node-key="id"
          default-expand-all
          highlight-current
          :expand-on-click-node="false"
          :filter-node-method="filterNode"
          @node-click="handleSelect">
          <template slot-scope="{ node, data }">
            <div class="tag-node">
              <span class="tag-node__label">{{ node.label }}</span>
              <span class="tag-node__actions">
                <el-tooltip content="添加子标签" placement="top" :open-delay="300">
                  <el-button type="text" icon="el-icon-plus" @click.stop="openCreate(data)"/>
                </el-tooltip>
                <el-tooltip content="重命名" placement="top" :open-delay="300">
                  <el-button type="text" icon="el-icon-edit" @click.stop="openEdit(data)"/>
                </el-tooltip>
                <el-tooltip content="删除" placement="top" :open-delay="300">
                  <el-button type="text" icon="el-icon-delete" @click.stop="removeTag(data)"/>
                </el-tooltip>
              </span>
            </div>
          </template>
        </el-tree>
        <div v-if="!tagList.length" class="tag-page__empty tag-page__empty--tree">
          还没有基础标签，先「新建一级标签」
        </div>
      </div>

      <div class="page-card tag-page__detail">
        <template v-if="selected">
          <div class="card-title">标签详情</div>
          <div class="tag-detail__row">
            <span>标签名称</span>
            <strong>{{ selected.title }}</strong>
          </div>
          <div class="tag-detail__row">
            <span>上级标签</span>
            <strong>{{ selectedParentTitle || '一级标签' }}</strong>
          </div>
          <div class="tag-detail__row">
            <span>子标签</span>
            <strong>{{ (selected.children || []).length }} 个</strong>
          </div>
          <div class="tag-detail__row">
            <span>创建时间</span>
            <strong>{{ selected.createTime || '-' }}</strong>
          </div>
          <div class="tag-detail__actions">
            <el-button size="small" icon="el-icon-plus" @click="openCreate(selected)">添加子标签</el-button>
            <el-button size="small" icon="el-icon-edit" @click="openEdit(selected)">重命名</el-button>
            <el-button size="small" type="danger" plain icon="el-icon-delete" @click="removeTag(selected)">删除</el-button>
          </div>
        </template>
        <div v-else class="tag-page__empty">在左侧选择一个标签查看详情</div>
      </div>
    </div>

    <el-dialog :title="dialogTitle" :visible.sync="dialogVisible" width="420px" @closed="resetForm">
      <el-form ref="refForm" :model="form" :rules="rules" label-width="80px" @submit.native.prevent>
        <el-form-item v-if="formParentTitle" label="上级标签">
          <span class="tag-form__parent">{{ formParentTitle }}</span>
        </el-form-item>
        <el-form-item label="标签名称" prop="title">
          <el-input v-model="form.title" maxlength="20" show-word-limit placeholder="最多 20 个字"
                    @keyup.enter.native="submitForm"/>
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import basicCustomerTagApi from '@/api/customer/basicCustomerTag'

export default {
  name: 'customerTag',
  data() {
    return {
      tagList: [],
      filterText: '',
      selected: null,
      treeProps: {children: 'children', label: 'title'},
      dialogVisible: false,
      dialogTitle: '',
      formParentTitle: '',
      saving: false,
      form: {
        id: null,
        parentId: null,
        title: ''
      },
      rules: {
        title: [
          {required: true, message: '请输入标签名称', trigger: 'blur'},
          {max: 20, message: '最多 20 个字', trigger: 'blur'}
        ]
      }
    }
  },
  computed: {
    totalCount() {
      return this.countNodes(this.tagList)
    },
    selectedParentTitle() {
      if (!this.selected || !this.selected.parentId) return ''
      const parent = this.findNode(this.tagList, this.selected.parentId)
      return parent ? parent.title : ''
    }
  },
  watch: {
    filterText(value) {
      this.$refs.refTree.filter(value)
    }
  },
  created() {
    this.loadData()
  },
  methods: {
    async loadData() {
      const res = await basicCustomerTagApi.all()
      this.tagList = (res && res.data) || []
      if (this.selected) {
        const found = this.findNode(this.tagList, this.selected.id)
        this.selected = found || null
        if (found) {
          this.$nextTick(() => {
            if (this.$refs.refTree) this.$refs.refTree.setCurrentKey(found.id)
          })
        }
      }
    },
    countNodes(list) {
      return (list || []).reduce((total, item) => total + 1 + this.countNodes(item.children), 0)
    },
    findNode(list, id) {
      for (let i = 0; i < (list || []).length; i++) {
        const item = list[i]
        if (item.id === id) return item
        const hit = this.findNode(item.children, id)
        if (hit) return hit
      }
      return null
    },
    filterNode(value, data) {
      if (!value) return true
      return (data.title || '').indexOf(value) > -1
    },
    handleSelect(data) {
      this.selected = data
    },
    openCreate(parent) {
      this.resetForm()
      this.form = {
        id: null,
        parentId: parent ? parent.id : null,
        title: ''
      }
      this.formParentTitle = parent ? parent.title : ''
      this.dialogTitle = parent ? '添加子标签' : '新建一级标签'
      this.dialogVisible = true
    },
    openEdit(tag) {
      this.resetForm()
      this.form = {
        id: tag.id,
        parentId: tag.parentId,
        title: tag.title
      }
      const parent = tag.parentId ? this.findNode(this.tagList, tag.parentId) : null
      this.formParentTitle = parent ? parent.title : ''
      this.dialogTitle = '重命名标签'
      this.dialogVisible = true
    },
    resetForm() {
      this.form = {id: null, parentId: null, title: ''}
      this.formParentTitle = ''
      this.dialogTitle = ''
      this.saving = false
      if (this.$refs.refForm) this.$refs.refForm.clearValidate()
    },
    submitForm() {
      if (this.saving) return
      this.$refs.refForm.validate(valid => {
        if (!valid) return
        this.saving = true
        basicCustomerTagApi.saveOrUpdate({
          id: this.form.id,
          parentId: this.form.parentId,
          title: this.form.title.trim()
        }).then(() => {
          this.saving = false
          this.dialogVisible = false
          this.$message.success('已保存')
          this.loadData()
        }).catch(() => {
          this.saving = false
        })
      })
    },
    removeTag(tag) {
      const childCount = this.countNodes(tag.children)
      const tip = childCount
        ? `「${tag.title}」下还有 ${childCount} 个子标签，将一并删除；已使用这些标签的客户、商品或活动也会失去该标签。是否继续？`
        : `删除后，已使用「${tag.title}」的客户、商品或活动将不再显示此标签。是否继续？`
      this.$confirm(tip, '删除标签', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      }).then(() => {
        return basicCustomerTagApi.removeByIds(this.collectIds(tag))
      }).then(() => {
        this.$message.success('已删除')
        if (this.selected && this.collectIds(this.selected).indexOf(tag.id) > -1) {
          this.selected = null
        }
        this.loadData()
      }).catch(() => {
      })
    },
    collectIds(tag) {
      const ids = [tag.id]
      const children = tag.children || []
      children.forEach(child => {
        ids.push(...this.collectIds(child))
      })
      return ids
    }
  }
}
</script>

<style rel="stylesheet/scss" lang="scss" scoped>
@import "src/styles/variables.scss";

.tag-page {
  padding-bottom: 20px;
}

.tag-page__body {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.tag-page__tree {
  flex: 1;
  min-width: 0;
}

.tag-page__detail {
  width: 320px;
  flex-shrink: 0;
}

.tag-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-right: 8px;
  line-height: 36px;
}

.tag-node__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-node__actions {
  display: inline-flex;
  flex-shrink: 0;
  visibility: hidden;
}

.tag-node:hover .tag-node__actions {
  visibility: visible;
}

.tag-node__actions .el-button {
  padding: 0 4px;
  color: $ink-muted;

  &:hover {
    color: $brand;
  }
}

.tag-detail__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  font-size: 13px;
  color: $ink-muted;
  border-bottom: 1px dashed $line;

  strong {
    font-weight: 500;
    color: $ink;
    text-align: right;
    word-break: break-all;
  }
}

.tag-detail__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.tag-page__empty {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: $ink-muted;
}

.tag-page__empty--tree {
  padding: 24px 0 8px;
}

.tag-form__parent {
  color: $ink-muted;
}
</style>