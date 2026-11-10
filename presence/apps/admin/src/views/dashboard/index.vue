<template>
  <div class="page-container">
    <!-- 页头：身份 + 全页统一的查看日期 -->
    <div class="wb-head">
      <div>
        <h2 class="page-title" style="margin-bottom: 4px">工作台</h2>
        <div class="wb-sub">
          {{ auth.name || auth.username }}
          <template v-if="auth.roleLabels.length"> · {{ auth.roleLabels.join(' / ') }}</template>
          · {{ auth.orgLabel }}
        </div>
      </div>
      <a-space :size="8">
        <a-button size="small" @click="prevDay">&lt;</a-button>
        <a-date-picker
          v-model:value="viewDate"
          size="small"
          format="MM-DD"
          :allow-clear="false"
          style="width: 90px"
        />
        <a-button size="small" @click="nextDay">&gt;</a-button>
        <a-button size="small" :disabled="isToday" @click="backToday">今天</a-button>
      </a-space>
    </div>

    <!-- 统计卡：只放「当下要不要动手」的数，存量指标不占首页 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col v-for="card in statCards" :key="card.key" :span="24 / statCards.length">
        <a-card :loading="loading">
          <a-statistic
            :title="card.title"
            :value="card.value"
            :suffix="card.suffix"
            :prefix="card.prefix"
            :precision="card.precision"
            :value-style="{ color: card.color }"
          />
          <div class="wb-stat-sub">{{ card.sub }}</div>
        </a-card>
      </a-col>
    </a-row>

    <a-row :gutter="24" style="margin-bottom: 24px">
      <!-- 场地使用情况 -->
      <a-col v-if="blocks.venues" :span="14">
        <a-card :loading="loading">
          <template #title>
            <span>场地使用情况</span>
            <span class="wb-card-extra">{{ dayLabel }}</span>
          </template>
          <a-empty v-if="!venueQuickView.length" description="暂无场地" />
          <div v-else class="venue-overview">
            <div v-for="venue in venueQuickView" :key="venue.name" class="venue-row">
              <div class="venue-name">{{ venue.name }}</div>
              <div class="venue-bar">
                <a-tooltip v-for="(slot, i) in venue.slots" :key="i" placement="top">
                  <template #title>
                    <div v-if="slot.occupied">
                      <div style="font-weight: 600">{{ slot.title }}</div>
                      <!-- 课程 -->
                      <template v-if="slot.type === 'course'">
                        <div>课程占用</div>
                        <div>{{ slot.rangeStart }} — {{ slot.rangeEnd }}</div>
                      </template>
                      <!-- 内部使用 -->
                      <template v-else-if="slot.type === 'internal'">
                        <div>{{ slot.rangeStart }} — {{ slot.rangeEnd }}</div>
                        <div v-if="slot.contactName">登记：{{ slot.contactName }}</div>
                        <div v-if="slot.note" style="color: #ccc">备注：{{ slot.note }}</div>
                      </template>
                      <!-- 意向沟通中 -->
                      <template v-else-if="slot.contractStatus === 'INTENT'">
                        <div>{{ slot.rangeStart }} — {{ slot.rangeEnd }}</div>
                        <div v-if="slot.salesName">销售：{{ slot.salesName }}</div>
                        <div v-if="slot.createdAt">等待：{{ waitedText(slot.createdAt) }}</div>
                        <div v-if="slot.note" style="color: #ccc">备注：{{ slot.note }}</div>
                      </template>
                      <!-- 已签约 -->
                      <template v-else>
                        <div>{{ slot.rangeStart }} — {{ slot.rangeEnd }}</div>
                        <div v-if="slot.salesName">销售：{{ slot.salesName }}</div>
                        <div v-if="slot.note" style="color: #ccc">备注：{{ slot.note }}</div>
                      </template>
                    </div>
                    <div v-else>
                      <div>空闲时段</div>
                      <div>{{ slot.rangeStart }} — {{ slot.rangeEnd }}</div>
                    </div>
                  </template>
                  <div
                    class="venue-slot"
                    :class="{
                      occupied: slot.occupied,
                      course: slot.type === 'course',
                      signed: slot.type === 'rental' && slot.contractStatus !== 'INTENT',
                      intent: slot.type === 'rental' && slot.contractStatus === 'INTENT',
                      internal: slot.type === 'internal',
                    }"
                  ></div>
                </a-tooltip>
              </div>
            </div>
            <div class="venue-legend">
              <span><span class="legend-dot course"></span>课程</span>
              <span><span class="legend-dot signed"></span>已签约</span>
              <span><span class="legend-dot intent"></span>意向沟通中</span>
              <span><span class="legend-dot internal"></span>内部使用</span>
              <span><span class="legend-dot empty"></span>空闲</span>
              <span style="margin-left: auto; color: #999; font-size: 12px">08:00 — 22:00（每格30分钟）</span>
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 待处理事项：所有人可见，条目本身按权限派生 -->
      <a-col :span="todoSpan">
        <a-card title="待处理事项" :loading="loading">
          <a-empty v-if="!todoItems.length" description="暂无待处理事项" />
          <div v-for="item in todoItems" :key="item.id" class="wb-todo-row">
            <div style="display: flex; align-items: center; gap: 8px">
              <a-badge :status="item.urgent ? 'error' : 'processing'" />
              <span style="color: #4b3621">{{ item.text }}</span>
            </div>
            <a-space>
              <a-tag v-if="item.urgent" color="red">紧急</a-tag>
              <a-button type="link" size="small" @click="handleTodo(item)">处理</a-button>
            </a-space>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <a-row v-if="blocks.courses || hasSideBlock" :gutter="24">
      <!-- 课程时间线 -->
      <a-col v-if="blocks.courses" :span="hasSideBlock ? 14 : 24">
        <a-card :loading="loading">
          <template #title>
            <span>课程安排</span>
            <span class="wb-card-extra">{{ dayLabel }} 共 {{ todayCourses.length }} 节</span>
          </template>
          <a-empty v-if="!todayCourses.length" :description="`${dayLabel}暂无课程`" />
          <div class="schedule-timeline">
            <div v-for="item in todayCourses" :key="item.id" class="timeline-item" :class="item.statusClass">
              <div class="timeline-time">{{ item.time }}</div>
              <div class="timeline-content">
                <div style="font-weight: 500; color: #4b3621">{{ item.name }}</div>
                <div style="font-size: 12px; color: #7d665c">
                  {{ item.trainer }} · {{ item.venue }} · {{ item.enrolled }}/{{ item.capacity }}人
                </div>
              </div>
              <div class="timeline-status">
                <a-tag :color="item.statusColor">{{ item.statusText }}</a-tag>
              </div>
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 最近订单 + 库存预警 -->
      <a-col v-if="hasSideBlock" :span="blocks.courses ? 10 : 24">
        <a-card v-if="blocks.orders" title="最近订单" :loading="loading" style="margin-bottom: 24px">
          <a-empty v-if="!recentOrders.length" description="暂无订单" />
          <div v-for="order in recentOrders" :key="order.id" class="wb-order-row">
            <div>
              <div style="font-weight: 500; color: #4b3621">{{ order.user }}</div>
              <div style="font-size: 12px; color: #999">{{ order.course }}</div>
            </div>
            <span style="color: #6b463c; font-weight: 600">¥{{ order.amount.toFixed(2) }}</span>
          </div>
        </a-card>
        <a-card v-if="blocks.stock" title="库存预警" :loading="loading">
          <a-empty v-if="!stockAlerts.length" description="库存充足" :image="undefined" />
          <a-alert
            v-for="alert in stockAlerts"
            :key="alert.warehouseId + alert.name"
            :message="`${alert.name} 仅剩 ${alert.stock}${alert.unit || ''}，安全库存 ${alert.safetyStock}`"
            type="warning"
            show-icon
            style="margin-bottom: 8px"
          />
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { workbench } from '@/api/analytics'
import { useAuthStore } from '@/stores/auth'
import dayjs, { type Dayjs } from 'dayjs'

