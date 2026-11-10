import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(customParseFormat)
dayjs.extend(isBetween)
export default {
  /**
   * 获取当前月份字符串
   * @returns {string}
   */
  getCurrentMonthCode(format = 'YYYY-MM') {
    return dayjs().format(format)
  },
  /**
   * 获取当前年份字符串
   * @returns {string}
   */
  getCurrentYear(format = 'YYYY') {
    return dayjs().format(format)
  },
  /**
   * 获取上月份字符串
   * @returns {string}
   */
  getLastMonthChinese(format = 'YYYY年MM月') {
    return dayjs().subtract(1, 'M').format(format)
  },
  /**
   * 获取上月份字符串
   * @returns {string}
   */
  getLastMonthCode(format = 'YYYY-MM') {
    return dayjs().subtract(1, 'M').format(format)
  },
  /*获取当前周第一天*/
  getCurrentWeekCode(format = 'YYYY-MM-DD') {
    return dayjs().startOf('week').add(1, 'day').format(format)
  },
  getCurrentDateCode(format = 'YYYY-MM-DD') {
    return dayjs().format(format)
  },
  getCurrentDateCodeAdd(day, format = 'YYYY-MM-DD') {
    return dayjs().add(day, 'day').format(format)
  },
  getCurrentTimeCode() {
    return dayjs().format('YYYY-MM-DD HH:mm:ss')
  },
  timestampFormat(ts, format = 'YYYY-MM-DD HH:mm:ss') {
    return dayjs(ts).format(format)
  },
  /**
   * 字符串转为日期
   * @param str
   * @param format
   * @returns {dayjs.Dayjs}
   */
  parseDate(str, format = 'YYYY-MM-DD') {
    if (!str) {
      return dayjs()
    }
    return dayjs(str, format)
  },
  /**
   * 格式化
   * @param str 原日期时间字符串
   * @param strFormat 原日期时间字符串格式
   * @param targetFormat 目标日期时间字符串格式
   * @returns {string}
   */
  format(str, targetFormat = 'YYYY年MM月DD日', strFormat = 'YYYY-MM-DD HH:mm:ss') {
    if (!str) {
      return ''
    }
    return dayjs(str, strFormat).format(targetFormat)
  },
  formatWeek(str, targetFormat = 'd') { // 数字星期几（0-6，0是周日）
    if (!str) {
      return ''
    }
    return dayjs(str).format('d')
  },
  /**
   * 目标时间减当前时间得秒
   * @param str
   * @param strFormat
   * @returns {number}
   */
  subtractSecond(str, strFormat = 'YYYY-MM-DD HH:mm:ss') {
    if (!str) {
      return 0
    }
    return dayjs(str, strFormat).diff(dayjs(), 'second')
  },
  /**
   * 月份减
   * @param monthCode yyyy-MM
   * @param count 要减的月份
   * @returns {string} yyyy-MM
   */
  subtractMonth(monthCode, count) {
    return dayjs(monthCode).subtract(count, 'M').format('YYYY-MM')
  },
  /**
   * 天数减
   * @param dateCode yyyy-MM-dd
   * @param count 要减去的天数
   * @returns {string} yyyy-MM-dd
   */
  subtractDay(dateCode, count = 0) {
    return dayjs(dateCode).subtract(count, 'd').format('YYYY-MM-DD')
  },
  /**
   * 月份加
   * @param monthCode yyyy-MM
   * @param count 要加的月份
   * @returns {string}yyyy-MM
   */
  addMonth(monthCode, count) {
    return dayjs(monthCode).add(1, 'M').format('YYYY-MM')
  },
  /**
   * 日期加
   * @param monthCode yyyy-MM-dd HH:mm:ss
   * @param count 要加的天数
   * @returns {string}yyyy-MM-dd HH:mm:ss
   */
  addDay(dayCode, count = 1, format = 'YYYY-MM-DD HH:mm:ss') {
    return dayjs(dayCode).add(count, 'd').format(format)
  },
  /**
   * 秒数加
   * @param monthCode yyyy-MM-dd HH:mm:ss
   * @param count 秒数
   * @returns {string}yyyy-MM-dd HH:mm:ss
   */
  addSeconds(dayCode, count = 1, format = 'YYYY-MM-DD HH:mm:ss') {
    return dayjs(dayCode).add(count, 's').format(format)
  },
  toDate(dateStr, format = 'YYYY-MM-DD') {
    return dayjs(dateStr).format(format)
  },
  toDateTime(dateStr, format = 'YYYY-MM-DD HH:mm:ss') {
    return dayjs(dateStr, format)
  },
  toSeconds(dateStr, format = 'YYYY-MM-DD HH:mm:ss') {
    return dayjs(dateStr, format).unix()
  },
  unixToTime(dateStr, format = 'YYYY-MM-DD HH:mm:ss') {
    return dayjs.unix(dateStr).format(format)
  },
  /*将字符串时间转为Date*/
  toDateFormat(dateStr) {
    return dayjs(dateStr).toDate()
  },
  /**
   * 秒转换为天时分秒中文描述
   * @param second
   * @param showMinutesAndSecond 是否显示分和秒
   * @param toHour 是否只显示到小时
   * @returns {string} 时间描述 xx个月，xx天，xx个小时，xx分钟
   */
  second2String(second, toHour = false) {
    second = parseInt(second)
    const days = Math.floor(second / 86400)
    second = second % 86400
    const hours = Math.floor(second / 3600)
    second = second % 3600
    let stringTime = ''
    if (days > 0) {
      stringTime = `${days}天`
    }
    if (hours > 0) {
      stringTime = `${stringTime}${hours}小时`
    }
    // 有天或者小时，直接返回
    if (toHour && (days > 0 || hours > 0)) {
      return stringTime
    }
    const minutes = Math.floor(second / 60)
    second = second % 60
    if (minutes > 0) {
      stringTime = `${stringTime}${minutes}分`
    }
    if (second > 0) {
      stringTime = `${stringTime}${second}秒`
    }
    return stringTime
  },
  /**
   * 转为时间描述
   * @param dateTimeStr 时间yyyy-MM-dd HH:mm:ss
   * @returns {string} 时间描述 xx个月，xx天，xx个小时，xx分钟
   */
  millisecond2TimeDesc(dateTimeStr) {
    const currentMillSeconds = dayjs().unix()
    let seconds = this.toSeconds(dateTimeStr)
    seconds = currentMillSeconds - seconds
    if (seconds < 60) {
      return '刚刚';
    }
    const years = Math.floor(seconds / 31104000)
    if (years > 0) {
      return years + '年前'
    }
    const months = Math.floor(seconds / 2592000)
    if (months > 0) {
      return months + '个月前'
    }
    const days = Math.floor(seconds / 86400)
    if (days > 0) {
      return days + '天前'
    }
    const hours = Math.floor(seconds / 3600)
    if (hours > 0) {
      return hours + '个小时前'
    }
    const minutes = Math.floor(seconds / 60)
    if (minutes > 0) {
      return minutes + '分钟前'
    }
    return ''
  },
  /**
   * 求已等待时间
   * @param startTimeStr 开始时间：yyyy-MM-dd HH:mm:ss
   * @returns {string} 等待时间的中文描述
   */
  waitTimeString(startTimeStr) {
    if (!startTimeStr) {
      return ''
    }
    const startTime = this.toDateTime(startTimeStr)
    const waitSeconds = dayjs().diff(startTime, 'seconds')
    if (waitSeconds <= 0) {
      return '还没开始'
    }
    return this.second2String(waitSeconds)
  },
  /**
   * 求剩余时间
   * @param deadLineStr 截止时间：yyyy-MM-dd HH:mm:ss
   * @returns {string} 剩余时间的中文描述
   */
  surplusTimeString(deadLineStr) {
    const startTime = this.toDateTime(deadLineStr)
    const surplusSeconds = startTime.diff(dayjs(), 'seconds')
    if (surplusSeconds <= 0) {
      return '已超时'
    }
    return this.second2String(surplusSeconds)
  },
  /**
   * 求使用时间
   * @param startTimeStr 开始时间：yyyy-MM-dd HH:mm:ss
   * @param deadLineStr 完成时间：yyyy-MM-dd HH:mm:ss
   * @returns {string} 使用时间的中文描述
   */
  usedTimeString(startTimeStr, finishTimeStr) {
    if (!finishTimeStr) {
      return '未完成'
    }
    const startTime = this.toDateTime(startTimeStr)
    const finishTime = this.toDateTime(finishTimeStr)
    const usedSeconds = finishTime.diff(startTime, 'seconds')
    if (usedSeconds <= 0) {
      return '提前完成'
    }
    return this.second2String(usedSeconds)
  },
  passedTimeString(startTimeStr) {
    const startTime = this.toDateTime(startTimeStr)
    const usedSeconds = dayjs().diff(startTime, 'seconds')
    if (usedSeconds <= 0) {
      return '提前完成'
    }
    return this.second2String(usedSeconds)
  },
  currDateTimeSubDay(day) {
    return (day ? dayjs().subtract(day, 'day') : dayjs())
  },
  /**
   * 当前月月减一
   * @param dateTime YYYY年MM月  需要月份减一的时间
   */
  monthSubtractOne(dateTime, subtractMonth = 1, format = 'YYYY年MM月') {
    return dayjs(dateTime.replace(/[年月]/g, '-')).subtract(subtractMonth, 'month').format(format)
  },

  dateFormat: (date, format = 'YYYY-MM-DD') => {
    return dayjs(date).format(format)
  },

  waitSeconds(startTimeStr) {
    const startTime = dayjs(startTimeStr, 'YYYY-MM-DD HH:mm:ss')
    return dayjs().diff(startTime, 'seconds')
  },
  currBeforeDay(d) {
    return dayjs().diff(d, 'days')
  },
  /**
   * 根据闯进来的字符串时间 返回 day天后的 过期时间
   * @param date
   * @param format
   * @param day
   * @returns {string}
   */
  expiredDate: (date, format, day) => {
    return dayjs(date).add(day, 'days').format(format)
  },
  //月份加带天数
  dateAddMonth(strDate, month) {
    return dayjs(strDate).add(month, 'M').format('YYYY-MM-DD')
  },
  /**
   * 时间是否在给定时间区间
   */
  dateIsBetween(dataTime, startTime, endTime) {
    return dayjs(dataTime).isBetween(startTime, endTime)
  },
  /**
   * 两个时间差
   */
  dateDiff(startTime, endTime, unit = 'minutes') {
    return dayjs(endTime).diff(startTime, unit)
  },
  getWeek(dateTime) {
    let day = dayjs(dateTime).day()
    let week = ['日', '一', '二', '三', '四', '五', '六']
    return '周' + week[day]
  },
  /**
   * 判断传入的时间字符串是否是今天
   * @param dateStr
   * @returns {boolean}
   */
  isToday(dateStr) {
    if (dateStr) {
      return this.getCurrentDateCode() == this.toDate(dateStr)
    }
  },
  isBefore(createTime, endTime) {
    return dayjs(createTime).isBefore(dayjs(endTime))
  },
  isAfterNoon() {//判断当前时间是否超过12点
    const now = dayjs();
    const noon = dayjs().hour(12).minute(0).second(0);
    const isAfterNoon = now.isAfter(noon);
    return isAfterNoon;
  },
  unixMsToTime(dateStr, format = 'YYYY-MM-DD HH:mm:ss') {
    return dayjs(dateStr).format(format)
  }
}
