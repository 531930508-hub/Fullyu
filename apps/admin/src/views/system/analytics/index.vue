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
      <a-col :span="6">
        <a-card :loading="loading">
          <a-statistic title="总收入" prefix="¥" :value="stats.totalRevenue" :precision="2" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :loading="loading">
          <a-statistic title="本月收入" prefix="¥" :value="stats.monthRevenue" :precision="2" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :loading="loading">
          <a-statistic title="用户总数" :value="stats.userCount" />
        </a-card>
      </a-col>
      <a-col :span="6">
        <a-card :loading="loading">
          <a-statistic title="活跃会员" :value="stats.activeMemberCount" />
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

    <!-- 课程热度/导师评分/用户增长/会员分布：后端暂未提供聚合接口，待后续补充 -->
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { overview, revenueTrend } from '@/api/analytics'

const timeRange = ref('month')
const loading = ref(false)

const stats = ref({
  totalRevenue: 0,
  monthRevenue: 0,
  userCount: 0,
  activeMemberCount: 0,
})

const revenueData = ref<{ label: string; value: string; percent: number }[]>([])

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
      activeMemberCount: ov.activeMemberCount ?? 0,
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

onMounted(loadData)
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
</style>
