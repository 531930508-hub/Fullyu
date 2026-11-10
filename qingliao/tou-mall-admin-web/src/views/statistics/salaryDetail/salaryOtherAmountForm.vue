<template>
  <div class="salaryOtherAmountForm">
    <el-dialog
      :title="'劳务服务费调整'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="100px" label-position="left" class="margin-lr-16">

        <el-form-item label="所属门店" prop="shopId"
                      :rules="[{required: true, message: '请选择所属门店', trigger: ['blur', 'change']}]">
          <shop-selector ref="refShopSelector" v-model="form.shopId" :style="'width: 100%'" @selected="handleShopChange"
                         filter-status clearable
                         placeholder="请选择所属门店"></shop-selector>
        </el-form-item>
        <el-form-item  label="选择疗愈师" prop="massagistId"
                       :rules="[{required: true, message: '请选择疗愈师', trigger: ['blur', 'change']}]">
          <massagist-selector v-model="form.massagistId" :style="'width: 100%'" @selected="selectedMassagit"
                              :shop-id="form.shopId" clearable :filterStatus="-1"
                              placeholder="请选择疗愈师"></massagist-selector>
        </el-form-item>
        <el-form-item label="结算月份" prop="monthCode"
                      :rules="[{required: true, message: `请选择结算月份`, trigger: ['blur', 'change']}]">
          <el-date-picker
            v-model="form.monthCode"
            align="right"  class="m-r-10"
            type="month"
            placeholder="选择月份"
            value-format="yyyy-MM-dd">
          </el-date-picker>
        </el-form-item>
        <el-form-item label="调整类型" prop="type"
                      :rules="[{required: true, message: `请选择调整类型`, trigger: ['blur', 'change']}]">
          <el-select v-model="form.type" clearable placeholder="请选择调整类型"
                    >
            <el-option  label="增加" value="1"></el-option>
            <el-option  label="减少" value="0"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="调整金额" prop="amount"
                      :rules="[{required: true, message: `请输入调整金额`, trigger: ['blur', 'change']}]">
          <el-input @input="handleInput1" v-model="form.amount"></el-input>
        </el-form-item>

        <el-form-item label="动账标题" prop="title"
                      :rules="[{required: true, message: `请输入动账标题`, trigger: ['blur', 'change']}]">
          <el-input  v-model="form.title"></el-input>
        </el-form-item>
        <el-form-item label="动账原因" prop="content"
                      :rules="[{required: true, message: `请输入动账原因`, trigger: ['blur', 'change']}]">
          <el-input  v-model="form.content"></el-input>
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
import ShopSelector from '@/views/shop/shopList/ShopSelector';
import MassagistSelector from '@/views/massagist/management/MassagitSelector';
import salaryOtherAmountApi from "@/api/salaryOtherAmount"
import DateUtil from "../../../utils/dateUtil";

export default {
  name: 'salaryOtherAmountForm',
  props: {},
  components: {MassagistSelector, ShopSelector},
  data() {
    return {
      dialogVisible: false,
      form: {
        amount:'',
        monthCode:null
      },
    }
  },
  computed: {
    ...mapGetters(['shopList', 'shopId','shopListAll','userId'])
  },
  created() {
    this.$store.dispatch('setShopAllList')
  },
  methods: {
    handleInput1(value) {
        this.form.amount = value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    },

    open() {
      this.dialogVisible = true
    },
    handleShopChange(item) {
      console.log("=================");
      this.$set(this.form, 'massagistId', null)
    },
    handleClose() {
      this.dialogVisible = false
      this.form={}
    },
    async onSubmit() {
      let validate = await this.$refs.refForm.validate().catch(() => false);
      if (!validate) {
        return
      }

      this.form.monthCode=this.form.monthCode.substring(0,7)
      this.form.createUser=this.userId
      this.showFullLoading()
      console.log(this.form);
      await salaryOtherAmountApi.saveSalaryOtherAmount(this.form)
      this.handleClose()
      this.hideFullLoading()
      this.$notify.success('操作成功')
      this.$emit('submit-success')
    },
    selectedMassagit(item) {
      if (item) {
        this.$set(this.form, 'shopId', item.shopId)
      }
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>

</style>
