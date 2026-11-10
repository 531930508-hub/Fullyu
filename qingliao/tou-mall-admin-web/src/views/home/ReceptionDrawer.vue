<template>
  <div class="ReceptionDrawer">
    <el-drawer
      title="接待"
      :close-on-click-modal="false"
      :visible.sync="dialogVisible"
      size="700px"
      :before-close="handleClose">
      <el-form v-loading="loading" :model="form" ref="refForm" label-width="100px" label-position="left"
               class="margin-lr-16" style="padding-bottom: 90px">
        <!--        <el-form-item label="接待门店" prop="shopId"-->
        <!--                      :rules="[{required: true, message: '请选择接待门店', trigger: ['blur', 'change']}]">-->
        <!--          <shop-selector ref="refShopSelector" v-model="form.shopId" :style="'width: 100%'" filter-status-->
        <!--                         @selected="changeShop"-->
        <!--                         placeholder="请选择所属门店"></shop-selector>-->
        <!--        </el-form-item>-->
        <el-form-item label="接待时长" prop="durationMinutes"
                      :rules="[{required: true, message: `请选择接待时长`, trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.durationMinutes" size="mini" @change="clearTime" class="time">
            <el-radio-button v-for="(minutes,index) in [90, 60,45, 30]"
                             :key="index" :label="minutes">
              {{ minutes }}min
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="接待日期" prop="date"
                      :rules="[{required: true, message: `请选择接待日期`, trigger: ['blur', 'change']}]">
          <el-date-picker clearable
                          v-model="form.date"
                          align="right" style="width: 100%;"
                          type="date" :clearable="false" :picker-options="pickerOptions"
                          placeholder="接待日期" @change="clearTime"
                          value-format="yyyy-MM-dd">
          </el-date-picker>
          <el-radio-group v-model="form.date" size="mini" @change="clearTime" class="time">
            <el-radio-button v-for="(item,index) in dateToBeSelected || []"
                             :key="index" :label="item.value">
              {{ item.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="接待时间" prop="time"
                      :rules="[{required: true, message: `请选择接待时间`, trigger: ['blur', 'change']}]">
          <el-time-select clearable
                          placeholder="接待时间" @change="fetchMassagistList" style="width: 100%;"
                          v-model="form.time" format="HH:mm" value-format="HH:mm" :clearable="false"
                          :picker-options="{ start: clockInTime,step: '00:15',end: clockOutTime}">
          </el-time-select>
          <el-radio-group v-model="form.time" size="mini" class="time m-t-10" @change="fetchMassagistList">
            <el-radio-button v-for="(item,index) in  timeList|| []" :disabled="item.state==0"
                             :key="index" :label="item.time">
              {{ item.time }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
<!--        <el-form-item v-show="massagistList && massagistList.length" label="疗愈师" prop="massagistId">
          <el-radio-group class="time" v-model="form.massagistId" size="mini" @change="clearTime">
            <el-radio-button v-for="massagist in massagistList|| []" :label="massagist.id" :key="massagist.id">
              {{ massagist.name }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>-->
      </el-form>
      <div v-loading="loading" class="drawer-footer justify-end" style="width:700px">
        <div class="flex justify-center align-center">
          <!--          <span class="m-r-10"-->
          <!--                :style="{'color':form.hiddenIsUpdateSortBtn?'#909399':form.isUpdateSort?'#13ce66':'#ff4949'}">-->
          <!--            {{ form.isUpdateSort ? '计入轮次' : '不计入轮次' }}-->
          <!--          </span>-->
          <!--          <el-switch class="m-r-10" :disabled="form.hiddenIsUpdateSortBtn"-->
          <!--                     style="display: block"-->
          <!--                     v-model="form.isUpdateSort"-->
          <!--                     inactive-color="#13ce66"-->
          <!--                     active-color="#ff4949"-->
          <!--                     :inactive-value="true"-->
          <!--                     :active-value="false">-->
          <!--          </el-switch>-->
          <el-button @click="handleClose" class="btn-B m-r-10">取 消</el-button>
          <el-button type="primary" @click="onSubmit" class="btn-A">确 定</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import ProjectSelector from "@/views/goods/product/ProjectSelector";
import orderApi from "@/api/order/order";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import projectApi from "../../api/goods/project"
import dateUtil from "@/utils/dateUtil";

export default {
  name: 'ReceptionDrawer',
  components: {ShopSelector, ProjectSelector},
  props: {},
  data() {
    return {
      form: {},
      isSubmitting:false,
      dialogVisible: false,
      projectId: '',
      dateToBeSelected: [],
      timeList: [],
      massagistList: [],
      pickerOptions: {
        /*disabledDate(time) {
          return time.getTime() < Date.now() - 24 * 60 * 60 * 1000;
        },*/
      },
      clockInTime: '',
      clockOutTime: '',
      loading: false
    }
  },
  computed: {
    ...mapGetters(['shopList', 'shopId'])
  },
  created() {
    this.$store.dispatch("setShopList")
    this.getReceptionProjectId()
  },
  methods: {
    async open(form = {}) {
      this.dialogVisible = true
      this.loading = true
      try {
        // await this.initDateToBeSelected()
        await this.initForm(form);
      } finally {
        this.loading = false
      }
    },
    async initForm(form = {}) {
      await this.initDateToBeSelected()
      if (!form.date) {
        if (this.dateToBeSelected[0]) {
          form.date = this.dateToBeSelected[0].value
        } else {
          form.date = dateUtil.getCurrentDateCode()
        }
      }
      this.form = {
        payType: 3,
        shopId: this.shopId,
        isUpdateSort: false,
        massagistId: '',
        type: 2,
        ...form,
      }
      this.$forceUpdate()
      if (this.form.shopId) {
        let shop = this.shopList.find(e => e.id == this.form.shopId)
        if (shop) {
          this.clockInTime = shop.clockInTime
          this.clockOutTime = shop.clockOutTime
        } else {
          this.clockInTime = '08:30'
          this.clockOutTime = '22:30'
        }
      }
      this.$set(this.form, "durationMinutes", 90)
      await this.fetchTimeList()
      if (this.form.time) {
        await this.fetchMassagistList()
      }
    },
    async initDateToBeSelected() {
      let res = await orderApi.bookingDates(null, this.shopId)
      this.dateToBeSelected = res.data || []
    },
    handleClose() {
      this.dialogVisible = false
      this.massagistList = []
      this.timeList = []
      this.dateToBeSelected = []
      this.form = {}
    },
    async onSubmit() {
      if (this.isSubmitting) return; // 如果正在提交，则直接返回
      this.isSubmitting = true; // 设置正在提交


      this.loading = true
      try {
        let validate = await this.$refs.refForm.validate().catch(() => false);
        if (!validate) {
          this.isSubmitting=false;
          return
        }

        await orderApi.appointmentReceptionOrder({
          ...this.form,
          startTime: this.form.date + " " + this.form.time + ":00",
          massagistIdList: this.form.massagistId ? [this.form.massagistId] : []
        })
        this.notifySuccess()
        this.handleClose()
        this.$emit("submit-success")
      } finally {
        this.loading = false
        this.isSubmitting=false;
      }
      this.isSubmitting=false;
    },
    changeShop(item) {
      if (item) {
        this.clockInTime = item.clockInTime
        this.clockOutTime = item.clockOutTime
      } else {
        this.clockInTime = '08:30'
        this.clockOutTime = '22:30'
      }
    },
    clearTime() {
      if (this.form.time) {
        this.fetchMassagistList()
      }
      this.fetchTimeList()
    },
    async fetchTimeList() {
      try {
        let res = await orderApi.timeList(this.form.date, 1, this.projectId, this.form.durationMinutes, this.form.shopId, this.form.massagistId)
        this.timeList = res.data || []
      } catch (e) {
        this.timeList = []
      }
    },
    async fetchMassagistList() {
      try {
        let res = await orderApi.massagistListNew(this.form.date + " " + this.form.time + ":00", 1, this.form.durationMinutes, this.form.shopId,this.projectId)
        this.massagistList = res.data || []
      } catch (e) {
        this.massagistList = []
      }
    },
    async getReceptionProjectId() {
      const data = await projectApi.getReceptionProjectId()
      this.projectId = data.data
      if (this.projectId == null) {
        this.handleClose()
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ReceptionDrawer {
  .time /deep/ .el-radio-button:not(:first-child) .el-radio-button__inner {
    border-left: 1px solid #DCDFE6 !important;
  }

  .time /deep/ .el-radio-button__inner {
    border-radius: 6px;
    color: #49454f;
  }

  .time /deep/ .el-radio-button + .is-active:not(:first-child) .el-radio-button__inner {
    border-left: 1px solid #e8def8 !important;
  }

  .time /deep/ .el-radio-button__orig-radio:disabled + .el-radio-button__inner {
    color: #c0c4cc;
    cursor: not-allowed;
    background-image: none;
    background-color: #fff;
    border-color: #ebeef5;
    box-shadow: none;
  }

  .time /deep/ .el-radio-button .el-radio-button__inner {
    margin-right: 6px;
    margin-bottom: 6px;
  }

  .time /deep/ .el-radio-button__orig-radio:checked + .el-radio-button__inner {
    background-color: #e8def8;
    border-color: #e8def8;
    box-shadow: -1px 0 0 0 #e8def8;
    color: #4a4459;

    &::before {
      content: "";
      display: inline-block;
      width: 10px;
      position: relative;
      height: 6px;
      top: -2px;
      border-left: 2px solid #4a4459;
      border-bottom: 2px solid #4a4459;
      transform: rotate(-45deg);
      margin-right: 5px;
    }
  }

  .group {
    /deep/ .el-checkbox-button:not(:first-child) .el-checkbox-button__inner {
      border-left: 1px solid #DCDFE6 !important;
    }

    /deep/ .el-checkbox-button__inner {
      border-radius: 6px;
      color: #49454f;
      padding: 8px 15px;
      position: relative;
    }

    /deep/ .el-checkbox-button.is-checked:not(:first-child) .el-checkbox-button__inner {
      border-left: 1px solid #e8def8 !important;
    }

    /deep/ .el-checkbox-button.is-disabled .el-checkbox-button__inner {
      color: #c0c4cc;
      cursor: not-allowed;
      background-image: none;
      background-color: #fff;
      border-color: #ebeef5;
      box-shadow: none;
    }

    /deep/ .el-checkbox-button .el-checkbox-button__inner {
      margin-right: 6px;
      margin-bottom: 6px;
    }

    /deep/ .el-checkbox-button.is-checked .el-checkbox-button__inner {
      background-color: #e8def8;
      border-color: #e8def8;
      box-shadow: -1px 0 0 0 #e8def8;
      color: #4a4459;

      &::before {
        content: "";
        display: inline-block;
        width: 10px;
        position: relative;
        height: 6px;
        top: -2px;
        border-left: 2px solid #4a4459;
        border-bottom: 2px solid #4a4459;
        transform: rotate(-45deg);
        margin-right: 5px;
      }
    }

    /deep/ .el-checkbox-button .el-checkbox__input {
      display: none;
    }

    /deep/ .el-checkbox-button.is-checked .el-checkbox-button__inner {
      color: #4a4459 !important;
    }

    /deep/ .el-checkbox-button.is-focus .el-checkbox-button__inner {
      border-color: #DCDFE6;
    }
  }

  .btn-A {
    background-color: #6750a4;
    color: #FFFFFF;
    border: 1px solid #6750a4;
    border-radius: 16px;
    margin-left: 0;
  }

  .btn-B {
    background-color: #FFFFFF;
    border: 1px solid #d7d3db;
    color: #54515a;
    border-radius: 16px;
    margin-left: 0;
  }
}

</style>
