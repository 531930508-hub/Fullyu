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
          <div v-if="sameDaySelected" class="form-tip same-day-tip">
            含今天的申请按「当天请假」处理：审批链路从本店店长开始（店长及以上审批）
          </div>
        </el-form-item>
        <el-form-item label="休息时段" class="leave-time-item">
          <div class="leave-time-range">
            <el-form-item prop="startTime" label-width="0" class="leave-time-range__field"
                          :rules="[{required: true, message: '请选择开始时间', trigger: ['blur', 'change']}]">
              <el-time-select
                placeholder="开始时间" class="leave-time-range__input"
                v-model="form.startTime" format="HH:mm" value-format="HH:mm"
                :picker-options="{ start: clockInTime || '00:00',step: '00:30',end: clockOutTime || '24:00'}">
              </el-time-select>
            </el-form-item>
            <span class="leave-time-range__sep">至</span>
            <el-form-item prop="endTime" label-width="0" class="leave-time-range__field"
                          :rules="[{required: true, message: '请选择结束时间', trigger: ['blur', 'change']}]">
              <el-time-select
                placeholder="结束时间" class="leave-time-range__input"
                v-model="form.endTime" format="HH:mm" value-format="HH:mm"
                :picker-options="{start: clockInTime || '00:00',step: '00:30',end: clockOutTime || '24:00',minTime: form.startTime}">
              </el-time-select>
            </el-form-item>
          </div>
        </el-form-item>
        <el-form-item label="休息说明" prop="marks"
                      :rules="[{required: true, message: '请输入休息说明', trigger: ['blur', 'change']}]">
          <el-input type="textarea" v-model="form.marks" maxlength="200" show-word-limit
                    placeholder="请输入休息说明"></el-input>
        </el-form-item>
        <el-form-item label="抄送人员">
          <el-select v-model="form.ccIdList" multiple filterable clearable style="width: 100%"
                     placeholder="审批进度会同步抄送，可增减">
            <el-option v-for="item in adminUserList" :key="item.id" :label="item.nickName" :value="item.id"></el-option>
          </el-select>
          <div class="form-tip">默认取「审批流程 → 请假审批」的抄送人，可在此增减</div>
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
      ccSeq:0,
      shopSeq:0,
      clockInTime: '',
      clockOutTime: '',
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
      ...mapGetters(['shopId','userId','massagistId','shopList','adminUserList']),
      //勾选日期里是否包含今天：当天请假审批链路从店长开始
      sameDaySelected() {
        const now = new Date()
        const pad = n => String(n).padStart(2, '0')
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
        return (this.form.dates || []).some(item => String(item).slice(0, 10) === today)
      }
  },
  created() {
    //抄送人员选择器需要管理员列表
    this.$store.dispatch('setAdminUserList')
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
    //从已加载的门店列表里取门店；取不到返回 null
    findShop(shopId) {
      if (!shopId) return null
      return (this.shopList || []).find(item => String(item.id) === String(shopId)) || null
    },

    //门店列表未必在当前页面加载过，缺失时主动拉一次，保证默认营业时间可用
    async loadShop(shopId) {
      const shop = this.findShop(shopId)
      if (shop || !shopId || !this.$store) return shop
      try {
        await this.$store.dispatch('setShopList', true)
      } catch (e) {
        return null
      }
      return this.findShop(shopId)
    },

    applyShopHours(shop) {
      if (!shop) return
      this.clockInTime = this.formatTime(shop.clockInTime)
      this.clockOutTime = this.formatTime(shop.clockOutTime)
    },

    open(form = {}) {
      if (this.submitting) return false
      this.submitError = ''
      this.clockInTime = ''
      this.clockOutTime = ''
      const shopSeq = ++this.shopSeq
      this.form = {...form}
      if (Array.isArray(form.dates)) {
        this.$set(this.form, 'dates', [...form.dates])
      } else if (form.datesStr) {
        this.$set(this.form, 'dates', String(form.datesStr).split(',').filter(Boolean))
      }
      // 修改时保留已保存的时段；新申请才默认取所在门店营业时间。
      const targetShopId = form.shopId || this.shopId
      const shop = this.findShop(targetShopId)
      this.applyShopHours(shop)
      this.$set(this.form, 'startTime', this.formatTime(form.startTime) || this.clockInTime)
      this.$set(this.form, 'endTime', this.formatTime(form.endTime) || this.clockOutTime)
      //修改时沿用已保存的抄送人，新申请默认取审批流程配置
      if (Array.isArray(form.ccIdList)) {
        this.$set(this.form, 'ccIdList', [...form.ccIdList])
      } else {
        this.$set(this.form, 'ccIdList', [])
        this.loadDefaultCc()
      }
      this.dialogVisible = true
      this.$nextTick(() => this.$refs.refForm && this.$refs.refForm.clearValidate && this.$refs.refForm.clearValidate())
      //门店列表还没加载过：异步补齐默认时段，弹窗已关闭/换单或用户已手选时不覆盖
      if (!shop && targetShopId) {
        this.loadShop(targetShopId).then(laterShop => {
          if (shopSeq !== this.shopSeq || !this.dialogVisible || !laterShop) return
          this.applyShopHours(laterShop)
          if (!this.form.startTime) this.$set(this.form, 'startTime', this.clockInTime)
          if (!this.form.endTime) this.$set(this.form, 'endTime', this.clockOutTime)
        })
      }
      return true
    },

    //默认抄送人异步读取，弹窗已关闭或用户已手动选择时不覆盖
    async loadDefaultCc() {
      const seq = ++this.ccSeq
      try {
        const res = await massagistLeaveApi.defaultCcUsers()
        if (seq !== this.ccSeq || !this.dialogVisible) return
        if ((this.form.ccIdList || []).length) return
        this.$set(this.form, 'ccIdList', res.data || [])
      } catch (e) {
        //读取失败保持为空，不阻塞提交
      }
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
.form-tip {
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}
.same-day-tip {
  color: #c4562f;
}
.leave-time-item {
  margin-bottom: 30px;
}
.leave-time-range {
  display: flex;
  align-items: flex-start;
  width: 100%;
}
.leave-time-range__field {
  flex: 1 1 0;
  min-width: 0;
  margin-bottom: 0;
}
.leave-time-range__sep {
  flex: none;
  width: 20px;
  text-align: center;
  line-height: 40px;
  color: #909399;
}
.leave-time-range__input {
  width: 100%;
}
</style>
