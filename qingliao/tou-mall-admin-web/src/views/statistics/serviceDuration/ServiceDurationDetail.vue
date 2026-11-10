<template>
  <div class="ServiceDurationDetail">
    <el-drawer :show-close="true" :visible.sync="showDrawer" :z-index="108" append-to-body size="61%" title="服务时长详情"
               :before-close="close">
      <el-tabs v-model="activeName" type="card">
        <el-tab-pane label="订单详情" name="first">
          <el-table
            :data="serviceDuration.orderDetailList"
            style="width: 100%">
            <el-table-column prop="shopId" label="所属门店" show-overflow-tooltip>
              <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
            </el-table-column>
            <el-table-column prop="bedName" label="所属床位" show-overflow-tooltip></el-table-column>
            <el-table-column prop="massagistId" label="所属疗愈师" show-overflow-tooltip>
              <template slot-scope="scope">
                {{ scope.row.massagistId | massagistNameFilter }}
              </template>
            </el-table-column>
            <el-table-column prop="duration" label="服务时长" show-overflow-tooltip>
              <template slot-scope="scope">
                {{ scope.row.duration }}分钟
              </template>
            </el-table-column>
            <el-table-column prop="coefficient" label="工时系数" show-overflow-tooltip></el-table-column>
            <el-table-column prop="workingHours" label="工时" show-overflow-tooltip></el-table-column>
            <el-table-column prop="finishTime" label="完成时间" show-overflow-tooltip></el-table-column>
            <el-table-column prop="comment" label="备注" show-overflow-tooltip></el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="调整时长" name="second">
          <el-table
            :data="serviceDuration.adjustList"
            style="width: 100%">
            <el-table-column label="所属门店" prop="shopId" show-overflow-tooltip>
              <template slot-scope="scope">{{ scope.row.shopId | shopNameFilter }}</template>
            </el-table-column>
            <el-table-column
              prop="massagistId" show-overflow-tooltip
              label="疗愈师">
              <template slot-scope="scope">
                {{ scope.row.massagistId | massagistNameFilter }}
              </template>
            </el-table-column>
            <el-table-column
              prop="duration" show-overflow-tooltip
              label="调整时长">
              <template slot-scope="scope">
                {{ scope.row.duration }}分钟
              </template>
            </el-table-column>
            <el-table-column
              prop="type" show-overflow-tooltip
              label="调整类型">
              <template slot-scope="scope">
                {{ scope.row.type | adjustTypeFilter }}
              </template>
            </el-table-column>
            <el-table-column
              prop="status" show-overflow-tooltip
              label="调整状态">
              <template slot-scope="scope">
                {{ scope.row.status | adjustStatusFilter }}
              </template>
            </el-table-column>
            <el-table-column
              prop="adjustDate" show-overflow-tooltip
              label="调整日期">
            </el-table-column>
            <el-table-column
              prop="reason" show-overflow-tooltip
              label="调整原因">
            </el-table-column>
            <el-table-column
              prop="createTime"
              label="创建时间" show-overflow-tooltip>
            </el-table-column>
            <el-table-column
              prop="createUser" show-overflow-tooltip
              label="调整人">
              <template slot-scope="scope">
                {{ scope.row.createUser | adminUsernameFilter }}
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160">
              <template slot-scope="scope">
                <el-row>
                  <el-button
                    type="text"
                    @click="showAdjustForm(scope.row,scope.$index)">编辑
                  </el-button>
                </el-row>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>
    <adjust-form ref="refAdjustForm"></adjust-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import AdjustForm from "@/views/statistics/serviceDuration/AdjustForm";

export default {
  name: 'ServiceDurationDetail',
  components: {AdjustForm},
  props: {},
  data() {
    return {
      showDrawer: false,
      serviceDuration: {},
      activeName: 'first'
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
    this.$store.dispatch("setAdminUserList")
  },
  methods: {
    open(serviceDuration) {
      this.serviceDuration = {...serviceDuration}
      this.showDrawer = true
    },
    close() {
      this.showDrawer = false
    },
    showAdjustForm(row,index){
      this.$refs.refAdjustForm.open(row)
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ServiceDurationDetail {
}
</style>
