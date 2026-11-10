<template>
  <div class="app-container" :style="{height:winHeight+'px'}">
    <div class="flex justify-between flex-wrap align-center" ref="refSearch"
         style="margin-bottom: 24px;background-color: #FFFFFF;padding: 12px 24px;">
      <div class="flex align-center">
        <hamburger class="m-r-10" :toggleClick="toggleSideBar" :isActive="sidebar.opened"></hamburger>
        <el-radio-group class="group" v-model="searchForm.type" @change="updateData(true)" size="large">
          <el-radio-button :label="1">床位</el-radio-button>
          <el-radio-button :label="2">疗愈师</el-radio-button>
        </el-radio-group>
      </div>
      <div class="flex align-center flex-wrap">
        <shop-selector v-if="shopList && !isMassagist" v-model="searchForm.shopId" :clearable="false"
                       @change="changeShop" width="160px" :disabled="isMassagist" select-class="shop-select"/>
        <el-input v-show="showCustomerSearch" placeholder="输入客户手机号查找" v-model="searchForm.customerPhone"
                  class="search-cellphone" clearable @clear="updateData" @blur="updateData"
                  suffix-icon="el-icon-search">
        </el-input>
        <el-button v-show="showTodayBtn" :class="['today_btn', { 'not-today': !isToday }]" round @click="initDate">
          今天
        </el-button>
        <el-button v-show="showPrevAndNextDateBtn" class="next_btn" @click="prevDate" icon="el-icon-arrow-left" circle
                   size="medium"></el-button>
        <el-button v-show="showPrevAndNextDateBtn" class="next_btn" @click="nextDate" icon="el-icon-arrow-right" circle
                   size="medium"></el-button>
        <el-date-picker :style="showChangeDateBtn?{}:{'width':'0px'}" :editable="false"
                        :prefix-icon="'null'"
                        class="picker" ref="refPicker"
                        v-model="searchForm.date"
                        type="date" @change="updateData"
                        :clearable="false"
                        :format="'yyyy年MM月dd号'"
                        :value-format="'yyyy-MM-dd'"
                        placeholder="选择日期">
        </el-date-picker>
        <span v-show="showWeek" @click="$refs.refPicker.focus()"
              style="color: #49454F; font-size: 17px">{{ searchForm.date | formatWeek }}</span>

        <div class="avatar-container">
          <el-dropdown @command="handleCommand" trigger="click">
            <div class="avatar-wrapper">
              <img class="user-avatar" :src="avatar">
              <i class="el-icon-caret-bottom"></i>
            </div>
            <el-dropdown-menu class="user-dropdown" slot="dropdown">
              <el-dropdown-item divided @click.native="updatePassword">
                <span style="display:block;">修改密码</span>
              </el-dropdown-item>
              <el-dropdown-item divided @click.native="logout">
                <span style="display:block;">退出登录</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </el-dropdown>
        </div>
      </div>
    </div>
    <div class="content" v-loading="listLoading">
      <reception-div v-show="showPrevAndNextDateBtn" :reception-data="receptionData"></reception-div>
      <div class="scroll-container" ref="refScrollContainer" :style="{height:contentHeight+'px'}">
        <div class="bed-wrapper">
          <div class="bed-item"></div>
          <div v-for="item in dataList" class="bed-item" :style="item.type == 0?{'width':'120px'}:{}"
               v-if="searchForm.type==1">
            <img class="icon" src="@/assets/images/home/bed-reception-zone.png" v-if="item.type == 0"/>
            <img class="icon" src="@/assets/images/home/bed-wet-zone.png" v-if="item.type == 1"/>
            <img class="icon" src="@/assets/images/home/bed-dry-zone.png" v-if="item.type == 2"/>
            <span class="name">{{ item.name }}</span>
            <span v-if="item.type != 0" class="sub-name">{{ item.type == 1 ? '湿' : '干' }}区</span>
          </div>
          <schedules-line v-for="(item,index) in dataList" :massagist-round="getMassagistRound(item.id)"
                          :key="index" :avatar-url="item.avatarUrl" :name="item.name"
                          :order-detail-list="item.orderDetailList" :sort-index="getMassagistSortIndex(item.id)"
                          :schedules-list="item.schedulesList" :massagist-round-count="getMassagistRoundCount(item.id)"
                          class="bed-item" v-if="searchForm.type==2"></schedules-line>
        </div>
        <div class="main-wrapper" ref="refMainWrapper">
          <div class="current-time-line" :style="timelineStyle">
            <div class="time-tag flex">
              <div style="position: absolute;width: 100px;left: -100px" class="flex">
                <div style="flex:1;height:2px;margin-top:-1px;background-color: #FFFFFF"/>
                <div class="time-label">{{ formattedCurrentTime }}</div>
              </div>
            </div>
          </div>
          <div class="time-wrapper">
            <div v-for="item in timeList" class="item">
              <div class="time">{{ item }}</div>
              <div style="margin-top:25px;font-size: 13px">{{ timeListPeople[item] }} 人</div>
            </div>
          </div>
          <div v-for="item in dataList" class="data-item" :data-item-id="item.id" :key="item.id">
            <div class="line-wrapper">
              <div v-for="time in timeList" class="item" :style="item.type == 0?{'width':'120px'}:{}"
                   @click.stop="showAppointment(item,time)"
                   :class="{'grey':(timeGrey(item.schedulesList,time)||(searchForm.type==1 && item.status == 0)||timeGreyNew(time))}">
              </div>
            </div>
            <draggable v-model="item.orderDetailList" @start="onDragStart" @end="onDragEnd"
                       :data-item-id="item.id" :disabled="isMassagist || item.type == 0"
                       class="data-wrapper" group="schedule" animation="300" :scroll="true" chosenClass="check-item"
                       :delay="200" :delayOnTouchStart="true" :touchStartThreshold="5" :forceFallback="true"
                       :fallbackTolerance="3">
              <transition-group>
                <div v-for="detail in item.orderDetailList" :class="['item', { 'completed': detail.state === 2 }]"
                     :style="searchForm.type == 1 ? getStyle(detail, item.type) : getStyle(detail, detail.bedType)"
                     @click.stop="handleItemClick(detail, $event)"
                     @touchstart="handleTouchStart(detail, $event)"
                     @touchend="handleTouchEnd(detail, $event)"
                     :key="detail.id">
                  <div v-if="detail.type != 2">
                    <div class="triangle top-left"
                         :style="{'border-left': detail.order.payType == 3?'15px solid #fdad11':'15px solid #8a6a40',
                                'border-top': detail.order.payType == 3?'15px solid #fdad11':'15px solid #8a6a40'}">
                      <span class="text" v-if="detail.order.payType == 1">程</span>
                      <span class="text" v-else-if="detail.order.payType == 2">券</span>
                      <span class="text" v-else-if="detail.order.payType == 3">团</span>
                      <span class="text" v-else-if="detail.order.payType == 4">现</span>
                      <span class="text" v-else>码</span>
                    </div>
                    <div class="triangle top-right"
                         :style="{'border-right': detail.order.state == 1 || detail.order.state == 2|| detail.order.state == 5|| detail.order.state == 7?'15px solid #e4ffc2':'15px solid #c4c4c4',
                                'border-top': detail.order.state == 1 || detail.order.state == 2|| detail.order.state == 5|| detail.order.state == 7?'15px solid #e4ffc2':'15px solid #c4c4c4'}"></div>
                    <div class="triangle bottom-right"
                         :style="{'border-right': detail.state == 0?'15px solid #7a0000':'15px solid #e4ffc2',
                                'border-bottom': detail.state == 0?'15px solid #7a0000':'15px solid #e4ffc2'}"></div>
                    <div v-show="detail.order && detail.order.id" class="triangle bottom flex align-center"
                         :style="getOrderLabelStyle(detail.order)">
                    <span style="margin-left: 15px;font-size: 12px">
                      <span v-for="(item,index) in detail.order.parts" :key="index">
                        <span v-if="index!=0" style="margin:0 1px">|</span>
                        {{ item }}
                      </span>
                    </span>
                    </div>
                    <div class="flex" style="width: 100%;margin-top: 20px">
                      <div v-if="searchForm.type==1&&detail.massagist!=null" class="flex align-center">
                        <img class="avatar" :src="detail.massagist.avatarUrl"/>
                        <img v-if="detail.specifyType ==1" src="@/assets/images/specify-type-icon.png" height="10"
                             width="10" style="margin-left: -12px;margin-top: -25px"/>
                        <img v-else-if="!detail.isUpdateSort" src="@/assets/images/not-update-sort.png" height="10"
                             width="10" style="margin-left: -12px;margin-top: -25px"/>
                        <div>
                          <div class="username">{{
                              detail.massagist.name.length > 5 ? detail.massagist.name.substring(0, 4) + '...' : detail.massagist.name
                            }}
                          </div>
                          <div class="time">
                            {{ detail.startTime | formatDateTime }}~{{ detail.endTime  | formatDateTime }}
                          </div>
                        </div>
                      </div>
                      <div v-else-if="searchForm.type==1||searchForm.type==2">
                        <div class="flex align-center">
                          <div class="username">{{ detail.projectTitle }}</div>
                          <div class="bedname-tag" v-if="searchForm.type==2">{{ detail.bedName }}</div>
                        </div>
                        <div class="time">
                          <img v-if="detail.specifyType ==1" src="@/assets/images/specify-type-icon.png" height="10"
                               width="10"/>
                          <img v-else-if="!detail.isUpdateSort&&detail.massagist!=null" src="@/assets/images/not-update-sort.png" height="10"
                               width="10"/>
                          {{ detail.startTime | formatDateTime }}~{{ detail.endTime  | formatDateTime }}
                        </div>
                      </div>
                    </div>
                    <div style="margin-top: 5px" class="time">
                      <span v-show="detail.customer.orderCount">【{{ detail.customer.orderCount }}】</span>
                      <span>{{ customerTitle(detail.customer) }}</span>
                      <span>{{ detail.customer.gender == 2 ? '♀' : detail.customer.gender == 1 ? '♂' : '' }}</span>
                      <span v-show="detail.customer.vipLevel">{{ detail.customer.vipLevel }}</span>
                      <span>{{ detail.customer.phone.substr(-4) }}</span>
                    </div>
                    <div class="flex" style="width: 100%;margin-top: 6px">
                      <div style="font-size: 12px">{{ detail.comment }}</div>
                    </div>
                  </div>
                  <div v-else-if="detail.type == 2">
                    <div v-if="searchForm.type==1">
                      <div class="flex justify-center" style="margin-bottom: 10px">
                        <img class="avatar" :src="detail.massagist.avatarUrl"/>
                      </div>
                      <div>
                        <div class="username" style="margin-bottom: 10px">{{
                            detail.massagist.name.length > 5 ? detail.massagist.name.substring(0, 4) + '...' : detail.massagist.name
                          }}
                        </div>
                        <div class="time">
                          {{ detail.startTime | formatDateTime }}~{{ detail.endTime  | formatDateTime }}
                        </div>
                      </div>
                    </div>
                    <div v-else>
                      <div class="flex justify-center" style="margin-bottom: 10px">
                        <img class="avatar" src="@/assets/images/home/bed-reception-zone.png"/>
                      </div>
                      <div class="username flex justify-center" style="margin-bottom: 10px;padding-right: 12px">
                        {{ detail.projectTitle }}
                      </div>
                      <div class="time flex justify-center" style="padding-right: 12px">
                        {{ detail.startTime | formatDateTime }}~{{ detail.endTime  | formatDateTime }}
                      </div>
                    </div>
                    <div class="flex" style="width: 100%;margin-top: 10px;padding-right: 10px">
                      <div style="font-size: 12px">{{ detail.comment }}</div>
                    </div>
                  </div>
                </div>
              </transition-group>
            </draggable>
          </div>
        </div>
      </div>
    </div>
    <pad-order-detail ref="refPadOrderDetail" @submit-success="updateData"></pad-order-detail>
    <appointment-drawer ref="refAppointmentDrawer" @submit-success="updateData"></appointment-drawer>
    <password-form ref="refPasswordForm"></password-form>
    <order-label-dialog ref="refOrderLabelDialog" @submit-success="updateData"></order-label-dialog>
    <reception-drawer ref="refReceptionDrawer" @submit-success="updateData"></reception-drawer>
    <pad-reception-order-detail ref="refPadReceptionOrderDetail"
                                @submit-success="updateData"></pad-reception-order-detail>
    <admin-todo-card :shop-id="searchForm.shopId"></admin-todo-card>
  </div>
