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
        <i class="dot dot-inbound"></i>调入本店
        <i class="dot dot-leave"></i>已批准休息
        <i class="dot dot-leave-pending"></i>休息审批中
        <span class="legend-tip">点击空格子为该疗愈师排班</span>
      </span>
    </div>
    <el-alert v-if="loadError" :title="loadError" type="error" show-icon :closable="false">
      <el-button type="text" @click="fetch">重新加载</el-button>
    </el-alert>
    <el-alert v-if="leaveError" :title="leaveError" type="warning" show-icon :closable="false" class="leave-error">
      <el-button type="text" @click="fetch">重新加载</el-button>
    </el-alert>
    <div class="week-table-container" v-loading="loading">
      <el-table :data="rows" border class="week-table" :empty-text="emptyText" :max-height="tableMaxHeight">
        <el-table-column label="疗愈师" width="150" fixed>
          <template slot-scope="scope">
            <div class="massagist-name">{{ scope.row.name }}</div>
            <div v-if="scope.row.borrowed" class="massagist-meta">
              <el-tag size="mini" type="warning" effect="plain">借调 · 来自{{ shopName(scope.row.homeShopId) }}</el-tag>
            </div>
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
                   class="leave-chip" :class="{'is-pending': leave.pending}" :title="leaveTitle(leave)" @click.stop>
                <div class="chip-time">休息 {{ leave.startTime }}-{{ leave.endTime }}</div>
                <div class="chip-tag">{{ leave.pending ? '休息审批中' : '已批准休息' }}</div>
              </div>
              <div v-for="item in cellSchedules(scope.row, col.day)" :key="item.id"
                   class="shift-chip" :class="{'is-target': isTargetShop(item), 'is-inbound': isInbound(item)}"
                   :title="chipTitle(item)" @click.stop="handleChipClick(item)">
                <div class="chip-time">{{ item.startTime | hhmm }}-{{ item.endTime | hhmm }}</div>
                <div v-if="chipTag(item)" class="chip-tag">{{ chipTag(item) }}</div>
              </div>
              <div v-if="!scope.row.borrowed && !cellSchedules(scope.row, col.day).length && !cellLeaves(scope.row, col.day).length" class="cell-add">
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
import massagistLeaveApi from '@/api/massagistLeave'

const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

