<template>
  <div class="page-container">
    <h2 class="page-title" style="margin-bottom: 24px;">工作台</h2>

    <!-- 统计卡片 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="6">
        <a-card :loading="loading"><a-statistic title="课程总数" :value="stats.courseCount" suffix="节" :value-style="{ color: '#6B463C' }" /></a-card>
      </a-col>
      <a-col :span="6">
        <a-card :loading="loading"><a-statistic title="本月订单" :value="stats.monthOrderCount" suffix="单" :value-style="{ color: '#27AE60' }" /></a-card>
      </a-col>
      <a-col :span="6">
        <a-card :loading="loading"><a-statistic title="活跃会员" :value="stats.activeMemberCount" /></a-card>
      </a-col>
      <a-col :span="6">
        <a-card :loading="loading"><a-statistic title="本月收入" prefix="¥" :value="stats.monthRevenue" :precision="2" :value-style="{ color: '#F39C12' }" /></a-card>
      </a-col>
    </a-row>

    <a-row :gutter="24" style="margin-bottom: 24px">
      <!-- 今日场地概览 -->
      <a-col :span="14">
        <a-card title="今日场地概览" :extra="'占用 ' + venueOccupied + '/28 段'">
          <div class="venue-overview">
            <div v-for="venue in venueQuickView" :key="venue.name" class="venue-row">
              <div class="venue-name">{{ venue.name }}</div>
              <div class="venue-bar">
                <a-tooltip v-for="(slot, i) in venue.slots" :key="i" placement="top">
                  <template #title>
                    <div v-if="slot.occupied">
                      <div style="font-weight: 600;">{{ slot.title }}</div>
                      <div>{{ slot.type === 'course' ? '课程占用' : '租赁占用' }}</div>
                      <div>{{ slot.rangeStart }} — {{ slot.rangeEnd }}</div>
                    </div>
                    <div v-else>
                      <div>空闲时段</div>
                      <div>{{ slot.rangeStart }} — {{ slot.rangeEnd }}</div>
                    </div>
                  </template>
                  <div class="venue-slot" :class="{ occupied: slot.occupied, course: slot.type === 'course', rental: slot.type === 'rental' }"></div>
                </a-tooltip>
              </div>
            </div>
            <div class="venue-legend">
              <span><span class="legend-dot course"></span>课程</span>
              <span><span class="legend-dot rental"></span>租赁</span>
              <span><span class="legend-dot empty"></span>空闲</span>
              <span style="margin-left: auto; color: #999; font-size: 12px;">08:00 — 22:00（每格30分钟）</span>
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 待处理事项 -->
      <a-col :span="10">
        <a-card title="待处理事项">
          <div v-for="(item, idx) in todoItems" :key="item.id" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f5f0eb;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <a-badge :status="item.urgent ? 'error' : 'processing'" />
              <span style="color: #4B3621;" :style="item.done ? { textDecoration: 'line-through', opacity: 0.5 } : {}">{{ item.text }}</span>
            </div>
            <a-space>
              <a-tag v-if="item.urgent && !item.done" color="red" size="small">紧急</a-tag>
              <a-button v-if="!item.done" type="link" size="small" @click="handleTodo(idx)">处理</a-button>
              <a-tag v-else color="green" size="small">已处理</a-tag>
            </a-space>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="24">
      <!-- 今日课程时间线 -->
      <a-col :span="14">
        <a-card title="今日课程">
          <div class="schedule-timeline">
            <div v-for="item in todayCourses" :key="item.id" class="timeline-item" :class="item.statusClass">
              <div class="timeline-time">{{ item.time }}</div>
              <div class="timeline-content">
                <div style="font-weight: 500; color: #4B3621;">{{ item.name }}</div>
                <div style="font-size: 12px; color: #7D665C;">{{ item.trainer }} · {{ item.venue }} · {{ item.enrolled }}/{{ item.capacity }}人</div>
              </div>
              <div class="timeline-status">
                <a-tag :color="item.statusColor" size="small">{{ item.statusText }}</a-tag>
              </div>
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 最近订单 + 库存预警 -->
      <a-col :span="10">
        <a-card title="最近订单" style="margin-bottom: 24px">
          <div v-for="order in recentOrders" :key="order.id" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f5f0eb;">
            <div>
              <div style="font-weight: 500; color: #4B3621;">{{ order.user }}</div>
              <div style="font-size: 12px; color: #999;">{{ order.course }}</div>
            </div>
            <span style="color: #6B463C; font-weight: 600;">¥{{ order.amount }}</span>
          </div>
        </a-card>
        <a-card title="库存预警">
          <a-alert v-for="alert in stockAlerts" :key="alert.name" :message="alert.name + ' 仅剩 ' + alert.stock + ' 件'" type="warning" show-icon style="margin-bottom: 8px" />
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { overview } from '@/api/analytics'

