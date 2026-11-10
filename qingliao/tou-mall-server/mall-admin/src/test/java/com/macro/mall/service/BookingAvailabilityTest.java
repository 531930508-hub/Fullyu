package com.macro.mall.service;

import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.entity.OrderDetail;
import org.junit.jupiter.api.Test;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class BookingAvailabilityTest {
    private final LocalDateTime start = LocalDateTime.of(2026, 11, 8, 14, 0);

    private Object call(String method, Class<?>[] types, Object... args) throws Exception {
        Class<?> rules;
        try { rules = Class.forName("com.macro.mall.utils.BookingAvailability"); }
        catch (ClassNotFoundException e) { fail("预约容量规则尚未实现"); return null; }
        Method target = rules.getMethod(method, types);
        return target.invoke(null, args);
    }

    private boolean overlap(LocalDateTime a, LocalDateTime b, LocalDateTime c, LocalDateTime d, int gap) throws Exception {
        return (Boolean) call("overlaps", new Class[]{LocalDateTime.class, LocalDateTime.class, LocalDateTime.class, LocalDateTime.class, int.class}, a, b, c, d, gap);
    }

    private MassagistSchedules shift(long id) {
        MassagistSchedules s = new MassagistSchedules();
        s.setMassagistId(id); s.setShopId(1L); s.setDay(start.toLocalDate());
        s.setStartTime(start.minusHours(4).toLocalTime()); s.setEndTime(start.plusHours(8).toLocalTime());
        return s;
    }
    private OrderDetail order(Long id, long project, LocalDateTime from, LocalDateTime to) {
        OrderDetail d = new OrderDetail(); d.setMassagistId(id); d.setProjectId(project); d.setStartTime(from); d.setEndTime(to); return d;
    }
    private int free(List<MassagistSchedules> shifts, List<OrderDetail> orders, Long project) throws Exception {
        return (Integer) call("freeCount", new Class[]{LocalDateTime.class, LocalDateTime.class, List.class, List.class, Long.class}, start, start.plusHours(1), shifts, orders, project);
    }

    @Test void backToBackTherapistServicesHaveNoCleaningGap() throws Exception {
        assertFalse(overlap(start, start.plusHours(1), start.minusHours(1), start, 0));
    }
    @Test void bedNeedsFifteenMinutesAfterPreviousService() throws Exception {
        assertTrue(overlap(start, start.plusHours(1), start.minusHours(1), start, 15));
        assertFalse(overlap(start.plusMinutes(15), start.plusHours(1), start.minusHours(1), start, 15));
    }
    @Test void bedAlsoReservesGapBeforeNextService() throws Exception {
        assertTrue(overlap(start, start.plusHours(1), start.plusHours(1), start.plusHours(2), 15));
    }
    @Test void crossMidnightUsesDatesNotClockStrings() throws Exception {
        LocalDateTime late = start.withHour(23);
        assertTrue(overlap(late, late.plusHours(2), late.plusMinutes(30), late.plusHours(1), 0));
        assertFalse(overlap(late, late.plusHours(2), late.plusDays(1).withHour(14), late.plusDays(1).withHour(15), 0));
    }
    @Test void assignedWithoutShiftDoesNotConsumeScheduledIdlePeople() throws Exception {
        assertEquals(1, free(Arrays.asList(shift(1)), Arrays.asList(order(99L, 2, start, start.plusHours(1))), null));
    }
    @Test void unassignedOrderConsumesOnePerson() throws Exception {
        assertEquals(0, free(Arrays.asList(shift(1)), Arrays.asList(order(null, 2, start, start.plusHours(1))), null));
    }
    @Test void scheduledAssignedBusyPersonIsCountedOnce() throws Exception {
        assertEquals(1, free(Arrays.asList(shift(1), shift(2)), Arrays.asList(order(1L, 2, start, start.plusHours(1)), order(1L, 4, start, start.plusHours(1))), null));
    }
    @Test void adjacentOrdersDoNotArtificiallyReduceCapacity() throws Exception {
        assertEquals(1, free(Arrays.asList(shift(1), shift(2)), Arrays.asList(order(null, 2, start, start.plusMinutes(30)), order(null, 2, start.plusMinutes(30), start.plusHours(1))), null));
    }
    @Test void receptionDoesNotConsumeTreatmentCapacity() throws Exception {
        assertEquals(1, free(Arrays.asList(shift(1)), Arrays.asList(order(null, 3, start, start.plusHours(1))), null));
    }
    @Test void offShiftAndDuplicateSchedulesAreNotExtraPeople() throws Exception {
        MassagistSchedules later = shift(2); later.setStartTime(start.plusHours(1).toLocalTime());
        assertEquals(1, free(Arrays.asList(shift(1), shift(1), later), Collections.emptyList(), null));
    }
    @Test void projectCapacityExcludesOtherUnassignedProjects() throws Exception {
        assertEquals(1, free(Arrays.asList(shift(1)), Arrays.asList(order(null, 4, start, start.plusHours(1))), 2L));
    }
    /** 预约时段查询 SQL（findListByProjectIdAndShopId）不返回 day 列，排班仍须被计入。 */
    @Test void shiftRowWithoutDayColumnStillCountsForThatDate() throws Exception {
        MassagistSchedules s = shift(1); s.setDay(null);
        assertEquals(1, free(Arrays.asList(s), Collections.emptyList(), null));
    }
    @Test void serviceMayFinishAfterScheduledClosingIfStartedBeforeIt() throws Exception {
        MassagistSchedules s = shift(1); s.setEndTime(start.plusMinutes(30).toLocalTime());
        assertEquals(1, free(Arrays.asList(s), Collections.emptyList(), null));
    }
}
