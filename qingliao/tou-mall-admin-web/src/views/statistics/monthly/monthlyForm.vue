<template>
  <div class="AdjustForm">
    <el-dialog
      :title="'添加支出'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="100px" label-position="left" class="margin-lr-16">
        <el-form-item label="请选择门店" prop="shopId"
                      :rules="[{required: true, message: '请选择所属门店', trigger: ['blur', 'change']}]">
          <shop-selector v-model="form.shopId" :style="'width: 100%'" filter-status clearable
                         placeholder="请选择所属门店"></shop-selector>
        </el-form-item>

        <el-form-item label="支出日期" prop="dtime"
                      :rules="[{required: true, message: `请选择支出日期`, trigger: ['blur', 'change']}]">
          <el-date-picker
            v-model="form.dtime" style="width: 100%"
            value-format="yyyy-MM-dd"
            type="date" :picker-options="pickerOptions"
            placeholder="请选择支出日期">
          </el-date-picker>
        </el-form-item>
        <el-form-item label="支出金额" prop="moneyprice"
                      :rules="[{required: true, message: `请输入支出金额`, trigger: ['blur', 'change']}]">
          <el-input-number style="width: calc(100% - 70px)"
                           v-model="form.moneyprice"
                           @change="handleChange"
                           :min="1"
                           :step="1"
                           placeholder="请输入支出金额"
                           :precision="0"
          ></el-input-number>
        </el-form-item>
        <el-form-item label="支出原因" prop="marks"
                      :rules="[{required: true, message: `请输入支出原因`, trigger: ['blur', 'change']}]">
          <el-input style="width: 100%" type="textarea" v-model="form.marks" label="请输入支出原因"></el-input>
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
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import statistics from "@/api/statistics";

export default {
  name: 'monthlyForm',
  components: {ShopSelector},
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
    open() {
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
      await statistics.savepayout(this.form)
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
