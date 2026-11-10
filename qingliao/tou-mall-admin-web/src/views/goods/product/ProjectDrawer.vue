<template>
  <div class="ProjectDrawer">
    <el-drawer :show-close="true" :visible.sync="showDrawer" :z-index="108" append-to-body size="61%" title="项目列表"
               :before-close="close">
      <div style="padding: 20px;">
        <el-table
          :data="dataList"
          style="width: 100%">
          <el-table-column
            prop="title"
            label="项目标题"
            width="180">
          </el-table-column>
          <el-table-column
            prop="state"
            label="项目状态">
            <template slot-scope="scope">{{ scope.row.state | productStateFilter }}</template>
          </el-table-column>
          <el-table-column
            prop="type"
            label="项目属性">
            <template slot-scope="scope">{{ scope.row.type | projectTypeFilter }}</template>
          </el-table-column>
          <el-table-column
            prop="comment"
            label="项目备注">
          </el-table-column>
          <el-table-column
            prop="coefficient"
            label="系数">
          </el-table-column>
          <el-table-column label="操作" show-overflow-tooltip>
            <template v-slot="scope">
            <span style="cursor: pointer;padding: 0 6px" class="c-primary"
                  @click="handleCoefficient(scope.row)"><i
              class="el-icon-edit m-r-4"/>修改系数</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import projectApi from "@/api/goods/project";
import {mapGetters} from 'vuex'

export default {
  name: 'ProjectDrawer',
  props: {},
  data() {
    return {
      showDrawer: false,
      searchForm: {
        state: 1
      },
      dataList: []
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
  },
  methods: {
    async initData() {
      let res = await projectApi.list(this.searchForm)
      this.dataList = res.data || []
    },
    open() {
      this.initData()
      this.showDrawer = true
    },
    close() {
      this.showDrawer = false
    },
    handleCoefficient(row) {
      const title = row.title
      this.$prompt('请输入' + title + "系数", title, {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputType: 'number',
        inputPattern: /^(0|[1-9]\d*)(\.\d{1,2})?$/,
        inputValue: row.coefficient,
        inputErrorMessage: `${title}的系数必须大于等于0，且小数不超过两位`
      }).then(async ({value}) => {
        await projectApi.update({...row, coefficient: value})
        this.notifySuccess()
        this.initData()
      })
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ProjectDrawer {
}
</style>
