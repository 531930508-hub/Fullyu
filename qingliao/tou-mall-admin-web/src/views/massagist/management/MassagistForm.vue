<template>
  <div class="MassagistForm">
    <el-dialog
      :title="form.id ? '配置疗愈师':'新增疗愈师'"
      :visible.sync="dialogVisible"
      width="680px"
      custom-class="massagist-form-dialog"
      :close-on-click-modal="false"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="90px" label-position="left" class="massagist-form">
        <section class="form-section">
          <div class="form-section__head">
            <h3>基本信息</h3>
          </div>
          <el-form-item label="所属门店" prop="shopId"
                        :rules="[{required: true, message: '请选择所属门店', trigger: ['blur', 'change']}]">
            <shop-selector v-model="form.shopId" :style="'width: 100%'" filter-status clearable
                           placeholder="请选择所属门店" :force-update="false"></shop-selector>
          </el-form-item>
          <el-form-item label="疗愈师姓名" prop="name"
                        :rules="[{required: true, message: '请输入疗愈师姓名', trigger: ['blur', 'change']}]">
            <el-input v-model="form.name" placeholder="请输入疗愈师姓名"></el-input>
          </el-form-item>
          <el-form-item label="手机号码" prop="phone"
                        :rules="[{required: true, message: '请输入手机号码', trigger: ['blur', 'change']}]">
            <el-input v-model="form.phone" placeholder="请输入手机号码"></el-input>
          </el-form-item>
          <el-form-item label="疗愈师性别" prop="sex"
                        :rules="[{required: true, message: '请选择疗愈师性别', trigger: ['blur', 'change']}]">
            <el-radio-group v-model="form.sex">
              <el-radio v-for="item in ['男','女']"
                        :key="item"
                        :label="item">{{ item }}
              </el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="在职状态" prop="status"
                        :rules="[{required: true, message: '请选择在职状态', trigger: ['blur', 'change']}]">
            <el-radio-group v-model="form.status">
              <el-radio v-for="item in constant.jobStatus"
                        :key="item.value"
                        :label="item.value">{{ item.label }}
              </el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="疗愈师头像" prop="avatarUrl">
            <div class="avatar-field">
              <el-image v-if="form.avatarUrl"
                        class="avatar-preview"
                        :src="form.avatarUrl"
                        fit="cover"></el-image>
              <el-upload
                class="avatar-upload"
                ref="refFile"
                action="/data"
                :limit="1"
                :file-list="imageFile?[imageFile]:[]"
                :on-remove="handleRemove"
                :on-change="handleChange"
                :on-exceed="handleExceed"
                :auto-upload="false">
                <el-button slot="trigger" size="small" type="primary">上传头像</el-button>
              </el-upload>
            </div>
          </el-form-item>
        </section>

        <section class="form-section">
          <div class="form-section__head">
            <h3>技能与身份</h3>
          </div>
          <el-form-item label="疗愈师技能" prop="projectArrPage"
                        :rules="[{required: true, message: '请选择疗愈师技能', trigger: ['blur', 'change']}]">
            <el-select v-model="form.projectArrPage" multiple placeholder="可多选技能" style="width: 100%">
              <el-option
                v-for="item in projectList"
                :key="item.id"
                :label="item.title"
                :value="item.id">
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="身份">
            <el-checkbox-group v-model="form.identities">
              <el-checkbox v-for="item in identityOptions" :key="item.value" :label="item.value">{{ item.label }}</el-checkbox>
            </el-checkbox-group>
            <div v-if="form.id && hasIdentity('SHOP_MANAGER') && !form.umsAdminId" class="form-tip warn">
              尚未关联后台账号，暂时无法接收请假审批。
            </div>
            <div v-if="form.id && hasIdentity('TRAINER') && !form.umsAdminId" class="form-tip warn">
              尚未关联后台账号，需先在人员账号中开通并关联后才能登录考核。
            </div>
          </el-form-item>
          <el-form-item v-if="wasShopManager && form.status === 0" label="店长接班人" prop="successorMassagistId"
                        :rules="[{required: true, message: '该疗愈师是门店店长，离职前请选择接班人', trigger: ['blur', 'change']}]">
            <el-select v-model="form.successorMassagistId" placeholder="选择同店在职疗愈师" filterable style="width: 100%">
              <el-option v-for="m in successorList"
                         :key="m.id"
                         :label="m.name"
                         :value="m.id"></el-option>
            </el-select>
            <div class="form-tip">离职后本店请假审批将自动转给该接班人。</div>
            <div v-if="!successorList.length" class="form-tip warn">本店暂无可接班的在职疗愈师，请先补充人员并关联后台账号。</div>
          </el-form-item>
          <el-form-item label="正式月份" prop="formalMonth"
                        :rules="[{required: true, message: '请选择正式计薪月份', trigger: ['blur', 'change']}]">
            <el-date-picker
              v-model="form.formalMonth"
              type="month"
              value-format="yyyy-MM"
              placeholder="选择月份"
              style="width: 100%">
            </el-date-picker>
          </el-form-item>
        </section>

        <section class="form-section">
          <div class="form-section__head">
            <h3>任职与结算资料</h3>
          </div>
          <el-form-item label="真实姓名" prop="realName"
                        :rules="[{required: true, message: '请输入真实姓名', trigger: ['blur', 'change']}]">
            <el-input v-model="form.realName" placeholder="请输入真实姓名"></el-input>
          </el-form-item>
          <el-form-item label="身份证号" prop="sfzCard"
                        :rules="[{required: true, message: '请输入身份证号', trigger: ['blur', 'change']}]">
            <el-input v-model="form.sfzCard" placeholder="请输入身份证号"></el-input>
          </el-form-item>
          <el-form-item label="银行卡号" prop="bankCard"
                        :rules="[{required: true, message: '请输入银行卡号', trigger: ['blur', 'change']}]">
            <el-input v-model="form.bankCard" placeholder="请输入银行卡号"></el-input>
          </el-form-item>
        </section>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button :disabled="saving" @click="handleClose">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import massagistApi from "@/api/massagist";
