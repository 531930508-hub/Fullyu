<template>
  <div class="productForm">
    <el-dialog
      :title="form.id ? '编辑商品':'新增商品'"
      :visible.sync="dialogVisible"
      width="520px" top="20px"
      :before-close="handleClose">
      <el-form :model="form" ref="refForm" label-width="80px" class="margin-lr-16">
        <el-form-item label="商品名称" prop="title"
                      :rules="[{required: true, message: '请输入商品名称', trigger: ['blur', 'change']}]">
          <el-input v-model="form.title" placeholder="请输入商品名称"></el-input>
        </el-form-item>
        <el-form-item label="商品类型" prop="type"
                      :rules="[{required: true, message: '请选择商品类型', trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.type" @change="form.content=[{}];form.rewardMemberMonths=0">
            <el-radio v-for="item in constant.productType"
                      :key="item.value"
                      :label="item.value">{{ item.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="商品价格" prop="amount"
                      :rules="[{required: true, message: '请输入商品价格', trigger: ['blur', 'change']}]">
          <el-input-number style="width: 100%" v-model="form.amount" @change="handleChange($event,'amount')" :min="0.01"
                           placeholder="请输入商品价格"></el-input-number>
        </el-form-item>
        <el-form-item label="商品原价" prop="originalAmount"
                      :rules="[{required: true, message: '请选择商品原价', trigger: ['blur', 'change']}]">
          <el-input-number style="width: 100%" v-model="form.originalAmount"
                           @change="handleChange($event,'originalAmount')" :min="0.01"
                           placeholder="请输入商品原价"></el-input-number>
        </el-form-item>
        <div v-for="(item,index) in form.content" style="display: flex;align-items: center">
          <el-form-item label="商品内容" :prop="`content[${index}].projectId`" v-if="form.type==0"
                        :rules="[{required: true, message: '请选择商品所属项目', trigger: ['blur', 'change']}]">
            <project-selector v-model="item.projectId" placeholder="请选择商品所属项目"></project-selector>
          </el-form-item>
          <el-form-item :label="index==0?'商品内容':''" :prop="`content[${index}].couponId`" v-if="form.type==1"
                        :rules="[{required: true, message: '请选择商品卡券', trigger: ['blur', 'change']}]" class="flex1">
            <coupon-selector v-model="item.couponId" placeholder="请选择商品卡券" clearable @change="item.size=1"></coupon-selector>
          </el-form-item>
          <el-form-item label="" label-width="0" :prop="`content[${index}].size`"
                        v-if="form.type==1 && !couponIsCard(item.couponId)"
                        :rules="[{required: true, message: '请输入券张数', trigger: ['blur', 'change']}]">
            <el-input-number v-model="item.size" :min="1" :step="1" :precision="0" placeholder="请输入券张数"
                             controls-position="right"></el-input-number>
          </el-form-item>
          <i class="el-icon-circle-plus-outline"
             style="margin-left: 10px;font-size: 20px;margin-bottom: 18px;cursor: pointer"
             v-if="form.type==1 && index==0" @click="form.content.push({size:1})"></i>
          <i class="el-icon-remove-outline"
             style="margin-left: 10px;font-size: 20px;margin-bottom: 18px;cursor: pointer"
             v-if="form.type==1 && index!=0" @click="form.content.splice(index,1)"></i>
        </div>

        <el-form-item v-if="form.type==1" label="用完赠月" prop="rewardMemberMonths">
          <el-input-number v-model="form.rewardMemberMonths" :min="0" :max="120" :precision="0"
                           :step="1" controls-position="right"></el-input-number>
          <span>个月</span>
          <div class="reward-hint">默认0不赠送。按每笔购买订单一次，券包全部实际消费完成后赠会员月卡权益；过期、回收、退款不触发。接续已有及待生效会员期，不覆盖原权益。</div>
        </el-form-item>
        <el-form-item label="限购" prop="buyLimit">
          <el-switch
            v-model="buyLimitShow" @change="$set(form,'buyLimit',0)"
            active-text="限购"
            inactive-text="不限购">
          </el-switch>
          <el-input-number v-if="buyLimitShow" style="width: calc(100% - 190px)" v-model="form.buyLimit"
                           @change="handleChange($event,'buyLimit')"
                           :min="1" :step="1" :precision="0"
                           placeholder="请输入单客限购次数"></el-input-number>
          <span style="margin-left: 20px" v-if="buyLimitShow">次</span>
        </el-form-item>
        <div v-for="(item,index) in form.explainArray" :key="index" style="display: flex;align-items: center">
          <el-form-item :label="index==0?'商品说明':''" :prop="`explainArray[${index}]`" class="flex1">
            <el-input type="textarea"
                      :rows="2" v-model="form.explainArray[index]" placeholder="请输入商品说明" style="width: 100%"></el-input>
          </el-form-item>
          <i class="el-icon-circle-plus-outline"
             style="margin-left: 10px;font-size: 20px;margin-bottom: 18px;cursor: pointer"
             v-if="index==0" @click="form.explainArray.push('')"></i>
          <i class="el-icon-remove-outline"
             style="margin-left: 10px;font-size: 20px;margin-bottom: 18px;cursor: pointer"
             v-if="index!==0" @click="form.explainArray.splice(index,1)"></i>
        </div>
        <el-form-item label="商品备注" prop="comment">
          <el-input v-model="form.comment" type="textarea"
                    :rows="2" placeholder="请输入商品备注"></el-input>
        </el-form-item>
        <el-form-item label="商品顺序" prop="sequence"
                      :rules="[{required: true, message: '请选择商品顺序', trigger: ['blur', 'change']}]">
          <el-input-number style="width: 100%" v-model="form.sequence" @change="handleChange($event,'sequence')"
                           :min="1" :step="1" :precision="0"
                           placeholder="请选择商品顺序"></el-input-number>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">取 消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">确 定</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import RoomSelector from "@/views/shop/room/RoomSelector";
import ProjectSelector from "@/views/goods/product/ProjectSelector";
import CouponSelector from "@/views/goods/product/CouponSelector";
import productApi from "@/api/goods/product";

export default {
  name: 'productForm',
  components: {CouponSelector, ProjectSelector, RoomSelector, ShopSelector},
  props: {},
  data() {
    return {
      form: {},
      dialogVisible: false,
      buyLimitShow: false,
      submitting: false
    }
  },
  computed: {
    ...mapGetters(['couponList']),
    couponIsCard() {
      return (couponId) => {
        if (couponId){
          if (this.couponList && this.couponList.find(e => e.id == couponId)){
            return this.couponList.find(e => e.id == couponId).useType == 2
          }
        }
        return false
      };
    }
  },
  created() {
  },
  methods: {
    open(form = {}) {

      this.form = {
        type: 1,
        state: 1,
        content: [{}],
        explainArray: [''],
        sequence: 1,
        buyLimit: 0,
        rewardMemberMonths: 0, ...JSON.parse(JSON.stringify(form))
      }
      if (form.buyLimit > 0) {
        this.buyLimitShow = true
      }
      if (form.explainArray && form.explainArray.length == 0) {
        this.form.explainArray.push('')
      }
      this.dialogVisible = true
    },
    handleClose() {
      this.dialogVisible = false
      this.form = {}
      this.buyLimitShow = false
    },
    handleChange(value, param) {
      let formattedValue = value.toString().replace(/^(\d+(\.\d{0,2})?).*$/, '$1');
      if (parseFloat(formattedValue) < 0) {
        formattedValue = '0';
      }
      this.$set(this.form, param, formattedValue)
    },
    async onSubmit() {
      if (this.submitting) return
      this.submitting = true
      let loadingShown = false
      try {
        const validate = await this.$refs.refForm.validate().catch(() => false)
        if (!validate) return
        const request = JSON.parse(JSON.stringify(this.form))
        if (request.type != 1) request.rewardMemberMonths = 0
        this.showFullLoading()
        loadingShown = true
        if (request.id) await productApi.upd(request)
        else await productApi.add(request)
        productApi.list()
        this.handleClose()
        this.$notify.success('操作成功')
        this.$emit('submit-success')
      } finally {
        if (loadingShown) this.hideFullLoading()
        this.submitting = false
      }
    },
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.productForm {
  .reward-hint {
    margin-top: 8px;
    line-height: 1.7;
    letter-spacing: 0.05em;
  }
}
</style>
