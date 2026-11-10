<template>
  <div class="MiniImageForm">
    <el-dialog
      :title="form.id ? '配置图片':'新增图片'"
      :visible.sync="dialogVisible"
      width="40%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">
        <el-form-item label="图片类型" prop="type"
                      :rules="[{required: true, message: '请选择图片类型', trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.type">
            <el-radio v-for="item in constant.miniImageType"
                      :key="item.value"
                      :label="item.value">{{ item.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="跳转地址" >
          <el-input v-model="form.goUrl" style="width: 100%"></el-input>
          <span  style="color: #909399; font-size: 12px;line-height: 16px">
            跳转有导航的页面需要加?page=tabbar（如：/pages/mall/mall?page=tabbar）<br>
            跳转有参数的页面需要加对应的参数值(如：/pages/mall/detail?productid=12)
          </span>
        </el-form-item>
        <el-form-item label="图片"
                      :rules="[{validator: validateUrl, message: '请选择图片', trigger: ['blur', 'change']}]">
          <el-image v-if="form.url"
                    style="width: 100px; height: 100px"
                    :src="form.url"
                    fit="fill"></el-image>
          <el-upload
            class="upload-demo"
            ref="refFile"
            action="/data"
            :limit="1"
            :file-list="coverImageFile?[coverImageFile]:[]"
            :on-remove="handleRemove"
            :on-change="handleChange"
            :on-exceed="handleExceed"
            :auto-upload="false">
            <el-button slot="trigger" size="small" type="primary">选取文件</el-button>
          </el-upload>
        </el-form-item>

        <el-form-item label="图片状态" prop="status"
                      :rules="[{required: true, message: '请输入图片状态', trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.status">
            <el-radio v-for="item in constant.shopStatus"
                      :key="item.value"
                      :label="item.value">{{ item.label }}
            </el-radio>
          </el-radio-group>
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
import miniImageApi from "@/api/miniImage";
import SingleUpload from "@/components/Upload/singleUpload";
import {generatePreSignedUrl, uploadFile} from '@/api/oss'

export default {
  name: 'MiniImageForm',
  components: {SingleUpload},
  props: {},
  data() {

    return {
      form: {coverImageFile: null},
      dialogVisible: false,
      coverImageFile: null,
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

    handleRemove() {
      this.coverImageFile = null
    },
    handleChange(file, fileList) {
      this.coverImageFile = file
    },
    handleExceed(files, fileList) {
      this.$message.warning(`只能选择 1 个文件`);
    },
    handleClose() {
      this.dialogVisible = false
      this.coverImageFile = null
      this.form = {}
    },
    validateUrl(rule, value, callback) {
      if (!value || !this.coverImageFile) {
        return callback(new Error('请选择文件'));
      }
      callback();
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      this.showFullLoading()
      if (this.coverImageFile) {
        let res = await generatePreSignedUrl(this.coverImageFile.name, 'miniImage');
        console.log(res)
        let {url, expireTime, key} = res.data
        this.form.url = key
        await uploadFile(url, this.coverImageFile.raw)
      }
      let form = {...this.form}
      await miniImageApi.saveOrUpd(form)
      this.handleClose()
      this.hideFullLoading()
      this.$notify.success("操作成功")
      this.$emit("submit-success")
      this.$store.dispatch("setShopList", true)
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.MiniImageForm {
}
</style>
