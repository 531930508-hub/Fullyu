package com.macro.mall.utils;

import com.github.pagehelper.util.StringUtil;
import org.apache.logging.log4j.util.Strings;

import java.sql.Timestamp;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjuster;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

/**
 * @author jinlong
 */
public class DateUtil {
    private final static DateTimeFormatter FORMAT_MONTH = DateTimeFormatter.ofPattern("yyyy-MM");
    private final static DateTimeFormatter FORMAT_MM_DD = DateTimeFormatter.ofPattern("MM-dd");
    private static final DateTimeFormatter FORMAT_DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter FORMAT_DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter FORMAT_DATE_TIME_DIAGONAL = DateTimeFormatter.ofPattern("yyyy/M/d H:mm:ss");
    private static final DateTimeFormatter FORMAT_DATE_TIME_BANK = DateTimeFormatter.ofPattern("yyyy-MM-ddHH.mm.ss");
    private static final DateTimeFormatter FORMAT_DATE_MINUTE_CN = DateTimeFormatter.ofPattern("yyyy年MM月dd日 HH:mm");
    private final static DateTimeFormatter YYYYMMDD_DFM = DateTimeFormatter.ofPattern("yyyy年MM月dd日");
    private final static DateTimeFormatter HHmm_DFM = DateTimeFormatter.ofPattern("HH:mm");
    // 半个月的分钟数
    public static final int HALF_MONTH_MINUTES = 21600;

    public static String toYYYYMMDD(LocalDate date) {
        return date == null ? "" : FORMAT_DATE.format(date);
    }

    public static String toMMDD(LocalDate date) {
        return date == null ? "" : FORMAT_MM_DD.format(date);
    }

    public static String toStandString(LocalDate date) {
        return date == null ? "" : FORMAT_DATE_TIME.format(date);
    }

    public static String toStandString(LocalDateTime dateTime) {
        return dateTime == null ? "" : FORMAT_DATE_TIME.format(dateTime);
    }

    public static String getCurrentMonth() {
        return YearMonth.now().format(FORMAT_MONTH);
    }

    public static LocalDate parseYearMonth(String yearMonth) {
        if (StringUtil.isNotEmpty(yearMonth)) {
            LocalDate date = LocalDate.parse(yearMonth + "-01", FORMAT_DATE);
            return date;
        }
        return null;
    }

    public static String nowString() {
        return FORMAT_DATE_TIME.format(LocalDateTime.now());
    }

    public static String toYYYYMM(LocalDate date) {
        return date == null ? "" : FORMAT_MONTH.format(date);
    }

    public static String toYYYYMM(LocalDateTime dateTime) {
        return dateTime == null ? "" : FORMAT_MONTH.format(dateTime);
    }

    public static String toYYYYMMDD(LocalDateTime dateTime) {
        return dateTime == null ? "" : FORMAT_DATE.format(dateTime);
    }

    public static String toHHmm(LocalDateTime dateTime) {
        return dateTime == null ? "" : HHmm_DFM.format(dateTime);
    }

    public static String toHHmm(LocalTime time) {
        return time == null ? "" : HHmm_DFM.format(time);
    }

    public static LocalTime HHmmStrToTime(String time) {
        return LocalTime.parse(time, HHmm_DFM);
    }

    public static LocalDateTime string2DateTime(String text) {
        if (Strings.isBlank(text)) {
            return null;
        }
        return LocalDateTime.parse(text, FORMAT_DATE_TIME);
    }

    public static LocalDateTime stringDiagonal2DateTime(String text) {
        if (Strings.isBlank(text)) {
            return null;
        }
        return LocalDateTime.parse(text, FORMAT_DATE_TIME_DIAGONAL);
    }

    public static LocalDate stringToLocalDate(String text) {
        if (Strings.isBlank(text)) {
            return null;
        }
        return LocalDate.parse(text, FORMAT_DATE);
    }

    public static YearMonth string2YearMonth(String text) {
        if (Strings.isBlank(text)) {
            return null;
        }
        return YearMonth.parse(text, FORMAT_MONTH);
    }

    public static LocalDate date2LocalDate(Date date) {
        if (null == date) {
            return null;
        }
        return date.toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
    }

