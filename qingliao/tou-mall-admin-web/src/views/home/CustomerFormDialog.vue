<template>
  <el-dialog :title="`${maskedPhone}客户备注`" :visible.sync="dialogVisible" width="400px" modal-append-to-body
             append-to-body :close-on-click-modal="false">
    <div class="CustomerFormDialog">
      <div style="text-align: center;margin: 20px 0;">
        <el-input v-model="form.comment" placeholder="客户称呼" clearable></el-input>
      </div>
      <el-radio-group v-model="form.gender">
        <el-radio border v-for="(item,index) in constant.gender" :key="index" :label="item.value">
          {{ item.label }}
        </el-radio>
      </el-radio-group>
      <div style="text-align: center;margin: 20px 0;">
        <el-input v-model="form.note" placeholder="客户备注" clearable></el-input>
      </div>
      <div class="birthday-field">
        <span class="birthday-field__label">客户生日</span>
        <birthday-picker :key="pickerKey" v-model="form.birthday"></birthday-picker>
      </div>
      <div slot="footer" class="dialog-footer" style="float: right">
        <el-button class="btn-B m-r-10" @click="dialogVisible = false">取 消</el-button>
        <el-button type="primary" @click="onSubmit" class="btn-A">确 定</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import customerApi from '../../api/customer'
import BirthdayPicker from './BirthdayPicker'

export default {
  name: 'CustomerFormDialog',
  components: { BirthdayPicker },
  props: {},
  data() {
    return {
      dialogVisible: false,
      form: {},
      //每次打开重建生日控件，避免上一位客户没保存的月/日残留
      pickerKey: 0
    }
  },
  computed: {
    // 标题只展示脱敏号码；表单里的 form.phone 仍是真实值，提交不会把星号写回库里
    maskedPhone() {
      return this.$options.filters['maskPhoneFilter'](this.form.phone)
    }
  },
  methods: {
    open(customer) {
      this.dialogVisible = true
      this.pickerKey += 1
      this.form = {...customer}
    },
    async onSubmit() {
      this.showFullLoading()
      await customerApi.update(this.form)
      this.hideFullLoading()
      this.dialogVisible = false
      this.$emit('submit-success',this.form)
      this.notifySuccess()
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.CustomerFormDialog {
  padding-bottom: 20px;

  .birthday-field {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 20px 0;

    &__label {
      margin-right: 10px;
      color: #606266;
      font-size: 14px;
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
