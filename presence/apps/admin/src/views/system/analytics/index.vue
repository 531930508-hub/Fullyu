<template>
  <div class="page-container">
    <div class="page-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="page-title">数据分析</h2>
      <a-space>
        <a-radio-group v-model:value="timeRange" button-style="solid">
          <a-radio-button value="week">本周</a-radio-button>
          <a-radio-button value="month">本月</a-radio-button>
          <a-radio-button value="quarter">本季</a-radio-button>
        </a-radio-group>
      </a-space>
    </div>

    <!-- 核心指标 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="8">
        <a-card :loading="loading">
          <a-statistic title="总收入" prefix="¥" :value="stats.totalRevenue" :precision="2" />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card :loading="loading">
          <a-statistic title="本月收入" prefix="¥" :value="stats.monthRevenue" :precision="2" />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card :loading="loading">
          <a-statistic title="用户总数" :value="stats.userCount" />
        </a-card>
      </a-col>
    </a-row>

    <!-- 收入趋势 -->
    <a-card title="收入趋势（近30天）" style="margin-bottom: 24px" :loading="loading">
      <a-empty v-if="!revenueData.length" description="暂无收入数据" />
      <div v-else class="chart-container">
        <div class="bar-chart">
          <div v-for="(item, i) in revenueData" :key="i" class="bar-item">
            <div class="bar-wrapper">
              <div class="bar" :style="{ height: item.percent + '%' }"></div>
            </div>
            <div class="bar-label">{{ item.label }}</div>
            <div class="bar-value">¥{{ item.value }}</div>
          </div>
        </div>
      </div>
    </a-card>

    <!-- 课程热度 / 导师评分 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="12">
        <a-card title="课程热度（报名 Top 8）" :loading="chartsLoading">
          <a-empty v-if="!coursePopularity.length" description="暂无课程数据" />
          <div v-else class="rank-list">
            <div v-for="(item, i) in coursePopularity" :key="i" class="rank-item">
              <div class="rank-name" :title="item.name">{{ item.name }}</div>
              <div class="rank-bar-wrap">
                <div class="rank-bar" :style="{ width: courseBarWidth(item.value) + '%' }"></div>
              </div>
              <div class="rank-value">{{ item.value }}/{{ item.capacity }}</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :span="12">
        <a-card title="导师评分（Top 8）" :loading="chartsLoading">
          <a-empty v-if="!trainerRatings.length" description="暂无评价数据" />
          <div v-else class="rank-list">
            <div v-for="(item, i) in trainerRatings" :key="i" class="rank-item">
              <div class="rank-name" :title="item.name">{{ item.name }}</div>
              <div class="rank-bar-wrap">
                <div class="rank-bar rating" :style="{ width: (item.value / 5 * 100) + '%' }"></div>
              </div>
              <div class="rank-value">{{ item.value }}分 · {{ item.count }}评</div>
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <!-- 用户增长 -->
    <a-row :gutter="24" style="margin-bottom: 24px">
      <a-col :span="12">
        <a-card title="用户增长（近30天新增）" :loading="chartsLoading">
          <a-empty v-if="!userGrowthData.length" description="暂无新增用户" />
          <div v-else class="chart-container">
            <div class="bar-chart">
              <div v-for="(item, i) in userGrowthData" :key="i" class="bar-item">
                <div class="bar-wrapper">
                  <div class="bar" :style="{ height: item.percent + '%' }"></div>
                </div>
                <div class="bar-label">{{ item.label }}</div>
                <div class="bar-value">{{ item.value }}</div>
              </div>
            </div>
          </div>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { overview, revenueTrend, charts } from '@/api/analytics'

const timeRange = ref('month')
const loading = ref(false)
const chartsLoading = ref(false)

const stats = ref({
  totalRevenue: 0,
  monthRevenue: 0,
  userCount: 0,
})

const revenueData = ref<{ label: string; value: string; percent: number }[]>([])
const coursePopularity = ref<{ name: string; value: number; capacity: number }[]>([])
const trainerRatings = ref<{ name: string; value: number; count: number }[]>([])
const userGrowthData = ref<{ label: string; value: number; percent: number }[]>([])

function courseBarWidth(value: number) {
  const max = Math.max(1, ...coursePopularity.value.map((c) => c.value))
  return Math.round((value / max) * 100)
}

function formatAmount(yuan: number) {
  if (yuan >= 1000) return (yuan / 1000).toFixed(1) + 'k'
  return String(yuan)
}

async function loadData() {
  loading.value = true
  try {
    const [ov, trend]: any = await Promise.all([overview(), revenueTrend(30)])
    stats.value = {
      totalRevenue: (ov.totalRevenue ?? 0) / 100,
      monthRevenue: (ov.monthRevenue ?? 0) / 100,
      userCount: ov.userCount ?? 0,
    }
    const list: { date: string; amount: number }[] = Array.isArray(trend) ? trend : []
    const max = Math.max(1, ...list.map(d => d.amount))
    revenueData.value = list.map(d => {
      const yuan = (d.amount ?? 0) / 100
      return {
        label: d.date?.slice(5) || '',
        value: formatAmount(yuan),
        percent: Math.round(((d.amount ?? 0) / max) * 100),
      }
    })
  } catch (e: any) {
    message.error(e?.message || '加载数据失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
  loadCharts()
})

async function loadCharts() {
  chartsLoading.value = true
  try {
    const data: any = await charts()
    coursePopularity.value = Array.isArray(data?.coursePopularity) ? data.coursePopularity : []
    trainerRatings.value = Array.isArray(data?.trainerRatings) ? data.trainerRatings : []
    const growth: { date: string; count: number }[] = Array.isArray(data?.userGrowth) ? data.userGrowth : []
    const gmax = Math.max(1, ...growth.map((d) => d.count))
    userGrowthData.value = growth.map((d) => ({
      label: d.date?.slice(5) || '',
      value: d.count ?? 0,
      percent: Math.round(((d.count ?? 0) / gmax) * 100),
    }))
  } catch (e: any) {
    message.error(e?.message || '加载图表数据失败')
  } finally {
    chartsLoading.value = false
  }
}
</script>

<style scoped>
.chart-container {
  padding: 16px 0;
}
.bar-chart {
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  height: 180px;
  padding: 0 16px;
}
.bar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.bar-wrapper {
  width: 40px;
  height: 140px;
  background: #f5efe8;
  border-radius: 4px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}
.bar {
  width: 100%;
  background: linear-gradient(to top, #6B463C, #8B6354);
  border-radius: 4px 4px 0 0;
  transition: height 0.3s ease;
}
.bar-label {
  font-size: 12px;
  color: #999;
}
.bar-value {
  font-size: 12px;
  color: #4B3621;
  font-weight: 500;
}
.rank-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
}
.rank-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.rank-name {
  width: 120px;
  font-size: 13px;
  color: #4B3621;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rank-bar-wrap {
  flex: 1;
  height: 14px;
  background: #f5efe8;
  border-radius: 7px;
  overflow: hidden;
}
.rank-bar {
  height: 100%;
  background: linear-gradient(to right, #8B6354, #6B463C);
  border-radius: 7px;
  transition: width 0.3s ease;
}
.rank-bar.rating {
  background: linear-gradient(to right, #E0B872, #C99A3F);
}
.rank-value {
  width: 96px;
  text-align: right;
  font-size: 12px;
  color: #7D665C;
}
</style>
