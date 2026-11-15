<template>
  <div class="AppointmentDrawer">
    <el-drawer
      :title="drawerTitle"
      :close-on-click-modal="false"
      :visible.sync="dialogVisible"
      size="700px"
      :before-close="handleClose">
      <el-form v-loading="loading" :model="form" ref="refForm" label-width="110px" class="margin-lr-16"
               style="padding-bottom: 90px">
        <!--        <el-form-item label="预约门店" prop="shopId"-->
        <!--                      :rules="[{required: true, message: '请选择预约门店', trigger: ['blur', 'change']}]">-->
        <!--          <shop-selector ref="refShopSelector" v-model="form.shopId" :style="'width: 100%'" filter-status-->
        <!--                         @selected="changeShop"-->
        <!--                         placeholder="请选择所属门店"></shop-selector>-->
        <!--        </el-form-item>-->
        <el-form-item label="服务项目" prop="productId"
                      :rules="[{required: true, message: '请选择服务项目', trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.productId" size="small" @change="productSelected" class="time">
            <el-radio-button :label="item.id" v-for="(item,index) in productList" :key="index">{{ item.title }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="服务人数" prop="personCount"
                      :rules="[{required: true, message: `请输入服务人数`, trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.personCount" size="small" @change="handleChange" class="time">
            <el-radio-button :label="item" v-for="(item,index) in maxBedCount" :key="index">{{ item }}位
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="疗愈时长" prop="durationMinutes"
                      :rules="[{required: true, message: `请选择理疗时长`, trigger: ['blur', 'change']}]">
          <el-radio-group v-model="form.durationMinutes" size="mini" @change="clearTime" class="time">
            <el-radio-button v-for="(minutes,index) in projectTypeDurationMinutesMap[this.projectTypeNew] || []"
                             :key="index" :label="minutes">
              {{ minutes }}min
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="到店日期" prop="date"
                      :rules="[{required: true, message: `请选择到店日期`, trigger: ['blur', 'change']}]">
          <el-date-picker clearable
                          v-model="form.date"
                          align="right" style="width: 100%;"
                          type="date" :clearable="false" :picker-options="pickerOptions"
                          placeholder="到店日期" @change="clearTime"
                          value-format="yyyy-MM-dd">
          </el-date-picker>
          <el-radio-group v-model="form.date" size="mini" @change="clearTime" class="time">
            <el-radio-button v-for="(item,index) in dateToBeSelected || []"
                             :key="index" :label="item.value">
              {{ item.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="到店时间" prop="time"
                      :rules="[{required: true, message: `请选择到店时间`, trigger: ['blur', 'change']}]">
          <el-time-select clearable
                          placeholder="到店时间" @change="fetchMassagistAndBed" style="width: 100%;"
                          v-model="form.time" format="HH:mm" value-format="HH:mm" :clearable="false"
                          :picker-options="{ start: clockInTime,step: '00:15',end: clockOutTime}">
          </el-time-select>
          <el-radio-group v-model="form.time" size="mini" class="time m-t-10" @change="fetchMassagistAndBed">
            <el-radio-button v-for="(item,index) in  timeList|| []" :disabled="item.state==0"
                             :key="index" :label="item.time">
              {{ item.time }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="手机号Phone" prop="phone"
                      :rules="{required: true, message: '请输入手机号PhoneNumber', trigger: ['blur', 'change']}">
          <div class="flex">
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
            <span v-if="selectCustomerList && selectCustomerList.find(e=>e.phone==form.phone)"
                  style="margin:0 10px">
              <span>
                {{ selectCustomerList.find(e => e.phone == form.phone).couponCount || 0 }}张券可用
              </span>
            </span>
            <span v-else style="margin:0 10px" class="c-info">
              无客户信息
            </span>
          </div>
        </el-form-item>
        <el-form-item v-show="form.phone" label="客户信息">
          <div class="flex">
            <el-form-item label="" label-width="0" prop="comment" style="margin-right: 6px">
              <el-input v-model="form.comment" placeholder="称呼 Name" style="width: 120px"></el-input>
            </el-form-item>
            <el-form-item label="" label-width="0" prop="gender">
              <el-radio-group v-model="form.gender" size="mini" class="time">
                <el-radio-button v-for="(item,index) in constant.gender"
                                 :key="index" :label="item.value">
                  {{ item.label }}
                </el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="" label-width="0" prop="note">
              <el-input v-model="form.note" placeholder="备注 Note" style="width: 240px"></el-input>
            </el-form-item>
          </div>
        </el-form-item>
        <el-form-item v-show="form.phone" label="客户生日">
          <div class="birthday-row">
            <birthday-picker :key="openSeq" v-model="form.birthday"></birthday-picker>
            <span v-if="birthdayCountdown" class="birthday-countdown"
                  :class="{ 'is-today': birthdayCountdown === '今天生日' }">{{ birthdayCountdown }}</span>
            <span class="birthday-hint">只记月日，用于生日关怀</span>
          </div>
        </el-form-item>
        <el-form-item v-if="blockedMassagistList.length" label="客户暂别">
          <div class="blocked-row">
            <el-tag v-for="item in blockedMassagistList" :key="item.id" size="small" type="warning"
                    style="margin-right: 6px">
              {{ item.massagist ? item.massagist.name : '疗愈师' }}
            </el-tag>
            <span class="blocked-hint">该客户不想再被分配到以上疗愈师；自动派人会跳过，手动指定仅提示</span>
          </div>
        </el-form-item>
        <el-form-item label="支付方式" prop="payType">
          <el-radio-group v-model="form.payType" size="mini" class="time m-t-10">
            <el-radio-button v-for="item in constant.orderPayType.filter(s=>s.value != 2 && s.value!= 1)"
                             :key="item.value" :label="item.value">
              {{ item.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-show="massagistList && massagistList.length" label="疗愈师" prop="massagistIdList">
          <el-checkbox-group class="group"
                             v-model="form.massagistIdList"
                             :max="form.personCount"
                             @change="handleMassagistChange">
            <el-checkbox-button v-for="massagist in massagistList" :label="massagist.id" :key="massagist.id"
                                :class="{'is-avoided': isBlockedMassagist(massagist.id)}">
              {{ massagist.name }}<span v-if="isBlockedMassagist(massagist.id)" class="avoided-badge">暂别</span>
            </el-checkbox-button>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-show="bedList && bedList.length" label="座位" prop="bedIdList">
          <el-checkbox-group class="group"
                             v-model="form.bedIdList"
                             :max="form.personCount">
            <el-checkbox-button v-for="bed in bedList" :label="bed.id" :key="bed.id">
              {{ bed.name }}
            </el-checkbox-button>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <el-alert v-if="selectedBlockedNames.length" type="warning" :closable="false" show-icon
                :title="`本次安排包含客户设为暂别的疗愈师：${selectedBlockedNames.join('、')}，请与客户确认`"
                style="margin-bottom: 10px"></el-alert>
      <div v-loading="loading" class="drawer-footer justify-end" style="width:700px">
        <div class="flex justify-center align-center">
          <span class="m-r-10" v-show="form.massagistIdList && form.massagistIdList.length"
                :style="{'color':form.hiddenIsUpdateSortBtn?'#909399':form.isUpdateSort?'#13ce66':'#ff4949'}">
            {{ form.isUpdateSort ? '计入轮次' : '不计入轮次' }}
          </span>
          <el-switch class="m-r-10" :disabled="form.hiddenIsUpdateSortBtn"
                     style="display: block" v-if="form.massagistIdList && form.massagistIdList.length"
                     v-model="form.isUpdateSort"
                     active-color="#13ce66"
                     inactive-color="#ff4949">
          </el-switch>
          <el-button @click="handleClose" class="btn-B m-r-10">取 消</el-button>
          <el-button type="primary" @click="onSubmit" class="btn-A">确 定</el-button>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import ProjectSelector from "@/views/goods/product/ProjectSelector";
import orderApi from "@/api/order/order";
import ShopSelector from "@/views/shop/shopList/ShopSelector";
import bedApi from "@/api/shop/bed";
import customerApi from "@/api/customer";
import customerMassagistBlockApi from "@/api/customer/customerMassagistBlock";
import dateUtil from "@/utils/dateUtil";
import { birthdayCountdownLabel } from "@/utils/birthday";
import BirthdayPicker from "@/views/home/BirthdayPicker";

export default {
  name: 'AppointmentDrawer',
  components: {ShopSelector, ProjectSelector, BirthdayPicker},
  props: {},
  data() {
    return {
      form: {},
      isSubmitting: false,
      selectCustomerList: [],
      blockedMassagistList: [],
      confirmedBlockedIds: [],
      blockedPhone: '',
      queryString: '',
      dialogVisible: false,
      projectType: '',//1是湿区，2是干区
      projectTypeNew:'',//1标识洗头，2标识全身，3标识舒耳
      projectId: '',
      projectTypeDurationMinutesMap: {
        1: [60, 90, 30],
        2: [60, 90, 30],
        3: [30, 60],
      },
      dateToBeSelected: [],
      timeList: [],
      massagistList: [],
      bedList: [],
      pickerOptions: {
        /*disabledDate(time) {
          return time.getTime() < Date.now() - 24 * 60 * 60 * 1000;
        },*/
      },
      clockInTime: '',
      clockOutTime: '',
      maxBedCount: 1,
      drawerTitle: '',
      loading: false,
      baseDataPromise: null,
      openSeq: 0
    }
  },
  computed: {
    ...mapGetters(['productList', 'shopList', 'shopId']),
    birthdayCountdown() {
      return birthdayCountdownLabel(this.form.birthday)
    },
    selectedBlockedNames() {
      return (this.form.massagistIdList || [])
        .filter(id => this.isBlockedMassagist(id))
        .map(id => {
          const massagist = this.massagistList.find(item => String(item.id) === String(id))
          return massagist ? massagist.name : id
        })
    }
  },
  watch: {
    'form.phone': {
      handler(newVal, oldVal) {
        if (newVal) {
          this.$nextTick(() => {
            if (this.selectCustomerList.find(e => e.phone == newVal)) {
              this.form.comment = this.selectCustomerList.find(e => e.phone == newVal).comment;
              this.form.gender = this.selectCustomerList.find(e => e.phone == newVal).gender;
              this.form.birthday = this.selectCustomerList.find(e => e.phone == newVal).birthday || null;
            }
          })
          this.fetchBlockedByPhone(newVal)
          //客户确定后重算时段/床位：同一客户紧接着的加钟段不应因为整理期被置灰
          this.refreshAvailabilityForCustomer(newVal)
        } else {
          this.form.comment = ''
          this.form.gender = null
          this.form.birthday = null
          this.blockedMassagistList = []
          this.confirmedBlockedIds = []
          this.availabilityPhone = ''
          this.refreshAvailabilityForCustomer('')
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
              this.form.birthday = customer.birthday || null;
            } else {
              this.form.comment = ''
              this.form.gender = null
              this.form.birthday = null
            }
          })
        } else {
          this.form.comment = ''
          this.form.gender = null
          this.form.birthday = null
        }
      },
      immediate: true,
      deep: true
    }
  },
  created() {
    //不在这里 dispatch:create 时门店/用户信息可能还没就绪,且异步返回无人等待。
    //改为在 open() 打开抽屉时经 ensureBaseData() 等待完成。
  },
  methods: {
    /**
     * 确保服务项目、门店等基础数据已加载。
     * 并发调用共享同一个 Promise,避免重复请求;失败后清空缓存以便下次重试。
     */
    ensureBaseData() {
      if (!this.baseDataPromise) {
        this.baseDataPromise = Promise.all([
          this.$store.dispatch("setProductList"),
          this.$store.dispatch("setShopList")
        ]).finally(() => {
          this.baseDataPromise = null
        })
      }
      return this.baseDataPromise
    },
    async open(form = {}, params = {}, title = '预约') {
      //同一实例可能被连续 open(连点行/行切换),用序号丢弃过期的那次初始化
      const seq = ++this.openSeq
      this.dialogVisible = true
      this.drawerTitle = title
      this.loading = true
      this.availabilityLoaded = false
      this.availabilityPhone = ''
      try {
        await this.ensureBaseData();
        if (seq !== this.openSeq) return
        if (!this.productList.length) {
          this.$message.error('服务项目加载失败,请关闭后重试')
          return
        }
        await this.initForm(form, params, seq);
        //await this.productSelected(this.productList[0])
      } catch (e) {
        if (seq !== this.openSeq) return
        console.error('预约抽屉初始化失败', e)
        this.$message.error('预约信息加载失败,请稍后重试')
      } finally {
        if (seq === this.openSeq) {
          this.loading = false
        }
      }
    },
    async initForm(form = {}, params = {}, seq) {
      //seq 存在时表示由 open() 发起,过期则中断,避免写入已被覆盖的表单状态
      const isStale = () => seq !== undefined && seq !== this.openSeq

      let proIndex = 0
      if (params.projectType) {
        proIndex = this.productList.findIndex(e => e.projectList.findIndex(e => e.type == params.projectType) > -1)
      } else if (form.projectId) {
        proIndex = this.productList.findIndex(e => e.projectList.findIndex(e => e.id == form.projectId) > -1)
      }

      //产品/项目数据可能未就绪或已变更,兜底到第一个可选服务,避免 productList[proIndex] 为 undefined
      if (proIndex < 0 || !this.productList[proIndex]) {
        proIndex = 0
      }
      const product = this.productList[proIndex]
      if (!product || !product.projectList || !product.projectList.length) {
        throw new Error('服务项目数据为空,无法初始化预约表单')
      }

      form.shopId=this.shopId
      await this.initDateToBeSelected(form.shopId)//查询疗愈师的排班表,显示可预定的日期
      if (isStale()) return

      if (!form.date) {
        if (this.dateToBeSelected[0]) {
          form.date = this.dateToBeSelected[0].value
        } else {
          form.date = dateUtil.getCurrentDateCode()
        }
      }
      this.form = {
        payType: 3,
        massagistIdList: [],
        bedIdList: [],
        comment: '',
        gender: null,
        birthday: null,
        productId: product.id,
        personCount: 1,
        shopId: this.shopId,
        //选好疗愈师后默认「不计入轮次」(开关为红色),需要计入时由操作员手动打开
        isUpdateSort: false,
        ...form,
      }

      this.$forceUpdate()

      if (this.form.shopId) {
        let shop = this.shopList.find(e => e.id == this.form.shopId)
        if (shop) {
          this.clockInTime = shop.clockInTime
          this.clockOutTime = shop.clockOutTime
        } else {
          this.clockInTime = '08:30'
          this.clockOutTime = '22:30'
        }
      }
      this.projectType = product.projectList[0].type
      //luxin修改了
      if(product.projectList[0].id==4){
        this.projectTypeNew=3//强制转换为采耳索引
      }else{
        this.projectTypeNew=this.projectType
      }
      this.projectId = product.projectList[0].id
      this.$set(this.form, "durationMinutes", (this.projectTypeDurationMinutesMap[this.projectType] || [])[0])
      await this.initMaxBedCount()
      await this.fetchTimeList()
      if (isStale()) return
      if (this.form.time) {
        await this.fetchMassagistList()
        await this.fetchBedList()
        if (isStale()) return
        this.availabilityLoaded = true
        if (params.name) {
          if (params.type == 1 && this.form.bedIdList.length == 0) {
            let findIndex = this.bedList.findIndex(e => e.name == params.name);
            if (findIndex > -1) {
              this.form.bedIdList.push(this.bedList[findIndex].id)
            }
          } else if (params.type == 2 && this.form.massagistIdList.length == 0) {
            let findIndex = this.massagistList.findIndex(e => e.name == params.name);
            if (findIndex > -1) {
              this.form.massagistIdList.push(this.massagistList[findIndex].id)
            }
          }
        }

      }
      if (this.form.phone) {
        await this.querySearchCustomer(form.phone, (data) => {
        })
        if (isStale()) return
        await this.fetchBlockedByPhone(this.form.phone)
      }
    },
    async initDateToBeSelected(shopId) {//获取疗愈师排班计划表近4天的日期列表，根据门店id
     // let res = await orderApi.bookingDates()
      let res = await orderApi.bookingDatesNew(shopId)
      console.log(res);
      this.dateToBeSelected = res.data || []
    },
    handleClose() {
      //作废仍在进行中的初始化,避免其把数据写回已关闭的抽屉
      this.openSeq++
      this.loading = false
      this.dialogVisible = false
      this.massagistList = []
      this.bedList = []
      this.timeList = []
      this.dateToBeSelected = []
      this.form = {}
      this.queryString = ''
      this.selectCustomerList = []
      this.blockedMassagistList = []
      this.confirmedBlockedIds = []
      this.blockedPhone = ''
      this.maxBedCount = 1
    },
    async onSubmit() {
      console.log(this.isSubmitting)
      if (this.isSubmitting) return; // 如果正在提交，则直接返回
      this.isSubmitting = true; // 设置正在提交
      try {
        let validate = await this.$refs.refForm.validate().catch(() => false);
        if (!validate) {
          this.isSubmitting=false;
          return
        }
        if(!this.form.time){
          this.notifyWarning("请选择到店时间！","警告")
          this.isSubmitting=false;
          return;
        }
        if(this.bedList.length==0){
          this.notifyWarning("暂无床位，不可添加订单！","警告")
          this.isSubmitting=false;
          return;
        }
        this.showFullLoading()
        this.hideFullLoading()
        this.form.addType=0;//标识直接新建
        if(this.drawerTitle=="加钟"){
          this.form.addType=1//标识加钟
        }
        await orderApi.appointmentOrder(this.form)

        this.notifySuccess()
        this.handleClose()
        this.$emit("submit-success")
        this.isSubmitting=false;
      }
      catch (error) {
        this.isSubmitting=false;
      }
    },
    handleChange(newValue) {
      if (newValue == undefined || newValue == null || newValue < 1) {
        this.form.personCount = "1";
      } else if (newValue && newValue > this.maxBedCount) {
        this.form.personCount = this.maxBedCount;
      }
      if (this.form.massagistIdList.length > newValue) {//已选择疗愈师人数大于服务人数则清空多余人数
        this.form.massagistIdList.splice(newValue - 1, this.form.massagistIdList.length - newValue)
      }
      if (this.form.bedIdList.length > newValue) {//已选择座位人数大于服务人数则清空多余人数
        this.form.bedIdList.splice(newValue - 1, this.form.bedIdList.length - newValue)
      }
      this.clearTime()
    },
    productSelected(id) {
      this.form.personCount=1;

      let findIndex = this.productList.findIndex(e => e.id == id);
      let item = this.productList[findIndex]
      this.$set(this.form, "bedIdList", [])
      if (item) {
        this.projectType = item.projectList[0].type
        //luxin修改了
        if(item.projectList[0].id==4){
          this.projectTypeNew=3//强制转换为采耳索引
        }else{
          this.projectTypeNew=this.projectType
        }
        this.projectId = item.projectList[0].id
        this.$set(this.form, "durationMinutes", (this.projectTypeDurationMinutesMap[this.projectType] || [])[0])
        this.setMaxBedCount()
      } else {
        this.projectType = ''
        this.projectId = ''
        this.$set(this.form, "durationMinutes", '')
        this.maxBedCount = 1
      }
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
    handlePhoneInput(value) {
      this.form.comment = ''
      this.form.gender = null
      this.form.birthday = null
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
      this.form.birthday = item.birthday || null;
      this.fetchBlockedByPhone(item.phone)
    },
    async fetchBlockedByPhone(phone) {
      const normalized = (phone || '').trim()
      if (!/^1\d{10}$/.test(normalized)) {
        this.blockedMassagistList = []
        this.confirmedBlockedIds = []
        this.blockedPhone = ''
        return
      }
      if (this.blockedPhone !== normalized) {
        this.blockedPhone = normalized
        this.confirmedBlockedIds = []
      }
      try {
        const res = await customerMassagistBlockApi.byPhone(normalized)
        // 防止旧请求覆盖新输入的手机号
        if (this.form.phone !== normalized) {
          return
        }
        this.blockedMassagistList = res.data || []
        // 客户变更后，已勾选但未确认过的暂别疗愈师同样确认一次
        this.$nextTick(() => {
          this.handleMassagistChange(this.form.massagistIdList || [])
        })
      } catch (e) {
        this.blockedMassagistList = []
      }
    },
    isBlockedMassagist(id) {
      const massagist = this.massagistList.find(item => String(item.id) === String(id))
      if (massagist && massagist.blockedByCustomer) {
        return true
      }
      return this.blockedMassagistList.some(item => String(item.massagistId) === String(id))
    },
    handleMassagistChange(ids) {
      const blockedAdded = (ids || []).filter(id => {
        return this.isBlockedMassagist(id) && !this.confirmedBlockedIds.includes(String(id))
      })
      if (!blockedAdded.length) {
        return
      }
      const id = blockedAdded[0]
      const massagist = this.massagistList.find(item => String(item.id) === String(id))
      const name = massagist ? massagist.name : '该疗愈师'
      // 先回退勾选，确认后再恢复
      this.form.massagistIdList = (this.form.massagistIdList || [])
        .filter(item => String(item) !== String(id))
      this.$confirm(
        `${name} 是该客户设为「暂别」的疗愈师。如客户在现场同意，可继续指定；此设置仅对本次订单生效，不会改变客户的偏好记录。`,
        `仍要为该客户指定「${name}」吗？`,
        {
          confirmButtonText: '仍要指定',
          cancelButtonText: '不指定',
          type: 'warning'
        }
      ).then(() => {
        this.confirmedBlockedIds.push(String(id))
        if (!(this.form.massagistIdList || []).some(item => String(item) === String(id))) {
          this.form.massagistIdList.push(id)
        }
      }).catch(() => {
      })
    },
    changeShop(item) {
      if (item) {
        this.clockInTime = item.clockInTime
        this.clockOutTime = item.clockOutTime
      } else {
        this.clockInTime = '08:30'
        this.clockOutTime = '22:30'
      }
      this.form.time=''
      this.setMaxBedCount()
    },
    clearTime() {
      if (this.form.time) {
        this.fetchMassagistAndBed()
      }
      this.fetchTimeList()
    },
    /** 换客户后按新客户重算可约时段与床位（未选时段则只算时段）。 */
    async refreshAvailabilityForCustomer(phone) {
      if (!this.availabilityLoaded || !this.dialogVisible) return
      const normalized = (phone || '').trim()
      const key = /^1\d{10}$/.test(normalized) ? normalized : ''
      if (this.availabilityPhone === key) return
      this.availabilityPhone = key
      await this.fetchTimeList()
      if (this.form.time) {
        await this.fetchMassagistAndBed()
      }
    },
    async fetchTimeList() {
      try {
        if(this.form.date!=null&&this.form.date!=undefined){
          //带上手机号：加钟时同一客户紧接着的时段不占 15 分钟整理期，否则会被自己上一单挡住
          let res = await orderApi.timeList(this.form.date, this.form.personCount, this.projectId, this.form.durationMinutes, this.form.shopId, this.form.massagistId, this.form.phone, this.form.orderId)
          console.log(res.data)
          this.timeList = res.data
        }
      } catch (e) {
        this.timeList = []
      }
    },
    fetchMassagistAndBed() {
      this.fetchMassagistList()
      this.fetchBedList()
    },
    async fetchMassagistList() {
      try {
        if(this.form.date!=null&&this.form.date!=undefined) {
          let res = await orderApi.massagistListNew(this.form.date + " " + this.form.time + ":00", this.form.personCount, this.form.durationMinutes, this.form.shopId, this.projectId, this.form.phone)
          console.log(res.data)
          this.massagistList = res.data || []
        }
      } catch (e) {
        this.massagistList = []
      }
    },
    async fetchBedList() {
      try {
        if(this.form.date!=null&&this.form.date!=undefined) {
          let res = await orderApi.bedList(this.form.date + " " + this.form.time + ":00", this.projectId, this.form.durationMinutes, this.form.shopId, this.form.orderId, this.form.phone)
          this.bedList = res.data || []
        }
      } catch (e) {
        this.bedList = []
      }
    },
    async initMaxBedCount() {
      try {
        let res = await bedApi.maxBedCount(this.form.shopId, this.projectType)
        this.maxBedCount = res.data || 0
      } catch (e) {
        this.maxBedCount = 0
      }
    },
    async setMaxBedCount() {
      await this.initMaxBedCount()
      this.handleChange(this.form.personCount)
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.AppointmentDrawer {
  .time /deep/ .el-radio-button:not(:first-child) .el-radio-button__inner {
    border-left: 1px solid #DCDFE6 !important;
  }

  .time /deep/ .el-radio-button__inner {
    border-radius: 6px;
    color: #49454f;
  }

  .time /deep/ .el-radio-button + .is-active:not(:first-child) .el-radio-button__inner {
    border-left: 1px solid #e8def8 !important;
  }

  .time /deep/ .el-radio-button__orig-radio:disabled + .el-radio-button__inner {
    color: #c0c4cc;
    cursor: not-allowed;
    background-image: none;
    background-color: #fff;
    border-color: #ebeef5;
    box-shadow: none;
  }

  .time /deep/ .el-radio-button .el-radio-button__inner {
    margin-right: 6px;
    margin-bottom: 6px;
  }

  .time /deep/ .el-radio-button__orig-radio:checked + .el-radio-button__inner {
    background-color: #e8def8;
    border-color: #e8def8;
    box-shadow: -1px 0 0 0 #e8def8;
    color: #4a4459;

    &::before {
      content: "";
      display: inline-block;
      width: 10px;
      position: relative;
      height: 6px;
      top: -2px;
      border-left: 2px solid #4a4459;
      border-bottom: 2px solid #4a4459;
      transform: rotate(-45deg);
      margin-right: 5px;
    }
  }

  .group {
    /deep/ .el-checkbox-button:not(:first-child) .el-checkbox-button__inner {
      border-left: 1px solid #DCDFE6 !important;
    }

    /deep/ .el-checkbox-button__inner {
      border-radius: 6px;
      color: #49454f;
      padding: 8px 15px;
      position: relative;
    }

    /deep/ .el-checkbox-button.is-checked:not(:first-child) .el-checkbox-button__inner {
      border-left: 1px solid #e8def8 !important;
    }

    /deep/ .el-checkbox-button.is-disabled .el-checkbox-button__inner {
      color: #c0c4cc;
      cursor: not-allowed;
      background-image: none;
      background-color: #fff;
      border-color: #ebeef5;
      box-shadow: none;
    }

    /deep/ .el-checkbox-button .el-checkbox-button__inner {
      margin-right: 6px;
      margin-bottom: 6px;
    }

    /deep/ .el-checkbox-button.is-checked .el-checkbox-button__inner {
      background-color: #e8def8;
      border-color: #e8def8;
      box-shadow: -1px 0 0 0 #e8def8;
      color: #4a4459;

      &::before {
        content: "";
        display: inline-block;
        width: 10px;
        position: relative;
        height: 6px;
        top: -2px;
        border-left: 2px solid #4a4459;
        border-bottom: 2px solid #4a4459;
        transform: rotate(-45deg);
        margin-right: 5px;
      }
    }

    /deep/ .el-checkbox-button .el-checkbox__input {
      display: none;
    }

    /deep/ .el-checkbox-button.is-checked .el-checkbox-button__inner {
      color: #4a4459 !important;
    }

    /deep/ .el-checkbox-button.is-focus .el-checkbox-button__inner {
      border-color: #DCDFE6;
    }

    /deep/ .el-checkbox-button.is-avoided .el-checkbox-button__inner {
      border: 1px dashed #E6A23C;
    }

    /deep/ .el-checkbox-button.is-avoided.is-checked .el-checkbox-button__inner {
      border: 1px dashed #E6A23C;
    }
  }

  .blocked-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    line-height: 28px;
  }

  .blocked-hint {
    color: #909399;
    font-size: 12px;
    margin-left: 6px;
  }

  .birthday-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
  }

  .birthday-hint {
    color: #909399;
    font-size: 12px;
    margin-left: 10px;
  }

  .birthday-countdown {
    margin-left: 10px;
    padding: 1px 8px;
    border-radius: 10px;
    background: #fdf0f4;
    color: #b4557a;
    font-size: 12px;
    line-height: 20px;

    &.is-today {
      background: #f8dfe8;
      color: #9c3f63;
      font-weight: 500;
    }
  }

  .avoided-badge {
    margin-left: 4px;
    padding: 0 4px;
    font-size: 10px;
    line-height: 14px;
    border-radius: 7px;
    background: #FDF6EC;
    color: #E6A23C;
    border: 1px solid #F5DAB1;
  }

  .btn-A {
    background-color: #6750a4;
    color: #FFFFFF;
    border: 1px solid #6750a4;
    border-radius: 16px;
    margin-left: 0;
  }

  .btn-B {
    background-color: #FFFFFF;
    border: 1px solid #d7d3db;
    color: #54515a;
    border-radius: 16px;
    margin-left: 0;
  }
}

</style>