    public static LocalDateTime date2LocalDateTime(Date date) {
        if (null == date) {
            return null;
        }
        return date.toInstant().atZone(ZoneId.systemDefault()).toLocalDateTime();
    }

    public static Date localDate2Date(LocalDate localDate) {
        if (null == localDate) {
            return null;
        }
        ZonedDateTime zonedDateTime = localDate.atStartOfDay(ZoneId.systemDefault());
        return Date.from(zonedDateTime.toInstant());
    }

    public static Date localDateTime2Date(LocalDateTime localDateTime) {
        if (null == localDateTime) {
            return null;
        }
        ZonedDateTime zdt = localDateTime.atZone(ZoneId.systemDefault());
        return Date.from(zdt.toInstant());
    }

    /**
     * 时间相减得秒数
     *
     * @param start
     * @param end
     * @return
     */
    public static long diffSeconds(LocalDateTime start, LocalDateTime end) {
        Duration duration = Duration.between(start, end);
        return duration.getSeconds();
    }

    /**
     * 日期相减得分钟
     *
     * @param start
     * @param end
     * @return
     */
    public static long diffMinutes(LocalTime start, LocalTime end) {
        Duration duration = Duration.between(start, end);
        return duration.toMinutes();
    }

    /**
     * 时间相减得分钟
     *
     * @param start
     * @param end
     * @return
     */
    public static long diffMinutes(LocalDateTime start, LocalDateTime end) {
        Duration duration = Duration.between(start, end);
        return duration.toMinutes();
    }

    /**
     * 时间相减得小时数
     *
     * @param start
     * @param end
     * @return
     */
    public static long diffHours(LocalDateTime start, LocalDateTime end) {
        Duration duration = Duration.between(start, end);
        return duration.toHours();
    }

    /**
     * 时间相减的天数
     *
     * @param start
     * @param end
     * @return
     */
    public static long diffDays(LocalDateTime start, LocalDateTime end) {
        Duration duration = Duration.between(start, end);
        return duration.toDays();
    }

    /**
     * 日期相减得天数
     *
     * @param start
     * @param end
     * @return
     */
    public static int diffDays(LocalDate start, LocalDate end) {
        return (int) ChronoUnit.DAYS.between(start, end);
    }

    /**
     * 日期相减得月数
     *
     * @param start
     * @param end
     * @return
     */
    public static int diffMonths(LocalDate start, LocalDate end) {
        return (int) ChronoUnit.MONTHS.between(start, end);
    }

    /**
     * 计算两个月份相差几个月
     *
     * @param startMonth yyyy-MM
     * @param endMonth   yyyy-MM
     * @return 2023-09和2023-06得到3
     */
    public static int diffMonths(String startMonth, String endMonth) {
        YearMonth start = YearMonth.parse(startMonth);
        YearMonth end = YearMonth.parse(endMonth);
        return (int) ChronoUnit.MONTHS.between(start, end);
    }

    /**
     * 日期相减得月数
     *
     * @param start
     * @param end
     * @return
     */
    public static int diffMonths(LocalDateTime start, LocalDateTime end) {
        return (int) ChronoUnit.MONTHS.between(start, end);
    }

    /**
     * 日期相减得年
     *
     * @param start
     * @param end
     * @return
     */
    public static Integer diffYears(LocalDate start, LocalDate end) {
        Period period = Period.between(start, end);
        return period.getYears();
    }

    /**
     * 日期增加天数
     *
     * @param date
     * @param amountToAdd amountToAdd 要增加的数值，可以为负数（会减日期）
     * @return
     */
    public static LocalDateTime addDate(LocalDateTime date, int amountToAdd) {
        return addDate(date, amountToAdd, ChronoUnit.DAYS);
    }

    /**
     * 日期增加天数
     *
     * @param date
     * @param amountToAdd amountToAdd 要增加的数值，可以为负数（会减日期）
     * @return
     */
    public static LocalDate addDate(LocalDate date, int amountToAdd) {
        return addDate(date, amountToAdd, ChronoUnit.DAYS);
    }

    /**
     * 月份加
     *
     * @param monthCode   yyyy-MM
     * @param amountToAdd
     * @return yyyy-MM
     */
    public static String plusMonth(String monthCode, int amountToAdd) {
        YearMonth m = YearMonth.parse(monthCode);
        return m.plusMonths(amountToAdd).format(FORMAT_MONTH);
    }

