<template>
  <el-dialog
    :title="'修改订单'"
    :close-on-click-modal="false"
    :visible.sync="dialogVisible"
    width="700px"
    append-to-body
    :before-close="handleClose">
    <div v-loading="loading" class="UpdOrderForm">
      <el-form :model="form" ref="refForm" label-width="100px" label-position="left" class="margin-lr-16">
        <el-form-item label="到店日期" prop="date"
                      :rules="[{required: true, message: `请选择到店日期`, trigger: ['blur', 'change']}]">
          <el-date-picker
            v-model="form.date"
            align="right" style="width: 100%"
            type="date" :clearable="false"
            placeholder="到店日期" @change="clearTime"
            value-format="yyyy-MM-dd">
          </el-date-picker>
          <el-radio-group v-model="form.date" size="mini" @change="clearTime" class="time">
            <el-radio-button v-for="(item,index) in dateToBeSelected || []"
                             :key="index" :label="item.value">
              {{ item.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="到店时间" prop="time"
                      :rules="[{required: true, message: `请选择到店时间`, trigger: ['blur', 'change']}]">
          <el-time-select
            placeholder="到店时间" @change="fetchMassagistAndBedNew" style="width: 100%"
            v-model="form.time" format="HH:mm" value-format="HH:mm" :clearable="false"
            :picker-options="{ start: clockInTime,step: '00:15',end: clockOutTime}">
          </el-time-select>
          <el-radio-group v-model="form.time" size="mini" @change="fetchMassagistAndBedNew" class="time m-t-10">
            <el-radio-button v-for="(item,index) in  timeList|| []" :disabled="item.state==0"
                             :key="index" :label="item.time" style="border-left: 1px">
              {{ item.time }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-show="massagistList && massagistList.length" label="疗愈师" prop="massagistIdList">
          <el-checkbox-group class="group" :max="form.personCount" v-model="form.massagistIdList">
            <el-checkbox-button v-for="massagist in massagistList" :label="massagist.id" :key="massagist.id">
              <img v-if="massagist.fixed ==1" src="@/assets/images/specify-type-icon.png" height="10"
                   style="margin-right: 2px" width="10"/>
              <img v-else-if="massagist.fixed ==2" src="@/assets/images/not-update-sort.png" height="10"
                   style="margin-right: 2px" width="10"/>
              {{ massagist.name }}
            </el-checkbox-button>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-show="bedList && bedList.length" label="座位" prop="bedIdList">
          <el-checkbox-group class="group" :max="form.personCount" v-model="form.bedIdList">
            <el-checkbox-button v-for="bed in bedList" :label="bed.id" :key="bed.id">
              {{ bed.name }}
            </el-checkbox-button>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-if="form.state == 0" label="支付方式" prop="payType">
          <el-radio-group v-model="form.payType" size="mini" class="time m-t-10">
            <el-radio-button v-for="item in constant.orderPayType.filter(s=>s.value != 2)"
                             :key="item.value" :label="item.value">
              {{ item.label }}
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
import dateUtil from "@/utils/dateUtil"
import orderApi from "@/api/order/order"

export default {
  name: 'UpdOrderForm',
  components: {},
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
      specifyTypevalue:0,
      isUpdateSortvalue:true,
      bedList: [],
      clockInTime: '',
      clockOutTime: '',
      pickerOptions: {
        disabledDate(time) {
          return time.getTime() < Date.now() - 24 * 60 * 60 * 1000;
        },
      },
      loading: false,
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
    async open(orderId) {
      this.dialogVisible = true
      this.loading = true
      try {
        let res = await orderApi.info(orderId);
        if (res.data) {
          let productId = res.data.productId
          let startTime = res.data.startTime
          let date = dateUtil.format(startTime, "YYYY-MM-DD")
          let time = dateUtil.format(startTime, "HH:mm")
          let shopId = res.data.shopId
          let personCount = res.data.orderDetailList.length
          let massagistIdList = res.data.orderDetailList.filter(t=>t.massagistId!=null).map(e =>e.massagistId)
          console.log(massagistIdList);
          let bedIdList = res.data.orderDetailList.map(e => e.bedId)
          let durationMinutes = res.data.duration
          let payType = res.data.payType
          let state = res.data.state
          this.form = {
            orderId,
            productId,
            startTime,
            shopId,
            personCount,
            massagistIdList,
            bedIdList,
            durationMinutes,
            date,
            time,
            payType,
            state
          }
          const {projectId, specifyType, massagistId, isUpdateSort} = res.data.orderDetailList[0]
          console.log(res.data.orderDetailList[0])
          this.projectId = projectId
          this.specifyTypevalue=specifyType
          this.isUpdateSortvalue=isUpdateSort
          await this.initDateToBeSelected()
          await this.fetchTimeList()
          if (specifyType == 1) {
            await this.fetchMassagistAndBed(massagistId, 1)
          } else if (!isUpdateSort) {
            await this.fetchMassagistAndBed(massagistId, 2)
          } else {
            await this.fetchMassagistAndBed()
          }
          let item = this.shopList.find(e => e.id == shopId)
          if (item) {
            this.clockInTime = item.clockInTime
            this.clockOutTime = item.clockOutTime
          } else {
            this.clockInTime = '08:30'
            this.clockOutTime = '22:30'
          }
          this.form.massagistIdList = massagistIdList
          this.form.bedIdList = bedIdList
        }
      } finally {
        this.loading = false
      }
    },
    handleClose() {
      this.dialogVisible = false
      this.massagistList = []
      this.bedList = []
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
      if (this.form.massagistIdList && this.form.massagistIdList.length > this.form.personCount) {
        this.notifyWarning(this.form.personCount + "人订单，最多选择" + this.form.personCount + "个疗愈师")
        return
      }
      if (this.form.bedIdList && this.form.bedIdList.length > this.form.personCount) {
        this.notifyWarning(this.form.personCount + "人订单，最多选择" + this.form.personCount + "个座位")
        return
      }
      let startTime = this.form.date + " " + this.form.time + ":00"
      /* if (startTime == this.form.startTime) {
         this.notifyWarning("到店时间没有变化，无需提交修改")
         return
       }*/
      if (this.form.personCount > 1) {// todo 提醒文本需要修改
        await this.notifyConfirm("此订单下所有详情都会修改到店时间，确定要修改吗？")
      }
      this.loading = true
      try {
        let data = {...this.form, startTime}
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
    async clearTime() {
      if (this.form.time) {
        if (this.specifyType == 1) {
          await this.fetchMassagistAndBed(massagistId, 1)
        } else if (!this.isUpdateSort) {
          await this.fetchMassagistAndBed(massagistId, 2)
        }
        //this.fetchMassagistAndBed()
      }
      this.fetchTimeList()
    },
    async fetchMassagistAndBed(massagistId, type) {
      await this.fetchMassagistList(massagistId, type)
      await this.fetchBedList()
    },
    async fetchMassagistAndBedNew() {
      if (this.specifyType == 1) {
        await this.fetchMassagistAndBed(massagistId, 1)
      } else if (!this.isUpdateSort) {
        await this.fetchMassagistAndBed(massagistId, 2)
      }
      await this.fetchBedList()
    },
    async fetchMassagistList(massagistId, type) {
      console.log("massagistId+++")
      console.log(this.massagistId)//specifyType, massagistId, isUpdateSort
      console.log(this.isUpdateSort)
      console.log(this.specifyType)
      try {
        let res = await orderApi.massagistListNew(this.form.date + " " + this.form.time + ":00", this.form.personCount, this.form.durationMinutes, this.form.shopId,this.projectId)
        this.massagistList = res.data || []
        // 如果指定了疗愈师
        if (massagistId) {
          this.massagistList.forEach(v => {
            // 指定疗愈师的，做个标记
            if (massagistId == v.id) {
              this.$set(v, 'fixed', type)
            } else {
              this.$set(v, 'fixed', 0)
            }
          })
        }
      } catch (e) {
        this.massagistList = []
      }
    },
    async fetchBedList() {
      try {
        let res = await orderApi.bedList(this.form.date + " " + this.form.time + ":00", this.projectId, this.form.durationMinutes, this.form.shopId)
        this.bedList = res.data || []
      } catch (e) {
        this.bedList = []
      }
    },
    async fetchTimeList() {
      try {
        console.log(this.form.orderId)

        let res = await orderApi.timeListEdit(this.form.date, this.form.personCount, this.projectId, this.form.durationMinutes, this.form.shopId,this.form.orderId)
        this.timeList = res.data || []
      } catch (e) {
        this.timeList = []
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.UpdOrderForm {
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
}

</style>
