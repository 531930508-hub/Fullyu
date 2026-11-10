<template>
  <div class="GiftCardForm">
    <el-dialog
      :title="'批量添加礼品卡'"
      :visible.sync="dialogVisible"
      width="30%"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="100px" label-position="left" class="margin-lr-16">
        <el-form-item label="活动用途" prop="activityId"
                      :rules="[{required: true, message: '请选择活动用途', trigger: ['blur', 'change']}]">
          <el-select v-model.number="form.activityId" placeholder="请选择活动用途" style="width: 100%" filterable clearable>
            <el-option
              v-for="item in activityDoingList || []"
              :value="item.id"
              :label="`${item.title}`" :key="item.id">
              <span>{{ item.title }}-<span style="color: #9E9E9E">{{ item.code }}</span></span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="新增数量" prop="cardCount"
                      :rules="[{required: true, message: '请输入礼品卡新增数', trigger: ['blur', 'change']}]">
          <el-input-number v-model="form.cardCount" :min="1" :step="1" :max="5000" :precision="0" style="width: 100%"
                           placeholder="请输入礼品卡新增数"
                           controls-position="right"></el-input-number>
        </el-form-item>
        <el-form-item label="卡券数量" prop="number"
                      :rules="[{required: true, message: '请输入卡券兑换数量', trigger: ['blur', 'change']}]">
          <el-input-number v-model="form.number" :min="1" :step="1" :precision="0" style="width: 100%"
                           placeholder="请输入卡券兑换数量"
                           controls-position="right"></el-input-number>
        </el-form-item>
        <el-form-item label="面值" prop="amount"
                      :rules="[{required: false, message: '请输入面值', trigger: ['blur', 'change']}]">
          <el-input-number v-model="form.amount" :min="0" :step="1" :precision="2" style="width: 100%"
                           placeholder="请输入面值" controls-position="right"></el-input-number>
        </el-form-item>
        <el-form-item label="券有效期" prop="validDate"
                      :rules="[{required: validDateShow, message: '请输入券有效天数', trigger: ['blur', 'change']}]">
          <el-switch
            v-model="validDateShow" @change="$set(form,'validDate',null)"
            active-text="限期"
            inactive-text="永久">
          </el-switch>
          <el-input-number v-if="validDateShow" v-model="form.validDate" :min="validDateShow?1:0" :step="1"
                           :precision="0" clearable
                           placeholder="请输入券有效天数"
                           controls-position="right"></el-input-number>
          <span style="margin-left: 20px" v-if="validDateShow">天</span>
        </el-form-item>
        <el-form-item label="使用限制" prop="limitations"
                      :rules="[{required: false, message: '请输入使用限制', trigger: ['blur', 'change']}]">
          <el-input
            type="textarea"
            :rows="3"
            :maxlength="500"
            show-word-limit
            placeholder="请输入使用限制"
            v-model="form.limitations">
          </el-input>
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
import giftCardApi from "@/api/promotion/giftCard";

export default {
  name: 'GiftCardForm',
  components: {ShopSelector},
  props: {},
  data() {
    return {
      form: {},
      dialogVisible: false,
      validDateShow: false
    }
  },
  computed: {
    ...mapGetters(['activityDoingList', 'shopId', 'userId'])
  },
  created() {
    this.$store.dispatch('setActivityDoingList')
  },
  methods: {
    open(form = {}) {
      this.form = {...form, shopId: this.shopId, createUser: this.userId}
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
      await giftCardApi.batchSave(this.form)
      this.hideFullLoading()
      this.handleClose()
      this.$notify.success("操作成功")
      this.$emit("submit-success")
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.GiftCardForm {
}
</style>