    /**
     * 月份转为汉字描述
     *
     * @param monthCode 传入格式yyyy-MM
     * @return yyyy年MM月
     */
    public static String toChineseMonth(String monthCode) {
        if (Strings.isBlank(monthCode)) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        builder.append(monthCode.substring(0, 4));
        builder.append("年");
        builder.append(monthCode.substring(5));
        builder.append("月");
        return builder.toString();
    }

    /**
     * 日期转为汉字描述
     *
     * @param dateStr 传入格式yyyy-MM-dd
     * @return yyyy年MM月dd日
     */
    public static String toChineseDay(String dateStr) {
        if (Strings.isBlank(dateStr)) {
            return null;
        }
        StringBuilder builder = new StringBuilder();
        builder.append(dateStr.substring(0, 4));
        builder.append("年");
        builder.append(dateStr.substring(5, 7));
        builder.append("月");
        builder.append(dateStr.substring(8));
        builder.append("日");
        return builder.toString();
    }

    private static LocalDateTime addDate(LocalDateTime date, int amountToAdd, ChronoUnit unit) {
        return date.plus(amountToAdd, unit);
    }

    private static LocalDateTime minusTime(LocalDateTime time, int amountToAdd, ChronoUnit unit) {
        return time.minus(amountToAdd, unit);
    }

    private static LocalDate addDate(LocalDate date, int amountToAdd, ChronoUnit unit) {
        return date.plus(amountToAdd, unit);
    }

    /**
     * 时间相加分钟
     *
     * @param dateTime    目标时间
     * @param amountToAdd 要加的分钟数
     * @return
     */
    public static LocalDateTime addTimeByMinutes(LocalDateTime dateTime, int amountToAdd) {
        return dateTime.plus(amountToAdd, ChronoUnit.MINUTES);
    }

    /**
     * 时间相减分钟
     *
     * @param dateTime      目标时间
     * @param amountToMinus 要减的分钟数
     * @return
     */
    public static LocalDateTime minusTimeByMinutes(LocalDateTime dateTime, int amountToMinus) {
        return minusTime(dateTime, amountToMinus, ChronoUnit.MINUTES);
    }

    /**
     * 时间相加小时
     *
     * @param dateTime    目标时间
     * @param amountToAdd 要加的小时数
     * @return
     */
    public static LocalDateTime addTimeByHours(LocalDateTime dateTime, int amountToAdd) {
        return dateTime.plus(amountToAdd, ChronoUnit.HOURS);
    }

    /**
     * yyyyMM转yyyy-MM
     *
     * @param yyyyMM
     * @return yyyy-MM
     */
    public static String yyyyMM2yyyy_MM(String yyyyMM) {
        return yyyyMM.substring(0, 4) + "-" + yyyyMM.substring(4);
    }

    /**
     * yyyy-MM转yyyyMM
     *
     * @param yyyy_MM
     * @return yyyyMM
     */
    public static String yyyy_MM2yyyyMM(String yyyy_MM) {
        return yyyy_MM.replace("-", "");
    }

    /**
     * 时间减天数
     *
     * @param time
     * @param amountToMinus 要减的天数
     * @return
     */
    public static LocalDateTime minusTimeByDays(LocalDateTime time, int amountToMinus) {
        return time.minus(amountToMinus, ChronoUnit.DAYS);
    }

    /**
     * 日期是否在当月
     *
     * @param monthCode 月份：yyyy-MM
     * @param date
     * @return
     */
    public static boolean isInMonth(String monthCode, LocalDate date) {
        LocalDate start = getFirstDayOfMonth(monthCode);
        LocalDate end = getEndDayOfMonth(monthCode);
        return isBetweenStartAndEnd(date, start, end);
    }

    /**
     * 日期是否在起始和结束日期之间（包含起始和结束）
     *
     * @param date
     * @param start
     * @param end
     * @return
     */
    public static boolean isBetweenStartAndEnd(LocalDate date, LocalDate start, LocalDate end) {
        return !date.isBefore(start) && !date.isAfter(end);
    }

