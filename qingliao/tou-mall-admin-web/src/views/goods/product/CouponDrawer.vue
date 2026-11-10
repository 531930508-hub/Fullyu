<template>
  <div class="CouponDrawer">
    <el-drawer :show-close="true" :visible.sync="showDrawer" :z-index="108" append-to-body size="61%" title="卡券列表"
               :before-close="close">
      <div style="padding: 20px;">
        <el-button icon="el-icon-plus" @click="showVipCouponForm" type="primary">添加权益卡</el-button>
        <el-table
          :data="dataList"
          style="width: 100%;">
          <el-table-column
            prop="title"
            label="卡券名称"
            width="180">
          </el-table-column>
          <el-table-column
            prop="useType"
            label="类型">
            <template slot-scope="scope">{{ scope.row.useType | couponUseTypeFilter }}</template>
          </el-table-column>
          <el-table-column
            prop="state"
            label="卡券状态">
            <template slot-scope="scope">{{ scope.row.state | couponStateFilter }}</template>
          </el-table-column>

          <el-table-column
            prop="validDate"
            label="有效期">
            <template slot-scope="scope">
              <span v-if="scope.row.validDate && scope.row.validDate>100000">永久</span>
              <span v-else>{{ scope.row.validDate }}天</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="minutes"
            label="送券数">
            <template slot-scope="scope">
              <span v-if="scope.row.useType == 2">
                <span v-if="scope.row.minutes">{{ scope.row.minutes / 30 }}张</span>
                <span v-else>—</span>
              </span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column
            prop="vipLevel"
            label="顺序">
            <template slot-scope="scope">
              <span v-if="scope.row.useType == 2">{{ scope.row.vipLevel }}</span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column show-overflow-tooltip
                           prop="comment"
                           label="备注">
          </el-table-column>
          <el-table-column label="操作" width="180">
            <template v-slot="scope">
            <span v-if="scope.row.useType == 2" style="cursor: pointer;padding: 0 6px" class="c-primary"
                  @click="showVipCouponForm(scope.row)"><i
              class="el-icon-edit m-r-4"/>修改</span>
              <span v-if="scope.row.useType == 2" style="cursor: pointer;padding: 0 6px" class="c-primary"
                    @click="handleInvalid(scope.row.id)"><i
                class="el-icon-delete m-r-4"/>失效</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-drawer>
    <vip-coupon-form ref="refVipCouponForm" @on-submit="handleVipSaveOrUpd"></vip-coupon-form>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import couponApi from "@/api/goods/coupon";
import VipCouponForm from "./VipCouponForm";

export default {
  name: 'CouponDrawer',
  components: {VipCouponForm},
  props: {},
  data() {
    return {
      showDrawer: false,
      searchForm: {},
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
      let res = await couponApi.list({...this.searchForm, state: 1})
      this.dataList = res.data || []
    },
    open() {
      this.initData()
      this.showDrawer = true
    },
    close() {
      this.showDrawer = false
    },
    showVipCouponForm(form) {
      if (form.id) {
        form.size = form.minutes / 15
      }
      this.$refs.refVipCouponForm.open(form)
    },
    async handleInvalid(id) {
      await this.notifyDelete()
      await couponApi.removeById(id)
      this.notifySuccess()
      this.initData()
      this.$store.dispatch('setCouponList', true)
    },
    async handleVipSaveOrUpd(form) {
      const data = {...form, useType: 2, minutes: form.size * 30}
      await couponApi.saveOrUpd(data)
      this.notifySuccess()
      this.initData()
      this.$store.dispatch('setCouponList', true)
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.CouponDrawer {
}
</style>
