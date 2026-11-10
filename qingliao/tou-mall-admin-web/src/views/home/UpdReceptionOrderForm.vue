<template>
  <el-dialog
    :title="'修改接待'"
    :close-on-click-modal="false"
    :visible.sync="dialogVisible"
    width="700px"
    append-to-body
    :before-close="handleClose">
    <div v-loading="loading" class="UpdReceptionOrderForm">
      <el-form :model="form" ref="refForm" label-width="100px" label-position="left" class="margin-lr-16">
        <el-form-item label="接待时长" prop="durationMinutes"
                      :rules="[{required: true, message: `请选择接待时长`, trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.durationMinutes" size="mini" @change="clearTime" class="time">
            <el-radio-button v-for="(minutes,index) in [30,45, 60, 90]"
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
        <el-form-item v-show="massagistList && massagistList.length" label="疗愈师" prop="massagistId">
          <el-radio-group class="time" v-model="form.massagistId" size="mini" @change="clearTime">
            <el-radio-button v-for="massagist in massagistList|| []" :label="massagist.id" :key="massagist.id">
              {{ massagist.name }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer" style="float: right">
        <el-button @click="handleClose" class="btn-B m-r-10">取 消</el-button>
        <el-button type="primary" @click="onSubmit" class="btn-A">确 定</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import {mapGetters} from 'vuex'
import dateUtil from "@/utils/dateUtil";
import orderApi from "@/api/order/order";
import projectApi from "../../api/goods/project"

export default {
  name: 'UpdReceptionOrderForm',
  components: {},
  props: {},
  data() {
    return {
      form: {},
      dialogVisible: false,
      projectId: '',
      dateToBeSelected: [],
      timeList: [],
      massagistList: [],
      clockInTime: '',
      clockOutTime: '',
      pickerOptions: {
        disabledDate(time) {
          return time.getTime() < Date.now() - 24 * 60 * 60 * 1000;
        },
      },
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
    async open(orderId) {
      this.dialogVisible = true
      this.loading = true
      try {
        let res = await orderApi.info(orderId);
        if (res.data) {
          let startTime = res.data.startTime
          let date = dateUtil.format(startTime, "YYYY-MM-DD")
          let time = dateUtil.format(startTime, "HH:mm")
          let shopId = res.data.shopId
          let massagistId = res.data.orderDetailList[0].massagistId
          let durationMinutes = res.data.duration
          let payType = res.data.payType
          let state = res.data.state
          this.form = {
            orderId,
            startTime,
            shopId,
            massagistId,
            durationMinutes,
            date,
            time,
            payType,
            state,
            isUpdateSort: false
          }
          await this.initDateToBeSelected()
          await this.fetchTimeList()
          await this.fetchMassagistList()
          let item = this.shopList.find(e => e.id == shopId)
          if (item) {
            this.clockInTime = item.clockInTime
            this.clockOutTime = item.clockOutTime
          } else {
            this.clockInTime = '08:30'
            this.clockOutTime = '22:30'
          }
          this.form.massagistId = massagistId
        }
      } finally {
        this.loading = false
      }
    },
    handleClose() {
      this.dialogVisible = false
      this.massagistList = []
      this.timeList = []
      this.dateToBeSelected = []
      this.form = {}
    },
    async initDateToBeSelected() {
      let res = await orderApi.bookingDates(null, this.shopId)
      this.dateToBeSelected = res.data || []
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      let startTime = this.form.date + " " + this.form.time + ":00"
      /* if (startTime == this.form.startTime) {
         this.notifyWarning("到店时间没有变化，无需提交修改")
         return
       }*/
      this.loading = true
      try {
        let data = {...this.form, startTime, massagistIdList: [this.form.massagistId]}
        delete data.date
        delete data.time
        await orderApi.updateOrder(data)
        this.notifySuccess()
        this.handleClose()
        this.$emit("submit-success")
      } finally {
        this.loading = false
      }
    },
    clearTime() {
      if (this.form.time) {
        this.fetchMassagistList()
      }
      this.fetchTimeList()
    },
    async fetchMassagistList() {

      try {
        let res = await orderApi.massagistListNew(this.form.date + " " + this.form.time + ":00", 1, this.form.durationMinutes, this.form.shopId,this.projectId)
        this.massagistList = res.data || []
      } catch (e) {
        this.massagistList = []
      }
      console.log(this.massagistList)
    },
    async fetchTimeList() {
      try {
        let res = await orderApi.timeList(this.form.date, 1, this.projectId, this.form.durationMinutes, this.form.shopId)
        this.timeList = res.data || []
      } catch (e) {
        this.timeList = []
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
.UpdReceptionOrderForm {
  padding-bottom: 20px;

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
    margin-bottom: 10px;
  }

  .btn-B {
    background-color: #FFFFFF;
    border: 1px solid #d7d3db;
    color: #54515a;
    border-radius: 16px;
    margin-left: 0;
    margin-bottom: 10px;
  }

  .btn-danger {
    border-radius: 16px;
    margin-left: 0;
    margin-bottom: 10px;
  }
}

</style>
