<template>
  <div class="PasswordForm">
    <el-dialog
      :title="'修改密码'" :close-on-click-modal="false"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form ref="refForm" label-width="100px" :model="password" :rules="passwordRules" label-position="top">
        <el-form-item label="原密码: " prop="oldPassword">
          <el-input v-model="password.oldPassword" type="password"
                    placeholder="请输入原密码" clearable></el-input>
        </el-form-item>
        <el-form-item label="新密码: " prop="newPassword">
          <el-input v-model="password.newPassword" type="password"
                    show-password placeholder="请输入新密码" clearable></el-input>
        </el-form-item>
        <el-form-item label="确认新密码: " prop="newPassword2">
          <el-input v-model="password.newPassword2" type="password"
                    show-password placeholder="请确认新密码" clearable></el-input>
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
import {updatePassword} from "@/api/login";

const passValidator = (rule, value, callback) => {
  if (!value) {
    callback(new Error('请输入密码'))
  } else {
    if (value.trim().length < 3 || value.trim().length > 20) {
      callback(new Error('密码长度3到20位'))
    }
    callback()
  }
}


export default {
  name: 'PasswordForm',
  props: {},
  data() {
    const checkPassValidator = (rule, value, callback) => {
      if (value == '' || !value) {
        callback(new Error('请再次确认新密码'))
      } else {
        if (value !== this.password.newPassword) {
          callback(new Error('两次输入密码不一样'))
        }
        callback()
      }
    }
    return {
      password: {},
      dialogVisible: false,
      passwordRules: {
        oldPassword: [{required: true, message: '请输入旧密码', trigger: 'blur'}],
        newPassword: [{required: true, trigger: 'blur', validator: passValidator}],
        newPassword2: [{required: true, trigger: 'blur', validator: checkPassValidator}],
      },
    }
  },
  computed: {
    ...mapGetters(['name'])
  },
  created() {
  },
  methods: {
    open(password = {}) {
      this.password = password
      this.$store.dispatch('GetInfo')
      this.dialogVisible = true
    },
    handleClose() {
      this.dialogVisible = false
      this.password = {}
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      let data = {username: this.name, ...this.password}

      this.showFullLoading()
      await updatePassword(data)
      this.handleClose()
      this.hideFullLoading()
      this.$notify.success("操作成功")
      this.$store.dispatch('LogOut').then(() => {
        location.reload() // 为了重新实例化vue-router对象 避免bug
      })
      this.$emit("submit-success")
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.PasswordForm {
}
</style>