    /**
     * 得到所在周，周几的日期
     *
     * @param date      当前日期
     * @param dayOfWeek 周几
     * @return
     */
    public static LocalDate getDateOfWeek(LocalDate date, DayOfWeek dayOfWeek) {
        TemporalAdjuster FIRST_OF_WEEK = TemporalAdjusters
                .ofDateAdjuster(localDate -> localDate.minusDays(localDate.getDayOfWeek().getValue() - dayOfWeek.getValue()));
        return date.with(FIRST_OF_WEEK);
    }

    /**
     * 得到日期所在月的第一天日期
     *
     * @param date
     * @return
     */
    public static LocalDate getFirstOfMonth(LocalDate date) {
        return date.with(TemporalAdjusters.firstDayOfMonth());
    }

    /**
     * 得到所在月月第一天日期
     *
     * @param monthCode yyyy-MM
     * @return
     */
    public static LocalDate getFirstDayOfMonth(String monthCode) {
        YearMonth d = YearMonth.parse(monthCode);
        return d.atDay(1);
    }

    /**
     * 得到所在月月最后一天日期
     *
     * @param monthCode yyyy-MM
     * @return
     */
    public static LocalDate getEndDayOfMonth(String monthCode) {
        YearMonth d = YearMonth.parse(monthCode);
        return d.atEndOfMonth();
    }

    /**
     * 得到所在日期月最后一天日期
     *
     * @param date
     * @return
     */
    public static LocalDate getEndDayOfMonth(LocalDate date) {
        return date.with(TemporalAdjusters.lastDayOfMonth());
    }

    /**
     * 获取传入月份的月最后一天字符串：yyyy-MM-dd
     *
     * @param monthCode
     * @return yyyy-MM-dd
     */
    public static String getEndDayStrOfMonth(String monthCode) {
        YearMonth d = YearMonth.parse(monthCode);
        return toYYYYMMDD(d.atEndOfMonth());
    }

    /**
     * 获取当前月份第一天
     *
     * @return yyyy-MM-01
     */
    public static String getStartDayStrOfMonth() {
        return getCurrentMonthCode() + "-01";
    }

    /**
     * 获取当前月份yyyy-MM
     *
     * @return yyyy-MM
     */
    public static String getCurrentMonthCode() {
        return YearMonth.now().format(FORMAT_MONTH);
    }

    /**
     * 获取当前月份的下一个月code
     *
     * @return yyyy-MM
     */
    public static String getNextMonthCode() {
        return YearMonth.now().plusMonths(1).format(FORMAT_MONTH);
    }

    /**
     * 获取指定月份的下月月份
     *
     * @return yyyy-MM
     */
    public static String getNextMonthCode(String monthCode) {
        return plusMonth(monthCode, 1);
    }

    /**
     * 获取当前日期的上一个月
     *
     * @return yyyy-MM
     */
    public static String getLastMonthCode() {
        return minusMonth(YearMonth.now().format(FORMAT_MONTH), 1);
    }

    /**
     * 获取指定月份的上月月份
     *
     * @param yearMonth yyyy-MM
     * @return yyyy-MM
     */
    public static String getLastMonthCode(String yearMonth) {
        return minusMonth(yearMonth, 1);
    }

    /**
     * 月份减
     *
     * @param monthCode    yyyy-MM
     * @param monthToMinus
     * @return yyyy-MM
     */
    public static String minusMonth(String monthCode, int monthToMinus) {
        YearMonth yearMonth = YearMonth.parse(monthCode);
        return yearMonth.minusMonths(monthToMinus).format(FORMAT_MONTH);
    }

    /**
     * 是否为季初月份
     *
     * @param monthCode yyyy-MM
     * @return
     */
    public static boolean isSEarlySeason(String monthCode) {
        if (Strings.isBlank(monthCode)) {
            return false;
        }
        int month = Integer.parseInt(monthCode.substring(5));
        if (month == 1 || month == 4 || month == 7 || month == 10) {
            return true;
        }
        return false;
    }

    /**
     * 获取当前日期字符串
     *
     * @return yyyy-MM-dd
     */
    public static String getCurrentDateCode() {
        return LocalDate.now().format(FORMAT_DATE);
    }

