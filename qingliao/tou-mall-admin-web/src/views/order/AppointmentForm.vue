<template>
  <div class="AppointmentForm">
    <el-dialog
      :title="'预约'"
      :close-on-click-modal="false"
      :visible.sync="dialogVisible"
      width="700px"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="100px" label-position="left" class="margin-lr-16">
        <el-form-item label="预约门店" prop="shopId"
                      :rules="[{required: true, message: '请选择预约门店', trigger: ['blur', 'change']}]">
          <shop-selector v-model="form.shopId" :style="'width: 100%'" filter-status @change="changeShop"
                         placeholder="请选择所属门店"></shop-selector>
        </el-form-item>
        <el-form-item label="客户电话" prop="phone"
                      :rules="{required: true, message: '请输入客户电话', trigger: ['blur', 'change']}">
          <el-input v-model="form.phone" placeholder="请输入客户电话"></el-input>
        </el-form-item>
        <el-form-item label="服务项目" prop="productId"
                      :rules="[{required: true, message: '请选择服务项目', trigger: ['blur', 'change']}]">
          <product-selector v-model="form.productId" style="width: 100%"
                            @selected="productSelected"
                            placeholder="请选择服务项目"></product-selector>
        </el-form-item>
        <el-form-item label="服务人数" prop="personCount"
                      :rules="[{required: true, message: `请输入服务人数`, trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.personCount" size="small" @change="handleChange" class="time">
            <el-radio-button :label="item" v-for="(item,index) in maxBedCount" :key="index">{{ item }}位
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="理疗时长" prop="durationMinutes"
                      :rules="[{required: true, message: `请选择理疗时长`, trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.durationMinutes" size="mini" @change="clearTime" class="time">
            <el-radio-button v-for="(minutes,index) in projectTypeDurationMinutesMap[this.projectType] || []"
                             :key="index" :label="minutes">
              {{ minutes }}min
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="到店日期" prop="date"
                      :rules="[{required: true, message: `请选择到店日期`, trigger: ['blur', 'change']}]">
          <el-date-picker
            v-model="form.date"
            align="right" style="width: 100%"
            type="date" :clearable="false" :picker-options="pickerOptions"
            placeholder="到店日期" @change="clearTime"
            value-format="yyyy-MM-dd">
          </el-date-picker>
          <el-radio-group v-model="form.date" size="mini" @change="clearTime">
            <el-radio-button v-for="(date,index) in dateToBeSelected || []"
                             :key="index" :label="date">
              {{ date }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="到店时间" prop="time"
                      :rules="[{required: true, message: `请选择到店时间`, trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.time" size="mini" class="time" @change="fetchMassagistList">
            <el-radio-button v-for="(item,index) in  timeList|| []" :disabled="item.state==0"
                             :key="index" :label="item.time">
              {{ item.time }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="疗愈师" prop="massagistIdList">
          <el-checkbox-group
            v-model="form.massagistIdList"
            :max="form.personCount">
            <el-checkbox v-for="massagist in massagistList" :label="massagist.id" :key="massagist.id"
                         :disabled="massagist.available == 0">
              {{ massagist.name }}
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">取 消</el-button>
        <el-button type="primary" @click="onSubmit">确 定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import ProjectSelector from "@/views/goods/product/ProjectSelector";
import ProductSelector from "@/views/goods/product/ProductSelector";
import dateUtil from "@/utils/dateUtil";
import orderApi from "@/api/order/order";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import bedApi from "@/api/shop/bed";

/**
 * 已弃用
 */
export default {
  name: 'AppointmentForm',
  components: {ShopSelector, ProductSelector, ProjectSelector},
  props: {},
  data() {
    return {
      form: {},
      dialogVisible: false,
      projectType: '',//1是湿区，2是干区
      projectId: '',
      projectTypeDurationMinutesMap: {
        1: [15, 45, 60, 90],
        2: [30, 60, 90],
      },
      dateToBeSelected: [],
      timeList: [],
      massagistList: [],
      pickerOptions: {
        disabledDate(time) {
          return time.getTime() < Date.now() - 24 * 60 * 60 * 1000;
        },
      },
      maxBedCount: 1,
    }
  },
  computed: {
    ...mapGetters(['productList', 'shopList', 'shopId'])
  },
  created() {
    this.$store.dispatch("setProductList")
    this.$store.dispatch("setShopList")
  },
  methods: {
    async open(form = {}) {
      this.form = {...form, productId: this.productList[0].id, personCount: 1, shopId: this.shopId, massagistIdList: []}
      this.dateToBeSelected = [dateUtil.getCurrentDateCode(), dateUtil.getCurrentDateCodeAdd(1), dateUtil.getCurrentDateCodeAdd(2), dateUtil.getCurrentDateCodeAdd(3)]
      await this.productSelected(this.productList[0])
      this.dialogVisible = true
    },
    handleClose() {
      this.dialogVisible = false
      this.massagistList = []
      this.timeList = []
      this.dateToBeSelected = []
      this.form = {}
      this.maxBedCount = 1
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      this.showFullLoading()
      await orderApi.appointmentOrder(this.form)
      this.hideFullLoading()
      this.notifySuccess()
      this.handleClose()
      this.$emit("submit-success")
    },
    handleChange(newValue) {
      if (newValue == undefined || newValue == null || newValue < 1) {
        this.form.personCount = "1";
      } else if (newValue && newValue > this.maxBedCount) {
        this.form.personCount = this.maxBedCount;
      }
      this.clearTime()
    },
    productSelected(item) {
      this.projectType = item.projectList[0].type
      this.projectId = item.projectList[0].id
      this.$set(this.form, "durationMinutes", this.projectTypeDurationMinutesMap[this.projectType][0])
      this.$set(this.form, "date", this.dateToBeSelected[0])
      this.setMaxBedCount()
    },
    changeShop() {
      this.clearTime()
      this.setMaxBedCount()
    },
    clearTime() {
      this.massagistList = []
      this.$set(this.form, 'time', '')
      this.$set(this.form, 'massagistIdList', [])
      this.fetchTimeList()
    },
    async fetchTimeList() {
      this.timeList = []
      this.showFullLoading()
      let res = await orderApi.timeList(this.form.date, this.form.personCount, this.projectId, this.form.durationMinutes, this.form.shopId)
      this.hideFullLoading()
      this.timeList = res.data
      console.log(res.data)
    },
    async fetchMassagistList() {
      let res = await orderApi.massagistList(this.form.date + " " + this.form.time + ":00", this.form.personCount, this.form.durationMinutes, this.form.shopId)
      this.massagistList = res.data || []
    },
    async setMaxBedCount() {
      this.showFullLoading()
      let res = await bedApi.maxBedCount(this.form.shopId, this.projectType)
      this.hideFullLoading()
      this.maxBedCount = res.data
      this.handleChange(this.form.personCount)
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.AppointmentForm {
  .time /deep/ .el-radio-button:not(:first-child) .el-radio-button__inner {
    border-left: 1px solid #DCDFE6 !important;
  }

  .time /deep/ .el-radio-button__inner {
    border-radius: 6px;
  }

  .time /deep/ .el-radio-button + .is-active:not(:first-child) .el-radio-button__inner {
    border-left: 1px solid #409eff !important;
  }

  .time /deep/ .el-radio-button .el-radio-button__inner {
    margin-right: 6px;
    margin-bottom: 6px;
  }
}

</style>