function toDay(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function roundDays(value) {
  const num = Number(value)
  if (!num) return 0
  return Math.round(num * 100) / 100
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
      shifts: [],
      leaves: [],
      leaveStats: {},
      shopNames: {},
      loading: false,
      loadError: '',
      leaveError: '',
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
      const statusFilter = this.status === null || this.status === '' || this.status === undefined
        ? '' : String(this.status)
      const byMassagist = new Map()
      // 行只按名册生成：后端给的名册 = 本店疗愈师 + 本周被借调到本店的人。
      // 状态/疗愈师筛选在本地做，切筛选条件不必重新请求。
      this.massagists.forEach(m => {
        const key = String(m.id)
        if (statusFilter && String(m.status) !== statusFilter) return
        if (allowedId && key !== allowedId) return
        byMassagist.set(key, {
          massagistId: m.id,
          name: m.name,
          homeShopId: m.shopId,
          // 档案不在本店、只是本周被借调过来的人：本店只读，排班/编辑都要回到原店
          borrowed: String(m.shopId) !== String(this.shopId),
          byDay: {},
          byLeaveDay: {},
          scheduledDays: 0,
          restDays: 0,
          pendingLeaveDays: 0,
        })
      })
      this.shifts.forEach(shift => {
        const row = byMassagist.get(String(shift.massagistId))
        const day = toDay(shift.day)
        if (!row || !day) return
        if (!row.byDay[day]) row.byDay[day] = []
        row.byDay[day].push(shift)
      })
      this.leaves.forEach(leave => {
        const row = byMassagist.get(String(leave.massagistId))
        const day = toDay(leave.day)
        if (!row || !day) return
        if (!row.byLeaveDay[day]) row.byLeaveDay[day] = []
        row.byLeaveDay[day].push(leave)
      })
      byMassagist.forEach(row => {
        Object.keys(row.byDay).forEach(day => {
          row.byDay[day].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
        })
        Object.keys(row.byLeaveDay).forEach(day => {
          row.byLeaveDay[day].sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
        })
        const stat = this.leaveStats[String(row.massagistId)] || {}
        row.scheduledDays = Object.keys(row.byDay).length
        row.restDays = roundDays(stat.restDays)
        row.pendingLeaveDays = Number(stat.pendingDates || 0)
      })
      return Array.from(byMassagist.values())
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
        this.shifts = []
        this.leaves = []
        this.leaveStats = {}
        this.shopNames = {}
        this.loadError = ''
        this.leaveError = ''
        return
      }
      const seq = ++this.requestSeq
      this.loading = true
      const range = {shopId: this.shopId, dayStart: this.weekStart, dayEnd: this.weekEnd}
      try {
        // 休息看板是补充信息：它挂了不能把整周班表一起打空，单独降级成一条提示
        const [boardRes, leaveRes] = await Promise.all([
          massagistSchedulesApi.weekBoard(range),
          massagistLeaveApi.weekBoard(range).catch(() => null),
        ])
        if (seq !== this.requestSeq) return
        const board = (boardRes && boardRes.data) || {}
        this.massagists = Array.isArray(board.massagists) ? board.massagists : []
        this.shifts = Array.isArray(board.shifts) ? board.shifts : []
        this.shopNames = board.shops || {}
        const leaveBoard = leaveRes && leaveRes.data
        this.leaves = leaveBoard && Array.isArray(leaveBoard.leaves) ? leaveBoard.leaves : []
        this.leaveStats = (leaveBoard && leaveBoard.stats) || {}
        this.leaveError = leaveBoard ? '' : '休息数据加载失败，本周只显示排班'
        this.loadError = ''
      } catch (e) {
        if (seq !== this.requestSeq) return
        this.massagists = []
        this.shifts = []
        this.leaves = []
        this.leaveStats = {}
        this.shopNames = {}
        this.loadError = '周视图加载失败，请重试'
      } finally {
        if (seq === this.requestSeq) this.loading = false
      }
    },
    cellSchedules(row, day) {
      return row.byDay[day] || []
    },
    cellLeaves(row, day) {
      return row.byLeaveDay[day] || []
    },
    isTargetShop(schedule) {
      // 本店的人被调到别家店：当天不在本店接单
      return !!(schedule && schedule.targetShopId > 0 && !this.isInbound(schedule))
    },
    isInbound(schedule) {
      // 主场次在别的店、调店目标才是当前看板门店：她是被借调过来上班的
      return !!(schedule && schedule.targetShopId > 0
        && String(schedule.shopId) !== String(this.shopId))
    },
    shopName(shopId) {
      const key = String(shopId)
      if (this.shopNames[key]) return this.shopNames[key]
      const list = this.shopListAll || []
      const shop = list.find(s => s.id == shopId)
      return shop ? shop.name : `门店${shopId}`
    },
    chipTag(schedule) {
      if (this.isInbound(schedule)) return `调入 · 来自${this.shopName(schedule.shopId)}`
      if (this.isTargetShop(schedule)) return `调店 · ${this.shopName(schedule.targetShopId)}`
      if (schedule.schedulesType == 1) return '调店优先'
      return ''
    },
    chipTitle(schedule) {
      const time = `${this.hhmm(schedule.startTime)}-${this.hhmm(schedule.endTime)}`
      if (this.isInbound(schedule)) {
        return `${time} 从${this.shopName(schedule.shopId)}调入本店（归属${this.shopName(schedule.shopId)}，本店只读）`
      }
      if (this.isTargetShop(schedule)) {
        return `${time} 调店接单：${this.shopName(schedule.targetShopId)}（点击编辑）`
      }
      return `${time} 本店排班（点击编辑）`
    },
    leaveTitle(leave) {
      const state = leave.pending ? '休息审批中' : '已批准休息'
      const fullDay = leave.fullDay ? '（整天）' : ''
      return `休息 ${leave.startTime}-${leave.endTime} · ${state}${fullDay}`
    },
    handleCellClick(row, col) {
      if (row.borrowed) {
        this.$message.info(`该疗愈师属于${this.shopName(row.homeShopId)}，排班请到所属门店，或用“调店”入口调整`)
        return
      }
      const today = dayjs().format('YYYY-MM-DD')
      if (col.day < today) {
        this.$message.warning('不能为已过去的日期排班')
        return
      }
      this.$emit('create', {massagistId: row.massagistId, day: col.day})
    },
    handleChipClick(schedule) {
      // 调入班次的归属店不是本店，改它会被后端按门店作用域拒绝，这里直接说明只读
      if (this.isInbound(schedule)) {
        this.$message.info(`该班次归属${this.shopName(schedule.shopId)}，本店仅查看借调安排`)
        return
      }
      this.handleEdit(schedule)
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

      .dot-inbound {
        background: #fff;
        border: 2px solid #e6a23c;
      }

      .dot-leave {
        background: #67c23a;
      }

      .dot-leave-pending {
        background: #c0c4cc;
      }

      .legend-tip {
        margin-left: 8px;
      }
    }
  }

  .leave-error {
    margin-top: 8px;
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

    .chip-time {
      font-weight: 600;
    }

    .chip-tag {
      font-size: 11px;
      opacity: 0.85;
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

      &.is-inbound {
        border-left-style: dashed;
        border-left-color: #e6a23c;
        background: #fdf6ec;
        color: #8a5a12;
      }
    }

    .leave-chip {
      border-left: 3px solid #67c23a;
      background: #f0f9eb;
      border-radius: 4px;
      padding: 4px 6px;
      font-size: 12px;
      line-height: 1.5;
      color: #3f6b2b;

      &.is-pending {
        border-left-color: #c0c4cc;
        background: #f4f4f5;
        color: #606266;
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