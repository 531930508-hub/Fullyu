<template>
  <div class="GiftCustomerCouponForm">
    <el-dialog
      :title="'添加订单'"
      :visible.sync="dialogVisible"
      width="700px"
      :before-close="handleClose">

      <el-form  :model="form" ref="refForm" label-width="100px" label-position="left"
                class="margin-lr-16">
        <!-- 客户手机号 -->
        <el-form-item label="客户手机号" prop="phone"
                      :rules="{required: true, message: '请输入客户手机号', trigger: ['blur', 'change']}">
          <el-autocomplete
            v-model="form.phone"
            :fetch-suggestions="querySearchCustomer" highlight-first-item
            placeholder="手机号 PhoneNumber" :debounce="600"
            @select="handleSelectCustomer"
            @input="handlePhoneInput">
            <template slot-scope="{ item }">
              <div class="flex">{{ item.phone }}
                <span v-if="item.comment">-{{ item.comment }}</span>
                <span v-else-if="('用户'+item.phone)!=item.nickname">-{{ item.nickname }}</span>
                <span v-if="item.gender && item.gender == 2">女士</span>
                <span v-if="item.gender && item.gender == 1">先生</span>
              </div>
            </template>
          </el-autocomplete>
          <span v-if="selectCustomerList&& selectCustomerList.find(e=>e.phone==form.phone)"
                style="margin:0 10px">

            </span>
          <span v-else style="margin:0 10px" class="c-info">
              无客户信息时将自动添加
            </span>
        </el-form-item>
        <el-form-item label="客户称呼"  prop="comment"
                      :rules="{required: true, message: '请输入客户称呼', trigger: ['blur', 'change']}">
              <el-input v-model="form.comment" placeholder="称呼 Name" style="width: 52%" ></el-input>
        </el-form-item>
        <el-form-item label="客户性别" prop="gender"
                      :rules="{required: true, message: '请选择客户性别', trigger: ['blur', 'change']}">
          <el-radio-group v-model="form.gender" size="mini" class="time">
            <el-radio-button v-for="(item,index) in constant.gender"
                             :key="index" :label="item.value">
              {{ item.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注"  prop="note">
            <el-input v-model="form.note" placeholder="备注 Note" style="width: 52%"></el-input>
        </el-form-item>
        <el-form-item label="产品名称"  prop="productId"   :rules="{required: true, message: '请选择产品', trigger: ['blur', 'change']}">
          <el-select v-model="form.productId" @change="changeproduct"
                     filterable >
            <el-option v-for="item in productList"
                       :value="item.id"
                       :label="`${item.title}`" :key="item.id">
              <span>{{ item.title }}— <span style="color: red"> {{item.amount}}</span></span>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>

      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">取 消</el-button>
        <el-button type="primary" @click="onSubmit">提 交</el-button>
      </span>
    </el-dialog>

    <qr-code-pay-dialog ref="refQrCodePayDialog" @fetch="updateData"></qr-code-pay-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import customerApi from "@/api/customer";
import productApi from "@/api/goods/product";
import orderApi from "@/api/order/order";
import QrCodePayDialog from "./QrCodePayDialog.vue";

export default {
  name: 'AddCustomerCouponForm',
  components: {QrCodePayDialog},
  data() {
    return {
      form: {
        phone: '',
        comment:'',
        gender:null,
        note:'',
        payType:0,
        type:1,
        quantity:1,
        isGift:false,
        isUseIntegration:false,
        totalAmount:0
      },
      selectCustomerList: [],
      productList:[],
      queryString :'',
      dialogVisible: false,
    }
  },
  computed: {
    ...mapGetters(['userId', 'shopId'])
  },
  watch: {
    'form.phone': {
      handler(newVal, oldVal) {
        if (newVal) {
          this.$nextTick(() => {
            if (this.selectCustomerList.find(e => e.phone == newVal)) {
              this.form.comment = this.selectCustomerList.find(e => e.phone == newVal).comment;
              this.form.gender = this.selectCustomerList.find(e => e.phone == newVal).gender;
            }
          })
        } else {
          this.form.comment = ''
          this.form.gender = null
        }
      },
      immediate: true
    },
    selectCustomerList: {
      handler(newVal, oldVal) {
        if (newVal && newVal.length > 0) {
          this.$nextTick(() => {
            let customer = this.selectCustomerList.find(e => e.phone == this.form.phone)
            if (customer) {
              this.form.comment = customer.comment;
              this.form.gender = customer.gender;
            } else {
              this.form.comment = ''
              this.form.gender = null
            }
          })
        } else {
          this.form.comment = ''
          this.form.gender = null
        }
      },
      immediate: true,
      deep: true
    }
  },
  methods: {
    open(form = {}) {
      this.form.payType = 0
      this.form.type = 1
      this.form.quantity = 1
      this.form.isGift = false
      this.form.isUseIntegration = false
      this.form.totalAmount = 0
      this.dialogVisible = true
      this.GetProductList()
    },
    handleClose() {
      this.dialogVisible = false
      this.queryString = ''
      this.selectCustomerList = []
      this.form.phone = ''
      this.form.comment = ''
      this.form.gender = null
      this.form.productId=''
    },
    handlePhoneInput(value) {
      this.form.comment = ''
      this.form.gender = null
      if (!value) {
        this.form.phone = ''
        return
      }
      const filtered = value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, '');
      this.form.phone = filtered;
    },
    handleSelectCustomer(item) {
      this.form.phone = item.phone
      this.form.comment = item.comment;
      this.form.gender = item.gender;
    },
    changeproduct(item){
      console.log(item);
    },
    updateData() {
      this.dialogVisible = false
      this.queryString = ''
      this.selectCustomerList = []
      this.form = {}
      this.dialogVisible=false;
      this.$emit("submit-success")
    },
    async initOrderDetail(id) {
    /*  let res = await orderDetailApi.info(id);
      this.orderDetail = res.data || {customer: {}, massagist: {avatarUrl: ''}, order: {}}*/
    },
    async GetProductList(){
      let res = await productApi.getListNotParams()
      this.productList= res.data || [];
      console.log(this.productList);
    },
    async querySearchCustomer(queryString, cb) {
      if (queryString == this.queryString) {
        cb(this.selectCustomerList)
        return
      }
      this.queryString = queryString
      if (queryString && queryString.length > 1) {
        let res = await customerApi.page({'phone': queryString, size: 100})
        let {list, total} = res.data || {list: [], total: 0};
        let data = list || []
        this.selectCustomerList = data
        cb(data)
      } else {
        cb([])
      }
    },
    async onSubmit() {
      console.log("this.form1")
      console.log(this.form)

      const valid = await this.$refs.refForm.validate().catch(() => false)
      if (!valid) return
      await this.notifyConfirm("确定要购买此卡卷吗？")
      let resultData=  await orderApi.createOrder(this.form)
      if(resultData.code == 200){
        this.dialogVisible=false;
        this.$refs.refQrCodePayDialog.open(resultData.data.code, resultData.data.payAmount, resultData.data.totalAmount,resultData.data.id)
      }

      console.log(resultData)
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.GiftCustomerCouponForm {
  ::v-deep .el-dialog__body {
    padding-top: 0 !important;
  }
}
</style>
