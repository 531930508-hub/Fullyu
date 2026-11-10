<template>
  <div class="salaryCoefficientForm">
    <el-dialog
      :title="'更新劳务服务费系数'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="100px" label-position="left" class="margin-lr-16">

        <el-form-item label="0至7200" prop="onevalue"
                      :rules="[{required: true, message: `请输入金额`, trigger: ['blur', 'change']}]">
          <el-input @input="handleInput1" v-model="form.onevalue"></el-input>
        </el-form-item>

        <el-form-item label="7200至8400" prop="twovalue"
                      :rules="[{required: true, message: `请输入金额`, trigger: ['blur', 'change']}]">
          <el-input @input="handleInput2" v-model="form.twovalue"></el-input>
        </el-form-item>

        <el-form-item label="8400至9600" prop="threevalue"
                      :rules="[{required: true, message: `请输入金额`, trigger: ['blur', 'change']}]">
          <el-input @input="handleInput3" v-model="form.threevalue"></el-input>
        </el-form-item>
        <el-form-item label="9600以上" prop="fourvalue"
                      :rules="[{required: true, message: `请输入金额`, trigger: ['blur', 'change']}]">
          <el-input @input="handleInput4" v-model="form.fourvalue"></el-input>
        </el-form-item>

        <el-form-item label="实习期" prop="samllvalue"
                      :rules="[{required: true, message: `请输入金额`, trigger: ['blur', 'change']}]">
          <el-input @input="handleInput5" v-model="form.samllvalue"></el-input>
        </el-form-item>

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
import salaryOtherAmountApi from "@/api/salaryOtherAmount";

export default {
  name: 'salaryCoefficientForm',
  props: {},
  data() {
    return {
      dialogVisible: false,
      form: {
        onevalue:0,
        twovalue:0,
        threevalue:0,
        fourvalue:0,
        samllvalue:0,
      },
    }
  },
  methods: {
    handleInput1(value) {
        this.form.onevalue = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    },
    handleInput2(value) {
      this.form.twovalue = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    },
    handleInput3(value) {
      this.form.threevalue = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    },
    handleInput4(value) {
      this.form.fourvalue = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    },
    handleInput5(value) {
      this.form.samllvalue = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    },
    open() {
      this.getSalaryCoefficient();
      this.dialogVisible = true
    },
    async getSalaryCoefficient() {
      let res= await salaryOtherAmountApi.getSalaryCoefficient()
      this.form.onevalue=res.data[0].coefficient
      this.form.twovalue=res.data[1].coefficient
      this.form.threevalue=res.data[2].coefficient
      this.form.fourvalue=res.data[3].coefficient
      this.form.samllvalue=res.data[4].coefficient
    },
    handleClose() {
      this.dialogVisible = false
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      console.log("sdfds");
      console.log(this.form);
      this.showFullLoading()
      await salaryOtherAmountApi.saveorupdate(this.form)
      this.handleClose()
      this.hideFullLoading()
      this.$notify.success('操作成功')
      this.$emit('submit-success')
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>

</style>
