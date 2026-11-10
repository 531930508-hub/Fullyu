<template>
  <el-popover v-if="shop"
              placement="bottom"
              title=""
              width="330"
              trigger="click">
    <div class="flex align-center">
      <img class="icon" :src="avatarUrl" mode="aspectFill"/> <span style="font-size: 16px">{{ name }}</span>
    </div>
    <div style="background-color: #f5f4f4;margin-top: 10px;border-radius: 4px" class="flex">
      <template v-for="(item,index) in schedulesList">
        <div v-if="getWidth(index==0?shop.clockInTime:schedulesList[index-1].endTime,item.startTime)" content=""
             :style="`width:${getWidth(index==0?shop.clockInTime:schedulesList[index-1].endTime,item.startTime)}%`"
             style="display: inline-block;height: 20px;border-radius: 4px">
        </div>
        <div style="background-color: #e6dff6;display: inline-block;height: 20px;border-radius: 4px" content=""
             :style="`width:${getWidth(item.startTime,item.endTime)}%`">
          <div class="flex">
            <template v-for="(detail,dIndex) in schedulesDetailList(item)">
              <div content=""
                   :style="`width:${getWidth(dIndex==0?item.day+' '+item.startTime:schedulesDetailList(item)[dIndex-1].endTime,detail.startTime,item.startTime,item.endTime)}%`"
                   style="display: inline-block;height: 20px">
              </div>
              <div style="background-color: #6750a4;display: inline-block;height: 20px" content=" "
                   :style="`width:${getWidth(detail.startTime,detail.endTime,item.startTime,item.endTime)}%`">
              </div>
              <div style="display: inline-block;height: 20px" content=""
                   :style="`width:${getWidth(detail.endTime,item.endTime,item.startTime,item.endTime)}%`"
                   v-if="dIndex==schedulesDetailList(item).length-1">
              </div>
            </template>
          </div>
        </div>
        <div style="display: inline-block;height: 20px;border-radius: 4px" content=""
             :style="`width:${getWidth(item.endTime,shop.clockOutTime)}%`"
             v-if="index==schedulesList.length-1">
        </div>
      </template>
      <div v-if="!schedulesList || schedulesList.length==0"
           style="display: inline-block;height: 20px;border-radius: 4px" content=""></div>
    </div>

    <div style="margin-top: 10px">
      <div class="flex align-center">
        <div style="width: 4px;height: 4px;border-radius: 4px;background-color: #e6dff6;margin-right: 4px"
             content=""></div>
        <div style="font-size: 12px;width: 50px">上班时间</div>
        <div style="font-size: 12px;margin-left: 10px" class="flex flex1 flex-wrap">
          <div v-for="(item,index) in schedulesList"
               style="background-color: #f4f2f6;margin-right: 6px;margin-bottom: 2px;padding: 2px 4px">
            {{ item.startTime | formatTime }}-{{ item.endTime | formatTime }}
          </div>
        </div>
      </div>
      <div class="flex align-center m-t-10">
        <div style="width: 4px;height: 4px;border-radius: 4px;background-color: #6750a4;margin-right: 4px"
             content=""></div>
        <div style="font-size: 12px;width: 50px">服务时间</div>
        <div style="font-size: 12px;margin-left: 10px" class="flex flex1 flex-wrap">
          <div v-for="(item,index) in orderDetailList"
               style="background-color: #f4f2f6;margin-right: 6px;margin-bottom: 2px;padding: 2px 4px">
            {{ item.startTime | formatDateTime }}-{{ item.endTime | formatDateTime }}
          </div>
        </div>
      </div>
      <div v-if="massagistRound && sortIndex" class="flex align-center m-t-10">
        {{ '当前轮次：' + massagistRound + '，已排轮次：' + massagistRoundCount + '，预估排班优先级：' + sortIndex }}
      </div>
    </div>
    <div slot="reference" class="bed-item">
      <img class="icon" :src="avatarUrl" mode="aspectFill"/>
      <div style="width: 70px;">
        <div class="flex" style="width: 100%;">
          <div style="width: 75%">{{ name }}</div>
          <div v-if="massagistRoundCount"
               style="font-size: 12px; width: 16px; height: 16px; border: 1px solid #333; border-radius: 50%; text-align: center; ">
            {{ massagistRoundCount }}
          </div>
        </div>
        <div style="background-color: #f5f4f4;border-radius: 4px;margin-top: 10px" class="flex">
          <template v-for="(item,index) in schedulesList">
            <div v-if="getWidth(index==0?shop.clockInTime:schedulesList[index-1].endTime,item.startTime)" content=""
                 :style="`width:${getWidth(index==0?shop.clockInTime:schedulesList[index-1].endTime,item.startTime)}%`"
                 style="display: inline-block;height: 4px;border-radius: 4px">
            </div>
            <div style="background-color: #e6dff6;display: inline-block;height: 4px;border-radius: 4px" content=""
                 :style="`width:${getWidth(item.startTime,item.endTime)}%`">
              <div class="flex">
                <template v-for="(detail,dIndex) in schedulesDetailList(item)">
                  <div content=""
                       :style="`width:${getWidth(dIndex==0?item.day+' '+item.startTime:schedulesDetailList(item)[dIndex-1].endTime,detail.startTime,item.startTime,item.endTime)}%`"
                       style="display: inline-block;height: 4px">
                  </div>
                  <div style="background-color: #6750a4;display: inline-block;height: 4px" content=" "
                       :style="`width:${getWidth(detail.startTime,detail.endTime,item.startTime,item.endTime)}%`">
                  </div>
                  <div style="display: inline-block;height: 4px" content=""
                       :style="`width:${getWidth(detail.endTime,item.endTime,item.startTime,item.endTime)}%`"
                       v-if="dIndex==schedulesDetailList(item).length-1">
                  </div>
                </template>
              </div>
            </div>
            <div style="display: inline-block;height: 4px;border-radius: 4px" content=""
                 :style="`width:${getWidth(item.endTime,shop.clockOutTime)}%`"
                 v-if="index==schedulesList.length-1">
            </div>
          </template>
          <div v-if="!schedulesList || schedulesList.length==0"
               style="display: inline-block;height: 4px;border-radius: 4px" content=""></div>
        </div>
      </div>
    </div>
  </el-popover>