/**
 * 首页 = 当前登录人权限的投影。
 *
 * 数据只走 /analytics/workbench 一个接口（仅需登录），后端按权限逐块裁剪并回传 blocks；
 * 前端对没权限的块整块不渲染、布局自动收拢，不再出现「进首页先弹两条无权限红字」。
 * 存量指标（课程总数、活跃会员、用户增长）搬去「数据分析」页，首页只留当天要动手的事。
 */
const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)

/** 后端声明的可渲染块，请求失败时全部关掉，页面退化成只剩统计卡骨架 */
const blocks = ref({ courses: false, venues: false, orders: false, stock: false, revenue: false })
const stats = ref({
  todayCourseCount: 0,
  todayCheckinCount: 0,
  myTodoCount: 0,
  monthRevenue: null as number | null,
})

const viewDate = ref<Dayjs>(dayjs())
const viewDateStr = computed(() => viewDate.value.format('YYYY-MM-DD'))
const isToday = computed(() => viewDateStr.value === dayjs().format('YYYY-MM-DD'))
const dayLabel = computed(() => (isToday.value ? '今日' : viewDate.value.format('M月D日')))

function prevDay() {
  viewDate.value = viewDate.value.subtract(1, 'day')
}
function nextDay() {
  viewDate.value = viewDate.value.add(1, 'day')
}
function backToday() {
  viewDate.value = dayjs()
}

