<template>
  <div class="GiftCustomerCouponForm">
    <el-dialog
      :title="'送券申请'"
      :visible.sync="dialogVisible"
      width="700px"
      :before-close="handleClose">
      <el-tabs v-model="activeName">
        <el-tab-pane label="表单审批" name="first" :disabled="submitting"></el-tab-pane>
        <el-tab-pane label="批量审批" name="second" :disabled="submitting"></el-tab-pane>
      </el-tabs>
      <el-form v-if="activeName=='first'" :model="form" ref="refForm" label-width="120px" label-position="left"
               class="margin-lr-16" :disabled="submitting">
        <!-- 客户手机号 -->
        <el-form-item label="客户手机号" prop="phone"
                      :rules="{required: true, message: '请输入客户手机号', trigger: ['blur', 'change']}">
          <el-input
            v-model="form.phone"
            placeholder="请输入客户手机号"
            clearable @input="handlePhoneInput"
            show-word-limit>
          </el-input>
        </el-form-item>

        <!-- 赠送数量 -->
        <el-form-item label="赠送数量" prop="couponNumber"
                      :rules="[
                        {required: true, message: '请输入赠送数量', trigger: ['blur', 'change']},
                        {type: 'number', min: 1, message: '数量必须大于0', trigger: ['blur', 'change']}
                      ]">
          <el-input-number
            v-model="form.couponNumber"
            style="width: 100%"
            :min="1"
            :max="10000"
            :precision="0"
            placeholder="请输入赠送数量"
            controls-position="right">
          </el-input-number>
        </el-form-item>

        <el-form-item label="单券价值（元）" prop="couponAmount">
          <el-input-number v-model="form.couponAmount" :min="0" :max="99999999.99" :precision="2"
                           :step="1" controls-position="right" style="width: 100%"></el-input-number>
          <div class="el-upload__tip">默认 0 元；赠券总价值 {{ totalGiftAmount }} 元。不代表新增现金收款。</div>
        </el-form-item>

        <!-- 有效期 -->
        <el-form-item label="券有效期" prop="startTime"
                      :rules="{required: true, message: '请选择券有效期', trigger: 'change'}">
          <el-date-picker
            v-model="dateTime" :picker-options="pickerOptions"
            type="daterange"
            style="width:100%"
            end-placeholder="有效期止"
            range-separator="至"
            start-placeholder="有效期起"
            value-format="yyyy-MM-dd"
            @change="changeDate">
          </el-date-picker>
        </el-form-item>

        <!-- 使用限制 -->
        <el-form-item label="使用限制" prop="limitations">
          <el-input
            type="textarea"
            :rows="3"
            :maxlength="500"
            show-word-limit
            placeholder="请输入使用限制说明"
            v-model="form.limitations">
          </el-input>
        </el-form-item>
      </el-form>
      <div v-if="activeName=='second'">
        <el-button icon="el-icon-download" type="text" :loading="downloading" :disabled="submitting"
                   @click="downloadTemplate">批量审批模板下载</el-button>
        <div class="el-upload__tip">模板可填写每张券的价值；未填写或旧模板没有价值列时，按 0 元申请。任一行错误则整批不提交。</div>
        <div>
          <el-upload style="margin-top: 10px;margin-left: 150px" v-if="dialogVisible"
                     ref="refFile" drag
                     action="/data"
                     :limit="1"
                     accept=".xlsx"
                     :on-remove="handleRemove"
                     :on-change="handleChange"
                     :on-exceed="handleExceed"
                     :auto-upload="false" :disabled="submitting">
            <i class="el-icon-upload"></i>
            <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
            <div class="el-upload__tip" slot="tip">只能上传excel文件</div>
          </el-upload>
        </div>

      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose" :disabled="submitting">取 消</el-button>
        <el-button type="primary" @click="onSubmit" :loading="submitting">提 交</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import giftCustomerCouponApi from "@/api/order/giftCustomerCoupon"
import dateUtil from "@/utils/dateUtil";