</template>

<script>
import {mapGetters} from 'vuex'
import dayjs from "dayjs";
import dateUtil from "@/utils/dateUtil";

export default {
  name: 'SchedulesLine',
  props: {
    avatarUrl: {type: String, default: ''},
    name: {type: String, default: ''},
    schedulesList: {
      type: Array, default() {
        return []
      }
    },
    orderDetailList: {
      type: Array, default() {
        return []
      }
    },
    massagistRound: null,
    sortIndex: null,
    massagistRoundCount: null,
  },
  data() {
    return {
      shop: null
    }
  },
  computed: {
    ...mapGetters(['shopList', "shopId"]),
    schedulesDetailList() {
      return (item) => {
        const startTime = dayjs(item.day + " " + item.startTime);
        const endTime = dayjs(item.day + " " + item.endTime);
        return this.orderDetailList.filter(e => {
          return this.isTimeRangeWithinAnotherInclusive(e.startTime, e.endTime, startTime, endTime);
        })
      }
    }
  },
  created() {
    this.$store.dispatch('setShopList')
  },
  mounted() {
    console.log('Component mounted.')
    console.log(this.shopList)
    this.shop = this.shopList.find(e => e.id == this.shopId)
    console.log(this.shop)
  },
  methods: {
    getWidth(startTime, endTime, clockInTime, clockOutTime) {

      let time1 = dayjs(this.shop.clockInTime, 'HH:mm');
      let time2 = dayjs(this.shop.clockOutTime, 'HH:mm');
      let time3 = dayjs(startTime, 'HH:mm');
      let time4 = dayjs(endTime, 'HH:mm');
      if (clockInTime != null && clockOutTime != null) {
        time1 = dayjs(clockInTime, 'HH:mm');
        time2 = dayjs(clockOutTime, 'HH:mm');
        time3 = dayjs(startTime, 'YYYY-MM-DD HH:mm:ss');
        time4 = dayjs(endTime, 'YYYY-MM-DD HH:mm:ss');
      }
      const diffSeconds1 = time2.diff(time1, 'second');
      const diffSeconds2 = time4.diff(time3, 'second');
      return diffSeconds2 / diffSeconds1 * 100
    },
    diffSeconds(startTime, endTime) {
      const time3 = dayjs(startTime, 'HH:mm');
      const time4 = dayjs(endTime, 'HH:mm');
      const diffSeconds2 = time4.diff(time3, 'second');
      return diffSeconds2
    },
    isTimeRangeWithinAnotherInclusive(innerStart, innerEnd, outerStart, outerEnd) {
      return (dayjs(innerStart).isAfter(outerStart) || dayjs(innerStart).isSame(outerStart)) &&
        (dayjs(innerEnd).isBefore(outerEnd) || dayjs(innerEnd).isSame(outerEnd));
    }
  },
  filters: {
    formatTime(timeStr) {
      if (timeStr) {
        return dateUtil.format(timeStr, "HH:mm", 'HH:mm:ss');
      }
      return ''
    },
    formatDateTime(timeStr) {
      if (timeStr) {
        return dateUtil.format(timeStr, "HH:mm");
      }
      return ''
    }
  },
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.bed-item {
  width: 160px;
  height: 80px;
  display: flex;
  justify-content: center;
  align-items: center;

}

.icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  margin-right: 16px;
}
</style>