const loading = ref(false)
const stats = ref({
  userCount: 0,
  courseCount: 0,
  activeMemberCount: 0,
  orderCount: 0,
  totalRevenue: 0,
  monthRevenue: 0,
  monthOrderCount: 0,
})

async function loadOverview() {
  loading.value = true
  try {
    const data: any = await overview()
    stats.value = {
      userCount: data.userCount ?? 0,
      courseCount: data.courseCount ?? 0,
      activeMemberCount: data.activeMemberCount ?? 0,
      orderCount: data.orderCount ?? 0,
      totalRevenue: (data.totalRevenue ?? 0) / 100,
      monthRevenue: (data.monthRevenue ?? 0) / 100,
      monthOrderCount: data.monthOrderCount ?? 0,
    }
  } catch (e: any) {
    message.error(e?.message || '加载概览数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(loadOverview)

const venueOccupied = ref(16)

// 场地快速视图 - 每个场地28个半小时格子
const venueQuickView = ref([
  { name: '冥想室A', slots: generateSlots([{ s: 2, e: 5, type: 'course', title: '正念冥想入门' }, { s: 12, e: 15, type: 'course', title: '深度冥想进阶' }, { s: 20, e: 23, type: 'rental', title: '团建租赁' }]) },
  { name: '疗愈空间B', slots: generateSlots([{ s: 4, e: 8, type: 'course', title: '声音疗愈工作坊' }, { s: 12, e: 16, type: 'course', title: '颂钵深度体验' }]) },
  { name: '舞动厅C', slots: generateSlots([{ s: 2, e: 5, type: 'course', title: '舞动身心体验课' }, { s: 14, e: 18, type: 'rental', title: '品牌拍摄' }]) },
  { name: '多功能厅D', slots: generateSlots([{ s: 12, e: 18, type: 'course', title: '精油调配工作坊' }]) },
  { name: '私教室E', slots: generateSlots([{ s: 6, e: 8, type: 'course', title: '1v1冥想' }, { s: 16, e: 18, type: 'course', title: '1v1颂钵' }]) },
])

function generateSlots(occupied: { s: number; e: number; type: string; title: string }[]) {
  // 每格 30 分钟，从 08:00 开始，共 28 格
  const slotTime = (idx: number) => {
    const totalMin = 8 * 60 + idx * 30
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const slots = Array.from({ length: 28 }, () => ({ occupied: false, type: '', title: '', rangeStart: '', rangeEnd: '' }))
  // 先标记占用段，并记录每段的起止时间范围
  occupied.forEach(o => {
    const rangeStart = slotTime(o.s)
    const rangeEnd = slotTime(o.e)
    for (let i = o.s; i < o.e; i++) {
      slots[i] = { occupied: true, type: o.type, title: o.title, rangeStart, rangeEnd }
    }
  })
  // 计算连续空闲段的起止时间，赋给每个空闲格用于 hover 显示整段范围
  let i = 0
  while (i < slots.length) {
    if (!slots[i].occupied) {
      let j = i
      while (j < slots.length && !slots[j].occupied) j++
      const rangeStart = slotTime(i)
      const rangeEnd = slotTime(j)
      for (let k = i; k < j; k++) {
        slots[k].rangeStart = rangeStart
        slots[k].rangeEnd = rangeEnd
      }
      i = j
    } else {
      i++
    }
  }
  return slots
}

const todoItems = ref([
  { id: '1', text: '赵雪申请退款 - 正念冥想入门', urgent: true, done: false },
  { id: '2', text: '3条新评价待审核展示', urgent: false, done: false },
  { id: '3', text: '周静导师结算待确认（¥3,200）', urgent: false, done: false },
  { id: '4', text: '瑜伽垫库存不足，需补货', urgent: true, done: false },
  { id: '5', text: '下周排课确认（5个课程待排期）', urgent: false, done: false },
])

const todayCourses = ref([
  { id: '1', time: '09:00-10:30', name: '正念冥想入门 · 第3节', trainer: '王芳', venue: '冥想室A', enrolled: 6, capacity: 8, statusClass: 'done', statusColor: 'default', statusText: '已结束' },
  { id: '2', time: '10:00-12:00', name: '声音疗愈工作坊 · 第5节', trainer: '李梦琪', venue: '疗愈空间B', enrolled: 5, capacity: 6, statusClass: 'active', statusColor: 'green', statusText: '进行中' },
  { id: '3', time: '14:00-15:30', name: '深度冥想进阶 · 第7节', trainer: '王芳', venue: '冥想室A', enrolled: 4, capacity: 6, statusClass: 'upcoming', statusColor: 'blue', statusText: '待开始' },
  { id: '4', time: '15:00-16:30', name: '舞动身心体验课 · 第2节', trainer: '陈雅婷', venue: '舞动厅C', enrolled: 8, capacity: 12, statusClass: 'upcoming', statusColor: 'blue', statusText: '待开始' },
  { id: '5', time: '14:00-17:00', name: '精油调配工作坊', trainer: '周静', venue: '多功能厅D', enrolled: 8, capacity: 8, statusClass: 'upcoming', statusColor: 'gold', statusText: '已满员' },
  { id: '6', time: '18:00-19:30', name: '晨间瑜伽（晚班）', trainer: '赵明远', venue: '舞动厅C', enrolled: 5, capacity: 12, statusClass: 'upcoming', statusColor: 'blue', statusText: '待开始' },
])

const recentOrders = ref([
  { id: '1', user: '张敏', course: '正念冥想入门', amount: 249 },
  { id: '2', user: '李悦', course: '声音疗愈工作坊', amount: 399 },
  { id: '3', user: '陈思涵', course: '精油调配工作坊', amount: 359 },
  { id: '4', user: '新用户·小雨', course: '舞动身心体验课', amount: 99 },
])

const stockAlerts = ref([
  { name: '璑伽垫', stock: 2 },
  { name: '线香', stock: 3 },
])

function handleTodo(idx: number) {
  todoItems.value[idx].done = true
}
</script>

<style scoped>
.venue-overview { display: flex; flex-direction: column; gap: 8px; }
.venue-row { display: flex; align-items: center; gap: 12px; }
.venue-name { min-width: 80px; font-size: 13px; color: #4B3621; font-weight: 500; }
.venue-bar { display: flex; gap: 1px; flex: 1; }
.venue-slot { width: 100%; height: 20px; border-radius: 2px; background: #f5f0eb; }
.venue-slot.occupied.course { background: #6B463C; }
.venue-slot.occupied.rental { background: #F39C12; }
.venue-legend { display: flex; align-items: center; gap: 16px; margin-top: 8px; font-size: 12px; color: #666; }
.legend-dot { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
.legend-dot.course { background: #6B463C; }
.legend-dot.rental { background: #F39C12; }
.legend-dot.empty { background: #f5f0eb; }
.schedule-timeline { display: flex; flex-direction: column; gap: 8px; }
.timeline-item { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-radius: 8px; border: 1px solid #f0e6dc; transition: all 0.2s; }
.timeline-item.active { background: #f0fff4; border-color: #b7eb8f; }
.timeline-item.done { opacity: 0.6; }
.timeline-time { font-weight: 600; color: #6B463C; min-width: 100px; font-size: 13px; }
.timeline-content { flex: 1; }
.timeline-status { min-width: 70px; text-align: right; }
</style>