</template>

<script>
import shopApi from '../../api/shop/shop'
import orderDetailApi from '@/api/order/orderDetail';
import dateUtil from '@/utils/dateUtil';
import {formatDate} from '@/utils/date';
import {mapGetters} from 'vuex';
import PadOrderDetail from '@/views/home/PadOrderDetail';
import AppointmentDrawer from '@/views/home/AppointmentDrawer';
import draggable from 'vuedraggable';
import orderApi from "@/api/order/order";
import SchedulesLine from "@/views/home/SchedulesLine";
import dayjs from "dayjs";
import PasswordForm from "@/views/layout/components/PasswordForm";
import ReceptionDiv from "@/views/home/ReceptionDiv";
import OrderLabelDialog from "./OrderLabelDialog";
import ReceptionDrawer from "./ReceptionDrawer";
import PadReceptionOrderDetail from "./PadReceptionOrderDetail";
import Hamburger from "../../components/Hamburger";
import ShopSelector from "../shop/shopList/ShopSelector";
import roundScheduleApi from "../../api/roundSchedule"
import AdminTodoCard from "./AdminTodoCard";

export default {
  name: 'board',
  components: {
    ShopSelector,
    Hamburger,
    PadReceptionOrderDetail,
    ReceptionDrawer,
    OrderLabelDialog,
    ReceptionDiv,
    SchedulesLine,
    AppointmentDrawer,
    PadOrderDetail,
    draggable,
    PasswordForm,
    AdminTodoCard
  },
  data() {
    return {
      searchForm: {
        shopId: '',
        date: '',
        type: 1
      },
      timeList: [],
      timeListPeople:[],
      receptionData: null,
      dataList: [],
      currentTime: new Date(),
      timer: null,
      isDragging: false,
      lastMouseX: 0,
      lastMouseY: 0,
      dragOffsetX: 0,
      dragOffsetY: 0,
      touchStartTime: 0,
      touchStartX: 0,
      touchStartY: 0,
      clickPending: false,
      winHeight: window.innerHeight,
      winWidth: window.innerWidth,
      contentHeight: window.innerHeight,
      massagistRound: [],
      listLoading: true,
      shopEndTime:'22:00'
    }
  },
  created() {
    // 设备宽：1174px 高：693px
    //alert('当前窗口宽度：' + window.innerWidth + '' + '当前窗口高度：' + window.innerHeight)
    this.initData()
    this.$store.dispatch('setShopAllList')
  },
  mounted() {
    this.updateTime();
    this.timer = setInterval(() => {
      let date = new Date();
      if (date.getSeconds() == 0) {
        this.fetchData();
      }
    }, 1000);
    this.handleResize()
    // 添加位置跟踪
    document.addEventListener('mousemove', this.trackPosition);
    document.addEventListener('touchmove', this.trackPosition, {passive: false});
    document.addEventListener('touchstart', this.handleGlobalTouchStart, {passive: true});
    // document.addEventListener('selectstart', this.preventSelect, {passive: false});
    document.addEventListener('contextmenu', this.preventSelect, {passive: false});
    window.addEventListener('resize', this.handleResize);
  },
  beforeDestroy() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    document.removeEventListener('mousemove', this.trackPosition);
    document.removeEventListener('touchmove', this.trackPosition);
    document.removeEventListener('touchstart', this.handleGlobalTouchStart);
    // document.removeEventListener('selectstart', this.preventSelect);
    document.removeEventListener('contextmenu', this.preventSelect);
    window.removeEventListener('resize', this.handleResize);
  },
  computed: {
    ...mapGetters(['shopId', 'avatar', 'roles', 'massagistId', 'sidebar', 'shopList']),
    isToday() {
      return this.searchForm.date === dateUtil.getCurrentDateCode();
    },
    formattedCurrentTime() {
      if (!this.currentTime || isNaN(new Date(this.currentTime))) {
        return '';
      }
      return formatDate(new Date(this.currentTime), 'hh:mm');
    },
    timelineStyle() {
      if (this.timeList.length === 0 || !this.dataList || this.dataList.length === 0) {
        return {display: 'none'};
      }
      const now = this.currentTime;
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const firstTime = String(this.timeList[0] || '').split(':');
      const firstHour = parseInt(firstTime[0]);
      const firstMinute = parseInt(firstTime[1]);
      if (isNaN(firstHour) || isNaN(firstMinute)) {
        return {display: 'none'};
      }

      const totalMinutes = (hours - firstHour) * 60 + (minutes - firstMinute);
      const top = (totalMinutes / 15) * 80 + 8;

      if (top < 8 || this.searchForm.date !== dateUtil.getCurrentDateCode()) {
        return {display: 'none'};
      }

      const lastTimeStr = this.timeList[this.timeList.length - 1].split(':');
      const lastHour = parseInt(lastTimeStr[0]);
      const lastMinute = parseInt(lastTimeStr[1]);
      const endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), lastHour, lastMinute);
      if (now > endTime) {
        return {display: 'none'};
      }

      const lineWidth = this.searchForm.type == 1 ? this.dataList.length * 160 - 46 : this.dataList.length * 160;

      return {
        position: 'absolute',
        top: `${top}px`,
        left: '66px',
        width: `${lineWidth}px`,
        height: '1px',
        backgroundColor: '#1D1B20',
        zIndex: 3
      };
    },
    timeGreyNew(){
      return (time)=>{
        const date1 = new Date("2026-05-01 "+time+":00");
        const date2 = new Date("2026-05-01 "+this.shopEndTime+":00");

        if(date1 >= date2&&this.searchForm.type==1){
         // if(time=="22:00"||time=="22:15"||time=="22:30"||time=="22:45"||time=="23:00"||time=="23:15"||time=="23:30"){
              return true;
         // }
        }
      }
    },
    timeGrey() {

      return (schedulesList, time) => {
        if (schedulesList) {
          let index = schedulesList.findIndex(e => {

            const start = dayjs(e.startTime, 'HH:mm:ss');
            const end = dayjs(e.endTime, 'HH:mm:ss');
            const checkTime = dayjs(time, 'HH:mm');
            let check = (checkTime.isAfter(start) || checkTime.isSame(start)) &&
              (checkTime.isBefore(end));
            return check;
          })
          return index < 0;
        }
      }
    },
    isMassagist() {
      return this.roles.filter(s => s == '疗愈师').length > 0
    },
    showShopSelector() {
      return this.winWidth >= 515
    },
    showCustomerSearch() {
      return this.winWidth >= 1135
    },
    showTodayBtn() {
      return this.winWidth >= 640
    },
    showPrevAndNextDateBtn() {
      return this.winWidth >= 755
    },
    showChangeDateBtn() {
      return this.winWidth >= 885
    },
    showWeek() {
      return this.winWidth >= 550
    },
    getMassagistRound() {
      console.log('getMassagistRound++++++++++++++');
      return (massagistId) => {
        if (this.massagistRound && this.massagistRound.length) {
          return (this.massagistRound.find(s => massagistId == s.massagistId) || {round: ''}).round
        }
        return ''
      }
    },
    getMassagistRoundCount() {
      return (massagistId) => {
        if (this.massagistRound && this.massagistRound.length) {
          return (this.massagistRound.find(s => massagistId == s.massagistId) || {roundCount: ''}).roundCount
        }
        return ''
      }
    },
    getMassagistSortIndex() {
      return (massagistId) => {
        if (this.massagistRound && this.massagistRound.length) {
          let sortIndex = this.massagistRound.findIndex(s => massagistId == s.massagistId)
          return ++sortIndex
        }
        return null
      }
    },
  },
  methods: {
    hasShopId() {
      const id = this.searchForm.shopId
      return id !== null && id !== undefined && id !== '' && id !== 'null' && !isNaN(Number(id))
    },
    async fetchShopTimeList() {
      if (!this.hasShopId()) return
      const resendtime = await shopApi.timeShopEnd(this.searchForm.shopId)
      console.log("resendtime======================")
      console.log(resendtime.data)
      this.shopEndTime = resendtime.data;
      const res = await shopApi.timeList(this.searchForm.shopId)

      console.log(this.searchForm)
      const resNew = await shopApi.timeListNew(this.searchForm.shopId,this.searchForm.date)//获取人数和时间
      console.log("resNew-------------------------")
      console.log(resNew)
      this.timeList = res.data || []
      this.timeListPeople = resNew.data || []
    },
    async fetchReceptionData() {
      if (!this.hasShopId()) return
      const res = await shopApi.getReceptionData(this.searchForm.shopId)
      this.receptionData = res.data
    },

    getStyle(item, type) {
      if (!item.startTime || !item.duration) {
        return {display: 'none'};
      }

      // 一个格子高度是80px，一个时间段15分钟
      const height = (item.duration / 15) * 80 - 16; // 16px为上下间距

      let startTime = dateUtil.format(item.startTime, 'HH:mm');
      if (!startTime || typeof startTime !== 'string') {
        return {display: 'none'};
      }
      const timeList = this.timeList || [];
      if (!timeList.length) {
        return {display: 'none'};
      }
      let index = timeList.findIndex(t => t === startTime);

      // 如果找不到精确匹配，尝试找到最接近的时间段
      if (index < 0) {
        const startHour = parseInt(startTime.split(':')[0]);
        const startMinute = parseInt(startTime.split(':')[1]);

        for (let i = 0; i < timeList.length; i++) {
          const timeHour = parseInt(timeList[i].split(':')[0]);
          const timeMinute = parseInt(timeList[i].split(':')[1]);

          if (timeHour > startHour || (timeHour === startHour && timeMinute >= startMinute)) {
            index = i;
            break;
          }
        }

        if (index < 0) index = 0;
      }

      // 计算精确位置：基础位置 + 分钟偏移
      const baseTop = 80 * index + 8;
      const startMinutes = parseInt(startTime.split(':')[1]);
      const slotTime = timeList[index] || '';
      const timeSlotMinutes = parseInt(slotTime.split(':')[1]) || 0;
      const minuteOffset = (startMinutes - timeSlotMinutes) * (80 / 15); // 15分钟一个单位

      const marginTop = baseTop + minuteOffset;

      // 检测重叠并计算水平偏移
      const {leftOffset, width, zIndex} = this.calculateOverlapOffset(item, type);

      const style = {
        height: height + 'px',
        top: marginTop + 'px',
        left: leftOffset + 'px',
        width: width + 'px',
        backgroundColor: type === 1 ? '#EADDFF' : type === 2 ? '#FFECD9' : '#85603B',
        color: type === 1 ? '#4F378A' : type === 2 ? '#C14E05' : '#FFF',
        zIndex: zIndex
      };
      return style;
    },
    calculateOverlapOffset(currentItem, type) {
      // 找到当前项所属的床位/疗愈师数据
      let currentBedData = null;
      for (let bed of this.dataList) {
        if (bed.orderDetailList && bed.orderDetailList.find(order => order.id === currentItem.id)) {
          currentBedData = bed;
          break;
        }
      }

      if (!currentBedData) {
        return {leftOffset: 16, width: type == 0 ? 88 : 128, zIndex: 1};
      }

      // 获取当前项的时间范围
      const currentStart = new Date(`2000-01-01 ${dateUtil.format(currentItem.startTime, 'HH:mm:ss')}`);
      const currentEnd = new Date(currentStart.getTime() + currentItem.duration * 60000);

      // 找到所有重叠的项目
      const overlappingItems = currentBedData.orderDetailList.filter(otherItem => {
        if (otherItem.id === currentItem.id) return true;

        const otherStart = new Date(`2000-01-01 ${dateUtil.format(otherItem.startTime, 'HH:mm:ss')}`);
        const otherEnd = new Date(otherStart.getTime() + otherItem.duration * 60000);

        // 检查时间是否重叠
        return (currentStart < otherEnd && currentEnd > otherStart);
      });

      // 如果没有重叠，返回默认值
      if (overlappingItems.length <= 1) {
        return {leftOffset: 16, width: type == 0 ? 88 : 128, zIndex: 1};
      }

      // 按开始时间排序重叠项目
      overlappingItems.sort((a, b) => {
        const aStart = new Date(`2000-01-01 ${dateUtil.format(a.startTime, 'HH:mm:ss')}`);
        const bStart = new Date(`2000-01-01 ${dateUtil.format(b.startTime, 'HH:mm:ss')}`);
        return aStart - bStart;
      });

      // 找到当前项在重叠项目中的索引
      const currentIndex = overlappingItems.findIndex(item => item.id === currentItem.id);
      const totalOverlapping = overlappingItems.length;

      // 计算每个项目的宽度和偏移
      const baseWidth = type == 0 ? 88 : 128;
      const baseOffset = 16;
      const overlapOffset = 30; // 每个重叠项目的水平偏移

      // 调整宽度以适应重叠显示
      const adjustedWidth = Math.max(60, baseWidth - (totalOverlapping - 1) * 15);
      const leftOffset = baseOffset + (currentIndex * overlapOffset);
      const zIndex = currentIndex + 1;

      return {leftOffset, width: adjustedWidth, zIndex};
    },
    initData() {
      this.searchForm.shopId = this.shopId
      this.searchForm.date = dateUtil.getCurrentDateCode()
      this.searchForm.type = 1
      if (!this.hasShopId()) {
        // 账号没有门店范围时不要用 null 调接口，等用户选择门店后再加载
        this.dataList = []
        return
      }
      this.fetchShopTimeList()
      this.fetchData()
    },
    initDate() {
      const currentDate = dateUtil.getCurrentDateCode()
      if (this.searchForm.date == currentDate) {
        return
      }
      this.searchForm.date = currentDate
      this.updateData()
    },
    prevDate() {
      this.searchForm.date = dateUtil.subtractDay(this.searchForm.date, 1)
      this.updateData(true)
    },
    nextDate() {
      this.searchForm.date = dateUtil.addDay(this.searchForm.date, 1, 'YYYY-MM-DD');
      this.updateData(true)
    },
    async fetchData() {
      await this.updateData()
      this.updateTime();
      this.fetchReceptionData()
    },
    async updateData(showloading = false) {
      if (!this.hasShopId()) return
      if (showloading){
        this.listLoading = true
        if (this.winWidth < 1600){
          this.dataList = []
        }
      }
      try {
        let res = await orderDetailApi.schedulingMap(this.searchForm)
        console.log("res--------------")
        console.log(res)
        this.dataList = res.data || []
        console.log(this.dataList)
        if (this.searchForm.type == 2) {
          this.fetchMassagistRound()
        }
      } finally {
        this.listLoading = false
      }
      this.fetchShopTimeList()
    },
    async openDetail(orderDetail) {
      this.$refs.refPadOrderDetail.open(orderDetail)
    },
    async openReceptionDetail(orderDetail) {
      this.$refs.refPadReceptionOrderDetail.open(orderDetail)
    },
    handleItemClick(detail, event) {
      if (this.isDragging) {
        this.isDragging = false;
        return
      }
      if (this.isMassagist) {
        if (detail.type != 2 && this.massagistId == detail.massagistId) {
          this.openAddOrderLabelDialog(detail.order)
        }
        return
      }
      if (detail.type == 2) {
        this.openReceptionDetail(detail)
        return
      }
      this.openDetail(detail);
    },
    handleTouchStart(detail, event) {
      console.log("detail+++++++++++++++");
      event.preventDefault();
      this.touchStartTime = Date.now();
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
      this.clickPending = true;
    },
    handleTouchEnd(detail, event) {
      console.log("end+++++++++++++++");
      const touchDuration = Date.now() - (this.touchStartTime || 0);
      const touchEndX = event.changedTouches[0].clientX;
      const touchEndY = event.changedTouches[0].clientY;
      const moveDistance = Math.sqrt(Math.pow(touchEndX - this.touchStartX, 2) + Math.pow(touchEndY - this.touchStartY, 2));

      if (this.clickPending && !this.isDragging && touchDuration < 200 && moveDistance < 5) {
        setTimeout(() => {
          if (!this.isDragging) {
            this.handleItemClick(detail);
          }
        }, 50);
      }
      this.clickPending = false;
    },
    formatDateTime(timeStr) {
      if (timeStr) {
        return dateUtil.format(timeStr, 'HH:mm');
      }
      return ''
    },
    updateTime() {
      this.currentTime = new Date();
      this.scrollToCurrentTime();
    },
    scrollToCurrentTime() {
      this.$nextTick(() => {
        if (this.$refs.refScrollContainer && this.timelineStyle.display !== 'none' && !this.isDragging) {
          const top = parseFloat(this.timelineStyle.top);
          this.$refs.refScrollContainer.scrollTop = top - (this.$refs.refScrollContainer.clientHeight / 8);
        }
      });
    },
    async showAppointment(item, time) {
      if(this.timeGreyNew(time)){
        return
      }
      if ((this.searchForm.type == 2 && this.timeGrey(item.schedulesList, time) || (this.searchForm.type == 1 && item.status == 0))) {
        return
      }

      //疗愈师权限不允许新建
      if (this.isMassagist) {
        return
      }

      //已存在信息的时间段不会触发预约
      if (item.orderDetailList && item.orderDetailList.length > 0 && item.orderDetailList.findIndex(e => {
        let startTime = this.formatDateTime(e.startTime);
        let endTime = this.formatDateTime(e.endTime);
        return startTime <= time && endTime > time
      }) > -1) {
        return
      }
      let res = await orderApi.bookingDates(this.searchForm.date, this.searchForm.shopId)
      let dateToBeSelected = res.data || []
      if (dateToBeSelected.findIndex(e => e.value == this.searchForm.date) < 0) {
        this.notifyWarning("当前日期无排班，不允许预约")
      } else {
        let form = {date: this.searchForm.date, time};
        let params = {type: this.searchForm.type, projectType: item.type, name: item.name};
        console.log("params");
        console.log(params);
        console.log(item.type);
        if (item.type == 0) {
          this.$refs.refReceptionDrawer.open(form, params)
        } else {
          this.$refs.refAppointmentDrawer.open(form, params)
        }
      }
    },
    onDragStart(evt) {
      // 检查是否为已完成状态的订单
      // if (evt.item && evt.item.classList.contains('completed')) {
      //   evt.preventDefault();
      //   return false;
      // }

      this.isDragging = true;
      this.clickPending = false;

      // 记录拖拽元素和鼠标的相对偏移
      const draggedElement = evt.item;
      if (draggedElement && evt.originalEvent) {
        const rect = draggedElement.getBoundingClientRect();
        let clientX, clientY;

        if (evt.originalEvent.touches && evt.originalEvent.touches[0]) {
          clientX = evt.originalEvent.touches[0].clientX;
          clientY = evt.originalEvent.touches[0].clientY;
        } else {
          clientX = evt.originalEvent.clientX || 0;
          clientY = evt.originalEvent.clientY || 0;
        }

        // 计算鼠标相对于元素左上角的偏移
        this.dragOffsetX = clientX - rect.left - 16;
        this.dragOffsetY = clientY - rect.top - 8;

        this.lastMouseX = clientX;
        this.lastMouseY = clientY;
      }
    },
    async onDragEnd(evt) {
      const {from, to, newIndex} = evt;
      const mainWrapper = this.$refs.refMainWrapper;
      if (!mainWrapper) {
        this.isDragging = false;
        this.updateData();
        return;
      }

      // 计算元素左上角位置（减去鼠标偏移）
      let elementX = this.lastMouseX - (this.dragOffsetX || 0);
      let elementY = this.lastMouseY - (this.dragOffsetY || 0);

      // 临时隐藏拖拽元素以获取底层元素
      const draggingItems = document.querySelectorAll('.sortable-chosen, .sortable-ghost');
      draggingItems.forEach(item => item.style.display = 'none');

      const targetElement = document.elementFromPoint(elementX, elementY);

      // 恢复拖拽元素显示
      draggingItems.forEach(item => item.style.display = '');

      const dataItem = targetElement ? targetElement.closest('.data-item') : null;

      if (!dataItem) {
        this.isDragging = false;
        this.updateData();
        return;
      }

      // 获取目标床位ID
      const newBedId = dataItem.dataset.itemId;

      // 计算时间位置 - 基于元素左上角位置
      const mainRect = mainWrapper.getBoundingClientRect();
      const scrollTop = mainWrapper.scrollTop;
      const relativeY = elementY - mainRect.top + scrollTop; // 减去顶部边距

      // 每个格子80px高度，计算时间索引
      const timeIndex = Math.max(0, Math.min(Math.floor(relativeY / 80), this.timeList.length - 1));

      const newTime = this.timeList[timeIndex] || this.timeList[0];

      // 查找源数据
      let bedId = to.dataset.itemId;
      if (!bedId) {
        let parent = to.closest('.data-item');
        if (parent) bedId = parent.dataset.itemId;
      }

      const sourceData = this.dataList.find(d => d.id == bedId);
      const sourceItem = sourceData && sourceData.orderDetailList[newIndex];
      if (!sourceItem || !newBedId) {
        this.isDragging = false;
        return;
      }
      // 查找源数据
      let fromItemId = from.dataset.itemId;
      if (!fromItemId) {
        let parent = from.closest('.data-item');
        if (parent) fromItemId = parent.dataset.itemId;
      }

      // 验证是否移动，并显示确认弹框
      const targetBed = this.dataList.find(d => d.id == newBedId);
      if ((fromItemId != 0 && targetBed.name == '接待') || (fromItemId == 0 && targetBed.name != '接待')) {
        this.isDragging = false
        this.updateData()
        return
      }
      let confirmMessage = `确认将订单调整到 ${targetBed ? targetBed.name : '目标床位'} 的 ${newTime} 时间段吗？`;
      const oldItemTime = dayjs(sourceItem.startTime).format('HH:mm:ss')
      const newItemTime = dayjs(newTime, 'HH:mm').format('HH:mm:ss');
      const changeTime = oldItemTime != newItemTime
      const changeBed = (this.searchForm.type === 1 && newBedId != sourceItem.bedId) || (this.searchForm.type === 2 && newBedId != sourceItem.massagistId)
      let message = ''
      if (sourceItem.specifyType == 1 && targetBed.phone) {
        // 调整疗愈师
        message = '本单已指定疗愈师，'
      }
      if (changeBed && changeTime) {
        confirmMessage = message + `确认将订单调整到 ${targetBed ? targetBed.name : '目标床位'} 的 ${newTime} 时间段吗？`;
      } else if (changeBed) {
        confirmMessage = message + `确认将订单调整到 ${targetBed ? targetBed.name : '目标床位'} 吗？`;
      } else if (changeTime) {
        confirmMessage = `确认将订单调整到 ${newTime} 时间段吗？`;
      } else {
        this.isDragging = false;
        return
      }
      this.$confirm(confirmMessage, '确认调整', {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        try {
          console.log("sourceItem.id")
          console.log(sourceItem.id)
          console.log(this.searchForm)
          await orderDetailApi.updateOrderDetail({
            id: sourceItem.id,
            bedId: this.searchForm.type === 1 ? newBedId : null,
            massagistId: this.searchForm.type === 1 ? null : newBedId,
            startTime: `${this.searchForm.date} ${newTime}:00`
          });
          await this.updateData();
          this.$message.success('调整成功');
        } catch (error) {
          this.$message.error('保存失败，请重试');
          await this.updateData();
        }
      }).catch(() => {
        // 取消时刷新数据恢复原状态
        this.updateData();
      });

      this.isDragging = false;
    },
    trackPosition(e) {
      // 优先使用触摸事件的坐标
      if (e.touches && e.touches[0]) {
        this.lastMouseX = e.touches[0].clientX;
        this.lastMouseY = e.touches[0].clientY;
      } else if (e.changedTouches && e.changedTouches[0]) {
        this.lastMouseX = e.changedTouches[0].clientX;
        this.lastMouseY = e.changedTouches[0].clientY;
      } else if (e.clientX !== undefined && e.clientY !== undefined) {
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
      }

      // 防止拖拽时的默认行为
      if (this.isDragging && e.preventDefault) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    handleGlobalTouchStart(e) {
      this.touchStartTime = Date.now();
    },
    preventSelect(e) {
      if (e.target.closest('.data-wrapper') || e.target.closest('.item')) {
        e.preventDefault();
        return false;
      }
    },
    handleCommand(command) {
      if (command === 'logout') {
        this.logout();
      }
    },
    updatePassword() {
      this.$refs.refPasswordForm.open();
    },
    logout() {
      this.$store.dispatch('LogOut').then(() => {
        location.reload();
      });
    },
    customerTitle(customer) {
      if (!customer) {
        return
      }
      const {comment, nickname, phone} = customer
      if (comment) {
        return comment
      }
      if (nickname && nickname == '用户' + phone) {
        return null
      }
      return nickname
    },
    openAddOrderLabelDialog(order) {
      if (!order.id) {
        return
      }
      this.$refs.refOrderLabelDialog.open({orderId: order.id, oil: order.oil, parts: order.parts})
    },
    getOrderLabelStyle(order) {
      if (!order.id) {
        return
      }
      let bgColor = ''
      let color = '#fff'
      if (order.oil == '花') {
        bgColor = 'linear-gradient(to right, #9d8bb6, #f2d8de)'
      } else if (order.oil == '柚') {
        bgColor = 'linear-gradient(to right, #eeb046, #faedc7)'
      } else if (order.oil == '竺') {
        bgColor = 'linear-gradient(to right, #b1d02a, #e5efcb)'
      } else if (order.oil == '森') {
        bgColor = 'linear-gradient(to right, #2a4824, #5c411f)'
      } else if (order.oil == '无') {
        bgColor = 'linear-gradient(to right, #a6a6a6, #ffffff)'
      } else if (order.oil == '花*') {
        bgColor = 'linear-gradient(to right, #f2d8de, #9d8bb6)'
      }else if (order.oil == '果*') {
        bgColor = 'linear-gradient(to right, #faedc7, #eeb046)'
      }else if (order.oil == '草*') {
        bgColor = 'linear-gradient(to right, #e5efcb, #b1d02a)'
      }else if (order.oil == '木*') {
        bgColor = 'linear-gradient(to right, #5c411f, #2a4824)'
      }else if (order.oil == '茶*') {
        bgColor = 'linear-gradient(to right, #6C8149, #D3D3D3)'
      } else {
        color = '#303133'
      }
      return {
        width: '100%',
        height: '30px',
        background: bgColor,
        color: color,
        zIndex: -1
      }
    },
    handleResize() {
      this.winHeight = window.innerHeight
      this.$nextTick(() => {
        this.contentHeight = window.innerHeight - this.$refs.refSearch.offsetHeight - 60
      })
      this.winWidth = window.innerWidth
    },
    toggleSideBar() {
      this.$store.dispatch('ToggleSideBar')
    },
    async fetchMassagistRound() {
      const res = await roundScheduleApi.findMassagistRound(this.searchForm)
      this.massagistRound = res.data || []
    },
    changeShop() {
      this.fetchShopTimeList()
      this.fetchData()
    },
  },
  filters: {
    formatDateTime(timeStr) {
      if (timeStr) {
        return dateUtil.format(timeStr, 'HH:mm');
      }
      return ''
    },
    formatWeek(date) {
      if (date) {
        let weekNumber = dateUtil.formatWeek(date);
        const weekMap = {0: '周日', 1: '周一', 2: '周二', 3: '周三', 4: '周四', 5: '周五', 6: '周六'}
        return weekMap[weekNumber];
      }
      return ''
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.app-container {
  background-color: #f7f2fa;
  padding: 0 0 24px;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -moz-user-select: none;
  -ms-user-select: none;
  overflow-y: hidden;

  .group /deep/ .el-radio-button__inner {
    padding: 12px 37.5px;
    color: #1D1B20;
  }

  .group /deep/ .el-radio-button:first-child .el-radio-button__inner {
    border-top-left-radius: 24px;
    border-bottom-left-radius: 24px;
    box-shadow: none !important;
  }

  .group /deep/ .el-radio-button__inner:hover {
    color: #1D1B20;
  }

  .group /deep/ .el-radio-button:not(:last-child) .el-radio-button__inner {
    border-right: 0;
  }

  .group /deep/ .el-radio-button:last-child .el-radio-button__inner {
    border-top-right-radius: 24px;
    border-bottom-right-radius: 24px;
    padding: 12px 30.5px;
  }

  .group /deep/ .el-radio-button__orig-radio:checked + .el-radio-button__inner {
    background-color: #e8def8;
    box-shadow: -1px 0 0 0 #e8def8
  }

  .group /deep/ .el-radio-button__orig-radio:checked + .el-radio-button__inner:hover {
    color: #4A4459;
  }

  .group /deep/ .el-radio-button__inner {
    border: 1px solid #79747e;
  }

  .group /deep/ .el-radio-button__orig-radio:checked + .el-radio-button__inner {
    color: #4A4459;
    font-weight: 500;
  }

  .shop-select {
    /deep/ .el-input__inner {
      border-radius: 20px;
    }
  }

  .search-cellphone {
    width: 200px;
    margin-left: 16px;

    /deep/ .el-input__inner {
      border-radius: 20px;
    }
  }

  .today_btn {
    background-color: #6750a4;
    color: #FFFFFF;
    margin-left: 16px;

    &.not-today {
      background-color: #FFFFFF;
      color: #000000;
      border: 1px solid #dcdfe6;
    }
  }

  .next_btn {
    background-color: #eaddff;
    color: #4F378A;
    border-color: #eaddff;
    margin-left: 16px;

    /deep/ .el-icon-arrow-left, /deep/ .el-icon-arrow-right {
      color: #4F378A;
      font-size: 18px;
      font-weight: 700;
    }
  }

  .picker {
    margin-left: 16px;
    width: 131px;
    font-size: 17px;
    font-weight: 600;
    color: #49454F;
  }

  .picker /deep/ .el-input__inner {
    border: 0 !important;
    padding: 0;
  }

  .picker /deep/ .el-input--suffix .el-input__inner {
    padding: 0;
  }

  .picker /deep/ .el-input--prefix .el-input__inner {
    padding: 0;
  }

  .avatar-container {
    height: 50px;
    display: inline-block;
    margin-left: 10px;

    .avatar-wrapper {
      cursor: pointer;
      margin-top: 5px;
      position: relative;

      .user-avatar {
        width: 40px;
        height: 40px;
        border-radius: 10px;
      }

      .el-icon-caret-bottom {
        position: absolute;
        right: -20px;
        top: 18px;
        font-size: 12px;
      }
    }
  }

  .content {
    background-color: #fff;
    border-radius: 16px;
    width: calc(96vw - 11px);
    overflow: auto;
    margin-left: 24px;
    border: 1px solid #0000001A;
    box-sizing: border-box;

    @media (max-width: 1440px) {
      width: calc(100vw - 8px);
      max-width: calc(100vw - 8px);
    }

    @media (min-width: 1600px) {
      width: fit-content;
    }
  }

  .scroll-container {
    overflow: auto;
    @media (max-width: 1440px) {
      .bed-wrapper,
      .main-wrapper {
        min-width: max-content;
      }
    }
  }

  .bed-wrapper {
    min-width: max-content;
    top: 0;
    z-index: 10;
    position: sticky;
    display: flex;
    box-shadow: 0px 4px 4px 0px #5842191A;
    border-top-left-radius: 16px;
    border-top-right-radius: 16px;
    background-color: #ffffff;

    .bed-item {
      width: 160px;
      height: 80px;
      border-right: 1px solid #eed;
      display: flex;
      justify-content: center;
      align-items: center;
      flex-shrink: 0;

      &:first-child {
        width: 60px;
        position: sticky;
        left: 0;
        top: 0;
        z-index: 10;
        background-color: #ffffff;
        border-right: 1px solid #eed;
      }

      .icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        margin-right: 10px;
        border: 1px solid #0000001A;
      }

      .name {
        color: #49454F;
        font-weight: 500;
        font-size: 18px;
      }

      .sub-name {
        font-size: 14px;
        color: #00000073;
        margin-left: 5px;
      }
    }
  }

  .main-wrapper::-webkit-scrollbar {
    width: 0 !important; /* Chrome, Safari, Edge */
  }

  .current-time-line {
    display: flex;
    align-items: center;

    .time-tag {
      position: sticky;
      left: 100px;

      .time-label {
        transform: translateY(-50%);
        background-color:rgba(0, 0, 0, 0.5);
        //background-color: #1D1B20;
        color: white;
        padding: 4px 8px;
        border-radius: 4px 0 0 4px;
        font-size: 14px;
        margin-right: 46px;

        &::after {
          content: '';
          position: absolute;
          left: 100%;
          top: 50%;
          transform: translateY(-50%);
          width: 0;
          height: 0;
          border-top: 12px solid transparent;
          border-bottom: 12px solid transparent;
          //border-left: 12px solid #1D1B20;
          border-left: 12px solid rgba(0, 0, 0, 0.5);
        }
      }
    }


  }

  .main-wrapper {
    min-width: max-content;
    overflow: visible;
    padding-bottom: 10px;
    position: relative;
    display: flex;
    box-sizing: border-box;
    background-color: #ffffff;
    padding-top: 10px;
    // box-sizing: border-box;
    // position: relative;
    // padding-top: 16px;
    // border-top: 1px solid #0000001A;
    .data-item {
      position: relative;
      flex-shrink: 0;

      .line-wrapper {
        display: flex;
        justify-items: center;
        flex-direction: column;

        .grey {
          background-color: #f8f8f8 !important;
        }

        .item {
          width: 160px;
          height: 80px;
          border-bottom: 1px solid #eed;
          border-right: 1px solid #eed;

          &:first-child {
            border-top: 1px solid #eed;
          }
        }
      }

      .data-wrapper {
        position: absolute;
        top: 0;
        left: 0;
        display: flex;
        justify-items: center;
        flex-direction: column;
        user-select: none !important;
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        -webkit-touch-callout: none !important;
        -webkit-tap-highlight-color: transparent !important;
        touch-action: pan-y;

        &::selection {
          background: transparent !important;
        }

        * {
          user-select: none !important;
          -webkit-user-select: none !important;
          -webkit-touch-callout: none !important;
          -webkit-tap-highlight-color: transparent !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;

          &::selection {
            background: transparent !important;
          }
        }

        .item {
          padding: 12px 0 0 12px;
          position: absolute;
          border-radius: 8px;
          cursor: grab;
          touch-action: none;
          user-select: none !important;
          -webkit-user-select: none !important;
          -webkit-touch-callout: none !important;
          -webkit-tap-highlight-color: transparent !important;
          -webkit-user-drag: none;
          -khtml-user-drag: none;
          -moz-user-drag: none;
          -o-user-drag: none;
          min-height: 44px;
          will-change: transform;
          -webkit-text-size-adjust: none;
          box-sizing: border-box;
          // 堆叠需要边框区别显示
          border: 1px solid rgba(0, 0, 0, 0.1);

          &:active {
            cursor: grabbing;
            transform: scale(0.98);
            transition: transform 0.1s ease;
          }

          &::before {
            border-top: 1px solid #eed;
          }

          .avatar {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            margin-right: 8px;
          }

          .username {
            font-size: 15px;
            font-weight: 500;
            user-select: none !important;
            -webkit-user-select: none !important;
          }

          .time {
            font-size: 12px;
            margin-top: 2px;
            user-select: none !important;
            -webkit-user-select: none !important;
          }

          .bedname-tag {
            font-size: 14px;
            font-weight: 500;
            border: 1px solid;
            padding: 2px 4px;
            border-radius: 4px;
            margin-left: 8px;
            user-select: none !important;
            -webkit-user-select: none !important;
          }

          .triangle {
            position: absolute;
            width: 0;
            height: 0;
          }

          .top-left {
            top: 0;
            left: 0;
            border-right: 15px solid transparent;
            border-bottom: 15px solid transparent;
            border-radius: 8px 0 0 0;

            .text {
              position: absolute;
              bottom: 0px;
              right: 0px;
              color: #FFFFFF;
              font-size: 12px;
            }
          }

          .top-right {
            top: 0;
            right: 0;
            border-left: 15px solid transparent;
            border-bottom: 15px solid transparent;
            border-radius: 0 8px 0 0;
          }

          .bottom-right {
            bottom: 0;
            right: 0;
            border-right: 15px solid red;
            border-bottom: 15px solid red;
            border-left: 15px solid transparent;
            border-top: 15px solid transparent;
            border-radius: 0 0 8px 0;
          }

          .bottom {
            bottom: 0;
            right: 0;
            border-radius: 0 0 8px 8px;
          }
        }

        .check-item {
          box-shadow: 0px 4px 4px 0px #0000004D, 0px 8px 12px 6px #00000026;
        }

        .completed {
          cursor: pointer !important;
          opacity: 0.6;

          &:active {
            cursor: pointer !important;
          }
        }

        .status {
          border-bottom-left-radius: 8px;
          border-top-right-radius: 8px;
          padding: 2px 6px;
          font-size: 12px;

          &.red {
            background-color: #FDD3D0;
            color: #900B09;
          }

          &.grey {
            background-color: #eee;
            color: #9a9a9a;
          }

          &.green {
            background-color: #CFF7D3;
            color: #02542D;
          }

          &.white {
            background-color: #F5F5F5;
            color: #1E1E1E;
          }

          &.yellow {
            background-color: #E8B931;
            color: #401B01;
          }
        }
      }
    }


    .time-wrapper {
      position: sticky;
      left: 0;
      z-index: 2;
      background-color: #ffffff;
      width: 60px;
      display: flex;
      align-items: center;
      flex-direction: column;
      border-right: 1px solid #eed;
      height: fit-content;
      flex-shrink: 0;

      .item {
        height: 80px;
        text-align: right;
        box-sizing: border-box;
        margin-right: 4px;

        &::first-child {
          margin-top: 8px;
        }

        .time {
          margin-top: -8px;
          box-sizing: border-box;
          color: #49454F;
          font-size: 12px;
        }
      }
    }
  }

}
</style>
