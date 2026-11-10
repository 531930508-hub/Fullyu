<template>
  <el-drawer :visible.sync="showDrawer" title="基础标签" size="40%">
    <div style="padding:20px" class="BasicCustomerTagDrawer">
      <el-button type="primary" @click="showCategorySaveOrUpdate(null,{title:''})" icon="el-icon-plus"
                 style="margin-bottom:16px;">
        添加
      </el-button>
      <el-input style="margin-bottom: 20px" placeholder="输入关键字进行过滤" v-model="filterText"/>
      <el-tree ref="refTree" :data="basicTaskCategoryList" :props="defaultProps" :default-expanded-keys="keys"
               accordion
               highlight-current node-key="id" @node-click="handleNodeClick" icon-class="el-icon-arrow-right"
               :filter-node-method="filterNode" :indent="20">
        <template slot-scope="{ node, data }">
          <div class="flex justify-between" style="width: 100%;line-height: 40px;"
               @mouseenter="changeShowControl(data)" @mouseleave="changeShowControl(data)">
            <div>
              <span>{{ node.label }}</span>
            </div>
            <div v-show="data.showControl" class="p-r24">
              <el-tooltip class="tree-icon" effect="dark" content="增加子类" placement="top">
                <i class="el-icon-plus"
                   @click.stop="showCategorySaveOrUpdate(node, {parentId:data.id})"/>
              </el-tooltip>
              <el-tooltip class="tree-icon" effect="dark" content="编辑" placement="top">
                <i class="el-icon-edit margin-lr-16"
                   @click.stop="showCategorySaveOrUpdate(node, data)"/>
              </el-tooltip>
              <el-tooltip class="tree-icon" effect="dark" content="删除" placement="top">
                <i class="el-icon-delete" @click.stop="removeCategory(data)"/>
              </el-tooltip>
            </div>
          </div>
        </template>
      </el-tree>
    </div>
  </el-drawer>
</template>

<script>
import basicCustomerTagApi from '../../../api/customer/basicCustomerTag'

export default {
  name: 'BasicCustomerTagDrawer',
  props: {},
  data() {
    return {
      showDrawer: false,
      defaultProps: {
        children: 'children',
        label: 'title'
      },
      basicTaskCategoryList: [],
      keys: [],
      filterText: ''
    }
  },
  watch: {
    filterText(val) {
      this.$refs.refTree.filter(val)
    }
  },
  methods: {
    open() {
      this.initData()
      this.showDrawer = true
    },
    async initData() {
      //initData的同时更新store中数据值，目前还不存在
      const res = await basicCustomerTagApi.all();
      let allList = res.data
      this.basicTaskCategoryList = allList || []
    },
    handleNodeClick(data, Node) {
    },
    showCategorySaveOrUpdate(node, data) {
      if (node) {
        this.keys = [node.key]
      }
      this.$prompt('请输入标签名称', '配置客户标签', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: data.title ? data.title : '',
        inputPattern: /^[\s\S]*.*[^\s][\s\S]*$/,
        inputErrorMessage: '标签内容不允许为空'
      }).then(async ({value}) => {
        data = {...data, title: value}
        await basicCustomerTagApi.saveOrUpdate(data)
        this.initData()
        await this.$store.dispatch('setBasicTaskCategoryList', true)
      }).catch(() => {
        this.$message({
          type: 'info',
          message: '取消输入'
        });
      });
    },
    async removeCategory(data) {
      let removeIds = []
      removeIds.push(data.id)
      this.pushChildIds(removeIds, data.children)
      await this.notifyConfirm(data.children ? '删除内容包含子级类型，确定要删除吗？' : '确定要删除吗？')
      await basicCustomerTagApi.removeByIds(removeIds);
      await this.$store.dispatch('setBasicTaskCategoryList', true)
      this.initData()
      this.notifySuccess()
    },
    pushChildIds(removeIds, children) {
      if (children && children.length > 0) {
        for (let i = 0; i < children.length; i++) {
          removeIds.push(children[i].id)
          this.pushChildIds(removeIds, children[i].children)
        }
      }
    },
    changeShowControl(data) {
      this.$set(data, 'showControl', !data.showControl)
    },
    filterNode(value, data) {
      if (!value) return true
      return data.title.indexOf(value) !== -1
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" >
.BasicCustomerTagDrawer {
  padding: 20px;
  .el-tree-node__content{
    height: 40px !important;
  }
}
</style>
