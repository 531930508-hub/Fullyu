<template>
  <el-drawer title="排班顺序调整"
             :close-on-click-modal="false"
             :visible.sync="dialogVisible"
             :before-close="handleClose"
             size="500px">
    <div class="MassagistSortDrawer">

      <el-table ref="roleTable" :data="sortList" style="width: 100%;">
        <el-table-column width="80">
          <template slot-scope="scope">
            {{ scope.$index + 1 }}
          </template>
        </el-table-column>
        <el-table-column prop="name"></el-table-column>
        <el-table-column width="100">
          <template slot-scope="scope">
            <el-avatar :src="scope.row.avatarUrl"></el-avatar>
          </template>
        </el-table-column>
        <el-table-column width="120">
          <template slot-scope="scope">
            <i v-show="scope.$index < sortList.length -1" class="el-icon-bottom"
               style="font-size: 20px;cursor: pointer;padding: 10px"
               @click="handleBottom(scope.$index)"></i>
            <i v-show="scope.$index > 0" class="el-icon-top" style="font-size: 20px;cursor: pointer;padding: 10px"
               @click="handleTop(scope.$index)"></i>
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top: 10px;text-align: right">
        <el-button icon="el-icon-close" @click="dialogVisible = false">取 消</el-button>
        <el-button icon="el-icon-check" type="primary" @click="onSubmit">保 存</el-button>
      </div>
    </div>

  </el-drawer>
</template>

<script>
import massagistApi from '../../../api/massagist'

export default {
  name: 'MassagistSortDrawer',
  components: {},
  props: {},
  data() {
    return {
      dialogVisible: false,
      sortList: [],
      hasChange: false,
      day: '',
      shopId: ''
    }
  },
  created() {
  },
  methods: {
    open(day, shopId) {
      this.dialogVisible = true
      this.hasChange = false
      this.day = day
      this.shopId = shopId
      this.fetchData()
    },
    async fetchData() {
      const res = await massagistApi.findSortList(this.day, this.shopId) || {}
      this.sortList = res.data || []
    },
    handleTop(index) {
      const pre = this.sortList[index - 1]
      const current = this.sortList[index]
      this.$set(this.sortList, index, pre)
      this.$set(this.sortList, index - 1, current)
      this.hasChange = true
    },
    handleBottom(index) {
      const next = this.sortList[index + 1]
      const current = this.sortList[index]
      this.$set(this.sortList, index, next)
      this.$set(this.sortList, index + 1, current)
      this.hasChange = true
    },
    async onSubmit() {
      const massagistIdList = []
      for (let i = 0; i < this.sortList.length; i++) {
        massagistIdList.push(this.sortList[i].id)
      }
      this.showFullLoading()
      await massagistApi.rerank(this.day, this.shopId, massagistIdList)
      this.hideFullLoading()
      this.notifySuccess()
      this.dialogVisible = false
      this.$emit('submit-success')
    },
    async handleClose() {
      if (this.hasChange) {
        await this.notifyConfirm('是否确定放弃本次调整')
      }
      this.hasChange = false
      this.dialogVisible = false
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.MassagistSortDrawer {
  padding: 0 20px;
}
</style>