import SingleUpload from "@/components/Upload/singleUpload";
import {generatePreSignedUrl, uploadFile} from '@/api/oss'
import ShopSelector from "@/views/shop/shopList/ShopSelector";

export default {
  name: 'MassagistForm',
  components: {ShopSelector, SingleUpload},
  props: {},
  data() {
    return {
      form: {},
      dialogVisible: false,
      saving: false,
      imageFile: null,
      identityOptions: [],
      // 打开时是否已经是店长：只有“已经是店长且改成离职”才要求选接班人
      wasShopManager: false,
      successorList: [],
    }
  },
  computed: {
    ...mapGetters(['shopId','projectList'])
  },
  created() {
    this.$store.dispatch('setProjectList')
    this.loadIdentityOptions()
  },
  watch: {
    'form.status'(val) {
      if (this.wasShopManager && val === 0) this.loadSuccessors()
    },
    'form.shopId'(val) {
      if (this.wasShopManager && this.form.status === 0) {
        this.form.successorMassagistId = null
        this.loadSuccessors(val)
      }
    }
  },
  methods: {
    async loadIdentityOptions() {
      try {
        let res = await massagistApi.identityOptions()
        this.identityOptions = res.data || []
      } catch (e) {
        this.identityOptions = []
      }
      if (!this.identityOptions.length) {
        this.identityOptions = [
          {value: 'SHOP_MANAGER', label: '店长'},
          {value: 'TRAINER', label: '内训师'},
        ]
      }
    },
    hasIdentity(code) {
      return (this.form.identities || []).indexOf(code) > -1
    },
    async open(form = {}) {
      if (!form.shopId){
        form.shopId = this.shopId
        form.status = 1
      }
      this.form = {...form}
      if (this.form.isTrainer == null) this.form.isTrainer = 0
      this.form.identities = Array.isArray(this.form.identities) ? [...this.form.identities] : []
      this.wasShopManager = this.form.identities.indexOf('SHOP_MANAGER') > -1
      this.successorList = []
      if (this.form.id) {
        // 列表数据可能来自缓存，编辑时以接口为准
        let res = await massagistApi.identities(this.form.id)
        this.form.identities = res.data || []
        this.wasShopManager = this.form.identities.indexOf('SHOP_MANAGER') > -1
      }
      this.dialogVisible = true
      if (this.wasShopManager && this.form.status === 0) await this.loadSuccessors()
    },
    async loadSuccessors(shopId) {
      shopId = shopId || this.form.shopId
      if (!shopId) {
        this.successorList = []
        return
      }
      let res = await massagistApi.list({shop_id: shopId, status: 1})
      this.successorList = (res.data || []).filter(m => m.id !== this.form.id && m.umsAdminId)
      if (this.form.successorMassagistId && !this.successorList.some(m => m.id === this.form.successorMassagistId)) {
        this.form.successorMassagistId = null
      }
    },
    handleRemove() {
      this.imageFile = null
    },
    handleChange(file, fileList) {
      this.imageFile = file
    },
    handleExceed(files, fileList) {
      this.$message.warning(`只能选择 1 个文件`);
    },
    handleClose(done) {
      if (this.saving) return
      this.dialogVisible = false
      this.imageFile = null
      this.form = {}
      if (typeof done === 'function') done()
    },
    async onSubmit() {
      if (this.saving) return
      let validate = false
      try {
        validate = await this.$refs.refForm.validate()
      } catch (e) {
        validate = false
      }
      if (!validate) {
        return
      }
      this.saving = true
      try {
        if (this.imageFile) {
          let res = await generatePreSignedUrl(this.imageFile.name, 'massagist');
          let {url, key} = res.data
          this.form.avatarUrl = key
          await uploadFile(url, this.imageFile.raw)
        }
        await massagistApi.saveOrUpd(this.form)
        this.dialogVisible = false
        this.imageFile = null
        this.form = {}
        this.$notify.success("操作成功")
        this.$emit("submit-success")
        this.$store.dispatch("setMassagistList", true)
      } catch (e) {
        this.$message.error((e && e.message) || '保存失败，请稍后重试')
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.MassagistForm {
  ::v-deep .massagist-form-dialog {
    border-radius: 16px;
    overflow: hidden;
  }

  ::v-deep .massagist-form-dialog .el-dialog__body {
    max-height: calc(100vh - 220px);
    overflow-y: auto;
    padding: 4px 28px 8px;
  }

  ::v-deep .massagist-form-dialog .el-dialog__footer {
    padding: 14px 28px 18px;
    border-top: 1px solid #ECE8F2;
    background: #fff;
  }
}

.massagist-form {
  padding-right: 4px;
}

.form-section + .form-section {
  margin-top: 4px;
  padding-top: 18px;
  border-top: 1px solid #F1EDF6;
}

.form-section__head {
  margin-bottom: 14px;

  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #3B3742;
  }
}

.form-section .el-form-item:last-child {
  margin-bottom: 14px;
}

.avatar-field {
  display: flex;
  align-items: center;
  min-height: 40px;
}

.avatar-preview {
  width: 56px;
  height: 56px;
  margin-right: 16px;
  border-radius: 12px;
  background: #F5F2F8;
}

.avatar-upload {
  display: inline-flex;
}

.form-tip {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #8A8491;
}

.form-tip.warn {
  color: #B26A00;
}
</style>