interface StatCard {
  key: string
  title: string
  value: number
  suffix?: string
  prefix?: string
  precision?: number
  color: string
  sub: string
}

/** 卡片数量随权限变化，用 24 整除保证一行铺满 */
const statCards = computed<StatCard[]>(() => {
  const list: StatCard[] = [
    {
      key: 'course',
      title: `${dayLabel.value}课程`,
      value: stats.value.todayCourseCount,
      suffix: '节',
      color: '#6B463C',
      sub: '已发布与已完成的排课',
    },
    {
      key: 'checkin',
      title: `${dayLabel.value}签到`,
      value: stats.value.todayCheckinCount,
      suffix: '人',
      color: '#27AE60',
      sub: '实际到场核销人数',
    },
    {
      key: 'todo',
      title: '待我审批',
      value: stats.value.myTodoCount,
      suffix: '项',
      color: stats.value.myTodoCount > 0 ? '#E74C3C' : '#8B7355',
      sub: '当前节点指派到我名下的单据',
    },
  ]
  if (blocks.value.revenue) {
    list.push({
      key: 'revenue',
      title: '本月收入',
      value: stats.value.monthRevenue ?? 0,
      prefix: '¥',
      precision: 2,
      color: '#F39C12',
      sub: `${dayjs().format('YYYY-MM')} 全渠道已归集`,
    })
  }
  return list
})

/** 右侧栏（订单/库存）有没有内容，决定第三行怎么分列 */
const hasSideBlock = computed(() => blocks.value.orders || blocks.value.stock)
/** 没有场地权限时，待处理事项独占一行 */
const todoSpan = computed(() => (blocks.value.venues ? 10 : 24))

const SLOT_PER_VENUE = 28
const SLOT_BASE_MIN = 8 * 60 // 08:00

const venueQuickView = ref<any[]>([])
const todoItems = ref<{ id: string; text: string; urgent: boolean; link: string }[]>([])
const todayCourses = ref<any[]>([])
const recentOrders = ref<{ id: string; user: string; course: string; amount: number }[]>([])
const stockAlerts = ref<any[]>([])

