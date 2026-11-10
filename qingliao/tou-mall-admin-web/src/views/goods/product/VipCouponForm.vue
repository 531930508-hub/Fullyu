<template>
  <div class="VipCouponForm">
    <el-dialog
      :title="'配置权益卡'"
      :close-on-click-modal="false"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" class="margin-lr-16" label-width="80px">
        <el-form-item label="标题" prop="title"
                      :rules="{required: true, message: '请输入备注', trigger: ['blur', 'change']}">
          <el-input v-model="form.title" placeholder="请输入备注"></el-input>
        </el-form-item>
        <el-form-item label="送券数" prop="size"
                      :rules="[{required: true, message: '请输入送券张数', trigger: ['blur', 'change']}]">
          <el-input-number v-model="form.size" :min="0" :step="1" placeholder="请输入券张数" style="width: 100%"
                           controls-position="right"></el-input-number>
        </el-form-item>
        <el-form-item label="有效期" prop="validDate"
                      :rules="{required: true, message: '请输入有效期', trigger: ['blur', 'change']}">
          <el-input-number v-model="form.validDate" :min="1" :step="1" placeholder="请输入有效期" style="width: 100%"
                           controls-position="right"></el-input-number>
        </el-form-item>
        <el-form-item label="顺序" prop="vipLevel"
                      :rules="{required: true, message: '请输入顺序', trigger: ['blur', 'change']}">
          <el-input-number v-model="form.vipLevel" :min="1" :step="1" placeholder="请输入顺序" style="width: 100%"
                           controls-position="right"></el-input-number>
        </el-form-item>
        <el-form-item label="备注" prop="comment"
                      :rules="{required: false, message: '请输入备注', trigger: ['blur', 'change']}">
          <el-input v-model="form.comment" placeholder="请输入备注"></el-input>
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

export default {
  name: 'VipCouponForm',
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
.VipCouponForm {
}
</style>