export default {
  name: 'GiftCustomerCouponForm',
  data() {
    return {
      form: {
        phone: '',
        couponNumber: 1,
        couponAmount: 0,
        limitations: '',
        startTime: '',
        endTime: ''
      },
      activeName: 'first',
      dialogVisible: false,
      pickerOptions: {
        disabledDate(time) {
          // 禁用今天之前的日期
          return time.getTime() < Date.now() - 86400000;
        },
        shortcuts: [{
          text: '一个月',
          onClick(picker) {
            picker.$emit('pick', [dateUtil.getCurrentDateCode(), dateUtil.getCurrentDateCodeAdd(30)]);
          }
        }, {
          text: '一年',
          onClick(picker) {
            picker.$emit('pick', [dateUtil.getCurrentDateCode(), dateUtil.getCurrentDateCodeAdd(365)]);
          }
        }]
      },
      dateTime: [],
      excelFile: null,
      submitting: false,
      downloading: false,
    }
  },
  computed: {
    ...mapGetters(['userId', 'shopId']),
    totalGiftAmount() {
      return ((Number(this.form.couponAmount) || 0) * (Number(this.form.couponNumber) || 0)).toFixed(2)
    }
  },
  methods: {
    changeDate(val) {
      if (val && val.length === 2) {
        this.form.startTime = val[0]
        this.form.endTime = val[1]
      } else {
        this.form.startTime = ''
        this.form.endTime = ''
      }
    },

    open(form = {}) {
      if (this.submitting) return
      this.activeName = 'first'
      this.excelFile = null
      this.form = Object.assign({phone: '', couponNumber: 1, couponAmount: 0, limitations: '', startTime: '', endTime: ''}, form,
        {couponAmount: form.couponAmount == null ? 0 : Number(form.couponAmount)})
      this.dateTime = form.startTime && form.endTime ? [form.startTime, form.endTime] : []
      this.dialogVisible = true
      this.$nextTick(() => {
        if (this.$refs.refForm) {
          this.$refs.refForm.clearValidate()
        }
      })
    },
    handleRemove() {
      this.excelFile = null
    },
    handleChange(file, fileList) {
      this.excelFile = file
    },
    handleExceed(files, fileList) {
      this.$message.warning(`只能选择 1 个文件`);
    },
    handleClose() {
      if (this.submitting) return
      this.dialogVisible = false
      if (this.$refs.refForm) {
        this.$refs.refForm.resetFields()
      }
      this.dateTime = []
      this.handleRemove()
      if (this.$refs.refFile) this.$refs.refFile.clearFiles()
    },
    async downloadTemplate() {
      if (this.downloading || this.submitting) return
      this.downloading = true
      try { await giftCustomerCouponApi.template() }
      finally { this.downloading = false }
    },
    handlePhoneInput(value){
      const filtered = value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
      this.form.phone = filtered;
    },
    async onSubmit() {
      if (this.submitting) return
      const tab = this.activeName
      if (tab === 'second' && (!this.excelFile || !this.excelFile.raw)) {
        this.$message.warning('请先选择赠券Excel文件')
        return
      }
      const amount = this.form.couponAmount == null ? 0 : Number(this.form.couponAmount)
      if (tab === 'first' && (!Number.isFinite(amount) || amount < 0 || amount > 99999999.99 ||
        Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001)) {
        this.$message.warning('单券价值须为非负金额，最多两位小数')
        return
      }
      this.submitting = true
      let loading = false
      try {
        if (tab === 'first') {
          const valid = await this.$refs.refForm.validate().catch(() => false)
          if (!valid) return
          this.showFullLoading()
          loading = true
          await giftCustomerCouponApi.add({...this.form, couponAmount: amount.toFixed(2), shopId: this.shopId})
        } else {
          await this.notifyConfirm('确定要提交批量送券申请吗？')
          this.showFullLoading()
          loading = true
          await giftCustomerCouponApi.importExcel(this.excelFile.raw, this.shopId)
        }
        this.$notify.success('操作成功')
        this.submitting = false
        this.handleClose()
        this.$emit('submit-success')
      } catch (error) {
        if (error !== 'cancel' && error !== 'close') throw error
      } finally {
        this.submitting = false
        if (loading) this.hideFullLoading()
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.GiftCustomerCouponForm {
  ::v-deep .el-dialog__body {
    padding-top: 0 !important;
  }
}
</style>