    /**
     * 获取昨天的日期字符串
     *
     * @return
     */
    public static String getYesterdayCode() {
        return LocalDate.now().minusDays(1).format(FORMAT_DATE);
    }

    /**
     * 获取当前日期时间字符串
     *
     * @return
     */
    public static String getCurrentDateTimeCode() {
        return LocalDateTime.now().format(FORMAT_DATE_TIME);
    }

    /**
     * 获取当前事件的分钟级别的时间字符串
     *
     * @return
     */
    public static String getCurrentDateMinuteCode() {
        return LocalDateTime.now().format(FORMAT_DATE_MINUTE_CN);
    }

    public static String toDateMinute(LocalDateTime dateTime) {
        return dateTime == null ? "" : FORMAT_DATE_MINUTE_CN.format(dateTime);
    }

    /**
     * 获取明天的日期
     *
     * @return
     */
    public static LocalDate getNextDate() {
        LocalDate nextDate = addDate(LocalDate.now(), 1);
        return nextDate;
    }

    /**
     * 时间转为时间戳
     *
     * @param time
     * @return
     */
    public static Long time2Timestamp(LocalDateTime time) {
        return time.toInstant(ZoneOffset.of("+8")).toEpochMilli();
    }

    /**
     * 时间转为时间戳(带毫秒)
     * yyyy-MM-dd HH:mm:ss形式的LocalDateTime转为时间戳后，没有带毫秒
     *
     * @param time
     * @return
     */
    public static Long time2TimestampWithMilli(LocalDateTime time) {
        Timestamp timestamp = Timestamp.valueOf(LocalDateTime.now());
        return timestamp.getTime() + 999;
    }

    /**
     * 时间戳转为时间
     *
     * @param timestamp
     * @return
     */
    public static LocalDateTime timestamp2Time(Long timestamp) {
        Instant instant = Instant.ofEpochMilli(timestamp);
        return LocalDateTime.ofInstant(instant, ZoneId.systemDefault());
    }

    /**
     * 时间戳转为 字符串yyyy-MM-dd HH:mm:ss
     *
     * @param timestamp 时间戳（毫秒）
     * @return yyyy-MM-dd HH:mm:ss
     */
    public static String timestamp2TimeStr(Long timestamp) {
        if (timestamp == null) {
            return null;
        }
        LocalDateTime time = timestamp2Time(timestamp);
        return toStandString(time);
    }

    /**
     * 时间戳转为 字符串yyyy-MM-dd
     *
     * @param timestamp 时间戳（毫秒）
     * @return yyyy-MM-dd HH:mm:ss
     */
    public static String timestamp2DateStr(Long timestamp) {
        if (timestamp == null) {
            return null;
        }
        LocalDateTime time = timestamp2Time(timestamp);
        return toYYYYMMDD(time.toLocalDate());
    }

    public static String formatYYYYMMDD2(LocalDateTime date) {
        return date == null ? "" : YYYYMMDD_DFM.format(date);
    }

    public static Date asDate(LocalDateTime localDateTime) {
        return Date.from(localDateTime.atZone(ZoneId.systemDefault()).toInstant());
    }

    /**
     * 获取几个月前的时间
     *
     * @param minusMonths 减去的月数
     * @return 几个月前的时间
     */
    public static String getCurrDateTimeAndMinusMonths(long minusMonths) {
        String format = LocalDateTime.now().minusMonths(minusMonths).format(FORMAT_DATE_TIME);
        return format;
    }

    /**
     * 获取月份列表
     *
     * @param startMonth
     * @param endMonth
     * @return
     */
    public static List<String> getMonths(String startMonth, String endMonth) {
        if (Strings.isBlank(startMonth) || Strings.isBlank(endMonth)) {
            return null;
        }
        if (startMonth.equals(endMonth)) {
            return Arrays.asList(startMonth);
        }
        int year = Integer.valueOf(startMonth.substring(0, 4));
        int month = Integer.valueOf(startMonth.substring(5));
        List<String> months = new ArrayList<>();
        months.add(startMonth);
        while (true) {
            month++;
            if (month > 12) {
                year++;
                month = 1;
            }
            StringBuilder b = new StringBuilder();
            b.append(year);
            b.append("-");
            if (month < 10) {
                b.append("0");
            }
            b.append(month);
            String monthCode = b.toString();
            months.add(monthCode);
            if (monthCode.equals(endMonth)) {
                break;
            }
        }
        return months;
    }

