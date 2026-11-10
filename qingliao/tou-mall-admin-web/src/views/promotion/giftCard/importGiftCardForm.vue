<template>
  <div class="importGiftCardForm">
    <el-dialog
      :title="'批量添加礼品卡'"
      :visible.sync="dialogVisible"
      width="700px"
      :before-close="handleClose">
      <a
        href="https://fullytherapy.oss-cn-hangzhou.aliyuncs.com/fully/template/%E7%A4%BC%E5%93%81%E5%8D%A1%E5%AF%BC%E5%85%A5%E6%A8%A1%E6%9D%BF.xlsx"
        target="_blank">
        <div style="background: #E9F2FF;color:#1678ff;padding:8px 15px;font-size:14px;border-radius: 4px;">
          <i class="el-icon-download"/>
          <span style="margin-left:5px;">批量提交礼品卡模板下载</span>
        </div>
      </a>
      <div>
        <el-upload style="margin-top: 10px;margin-left: 150px" v-if="dialogVisible"
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
          <div class="el-upload__tip" slot="tip">只能上传excel文件；可选增加「面值」列（元），留空记 0。导入的卡即视为已发放，按面值计入预收台账</div>
        </el-upload>
      </div>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">取 消</el-button>
        <el-button type="primary" @click="onSubmit">确 定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import giftCardApi from '@/api/promotion/giftCard';

export default {
  name: 'importGiftCardForm',
  props: {},
  data() {
    return {
      dialogVisible: false,
      excelFile: null,
    }
  },
  computed: {
    ...mapGetters(['shopId', 'userId'])
  },
  created() {
  },
  methods: {
    open(form = {}) {
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
      this.excelFile = null
    },
    async onSubmit() {
      if (!this.excelFile) {
        this.notifyWarning('请选择文件')
        return
      }
      await this.notifyConfirm('确定要提交批量礼品卡吗？')
      this.showFullLoading()
      await giftCardApi.importBatchSave(this.excelFile.raw, this.shopId, this.userId)
      this.$notify.success('操作成功')
      this.handleClose()
      this.hideFullLoading()
      this.$emit('submit-success')
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.importGiftCardForm {
}
</style>
