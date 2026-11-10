<template>
  <div class="MassagistLeaveForm">
    <el-dialog
      :title="form.id ? '修改休息申请':'申请休息'"
      :visible.sync="dialogVisible"
      width="450px"
      :close-on-click-modal="!submitting"
      :close-on-press-escape="!submitting"
      :before-close="handleClose">
      <el-alert v-if="submitError" :title="submitError" type="error" show-icon :closable="false"
                class="margin-lr-16" style="margin-bottom: 12px"></el-alert>
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">
        <el-form-item  label="休息日期" prop="dates"
                       :rules="[{required: true, message: '请选择休息日期', trigger: ['blur', 'change']}]">
          <el-date-picker v-model="form.dates"
                          align="right" style="width: 100%"
                          type="dates"
                          placeholder="可选择多个日期" :picker-options="pickerOptions"
                          value-format="yyyy-MM-dd">
          </el-date-picker>
        </el-form-item>
        <div class="flex">
          <el-form-item label="休息时段" prop="startTime"
                        :rules="[{required: true, message: '请选择开始时间', trigger: ['blur', 'change']}]">
            <el-time-select
              placeholder="开始时间" style="width: 100px"
              v-model="form.startTime" format="HH:mm" value-format="HH:mm"
              :picker-options="{ start: clockInTime,step: '00:30',end: clockOutTime}">
            </el-time-select>
          </el-form-item>
          <el-form-item prop="endTime" label-width="0"
                        :rules="[{required: true, message: '请选择结束时间', trigger: ['blur', 'change']}]">
            <el-time-select
              placeholder="结束时间" style="width: 100%"
              v-model="form.endTime" format="HH:mm" value-format="HH:mm"
              :picker-options="{start: clockInTime,step: '00:30',end: clockOutTime}">
            </el-time-select>
          </el-form-item>
        </div>
        <el-form-item label="休息说明" prop="marks"
                      :rules="[{required: true, message: '请输入休息说明', trigger: ['blur', 'change']}]">
          <el-input type="textarea" v-model="form.marks" maxlength="200" show-word-limit
                    placeholder="请输入休息说明"></el-input>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button :disabled="submitting" @click="handleClose">取 消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="submitting" @click="onSubmit">确 定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import massagistLeaveApi from "@/api/massagistLeave";

export default {
  name: 'MassagistLeaveForm',
  components: {},
  props: {},
  data() {
    return {
      form: {
        shopId:'',
        createUser:'',
      },
      pickerOptions: {
        disabledDate(time) {
          return time.getTime() < Date.now() - 24 * 60 * 60 * 1000;
        },
      },
      dialogVisible:false,
      submitting:false,
      submitError:'',
      clockInTime: '08:00',
      clockOutTime: '23:00',
    }
  },
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
  computed: {
      ...mapGetters(['shopId','userId','massagistId','shopList'])
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
      if (this.submitting) return false
      this.submitError = ''
      this.form = {...form}
      if (Array.isArray(form.dates)) {
        this.$set(this.form, 'dates', [...form.dates])
      } else if (form.datesStr) {
        this.$set(this.form, 'dates', String(form.datesStr).split(',').filter(Boolean))
      }
      const shop = (this.shopList || []).find(item => String(item.id) === String(this.shopId))
      if (shop) {
        this.clockInTime = this.formatTime(shop.clockInTime) || this.clockInTime
        this.clockOutTime = this.formatTime(shop.clockOutTime) || this.clockOutTime
      }
      // 修改时保留已保存的时段；新申请才默认取所在门店营业时间。
      this.$set(this.form, 'startTime', this.formatTime(form.startTime) || this.clockInTime)
      this.$set(this.form, 'endTime', this.formatTime(form.endTime) || this.clockOutTime)
      this.dialogVisible = true
      this.$nextTick(() => this.$refs.refForm && this.$refs.refForm.clearValidate && this.$refs.refForm.clearValidate())
      return true
    },

    handleClose() {
      if (this.submitting) return false
      this.dialogVisible = false
      this.submitError = ''
      this.form = {}
      return true
    },
    async onSubmit() {
      if (this.submitting) return false
      this.submitting = true
      this.submitError = ''
      let loadingShown = false
      try {
        try {
          const valid = await this.$refs.refForm.validate()
          if (valid === false) return false
        } catch (e) {
          return false
        }
        if (!this.massagistId || !this.userId || !this.shopId) {
          this.submitError = '当前账号未关联疗愈师或门店，无法提交'
          return false
        }
        if (!this.form.startTime || !this.form.endTime || this.form.endTime <= this.form.startTime) {
          this.submitError = '结束时间必须晚于开始时间'
          return false
        }
        const payload = {
          ...this.form,
          dates: [...(this.form.dates || [])],
          shopId: this.shopId,
          createUser: this.userId,
          massagistId: this.massagistId
        }
        this.showFullLoading()
        loadingShown = true
        await massagistLeaveApi.add(payload)
        this.hideFullLoading()
        loadingShown = false
        this.submitting = false
        this.handleClose()
        this.$notify.success("提交成功")
        this.$emit("submit-success")
        return true
      } catch (e) {
        this.submitError = '提交失败：' + ((e && e.message) || '请稍后重试') + '，可修改后重试'
        return false
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.submitting = false
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.MassagistForm {

}
</style>