    /**
     * 获取最近count个月的月份列表
     *
     * @return
     */
    public static List<String> findLastMonth(int count) {
        if (count == 0) {
            return Arrays.asList(getCurrentMonth());
        } else if (count < 0) {
            return Collections.emptyList();
        }
        String currentMonth = getCurrentMonth();
        String startMonth = minusMonth(currentMonth, count - 1);
        List<String> months = getMonths(startMonth, currentMonth);
        return months;
    }

    /**
     * 根据年查找本年的所有月份列表
     *
     * @param year
     * @return
     */
    public static List<String> findYearMonth(Integer year) {
        String startMonth = year + "-01";
        String currentMonth = getCurrentMonth();
        Integer currentYear = Integer.parseInt(currentMonth.substring(0, 4));
        if (year.equals(currentYear)) {
            return getMonths(startMonth, currentMonth);
        } else {
            return getMonths(startMonth, year + "-12");
        }
    }

    public static LocalDateTime parseToBank(String text) {
        if (Strings.isBlank(text)) {
            return null;
        }
        return LocalDateTime.parse(text, FORMAT_DATE_TIME_BANK);
    }

    /**
     * 根据开始月和结束月获取季度(开始结束不能跨年)
     *
     * @param startMonth yyyy-MM
     * @param endMonth   yyyy-MM
     * @return 返回季度列表：2023-04 2023-09 返回 2，3
     */
    public static List<Integer> getSeasons(String startMonth, String endMonth) {
        if (Strings.isBlank(startMonth) || Strings.isBlank(endMonth)) {
            return null;
        }
        int startMonthCount = Integer.valueOf(startMonth.substring(5));
        int endMonthCount = Integer.valueOf(endMonth.substring(5));
        List<Integer> seasons = new ArrayList<>();
        while (true) {
            if (startMonthCount < 4) {
                seasons.add(1);
                startMonthCount = 4;
            } else if (startMonthCount < 7) {
                seasons.add(2);
                startMonthCount = 7;
            } else if (startMonthCount < 10) {
                seasons.add(3);
                startMonthCount = 10;
            } else {
                seasons.add(4);
                return seasons;
            }
            if (startMonthCount > endMonthCount) {
                return seasons;
            }
        }
    }

    public static String getStartDayStrOfSeason(int year, int season) {
        if (season == 1) {
            return year + "-01-01";
        }
        if (season == 2) {
            return year + "-04-01";
        }
        if (season == 3) {
            return year + "-07-01";
        }
        if (season == 4) {
            return year + "-10-01";
        }
        return null;
    }

    public static String getEndDayStrOfSeason(int year, int season) {
        if (season == 1) {
            return year + "-03-31";
        }
        if (season == 2) {
            return year + "-06-30";
        }
        if (season == 3) {
            return year + "-09-30";
        }
        if (season == 4) {
            return year + "-12-31";
        }
        return null;
    }

    /**
     * 找下一个15分时间
     *
     * @param time
     * @return
     */
    public static LocalDateTime findNextTime(LocalDateTime time) {
        int hour = time.getHour();
        if (hour < 10) {
            time = time.withHour(10).withMinute(0).withSecond(0);
            return time;
        }
        if (hour > 23) {
            time = time.withHour(23).withMinute(0).withSecond(0);
            return time;
        }
        int minute = time.getMinute();
        if (minute < 15) {
            time = time.withMinute(15);
        } else if (minute < 30) {
            time = time.withMinute(30);
        } else if (minute < 45) {
            time = time.withMinute(45);
        } else {
            time = time.plusHours(1);
            time = time.withMinute(0);
        }
        time = time.withSecond(0);
        return time;
    }


    public static void main(String[] args) {
//        String currDateTimeAndMinusMonths = getNextMonthCode();
//        String s = toChineseMonth(currDateTimeAndMinusMonths);
//        System.out.println(s);

        System.out.println(timestamp2TimeStr(2029852800000L));
        System.out.println(timestamp2DateStr(1715327878000L));
        System.out.println(getEndDayOfMonth("2023-03"));
    }
}
