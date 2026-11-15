<template>
  <div class="birthday-picker">
    <el-select v-model="month" class="birthday-picker__select" placeholder="月" @change="onMonthChange">
      <el-option v-for="m in 12" :key="m" :label="`${m} 月`" :value="m"></el-option>
    </el-select>
    <span class="birthday-picker__sep">-</span>
    <el-select v-model="day" class="birthday-picker__select" placeholder="日" :disabled="!month"
               @change="onDayChange">
      <el-option v-for="d in dayOptions" :key="d" :label="`${d} 日`" :value="d"></el-option>
    </el-select>
    <el-button v-if="value" type="text" class="birthday-picker__clear" @click="clear">清除</el-button>
  </div>
</template>

<script>
import { BIRTHDAY_PLACEHOLDER_YEAR } from '@/utils/birthday'

const ymd = (month, day) =>
  `${BIRTHDAY_PLACEHOLDER_YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

function daysInMonth(month) {
  if (!month) return 31
  // 占位年是闰年，2 月固定 29 天，2/29 生日才选得出来
  return new Date(BIRTHDAY_PLACEHOLDER_YEAR, month, 0).getDate()
}

export default {
  name: 'BirthdayPicker',
  props: {
    // yyyy-MM-dd；年份只是占位，界面只让选月和日
    value: {
      type: String,
      default: null
    }
  },
  data() {
    return {
      month: null,
      day: null
    }
  },
  computed: {
    dayOptions() {
      return Array.from({ length: daysInMonth(this.month) }, (_, index) => index + 1)
    }
  },
  watch: {
    value: {
      immediate: true,
      handler(value) {
        this.syncFromValue(value)
      }
    }
  },
  methods: {
    syncFromValue(value) {
      const matched = value ? String(value).match(/^(\d{4})-(\d{2})-(\d{2})/) : null
      const month = matched ? Number(matched[2]) : null
      const day = matched ? Number(matched[3]) : null
      this.month = month
      this.day = day
      //老数据带真实年份时顺手归一到占位年，避免库里混着两种口径
      if (matched && Number(matched[1]) !== BIRTHDAY_PLACEHOLDER_YEAR) {
        this.emitValue(ymd(month, day))
      }
    },
    onMonthChange() {
      if (!this.month) {
        this.day = null
        this.emitValue(null)
        return
      }
      const total = daysInMonth(this.month)
      if (this.day && this.day > total) {
        this.day = total
      }
      this.emitValue()
    },
    onDayChange() {
      this.emitValue()
    },
    emitValue(value) {
      const next = value === undefined
        ? (this.month && this.day ? ymd(this.month, this.day) : null)
        : value
      if (next === (this.value || null)) return
      this.$emit('input', next)
    },
    clear() {
      this.month = null
      this.day = null
      this.emitValue(null)
    }
  }
}
</script>

<style rel="stylesheet/less" lang="less" scoped>
.birthday-picker {
  display: inline-flex;
  align-items: center;

  &__select {
    width: 100px;
  }

  &__sep {
    margin: 0 6px;
    color: #909399;
  }

  &__clear {
    margin-left: 4px;
    padding: 0;
  }
}
</style>