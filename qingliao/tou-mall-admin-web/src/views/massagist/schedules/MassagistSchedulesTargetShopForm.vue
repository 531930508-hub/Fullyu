<template>
  <div class="MassagistSchedulesTargetShopForm">
    <el-dialog
      :title="form.id ? '编辑调店':'新增调店'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-alert title="临时调店仅作用于所选当天：清除原店当天全部普通排班，其他日期保留；目标店同轮次优先安排，次日回到档案归属门店。" type="info" :closable="false" show-icon class="margin-lr-16"></el-alert>
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">

        <el-form-item label="所属门店" prop="shopId"
                      :rules="[{required: true, message: '请选择所属门店', trigger: ['blur', 'change']}]">
          <shop-selector ref="refShopSelector" v-model="form.shopId" :style="'width: 100%'" @selected="handleShopChange"
                         filter-status clearable :disabled="isEdit"
                         placeholder="请选择所属门店"></shop-selector>
        </el-form-item>
        <el-form-item  label="选择疗愈师" prop="massagistId"
                      :rules="[{required: true, message: '请选择疗愈师', trigger: ['blur', 'change']}]">
          <massagist-selector ref="refMassagistSelector"  v-model="form.massagistId" :style="'width: 100%'" @selected="selectedMassagit"
                              :shop-id="form.shopId" clearable :filterStatus="1" :disabled="isEdit"
                              placeholder="请选择疗愈师"></massagist-selector>
        </el-form-item>
        <el-form-item label="目标门店" prop="targetShopId"
                      :rules="[{required: true, message: '请选择目标门店', trigger: ['blur', 'change']}]">

          <el-select v-model="form.targetShopId"  :style="'width: 100%'" @selected="handleShopChange"
                     filter-status clearable :disabled="isEdit"
                     placeholder="请选择目标门店">
            <el-option
              v-for="item in shopListAll"
              :key="item.id"
              :label="item.name"
              :value="item.id">
            </el-option>
          </el-select>

        </el-form-item>
        <el-form-item  label="排班日期" prop="day"
                      :rules="[{required: true, message: '请选择排班日期', trigger: ['blur', 'change']}]">
          <el-date-picker
            v-model="form.day"
            align="right" style="width: 100%"
            type="date"
            placeholder="选择日期" :picker-options="pickerOptions" :disabled="isEdit"
            value-format="yyyy-MM-dd">
          </el-date-picker>
        </el-form-item>
        <div class="flex">
          <el-form-item label="排班时间" prop="startTime"
                        :rules="[{required: true, message: '请选择接单开始时间', trigger: ['blur', 'change']}]">
            <el-time-select
              placeholder="接单开始时间" style="width: 100%"
              v-model="form.startTime" format="HH:mm" value-format="HH:mm"
              :picker-options="{ start: clockInTime,step: '00:30',end: clockOutTime}">
            </el-time-select>
          </el-form-item>
          <el-form-item prop="endTime" label-width="0"
                        :rules="[{required: true, message: '请选择接单结束时间', trigger: ['blur', 'change']}]">
            <el-time-select
              placeholder="接单结束时间" style="width: 100%"
              v-model="form.endTime" format="HH:mm" value-format="HH:mm"
              :picker-options="{start: clockInTime,step: '00:30',end: clockOutTime,minTime: form.startTime}">
            </el-time-select>
          </el-form-item>
        </div>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">确 定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import massagistSchedulesApi from '@/api/massagistSchedules';
import ShopSelector from '@/views/shop/shopList/ShopSelector';
import MassagistSelector from '@/views/massagist/management/MassagitSelector';

export default {
  name: 'MassagistSchedulesTargetShopForm',
  components: {MassagistSelector, ShopSelector},
  props: {},
  watch: {
    'form.startTime': {
      handler(newVal, oldVal) {
        if (!newVal || !this.form.endTime) return;
        if (this.form.endTime < newVal) {
          this.form.endTime = '';
        }
      },
      immediate: true
    }
  },
  data() {
    return {
      form: {},
      dialogVisible: false,
      isEdit: false,
      submitting: false,
      pickerOptions: {
        disabledDate(time) {
          return time.getTime() < Date.now() - 24 * 60 * 60 * 1000;
        },
      },
      clockInTime: '',
      clockOutTime: '',
    }
  },
  computed: {
    ...mapGetters(['shopList', 'shopId','shopListAll'])
  },
  created() {
    this.$store.dispatch('setShopAllList')
  },
  methods: {
    formatTime(timeStr) {
      if (!timeStr) return '';
      const parts = timeStr.split(':');
      if (parts.length < 2) return '';
      const hours = parts[0].padStart(2, '0');
      const minutes = parts[1].padStart(2, '0');
      return `${hours}:${minutes}`;
    },
    open(form = {}) {
      console.log(form);
      this.form = {...form}
      if (form.startTime) {
        this.$set(this.form, 'startTime', this.formatTime(form.startTime))
      }
      if (form.endTime) {
        this.$set(this.form, 'endTime', this.formatTime(form.endTime))
      }
      this.isEdit = form.id > 0
      this.dialogVisible = true
      if (!form.id) {
        this.$nextTick(() => {
          this.$refs.refShopSelector.change(this.shopId)
        })
        this.changeDate('10:00', '22:00')
      }
      if (form.shopId){
        this.$nextTick(() => {
          this.$refs.refShopSelector.change(form.shopId)
        })
      }
      if (form.massagistId){
        this.$nextTick(() => {
          this.$refs.refMassagistSelector.change(form.massagistId)
        })
      }

    },
    changeDate(startTime, endTime) {
      this.$set(this.form, 'startTime', startTime)
      this.$set(this.form, 'endTime', endTime)
    },
    handleShopChange(item) {
      console.log("=================");
      this.$set(this.form, 'massagistId', null)
      if (item) {
        this.clockInTime = item.clockInTime
        this.clockOutTime = item.clockOutTime
      } else {
        this.clockInTime = '08:30'
        this.clockOutTime = '22:30'
      }
    },
    handleClose() {
      this.dialogVisible = false
      this.form = {}
    },
    async onSubmit() {
      if (this.submitting) return
      this.submitting = true
      let loadingShown = false
      try {
        const valid = await this.$refs.refForm.validate().catch(() => false)
        if (!valid) return
        if (this.form.shopId == this.form.targetShopId) {
          this.$notify.warning('目标门店不能与所属门店相同！')
          return
        }
        this.showFullLoading()
        loadingShown = true
        const request = {...this.form}
        if (this.isEdit) await massagistSchedulesApi.saveTargetShop(request)
        else await massagistSchedulesApi.batchTargetShop(request)
        this.handleClose()
        this.$notify.success('操作成功')
        this.$store.dispatch('setMassagistList', true)
        this.$emit('submit-success')
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.submitting = false
      }
    },
    selectedMassagit(item) {
      if (item) {
        this.$set(this.form, 'shopId', item.shopId)
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.MassagistSchedulesTargetShopForm {
}
</style>
