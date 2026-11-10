<template>
  <div class="SalaryOtherAmountDialog">
    <el-dialog
      title="其他调整"
      :visible.sync="dialogVisible"
      width="500px"
      :before-close="handleClose">
      <a
        href="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/template/%E5%85%B6%E4%BB%96%E8%B0%83%E6%95%B4.xlsx"
        target="_blank">
        <div style="background: #E9F2FF;color:#1678ff;padding:8px 15px;font-size:14px;border-radius: 4px;">
          <i class="el-icon-download"/>
          <span style="margin-left:5px;">模板下载</span>
        </div>
      </a>
      <div class="flex justify-center">
        <el-upload style="margin: 10px" v-if="dialogVisible"
                   ref="refFile" drag
                   action="/data"
                   :limit="1"
                   accept=".xlsx"
                   :on-remove="handleRemove"
                   :on-change="handleChange"
                   :on-exceed="handleExceed"
                   :auto-upload="false">
          <i class="el-icon-upload"></i>
          <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
          <div class="el-upload__tip" slot="tip">只能上传excel文件</div>
        </el-upload>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">取 消</el-button>
        <el-button type="primary" @click="onSubmit">提 交</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import salaryOtherAmountApi from "../../../api/salaryOtherAmount"

export default {
  name: 'SalaryOtherAmountDialog',
  data() {
    return {
      dialogVisible: false,
      excelFile: null,
    }
  },
  computed: {
    ...mapGetters(['userId'])
  },
  methods: {
    open() {
      this.excelFile = null
      this.dialogVisible = true
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
      this.dialogVisible = false
      if (this.$refs.refForm) {
        this.$refs.refForm.resetFields()
      }
      this.excelFile = null
      this.handleRemove()
    },
    async onSubmit() {
      await this.notifyConfirm("确定要提交其他调整吗？")
      this.showFullLoading()
      await salaryOtherAmountApi.importExcel(this.excelFile.raw, this.userId)
      this.$notify.success("操作成功")
      this.handleClose()
      this.hideFullLoading()
      this.$emit("submit-success")
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.SalaryOtherAmountDialog {
  ::v-deep .el-dialog__body {
    padding-top: 0 !important;
  }
}
</style>
