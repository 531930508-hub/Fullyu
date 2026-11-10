<template>
  <el-dialog :title="`${form.phone}客户备注`" :visible.sync="dialogVisible" width="400px" modal-append-to-body
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
      <div slot="footer" class="dialog-footer" style="float: right">
        <el-button class="btn-B m-r-10" @click="dialogVisible = false">取 消</el-button>
        <el-button type="primary" @click="onSubmit" class="btn-A">确 定</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import customerApi from '../../api/customer'

export default {
  name: 'CustomerFormDialog',
  components: {},
  props: {},
  data() {
    return {
      dialogVisible: false,
      form: {}
    }
  },
  methods: {
    open(customer) {
      this.dialogVisible = true
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
