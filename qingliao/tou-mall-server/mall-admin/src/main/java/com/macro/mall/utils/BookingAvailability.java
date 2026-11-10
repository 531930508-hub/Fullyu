package com.macro.mall.utils;

import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.entity.OrderDetail;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

/** 预约数字口径：床位有整理间隔，疗愈师没有；手动排单不使用床位间隔作硬限制。 */
public final class BookingAvailability {
    private BookingAvailability() { }

    public static boolean overlaps(LocalDateTime start, LocalDateTime end,
                                   LocalDateTime otherStart, LocalDateTime otherEnd, int gap) {
        if (start == null || end == null || otherStart == null || otherEnd == null) return false;
        int minutes = Math.max(0, gap);
        return start.isBefore(otherEnd.plusMinutes(minutes)) && otherStart.isBefore(end.plusMinutes(minutes));
    }

    public static Set<Long> scheduledIds(LocalDateTime start, List<MassagistSchedules> shifts) {
        Set<Long> ids = new HashSet<>();
        if (shifts == null) return ids;
        for (MassagistSchedules s : shifts) {
            if (start == null || s.getStartTime() == null || s.getEndTime() == null || s.getMassagistId() == null) continue;
            // 时段查询 SQL 按日期过滤后不一定带回 day 列，此时以查询时段所在日期为准
            LocalDate day = s.getDay() != null ? s.getDay() : start.toLocalDate();
            LocalDateTime from = day.atTime(s.getStartTime());
            LocalDateTime to = day.atTime(s.getEndTime());
            if (!to.isAfter(from)) to = to.plusDays(1);
            if (!start.isBefore(from) && start.isBefore(to)) ids.add(s.getMassagistId());
        }
        return ids;
    }

    /** 排班实际服务门店：调店时以目标门店为准。 */
    public static Long effectiveShopId(MassagistSchedules s) {
        if (s == null) return null;
        Long target = s.getTargetShopId();
        return target != null && target > 0 ? target : s.getShopId();
    }

    /**
     * 订单结束晚于疗愈师当天下班时间时，返回已顺延下班时间的排班（只延长不缩短）；无需处理时返回 null。
     * 只匹配订单门店当天、且上班时间不晚于订单开始的排班；跨零点订单封顶 23:59，跨夜排班不改。
     */
    public static MassagistSchedules shiftToExtend(OrderDetail d, List<MassagistSchedules> shifts) {
        if (d == null || shifts == null || d.getMassagistId() == null || d.getShopId() == null
                || d.getStartTime() == null || d.getEndTime() == null) return null;
        if (Objects.equals(d.getState(), 3)) return null;
        LocalDate day = d.getStartTime().toLocalDate();
        MassagistSchedules chosen = null;
        for (MassagistSchedules s : shifts) {
            if (s.getDay() == null || s.getStartTime() == null || s.getEndTime() == null) continue;
            if (!day.equals(s.getDay()) || !d.getMassagistId().equals(s.getMassagistId())) continue;
            if (!d.getShopId().equals(effectiveShopId(s))) continue;
            if (!s.getEndTime().isAfter(s.getStartTime())) continue;
            if (d.getStartTime().toLocalTime().isBefore(s.getStartTime())) continue;
            if (chosen == null || s.getStartTime().isAfter(chosen.getStartTime())) chosen = s;
        }
        if (chosen == null) return null;
        LocalTime newEnd = d.getEndTime().toLocalDate().isAfter(day) ? LocalTime.of(23, 59) : d.getEndTime().toLocalTime();
        if (!newEnd.isAfter(chosen.getEndTime())) return null;
        chosen.setEndTime(newEnd);
        return chosen;
    }

    /** 指定疗愈师在当前门店无排班时的提示：说明当天实际排班门店，便于顾客切换。 */
    public static String shopMismatchMessage(List<MassagistSchedules> dayShifts, Map<Long, String> shopNames) {
        Set<String> names = new LinkedHashSet<>();
        if (dayShifts != null) for (MassagistSchedules s : dayShifts) {
            Long shop = effectiveShopId(s);
            String name = shop == null || shopNames == null ? null : shopNames.get(shop);
            if (name != null && !name.trim().isEmpty()) names.add(name.trim());
        }
        if (names.isEmpty()) return "所选疗愈师当天没有排班，请选择其他日期";
        return "所选疗愈师当天在「" + String.join("、", names) + "」排班，与当前预约门店不一致，请切换门店后预约";
    }

    /** 区间内最低空闲人数；同一疗愈师重叠项目只占一个名额，未排班的指定单不占排班名额。 */
    public static int freeCount(LocalDateTime start, LocalDateTime end, List<MassagistSchedules> shifts,
                                List<OrderDetail> orders, Long projectId) {
        Set<Long> scheduled = scheduledIds(start, shifts);
        if (scheduled.isEmpty()) return 0;
        List<OrderDetail> relevant = new ArrayList<>();
        SortedSet<LocalDateTime> points = new TreeSet<>();
        points.add(start);
        if (orders != null) for (OrderDetail d : orders) {
            if (Objects.equals(d.getProjectId(), 3L)) continue;
            if (d.getMassagistId() == null && projectId != null && !projectId.equals(d.getProjectId())) continue;
            if (d.getMassagistId() != null && !scheduled.contains(d.getMassagistId())) continue;
            if (!overlaps(start, end, d.getStartTime(), d.getEndTime(), 0)) continue;
            relevant.add(d);
            if (d.getStartTime().isAfter(start) && d.getStartTime().isBefore(end)) points.add(d.getStartTime());
            if (d.getEndTime().isAfter(start) && d.getEndTime().isBefore(end)) points.add(d.getEndTime());
        }
        int minimum = scheduled.size();
        for (LocalDateTime at : points) {
            Set<Long> busy = new HashSet<>();
            int unassigned = 0;
            for (OrderDetail d : relevant) {
                if (!at.isBefore(d.getStartTime()) && at.isBefore(d.getEndTime())) {
                    if (d.getMassagistId() == null) unassigned++; else busy.add(d.getMassagistId());
                }
            }
            minimum = Math.min(minimum, Math.max(0, scheduled.size() - busy.size() - unassigned));
        }
        return minimum;
    }
}
