<template>
  <div class="MassagistSchedulesForm">
    <el-dialog
      :title="form.id ? '编辑排班':'新增排班'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">
        <el-form-item label="所属门店" prop="shopId"
                      :rules="[{required: true, message: '请选择所属门店', trigger: ['blur', 'change']}]">
          <shop-selector ref="refShopSelector" v-model="form.shopId" :style="'width: 100%'" @selected="handleShopChange"
                         filter-status clearable :disabled="isEdit" :force-update="false"
                         placeholder="请选择所属门店"></shop-selector>
        </el-form-item>
        <el-form-item v-if="isEdit" label="选择疗愈师" prop="massagistId"
                      :rules="[{required: true, message: '请选择疗愈师', trigger: ['blur', 'change']}]">
          <massagist-selector v-model="form.massagistId" :style="'width: 100%'" @selected="selectedMassagit"
                              :shop-id="form.id ?'':form.shopId" clearable :filterStatus="1" :disabled="isEdit"
                              placeholder="请选择疗愈师"></massagist-selector>
        </el-form-item>
        <el-form-item v-else label="选择疗愈师" prop="massagistIdList"
                      :rules="[{required: true, message: '请选择疗愈师', trigger: ['blur', 'change']}]">
          <massagist-selector v-model="form.massagistIdList" :style="'width: 100%'" @selected="selectedMassagit"
                              :shop-id="form.shopId" clearable :filterStatus="1" multiple
                              placeholder="可选择多个疗愈师"></massagist-selector>
        </el-form-item>
        <el-form-item v-if="isEdit" label="排班日期" prop="day"
                      :rules="[{required: true, message: '请选择排班日期', trigger: ['blur', 'change']}]">
          <el-date-picker
            v-model="form.day"
            align="right" style="width: 100%"
            type="date"
            placeholder="选择日期" :picker-options="pickerOptions"
            value-format="yyyy-MM-dd">
          </el-date-picker>
        </el-form-item>
        <el-form-item v-else label="排班日期" prop="dates"
                      :rules="[{required: true, message: '请选择排班日期', trigger: ['blur', 'change']}]">
          <el-date-picker v-model="form.dates"
                          align="right" style="width: 100%"
                          type="dates"
                          placeholder="可选择多个日期" :picker-options="pickerOptions"
                          value-format="yyyy-MM-dd">
          </el-date-picker>
        </el-form-item>
        <!--        <el-form-item v-if="isEdit" label="排班顺序" prop="sequence"
                              :rules="[{required: true, message: '请输入排班顺序', trigger: ['blur', 'change']}]">
                  <el-input-number v-model="form.sequence" :min="0" :max="100" label="排班顺序" style="width: 100%" controls></el-input-number>
                </el-form-item>-->
        <div class="flex">
          <el-form-item label="排班时间" prop="startTime"
                        :rules="[{required: true, message: '请选择上班时间', trigger: ['blur', 'change']}]">
            <el-time-select
              placeholder="上班时间" style="width: 100%"
              v-model="form.startTime" format="HH:mm" value-format="HH:mm"
              :picker-options="{ start: clockInTime,step: '00:30',end: clockOutTime}">
            </el-time-select>
          </el-form-item>
          <el-form-item prop="endTime" label-width="0"
                        :rules="[{required: true, message: '请选择下班时间', trigger: ['blur', 'change']}]">
            <el-time-select
              placeholder="下班时间" style="width: 100%"
              v-model="form.endTime" format="HH:mm" value-format="HH:mm"
              :picker-options="{start: clockInTime,step: '00:30',end: '24:00',minTime: form.startTime}">
            </el-time-select>
          </el-form-item>
        </div>
        <!--        <div style="margin-left: 100px">
                  <el-tag @click="changeDate('10:00','22:00')">10:00-22:00</el-tag>
                </div>-->

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
import massagistSchedulesApi from '@/api/massagistSchedules';
import ShopSelector from '@/views/shop/shopList/ShopSelector';
import MassagistSelector from '@/views/massagist/management/MassagitSelector';

export default {
  name: 'MassagistSchedulesForm',
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
      pickerOptions: {
        disabledDate(time) {
          return time.getTime() < Date.now() - 24 * 60 * 60 * 1000;
        },
      },
      isEdit: false,
      clockInTime: '',
      clockOutTime: '',
    }
  },
  computed: {
    ...mapGetters(['shopList', 'shopId'])
  },
  created() {
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
          this.changeDate(this.formatTime(this.clockInTime), this.formatTime(this.clockOutTime))
        })
      }
      if (form.shopId) {
        this.$nextTick(() => {
          this.$refs.refShopSelector.change(form.shopId)
        })
      }
    },
    changeDate(startTime, endTime) {
      this.$set(this.form, 'startTime', startTime)
      this.$set(this.form, 'endTime', endTime)
    },
    handleShopChange(item) {
      this.$set(this.form, 'massagistIdList', null)
      if (item) {
        this.clockInTime = item.clockInTime
        this.clockOutTime = item.clockOutTime
      } else {
        this.clockInTime = '08:30'
        this.clockOutTime = '22:30'
      }
      this.$set(this.form, 'massagistIdList', null)
    },
    handleClose() {
      this.dialogVisible = false
      this.form = {}
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      this.showFullLoading()
      if(this.form.endTime=='24:00'){
        this.form.endTime='23:59'
      }
      if (this.isEdit) {
        await massagistSchedulesApi.saveOrUpd(this.form)
      } else {
        await massagistSchedulesApi.batchAdd(this.form)
      }
      this.handleClose()
      this.hideFullLoading()
      this.$notify.success('操作成功')
      this.$store.dispatch('setMassagistList', true)
      this.$emit('submit-success')
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
.MassagistSchedulesForm {
}
</style>
