<template>
  <div class="RelatedMassagistForm">
    <el-dialog
      :title="'关联疗愈师'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="80px" label-position="left" class="margin-lr-16">
        <el-form-item label="选择疗愈师" prop="massagistId"
                      :rules="[{required: true, message: '请选择疗愈师', trigger: ['blur', 'change']}]">
          <massagist-selector v-model="form.massagistId" :style="'width: 100%'"
                              clearable
                              placeholder="请选择疗愈师"></massagist-selector>
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
import massagistSchedulesApi from "@/api/massagistSchedules";
import massagistApi from "@/api/massagist";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import MassagistSelector from "@/views/massagist/management/MassagitSelector";

export default {
  name: 'RelatedMassagistForm',
  components: {MassagistSelector, ShopSelector},
  props: {},
  watch: {},
  data() {
    return {
      form: {
        massagistId: null,
      },
      time: ["", ""],
      dialogVisible: false
    }
  },
  computed: {
    ...mapGetters([])
  },
  created() {
  },
  methods: {
    open(row) {
      this.umsAdminId = row.id
      this.form.massagistId = row.massagistId
      this.dialogVisible = true
    },
    handleClose() {
      this.dialogVisible = false
      this.form = {massagistId: null,}
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      this.showFullLoading()
      await massagistApi.relatedMassagist(this.umsAdminId, this.form.massagistId)
      this.handleClose()
      this.hideFullLoading()
      this.$notify.success("操作成功")
      this.$store.dispatch("setMassagistList", true)
      this.$emit("submit-success")
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.RelatedMassagistForm {
}
</style>