function toMin(t: string) {
  const [h, m] = (t || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** 将后端返回的时间段 ranges 转为 28 个半小时格子 */
function buildSlotsFromRanges(ranges: any[]) {
  const slotTime = (idx: number) => {
    const totalMin = SLOT_BASE_MIN + idx * 30
    const h = Math.floor(totalMin / 60)
    const m = totalMin % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  const makeEmpty = () => ({
    occupied: false, type: '', title: '', rangeStart: '', rangeEnd: '',
    useType: '', contractStatus: null as string | null, salesName: '' as string | null,
    createdAt: '' as string | null, contactName: '' as string | null, note: '' as string | null,
  })
  const slots = Array.from({ length: SLOT_PER_VENUE }, () => makeEmpty())
  ;(ranges || []).forEach((r: any) => {
    const s = Math.max(0, Math.round((toMin(r.startTime) - SLOT_BASE_MIN) / 30))
    const e = Math.min(SLOT_PER_VENUE, Math.round((toMin(r.endTime) - SLOT_BASE_MIN) / 30))
    for (let i = s; i < e; i++) {
      slots[i] = {
        occupied: true,
        type: r.type,
        title: r.title,
        rangeStart: r.startTime,
        rangeEnd: r.endTime,
        useType: r.useType ?? 'RENTAL',
        contractStatus: r.contractStatus ?? null,
        salesName: r.salesName ?? null,
        createdAt: r.createdAt ?? null,
        contactName: r.contactName ?? null,
        note: r.note ?? null,
      }
    }
  })
  // 计算连续空闲段起止时间，用于 hover 显示
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

async function loadWorkbench() {
  loading.value = true
  try {
    const data: any = await workbench(viewDateStr.value)
    blocks.value = {
      courses: Boolean(data.blocks?.courses),
      venues: Boolean(data.blocks?.venues),
      orders: Boolean(data.blocks?.orders),
      stock: Boolean(data.blocks?.stock),
      revenue: Boolean(data.blocks?.revenue),
    }
    stats.value = {
      todayCourseCount: data.stats?.todayCourseCount ?? 0,
      todayCheckinCount: data.stats?.todayCheckinCount ?? 0,
      myTodoCount: data.stats?.myTodoCount ?? 0,
      monthRevenue: data.stats?.monthRevenue ?? null,
    }
    venueQuickView.value = (data.venues || []).map((v: any) => ({
      name: v.name,
      slots: buildSlotsFromRanges(v.ranges),
    }))
    todayCourses.value = data.todayCourses || []
    // 订单金额后端给的是分，收入统计给的是元，两者口径不同别混用
    recentOrders.value = (data.recentOrders || []).map((o: any) => ({ ...o, amount: (o.amount ?? 0) / 100 }))
    stockAlerts.value = data.stockAlerts || []
    todoItems.value = data.todoItems || []
  } catch (e: any) {
    message.error(e?.message || '加载工作台失败')
  } finally {
    loading.value = false
  }
}

watch(viewDateStr, () => {
  loadWorkbench()
})

onMounted(() => {
  loadWorkbench()
})

/** 等待时长文案：x天x小时（不足1小时显示<1小时） */
function waitedText(createdAt: string | null | undefined): string {
  if (!createdAt) return ''
  const t = new Date(createdAt).getTime()
  if (!t) return ''
  const diff = Date.now() - t
  if (diff <= 0) return '刚刚'
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(h / 24)
  const rh = h - d * 24
  if (d <= 0 && rh <= 0) return '<1小时'
  if (d <= 0) return `${rh}小时`
  return `${d}天${rh}小时`
}

/** 待办跳转目标页所需权限，避免点进去撞 403 */
const TODO_PERM: Record<string, string> = {
  approval: 'flow:todo:view',
  refund: 'order:view',
  stock: 'scm:stock:view',
}

function handleTodo(item: { id: string; link: string }) {
  const perm = TODO_PERM[item.id]
  if (perm && !auth.hasPerm(perm)) {
    message.warning('你没有该单据的处理权限，请联系管理员')
    return
  }
  router.push(item.link)
}
</script>

<style scoped>
.wb-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; }
.wb-sub { font-size: 13px; color: #7D665C; }
.wb-stat-sub { margin-top: 4px; font-size: 12px; color: #999; }
.wb-card-extra { margin-left: 8px; font-size: 12px; font-weight: normal; color: #999; }
.wb-todo-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f5f0eb; }
.wb-order-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f5f0eb; }
.venue-overview { display: flex; flex-direction: column; gap: 8px; }
.venue-row { display: flex; align-items: center; gap: 12px; }
.venue-name { min-width: 80px; font-size: 13px; color: #4B3621; font-weight: 500; }
.venue-bar { display: flex; gap: 1px; flex: 1; }
.venue-slot { width: 100%; height: 20px; border-radius: 2px; background: #f5f0eb; box-sizing: border-box; }
.venue-slot.occupied.course { background: #6B463C; }
.venue-slot.occupied.signed { background: #F39C12; }
.venue-slot.occupied.intent { background: #FEF3C7; border: 1px dashed #F59E0B; }
.venue-slot.occupied.internal { background: #8B7355; }
.venue-legend { display: flex; align-items: center; gap: 16px; margin-top: 8px; font-size: 12px; color: #666; flex-wrap: wrap; }
.legend-dot { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
.legend-dot.course { background: #6B463C; }
.legend-dot.signed { background: #F39C12; }
.legend-dot.intent { background: #FEF3C7; border: 1px dashed #F59E0B; }
.legend-dot.internal { background: #8B7355; }
.legend-dot.empty { background: #f5f0eb; }
.schedule-timeline { display: flex; flex-direction: column; gap: 8px; }
.timeline-item { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border-radius: 8px; border: 1px solid #f0e6dc; transition: all 0.2s; }
.timeline-item.active { background: #f0fff4; border-color: #b7eb8f; }
.timeline-item.done { opacity: 0.6; }
.timeline-time { font-weight: 600; color: #6B463C; min-width: 100px; font-size: 13px; }
.timeline-content { flex: 1; }
.timeline-status { min-width: 70px; text-align: right; }
</style>
