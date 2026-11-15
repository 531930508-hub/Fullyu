<template>
  <div class="schedule-week">
    <div class="week-toolbar">
      <el-button class="week-nav" icon="el-icon-arrow-left" @click="shiftWeek(-1)" aria-label="上一周">上一周</el-button>
      <div class="week-range" :class="{'is-current': isCurrentWeek}">
        {{ rangeLabel }}
        <el-tag v-if="isCurrentWeek" size="mini" type="success" effect="plain" class="week-badge">本周</el-tag>
      </div>
      <el-button class="week-nav" aria-label="下一周" @click="shiftWeek(1)">下一周<i class="el-icon-arrow-right el-icon--right"></i></el-button>
      <el-button type="text" class="week-today" :disabled="isCurrentWeek" @click="goThisWeek">回到本周</el-button>
      <span class="week-legend">
        <i class="dot dot-normal"></i>本店排班
        <i class="dot dot-target"></i>调店接单
        <i class="dot dot-leave"></i>已批准休息
        <i class="dot dot-leave-pending"></i>休息审批中
        <span class="legend-tip">点击空格子为该疗愈师排班</span>
      </span>
    </div>
    <el-alert v-if="loadError" :title="loadError" type="error" show-icon :closable="false">
      <el-button type="text" @click="fetch">重新加载</el-button>
    </el-alert>
    <div class="week-table-container" v-loading="loading">
      <el-table :data="rows" border class="week-table" :empty-text="emptyText" :max-height="tableMaxHeight">
        <el-table-column label="疗愈师" width="150" fixed>
          <template slot-scope="scope">
            <div class="massagist-name">{{ scope.row.name }}</div>
            <div class="massagist-meta">本周已排 {{ scope.row.scheduledDays }} 天</div>
            <div v-if="scope.row.restDays > 0 || scope.row.pendingLeaveDays > 0" class="massagist-meta is-rest">
              <span v-if="scope.row.restDays > 0">本周休息 {{ scope.row.restDays }} 天</span>
              <span v-if="scope.row.pendingLeaveDays > 0">{{ scope.row.restDays > 0 ? ' · ' : '' }}{{ scope.row.pendingLeaveDays }} 天待审批</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-for="col in columns" :key="col.day" min-width="150">
          <template slot="header">
            <div class="col-head" :class="{'is-today': col.isToday}">
              <span class="col-weekday">{{ col.weekday }}</span>
              <span class="col-date">{{ col.dateLabel }}</span>
            </div>
          </template>
          <template slot-scope="scope">
            <div class="week-cell" :class="{'is-today': col.isToday, 'is-past': col.isPast}"
                 @click="handleCellClick(scope.row, col)">
              <div v-for="leave in cellLeaves(scope.row, col.day)" :key="'leave-' + leave.approvalId + '-' + leave.day"
                   class="leave-chip" :class="{'is-pending': leave.pending}" :title="leaveTitle(leave)">
                <div class="chip-time">休息 {{ leave.startTime }}-{{ leave.endTime }}</div>
                <div class="chip-tag">{{ leave.pending ? '休息审批中' : '已批准休息' }}</div>
              </div>
              <div v-for="item in cellSchedules(scope.row, col.day)" :key="item.id"
                   class="shift-chip" :class="{'is-target': isTargetShop(item)}"
                   :title="chipTitle(item)" @click.stop="handleEdit(item)">
                <div class="chip-time">{{ item.startTime | hhmm }}-{{ item.endTime | hhmm }}</div>
                <div v-if="isTargetShop(item)" class="chip-tag">调店 · {{ shopName(item.targetShopId) }}</div>
                <div v-else-if="item.schedulesType == 1" class="chip-tag">调店优先</div>
              </div>
              <div v-if="!cellSchedules(scope.row, col.day).length && !cellLeaves(scope.row, col.day).length" class="cell-add">
                <i class="el-icon-plus"></i> 排班
              </div>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script>
import {mapGetters} from 'vuex'
import dayjs from 'dayjs'
import massagistSchedulesApi from '@/api/massagistSchedules'
import massagistApi from '@/api/massagist'

