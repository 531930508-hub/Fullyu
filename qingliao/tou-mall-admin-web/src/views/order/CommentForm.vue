<template>
  <div class="CommentForm">
    <el-dialog
      :title="'订单备注'"
      :close-on-click-modal="false"
      :visible.sync="dialogVisible"
      width="700px"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-position="top" class="margin-lr-16">
        <el-form-item label="请输入备注内容" prop="comment"
                      :rules="{required: true, message: '请输入备注', trigger: ['blur', 'change']}">
          <el-input v-model="form.comment" placeholder="请输入备注"></el-input>
        </el-form-item>
        <el-tag @click="form.comment='已领取礼品'">已领取礼品</el-tag>
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

export default {
  name: 'CommentForm',
  props: {},
  data() {
    return {
      dialogVisible: false,
      form: {}
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
  },
  methods: {
    open(form = {}) {
      this.form = {...form}
      this.dialogVisible = true
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
      this.$emit("on-submit", this.form)
      this.handleClose()
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.CommentForm {
}
</style>
