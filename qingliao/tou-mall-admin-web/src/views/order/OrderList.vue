<template>
  <div class="OrderList">
    <div class="flex justify-between operate-container" style="align-items: flex-start;">
      <div class="flex flex-wrap" style="gap:10px">
        <shop-selector v-if="type==0" filter-status v-model="searchForm.shopId" @change="searchData" clearable
                       style="width: 180px"></shop-selector>
        <el-input placeholder="请输入客户手机号" v-model.trim="searchForm.phone" clearable @clear="searchData"
                  @keyup.enter.native="searchData" style="width: 160px;">
        </el-input>
        <el-select v-model="searchForm.state" @change="searchData" multiple placeholder="订单支付状态" clearable
                   style="width: 220px">
          <el-option
            v-for="item in constant.orderState"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-select v-model="searchForm.appointmentState" @change="searchData" multiple placeholder="订单状态" clearable
                   style="width: 190px">
          <el-option
            v-for="item in constant.orderAppointmentState"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-date-picker
          v-model="appointmentRange" style="width: 260px"
          type="daterange" @change="appointmentRangeChange"
          range-separator="-" v-if="type==0"
          value-format="yyyy-MM-dd HH:mm:ss"
          start-placeholder="预约时间" :default-time="['00:00:00','23:59:59']"
          end-placeholder="范围">
        </el-date-picker>
        <el-select v-model="searchForm.payType" @change="searchData" placeholder="订单支付方式" clearable
                   style="width: 180px">
          <el-option
            v-for="item in constant.orderPayType"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-select v-model="searchForm.appointmentType" @change="searchData" placeholder="订单预约类型" clearable
                   style="width: 180px" v-if="type==0">
          <el-option
            v-for="item in constant.appointmentType"
            :key="item.value"
            :label="item.label"
            :value="item.value">
          </el-option>
        </el-select>
        <el-input v-if="type==0" placeholder="请输入美团券号" v-model.trim="searchForm.couponCode" clearable
                  @clear="searchData"
                  style="width: 220px">
        </el-input>
        <el-input v-if="type==1" placeholder="产品名称" v-model.trim="searchForm.productTitle" clearable
                  @clear="searchData"
                  style="width: 220px">
        </el-input>
        <el-input v-if="type==1" placeholder="备注" v-model.trim="searchForm.comment" clearable
                  @clear="searchData"
                  style="width: 220px">
        </el-input>
        <div class="flex align-center">
          <el-checkbox v-model="searchForm.refundState" :true-label="-1" @change="searchData">退款失败</el-checkbox>
        </div>
        <el-input placeholder="请输入订单编号" v-model.trim="searchForm.code" clearable @clear="searchData"
                  style="width: 260px">
          <el-button slot="append" type="primary" icon="el-icon-search" @click="searchData"></el-button>
        </el-input>
      </div>
      <div style="min-width: 220px" class="flex justify-end">
        <el-button @click="exportExcel" style="margin-left: 20px">导出</el-button>
        <el-button v-if="type==0" type="primary" icon="el-icon-plus" @click="handleShowAppointment"
                   style="margin-left: 20px">添加预约
        </el-button>
        <el-button v-if="type==1" type="primary" icon="el-icon-s-ticket" @click="handleShowGiftCustomerCoupon"
                   style="margin-left: 20px">送券申请
        </el-button>
        <el-button v-if="type==1" type="primary" icon="el-icon-plus" @click="handleShowAddCustomerCoupon"
                   style="margin-left: 20px">添加订单
        </el-button>
      </div>
    </div>
    <div class="table-container">
      <el-table ref="roleTable"
                :data="dataList"
                style="width: 100%;"
                v-loading="listLoading" border>
        <el-table-column label="客户称呼" prop="customerNickname" width="150" show-overflow-tooltip>
        </el-table-column>
        <el-table-column label="客户手机号" prop="customerPhone" width="120" show-overflow-tooltip>
        </el-table-column>
        <el-table-column v-if="type==1" label="实际使用人" width="120" show-overflow-tooltip>
          <template slot-scope="scope">
            <span v-if="!scope.row.isGift">{{ scope.row.customerPhone }}</span>
            <span v-else>{{ scope.row.toCustomer != null ? scope.row.toCustomer.phone : '' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="产品名称" prop="productTitle" width="90" show-overflow-tooltip></el-table-column>
        <el-table-column label="所属门店" prop="shopId" show-overflow-tooltip width="150" v-if="type==0">
          <template slot-scope="scope">
            {{ scope.row.shopId | shopNameFilter }}
          </template>
        </el-table-column>
        <el-table-column label="订单编号" prop="code" width="147" show-overflow-tooltip></el-table-column>
        <el-table-column label="备注" prop="comment" show-overflow-tooltip v-if="type==1">
          <template slot-scope="scope">
            <span class="hover-click" @click="updateComment(scope.row)">
              {{ scope.row.comment }}
              <i class="el-icon-edit" style="cursor: pointer;padding: 0 4px"></i>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="总金额" prop="totalAmount" width="100px">
          <template slot-scope="scope">
            {{ scope.row.totalAmount }}元
          </template>
        </el-table-column>
        <el-table-column label="实付金额" prop="payAmount" width="120px">
          <template slot-scope="scope">
            <span v-if="scope.row.state==0 || scope.row.state==3 || scope.row.state==4">0 元</span>
            <span v-else-if="scope.row.couponPayAmount">
              <span v-if="scope.row.payAmount && (scope.row.payType==3 || scope.row.payType==4)" class="hover-click"
                    @click="changePayAmount(scope.row)">
                {{ scope.row.couponPayAmount }}元
                 <span>
                   <i class="el-icon-edit"></i>
                 </span>
              </span>
              <span v-else>{{ scope.row.couponPayAmount }}元</span>
            </span>
            <span v-else class="hover-click" @click="changePayAmount(scope.row)">
              {{ scope.row.payAmount }}元
               <span v-if="scope.row.payType==3 || scope.row.payType==4">
                 <i class="el-icon-edit"></i>
               </span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="开票状态" prop="totalAmount" width="100px">
          <template slot-scope="scope">
            <el-switch
              @change="handleStatusChange(scope.$index, scope.row)"
              :active-value="1"
              :inactive-value="0"
              v-model="scope.row.invoiceState">
            </el-switch>
          </template>
        </el-table-column>
        <el-table-column label="用券数量" prop="couponAmount" width="78px" v-if="type==0">
          <template slot-scope="scope">
            {{ scope.row.couponAmount }}张
          </template>
        </el-table-column>
        <el-table-column label="积分抵扣金额" prop="integrationAmount" v-if="type==1">
          <template slot-scope="scope">
            <span v-if="scope.row.state==0 || scope.row.state==3 || scope.row.state==4">0</span>
            <span v-else> {{ scope.row.integrationAmount }}</span>
            元
          </template>
        </el-table-column>
        <el-table-column label="支付方式" prop="payType" width="100px" show-overflow-tooltip>
          <template slot-scope="scope">
            {{ scope.row.payType | orderPayTypeFilter }}
          </template>
        </el-table-column>
        <el-table-column label="美团券码" prop="couponCode" width="140px" v-if="type==0" show-overflow-tooltip>
          <template slot-scope="scope">
            <span class="hover-click" v-if="scope.row.payType==3" @click="updateCouponCode(scope.row)">
              {{ scope.row.couponCode }}
                 <i class="el-icon-edit"></i>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="支付时间" prop="payTime" width="140px" show-overflow-tooltip></el-table-column>
        <el-table-column label="支付状态" prop="state" width="100px" show-overflow-tooltip>
          <template slot-scope="scope">
            <div v-if="scope.row.state==5">
              {{ scope.row.state | orderStateFilter }}-{{ scope.row.refundState | refundStateFilter }}
            </div>
            <div v-else>{{ scope.row.state | orderStateFilter }}</div>
          </template>
        </el-table-column>
        <el-table-column v-if="type==0" label="精油" width="60">
          <template slot-scope="scope">
            <el-tag v-if="scope.row.oil" type="warning" style="color: #584219" :style="getOrderLabelStyle(scope.row)">
              {{ scope.row.oil }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="type==0" label="部位" width="150">
          <template slot-scope="scope">
            <el-tag v-if="scope.row.parts && scope.row.parts.length" type="warning" style="color: #584219">
              <span v-for="(item,index) in scope.row.parts" :key="index">
                <span v-if="index!=0" style="margin:0 2px">|</span>
                {{ item }}
              </span>
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="预约时间" prop="startTime" width="130px" show-overflow-tooltip v-if="type==0">
          <template slot-scope="scope">
            <div>{{ scope.row.startTime | formatYYYYMMDDHHmm }}</div>
          </template>
        </el-table-column>
        <el-table-column label="预约人数" prop="personCount" width="130px" show-overflow-tooltip v-if="type==0">
          <template slot-scope="scope">
            <div>{{ scope.row.orderDetailList.length }}</div>
          </template>
        </el-table-column>
        <el-table-column label="疗愈时长" prop="duration" width="130px" show-overflow-tooltip v-if="type==0">
          <template slot-scope="scope">
            <div>{{ scope.row.duration }}</div>
          </template>
        </el-table-column>
        <el-table-column label="订单状态" prop="appointmentState" v-if="type==0">
          <template slot-scope="scope">
            <div v-if="scope.row.appointmentState==3">
              <el-popover
                placement="top-start"
                trigger="hover"
                :content="scope.row.cancelReason">
                <span slot="reference" class="c-warning">{{
                    scope.row.appointmentState | orderAppointmentStateFilter
                  }}<br/>{{scope.row.cancelOrderType | ordercancelOrderTypeFilter}}</span>
              </el-popover>
            </div>
            <div v-else>{{ scope.row.appointmentState | orderAppointmentStateFilter }}</div>
          </template>
        </el-table-column>
        <el-table-column label="备注" prop="comment" show-overflow-tooltip v-if="type==0">
          <template slot-scope="scope">
            <span class="hover-click" @click="updateComment(scope.row)">
            {{ scope.row.comment }}
            <i class="el-icon-edit"></i>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" prop="createTime" show-overflow-tooltip></el-table-column>
        <!--        <el-table-column label="预约信息" prop="appointmentId">
                  <template slot-scope="scope">
                    {{ scope.row.appointmentId }}
                  </template>
                </el-table-column>-->
        <el-table-column label="操作" header-align="center" width="220" fixed="right">
          <template slot-scope="scope">
            <el-row>
              <!--              <el-button size="mini" v-if="scope.row.appointmentId"
                                       type="text"
                                       @click="cancelReservation(scope.row,scope.$index)">
                              取消预约
                            </el-button>-->
              <el-button size="mini"
                         type="text"
                         @click="openDetail(scope.row,scope.$index)">详情
              </el-button>
              <el-button size="mini"
                         type="text" v-if="scope.row.appointmentState==0 || scope.row.appointmentState==1"
                         @click="updForm(scope.row,scope.$index)">修改
              </el-button>
              <el-button size="mini" type="text"
                         v-if="(type==0 && (((scope.row.state==1 || scope.row.state==2) && scope.row.appointmentState==1) || scope.row.appointmentState==0)) || (type==1 && scope.row.appointmentState==0)"
                         @click="cancelOrder(scope.row,scope.$index)">取消
              </el-button>
              <el-button size="mini"
                         type="text"
                         v-if="type==0 && scope.row.appointmentState==1 && (scope.row.state==1 || scope.row.state==2)"
                         @click="finishOrder(scope.row,scope.$index)">完成
              </el-button>
              <el-button size="mini"
                         type="text"
                         v-if="scope.row.state==1 || scope.row.state==2"
                         @click="refund(scope.row,scope.$index)">仅退款
              </el-button>
              <el-button
                v-if="scope.row.state==6 && (scope.row.appointmentState==2 || scope.row.appointmentState==1)"
                type="text" size="mini"
                @click="cancelRefundOrder(scope.row)">已退款取消
              </el-button>
              <el-button
                v-if="scope.row.refundState==-1"
                type="text" size="mini"
                @click="errorRefundOrder(scope.row)">退款重提
              </el-button>
              <el-button size="mini"
                         type="text" v-if="type == 0 && (scope.row.appointmentState==2)"
                         @click="printOrder(scope.row)">打印小票
              </el-button>
              <el-button size="mini"
                         type="text"
                         v-if="scope.row.state==0 && (scope.row.payType == 3 || scope.row.payType == 4)"
                         @click="handlePay(scope.row)">确认收款
              </el-button>
            </el-row>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <div class="pagination-container">
      <el-pagination
        background
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
        layout="total, sizes,prev, pager, next,jumper"
        :page-size="searchForm.size"
        :page-sizes="[5,10,15]"
        hide-on-single-page
        :current-page.sync="searchForm.page"
        :total="total">
      </el-pagination>
    </div>
    <refund-form ref="refRefundForm" @submit-success="fetchData"></refund-form>
    <order-detail ref="refDetail"></order-detail>
    <gift-customer-coupon-form ref="refGiftCustomerCouponForm"></gift-customer-coupon-form>
    <add-customer-coupon-form ref="refAddCustomerCouponForm" @submit-success="searchData"></add-customer-coupon-form>
    <appointment-drawer ref="refAppointmentForm" @submit-success="searchData"></appointment-drawer>
    <upd-order-form ref="refOrderForm" @submit-success="fetchData"></upd-order-form>
    <confirm-pay-dialog ref="refConfirmPayDialog" @submit-success="fetchData"/>
    <comment-form ref="refCommentForm" @on-submit="onSubmitComment"></comment-form>
    <cancel-order-dialog ref="refCancelOrderDialog" @submit-success="fetchData"></cancel-order-dialog>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import orderApi from "@/api/order/order";
import RefundForm from "@/views/order/RefundForm";
import OrderDetail from "@/views/order/OrderDetail";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import GiftCustomerCouponForm from "@/views/order/GiftCustomerCouponForm";
import AddCustomerCouponForm from "@/views/order/AddCustomerCouponForm";
import AppointmentDrawer from "../home/AppointmentDrawer";
import UpdOrderForm from "@/views/home/UpdOrderForm";
import dateUtil from "@/utils/dateUtil";
import ConfirmPayDialog from "../home/ConfirmPayDialog";
import CommentForm from "@/views/order/CommentForm";
import CancelOrderDialog from "../home/CancelOrderDialog";

export default {
  name: 'OrderList',
  components: {
    CancelOrderDialog,
    CommentForm,
    ConfirmPayDialog,
    UpdOrderForm, AppointmentDrawer, GiftCustomerCouponForm, ShopSelector, OrderDetail, RefundForm,AddCustomerCouponForm
  },
  props: {
    type: {
      default: 0,
      type: Number
    }
  },
  data() {
    return {
      searchForm: {
        page: 1,
        size: 10,
        order: '-id',
      },
      appointmentRange: [],
      dataList: [],
      listLoading: false,
      total: 0,
    }
  },
  computed: {
    ...mapGetters(['userId', 'shopId','shopListAll'])
  },
  created() {
    this.$store.dispatch("setMassagistList")
    this.$store.dispatch("setShopList")
    this.$store.dispatch('setShopAllList')
    this.initData()
  },
  methods: {
    async exportExcel() {
      await this.notifyConfirm("将按照当前筛选条件进行导出，是否确定导出？")
      this.showFullLoading('正在导出文件', true)
      let searchForm = JSON.parse(JSON.stringify(this.searchForm))
      if (this.searchForm.appointmentState && this.searchForm.appointmentState.length > 0) {
        searchForm = {...searchForm, appointmentState: this.searchForm.appointmentState.join(",")}
      }
      if (this.searchForm.state && this.searchForm.state.length > 0) {
        searchForm = {...searchForm, state: this.searchForm.state.join(",")}
      }
      await orderApi.exportExcel(searchForm)
      this.hideFullLoading()
    },
    handleShowAppointment() {
      this.$refs.refAppointmentForm.open()
    },
    handleShowGiftCustomerCoupon() {
      this.$refs.refGiftCustomerCouponForm.open()
    },
    handleShowAddCustomerCoupon(){
      this.$refs.refAddCustomerCouponForm.open()
    },
    initData() {
      this.searchForm = {
        page: 1,
        size: 10,
        order: '-id',
        type: this.type,
        state: [],
        appointmentState: this.type == 1 ? [2] : null,
        shopId: this.type == 0 ? this.shopId : null
      }
      this.searchData()
    },
    appointmentRangeChange(value) {
      if (value && value.length > 0) {
        this.$set(this.searchForm, 'startAppointmentTime', value[0])
        this.$set(this.searchForm, 'endAppointmentTime', value[1])
      } else {
        this.$set(this.searchForm, 'startAppointmentTime', null)
        this.$set(this.searchForm, 'endAppointmentTime', null)
      }
      this.searchData()
    },
    searchData() {
      this.searchForm.page = 1
      this.fetchData()
    },
    async fetchData() {
      this.listLoading = true
      let searchForm = JSON.parse(JSON.stringify(this.searchForm))
      if (this.searchForm.appointmentState && this.searchForm.appointmentState.length > 0) {
        searchForm = {...searchForm, appointmentState: this.searchForm.appointmentState.join(",")}
      }
      if (this.searchForm.state && this.searchForm.state.length > 0) {
        searchForm = {...searchForm, state: this.searchForm.state.join(",")}
      }
      let res = await orderApi.page(searchForm)
      this.listLoading = false
      let {list, total} = res.data
      this.dataList = list || []
      this.total = total || 0
    },
    handleSizeChange(val) {
      this.searchForm.size = val;
      this.searchData();
    },
    handleCurrentChange(val) {
      this.searchForm.page = val;
      this.fetchData();
    },
    openDetail(row, index) {
      this.$refs.refDetail.open(row)
    },
    updOrder() {

    },
    cancelOrder(row, index) {
      this.$refs.refCancelOrderDialog.open(row)
    },
    async cancelRefundOrder(row) {
      this.$prompt('请输入仅退款后又取消订单的原因', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /^.+$/,
        inputErrorMessage: '原因不能为空'
      }).then(async ({value}) => {
        await this.notifyConfirm("此操作将要取消此订单所有关联服务项目？确定要取消吗？")
        await orderApi.cancelRefundOrder(row.id, value)
        this.fetchData()
        this.notifySuccess()
      }).catch(() => {

      });
    },
    async errorRefundOrder(row) {
      await this.notifyConfirm("此操作将要重新提交此订单的退款，确定要提交吗？")
      await orderApi.errorRefundOrder(row.id)
      this.fetchData()
    },
    async refund(row, index) {
      this.$refs.refRefundForm.open(row)
    },
    updForm(row) {
      this.$refs.refOrderForm.open(row.id)
    },
    async printOrder(row) {
      await this.notifyConfirm('确定要打印小票吗')
      this.showFullLoading()
      await orderApi.printOrder(row.id)
      this.hideFullLoading()
      this.notifySuccess('已下发打印任务')
    },
    async finishOrder(row) {
      await this.notifyConfirm('确定要完成订单吗？')
      this.showFullLoading()
      await orderApi.finishOrder(row.id)
      this.hideFullLoading()
      this.notifySuccess()
      this.fetchData()
    },
    async updateComment(row) {
      if (this.type == 1) {
        this.$refs.refCommentForm.open({id: row.id, comment: row.comment})
      } else {
        this.$prompt('请输入备注内容', '更改备注', {
          confirmButtonText: '保存',
          cancelButtonText: '取消',
          inputPattern: /^.+$/,
          inputValue: row.comment,
          inputErrorMessage: '备注内容不能为空'
        }).then(async ({value}) => {
          await orderApi.updateComment(row.id, value)
          this.notifySuccess()
          row.comment = value
        }).catch(() => {

        });
      }
    },
    async onSubmitComment(form) {
      this.showFullLoading()
      await orderApi.updateComment(form.id, form.comment)
      this.hideFullLoading()
      this.fetchData()
      this.notifySuccess()
    },
    async updateCouponCode(row) {
      this.$prompt('请输入美团券码', '美团券码', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputPattern: /^.+$/,
        inputValue: row.couponCode,
        inputErrorMessage: '美团券码不能为空'
      }).then(async ({value}) => {
        await orderApi.updateCouponCode(row.id, value)
        this.notifySuccess()
        row.couponCode = value
      }).catch(() => {

      });
    },
    changePayAmount(row) {
      let title = ""
      if (row.payType != 3 && row.payType != 4) {
        return
      }
      if (row.payType == 3) {
        title = "美团实付"
      } else if (row.payType == 4) (
        title = "现金实付"
      )
      this.$prompt('请输入' + title + "金额(元)", title, {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputType: 'number',
        inputPattern: /^(0|[1-9]\d*)(\.\d{1,2})?$/,
        inputValue: row.payAmount,
        inputErrorMessage: `${title}的金额必须大于等于0，且小数不超过两位`
      }).then(async ({value}) => {
        await orderApi.updatePayAmount(row.id, value)
        this.notifySuccess()
        this.fetchData()
      }).catch(() => {

      });
    },
    async handlePay(row) {
      this.$refs.refConfirmPayDialog.open(row.id, row.payAmount, row.payType, row.couponCode)
    },
    getOrderLabelStyle(order) {
      let bgColor = ''
      if (order.oil == '花') {
        bgColor = 'linear-gradient(#9d8bb6, #f2d8de)'
      } else if (order.oil == '柚') {
        bgColor = 'linear-gradient(#eeb046, #faedc7)'
      } else if (order.oil == '竺') {
        bgColor = 'linear-gradient(#b1d02a, #e5efcb)'
      } else if (order.oil == '森') {
        bgColor = 'linear-gradient(#2a4824, #5c411f)'
      } else if (order.oil == '无') {
        bgColor = 'linear-gradient(#a6a6a6, #ffffff)'
      }else if (order.oil == '花*') {
        bgColor = 'linear-gradient(#f2d8de, #9d8bb6)'
      }else if (order.oil == '果*') {
        bgColor = 'linear-gradient( #faedc7, #eeb046)'
      }else if (order.oil == '草*') {
        bgColor = 'linear-gradient( #e5efcb, #b1d02a)'
      }else if (order.oil == '木*') {
        bgColor = 'linear-gradient(#5c411f, #2a4824)'
      }else if (order.oil == '茶*') {
        bgColor = 'linear-gradient( #6C8149, #D3D3D3)'
      }
      return {
        background: bgColor,
        color: '#fff',
      }
    },
    handleStatusChange(index, row) {
      console.log(row);
      this.$confirm('确认已开票了吗?', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
       await orderApi.updateOrderInvoiceStatus(row.id, {status: row.invoiceState}).then(response => {
          this.$message({
            type: 'success',
            message: '修改成功!'
          });
         this.fetchData()
        });
      }).catch(() => {
       /* this.$message({
          type: 'info',
          message: '取消修改'
        });*/
        this.fetchData()
      });
    },
  },
  filters: {
    formatYYYYMMDDHHmm(timeStr) {
      if (timeStr) {
        return dateUtil.format(timeStr, 'YYYY-MM-DD HH:mm');
      }
      return ''
    },
  },

}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.OrderList {
  padding: 0 20px;
}
</style>