const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function toDay(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function mondayOf(date) {
  const d = dayjs(date)
  // dayjs 的 day(): 周日=0；这里统一把周日归到上一周的周一，保证翻页粒度恒为 7 天
  const offset = (d.day() + 6) % 7
  return d.subtract(offset, 'day').format('YYYY-MM-DD')
}

export default {
  name: 'ScheduleWeek',
  props: {
    shopId: {type: [Number, String], default: null},
    massagistId: {type: [Number, String], default: null},
    status: {type: [Number, String], default: null},
  },
  data() {
    return {
      weekStart: mondayOf(dayjs()),
      massagists: [],
      schedules: [],
      loading: false,
      loadError: '',
      requestSeq: 0,
    }
  },
  computed: {
    ...mapGetters(['shopListAll']),
    weekEnd() {
      return dayjs(this.weekStart).add(6, 'day').format('YYYY-MM-DD')
    },
    rangeLabel() {
      const start = dayjs(this.weekStart)
      const end = dayjs(this.weekEnd)
      return `${start.format('YYYY-MM-DD')} ~ ${end.format('YYYY-MM-DD')}`
    },
    isCurrentWeek() {
      return this.weekStart === mondayOf(dayjs())
    },
    columns() {
      const today = dayjs().format('YYYY-MM-DD')
      return WEEK_DAYS.map((weekday, index) => {
        const day = dayjs(this.weekStart).add(index, 'day').format('YYYY-MM-DD')
        return {
          day,
          weekday,
          dateLabel: dayjs(day).format('MM-DD'),
          isToday: day === today,
          isPast: day < today,
        }
      })
    },
    rows() {
      const allowedId = this.massagistId ? String(this.massagistId) : ''
      const byMassagist = new Map()
      const ensure = (massagistId) => {
        const key = String(massagistId)
        if (!byMassagist.has(key)) {
          byMassagist.set(key, {massagistId, name: this.massagistName(massagistId), byDay: {}, scheduledDays: 0})
        }
        return byMassagist.get(key)
      }
      this.massagists.forEach(m => ensure(m.id))
      this.schedules.forEach(schedule => {
        const day = toDay(schedule.day)
        if (!day) return
        const row = ensure(schedule.massagistId)
        if (!row.byDay[day]) row.byDay[day] = []
        row.byDay[day].push(schedule)
      })
      const rows = []
      byMassagist.forEach(row => {
        if (allowedId && String(row.massagistId) !== allowedId) return
        Object.keys(row.byDay).forEach(day => {
          row.byDay[day].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
        })
        row.scheduledDays = Object.keys(row.byDay).length
        rows.push(row)
      })
      return rows
    },
    emptyText() {
      if (!this.shopId) return '请先选择门店'
      if (this.massagistId) return '所选疗愈师无可用排班，请检查门店与筛选条件'
      return '该门店暂无符合筛选条件的疗愈师'
    },
    tableMaxHeight() {
      return Math.max(320, window.innerHeight - 300)
    },
  },
  watch: {
    shopId() {
      this.fetch()
    },
  },
  created() {
    this.$store.dispatch('setShopAllList')
    this.$store.dispatch('setMassagistList')
    this.fetch()
  },
  methods: {
    shiftWeek(step) {
      // 关键规则：左右翻页恒为整周（±7 天），不允许按天滚动
      this.weekStart = dayjs(this.weekStart).add(step * 7, 'day').format('YYYY-MM-DD')
      this.fetch()
    },
    goThisWeek() {
      this.weekStart = mondayOf(dayjs())
      this.fetch()
    },
    reload() {
      this.fetch()
    },
    async fetch() {
      if (!this.shopId) {
        this.massagists = []
        this.schedules = []
        this.loadError = ''
        return
      }
      const seq = ++this.requestSeq
      this.loading = true
      try {
        const params = {
          shopId: this.shopId,
          dayStart: this.weekStart,
          dayEnd: this.weekEnd,
          all: 1,
          limit: 2000,
          order: 'day,startTime',
        }
        const massagistParams = {shopId: this.shopId, all: 1}
        if (this.status !== null && this.status !== '' && this.status !== undefined) {
          massagistParams.status = this.status
        }
        const [massagistRes, scheduleRes] = await Promise.all([
          massagistApi.list(massagistParams),
          massagistSchedulesApi.list(params),
        ])
        if (seq !== this.requestSeq) return
        this.massagists = this.unwrapList(massagistRes)
        this.schedules = this.unwrapList(scheduleRes)
        this.loadError = ''
      } catch (e) {
        if (seq !== this.requestSeq) return
        this.massagists = []
        this.schedules = []
        this.loadError = '周视图加载失败，请重试'
      } finally {
        if (seq === this.requestSeq) this.loading = false
      }
    },
    unwrapList(res) {
      const data = res && res.data
      if (Array.isArray(data)) return data
      if (data && Array.isArray(data.list)) return data.list
      return []
    },
    cellSchedules(row, day) {
      return row.byDay[day] || []
    },
    isTargetShop(schedule) {
      return schedule && schedule.targetShopId > 0
    },
    shopName(shopId) {
      const list = this.shopListAll || []
      const shop = list.find(s => s.id == shopId)
      return shop ? shop.name : '其他门店'
    },
    massagistName(massagistId) {
      const hit = (this.massagists || []).find(m => m.id == massagistId)
      if (hit) return hit.name
      const global = this.$store.getters.massagistList || []
      const found = global.find(m => m.id == massagistId)
      return found ? found.name : `疗愈师${massagistId}`
    },
    chipTitle(schedule) {
      const time = `${this.hhmm(schedule.startTime)}-${this.hhmm(schedule.endTime)}`
      return this.isTargetShop(schedule)
        ? `${time} 调店接单：${this.shopName(schedule.targetShopId)}（点击编辑）`
        : `${time} 本店排班（点击编辑）`
    },
    handleCellClick(row, col) {
      const today = dayjs().format('YYYY-MM-DD')
      if (col.day < today) {
        this.$message.warning('不能为已过去的日期排班')
        return
      }
      this.$emit('create', {massagistId: row.massagistId, day: col.day})
    },
    handleEdit(schedule) {
      this.$emit('edit', schedule)
    },
    hhmm(value) {
      if (!value) return ''
      const parts = String(value).split(':')
      if (parts.length < 2) return ''
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
    },
  },
  filters: {
    hhmm(value) {
      if (!value) return ''
      const parts = String(value).split(':')
      if (parts.length < 2) return ''
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`
    },
  },
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.schedule-week {
  margin-top: 12px;

  .week-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 12px;

    .week-range {
      font-size: 16px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 4px;
      background: #f5f7fa;

      &.is-current {
        background: #ecf5ff;
        color: #409eff;
      }

      .week-badge {
        margin-left: 8px;
      }
    }

    .week-today {
      padding: 0;
    }

    .week-legend {
      margin-left: auto;
      color: #909399;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 6px;

      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }

      .dot-normal {
        background: #409eff;
      }

      .dot-target {
        background: #e6a23c;
      }

      .legend-tip {
        margin-left: 8px;
      }
    }
  }

  .week-table-container {
    min-height: 200px;
  }

  .col-head {
    line-height: 1.4;

    .col-weekday {
      display: block;
      font-weight: 600;
    }

    .col-date {
      display: block;
      font-size: 12px;
      color: #909399;
    }

    &.is-today .col-weekday,
    &.is-today .col-date {
      color: #409eff;
    }
  }

  .massagist-name {
    font-weight: 600;
  }

  .massagist-meta {
    font-size: 12px;
    color: #909399;
  }

  .week-cell {
    min-height: 56px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 4px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: #f5f7fa;
    }

    &.is-today {
      background: #f0f7ff;
    }

    &.is-past {
      cursor: not-allowed;
      opacity: 0.75;
    }

    .cell-add {
      color: #c0c4cc;
      font-size: 12px;
      line-height: 32px;
      text-align: center;
      border: 1px dashed transparent;
      border-radius: 4px;
    }

    &:hover .cell-add {
      color: #409eff;
      border-color: #b3d8ff;
    }

    .shift-chip {
      border-left: 3px solid #409eff;
      background: #ecf5ff;
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 12px;
      line-height: 1.5;
      color: #1f3d63;

      &.is-target {
        border-left-color: #e6a23c;
        background: #fdf6ec;
        color: #8a5a12;
      }

      .chip-time {
        font-weight: 600;
      }

      .chip-tag {
        font-size: 11px;
        opacity: 0.85;
      }
    }
  }
}

@media (max-width: 900px) {
  .schedule-week .week-toolbar .week-legend {
    margin-left: 0;
  }
}
</style>