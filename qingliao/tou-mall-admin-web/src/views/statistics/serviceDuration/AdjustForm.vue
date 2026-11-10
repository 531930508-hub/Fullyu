<template>
  <div class="AdjustForm">
    <el-dialog
      :title="'调整工时'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="100px" label-position="left" class="margin-lr-16">
        <el-form-item label="所属疗愈师" prop="massagistId"
                      :rules="[{required: true, message: '请选择疗愈师', trigger: ['blur', 'change']}]">
          <massagist-selector v-model="form.massagistId" :style="'width: 100%'" disabled
                               clearable
                              placeholder="请选择疗愈师"></massagist-selector>
        </el-form-item>
        <el-form-item label="调整类型" prop="type"
                      :rules="[{required: true, message: `请选择调整类型`, trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.type" style="width: 100%">
            <el-radio v-for="item in constant.adjustType"
                      :key="item.value"
                      :label="item.value">{{ item.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="调整状态" prop="status"
                      :rules="[{required: true, message: `请选择调整状态`, trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.status" style="width: 100%">
            <el-radio v-for="item in constant.adjustStatus"
                      :key="item.value"
                      :label="item.value">{{ item.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="调整日期" prop="adjustDate"
                      :rules="[{required: true, message: `请输入要调整工时所属的日期`, trigger: ['blur', 'change']}]">
          <el-date-picker
            v-model="form.adjustDate" style="width: 100%"
            value-format="yyyy-MM-dd"
            type="date" :picker-options="pickerOptions"
            placeholder="请输入要调整工时所属的日期">
          </el-date-picker>
        </el-form-item>
        <el-form-item label="调整工时" prop="duration"
                      :rules="[{required: true, message: `请输入调整工时`, trigger: ['blur', 'change']}]">
          <el-input-number style="width: calc(100% - 70px)"
                           v-model="form.duration"
                           @change="handleChange"
                           :min="1"
                           :step="1"
                           placeholder="请输入调整工时"
                           :precision="0"
          ></el-input-number>
          （分钟）
        </el-form-item>
        <el-form-item label="调整原因" prop="reason"
                      :rules="[{required: true, message: `请输入调整原因`, trigger: ['blur', 'change']}]">
          <el-input style="width: 100%" type="textarea" v-model="form.reason" label="请输入调整原因"></el-input>
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
import MassagistSelector from "@/views/massagist/management/MassagitSelector";
import adjustApi from "@/api/adjust";

export default {
  name: 'AdjustForm',
  components: {MassagistSelector},
  props: {},
  data() {
    return {
      dialogVisible: false,
      form: {},
      allowedMonth: '',
    }
  },
  computed: {
    ...mapGetters([]),
    pickerOptions() {
      return {
        disabledDate: (time) => {
          if (!this.allowedMonth) return false;
          const [allowedYear, allowedMonthNum] = this.allowedMonth.split('-').map(Number);
          const month = time.getMonth();
          return month !== allowedMonthNum - 1; // 月份从0开始
        },
      }
    },
  },
  created() {
  },
  methods: {
    open(form = {}, allowedMonth) {
      this.form = {...form}
      this.allowedMonth = allowedMonth
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
      this.showFullLoading()
      await adjustApi.saveOrUpd(this.form)
      this.handleClose()
      this.hideFullLoading()
      this.$notify.success('操作成功')
      this.$emit('submit-success')
    },
    handleChange(newValue) {
      if (newValue < 1) {
        this.form.duration = 1;
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.AdjustForm {
}
</style>
