<template>
  <div class="ActivityForm">
    <el-dialog
      :title="form.id?'编辑活动':'添加活动'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="100px" label-position="left" class="margin-lr-16">
        <el-form-item label="所属门店" prop="shopId"
                      :rules="[{required: true, message: '请选择所属门店', trigger: ['blur', 'change']}]">
          <shop-selector v-model="form.shopId" :style="'width: 100%'" filter-status clearable
                         placeholder="请选择所属门店"></shop-selector>
        </el-form-item>

        <el-form-item label="活动标题" prop="title"
                      :rules="[{required: false, message: '请输入活动标题', trigger: ['blur', 'change']}]">
          <el-input v-model="form.title" placeholder="请输入活动标题"></el-input>
        </el-form-item>
        <el-form-item label="编码(code)" prop="code"
                      :rules="[{required: false, message: '请输入活动编码(code)', trigger: ['blur', 'change']}]">
          <el-input v-model="form.code" placeholder="请输入活动编码(code)"></el-input>
        </el-form-item>
        <el-form-item label="活动期限" prop="startDate"
                      :rules="[{required: false, message: '请选择开始日期', trigger: ['blur', 'change']}]">
          <el-date-picker
            v-model="dateRange" style="width: 100%"
            type="daterange" @change="dateRangeChange"
            range-separator="至"
            :picker-options="form.id?'':pickerOptions"
            value-format="yyyy-MM-dd"
            start-placeholder="开始日期"
            end-placeholder="结束日期">
          </el-date-picker>
        </el-form-item>
        <el-form-item label="活动状态" prop="status" v-if="!form.id"
                      :rules="[{required: false, message: '请选择活动状态', trigger: ['blur', 'change']}]">
          <el-select v-model.number="form.status" placeholder="请选择活动状态" style="width: 100%" filterable clearable>
            <el-option
              v-for="(item,index) in constant.activityStatus || []"
              :value="item.value"
              :label="`${item.label}`" :key="index">
              <span>{{ item.label }}</span>
            </el-option>
          </el-select>
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
import activityApi from "@/api/promotion/activity";
import ShopSelector from "@/views/shop/shopList/ShopSelector";

export default {
  name: 'ActivityForm',
  props: {},
  components: {ShopSelector},
  data() {
    return {
      form: {},
      dateRange: [],
      pickerOptions: {
        disabledDate(time) {
          return time.getTime() < Date.now() - 24 * 60 * 60 * 1000;
        },
      },
      dialogVisible: false,
    }
  },
  computed: {
    ...mapGetters(['shopId'])
  },
  created() {
  },
  methods: {
    open(form = {}) {
      this.form = {...form, createUser: this.userId, status: 1}
      if (!form.shopId){
        form.shopId = this.shopId
      }
      if (this.form.startDate) {
        this.dateRange = [this.form.startDate, this.form.endDate]
      }
      this.dialogVisible = true
    },
    handleClose() {
      this.dialogVisible = false
      this.form = {}
      this.dateRange=[]
    },
    dateRangeChange(value) {
      if (value && value.length > 0) {
        this.$set(this.form, 'startDate', value[0])
        this.$set(this.form, 'endDate', value[1])
      } else {
        this.$set(this.form, 'startDate', null)
        this.$set(this.form, 'endDate', null)
      }
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }
      console.log(this.form)
      await activityApi.saveOrUpd(this.form)
      this.handleClose()
      this.$notify.success("操作成功")
      this.$emit("submit-success")
      this.$store.dispatch("setActivityDoingList", true)
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.ActivityForm {
}
</style>
