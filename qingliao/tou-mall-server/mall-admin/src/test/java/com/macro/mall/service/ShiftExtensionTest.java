package com.macro.mall.service;

import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.utils.BookingAvailability;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** 订单超出下班时间时，按订单实际所在门店自动顺延当天排班（只延长、不缩短）。 */
class ShiftExtensionTest {
    private final LocalDate day = LocalDate.of(2026, 11, 9);

    private MassagistSchedules shift(long id, long shop, long target, String from, String to) {
        MassagistSchedules s = new MassagistSchedules();
        s.setId(id); s.setMassagistId(7L); s.setShopId(shop); s.setTargetShopId(target); s.setDay(day);
        s.setStartTime(LocalTime.parse(from)); s.setEndTime(LocalTime.parse(to));
        return s;
    }
    private OrderDetail order(long shop, String from, String to) {
        OrderDetail d = new OrderDetail(); d.setMassagistId(7L); d.setShopId(shop); d.setState(0);
        d.setStartTime(day.atTime(LocalTime.parse(from))); d.setEndTime(day.atTime(LocalTime.parse(to)));
        return d;
    }

    @Test void extendsShiftWhenOrderEndsAfterClockOut() {
        MassagistSchedules s = shift(1, 1, 0, "10:00", "21:00");
        MassagistSchedules hit = BookingAvailability.shiftToExtend(order(1, "20:30", "22:00"), Collections.singletonList(s));
        assertNotNull(hit);
        assertEquals(1L, hit.getId());
        assertEquals(LocalTime.of(22, 0), hit.getEndTime());
    }

    @Test void neverShrinksShift() {
        MassagistSchedules s = shift(1, 1, 0, "10:00", "21:00");
        assertNull(BookingAvailability.shiftToExtend(order(1, "18:00", "19:30"), Collections.singletonList(s)));
        assertEquals(LocalTime.of(21, 0), s.getEndTime());
    }

    @Test void picksShiftOfOrderShopIncludingTransfer() {
        MassagistSchedules home = shift(1, 1, 0, "10:00", "15:00");
        MassagistSchedules moved = shift(2, 1, 3, "15:00", "21:00");
        MassagistSchedules hit = BookingAvailability.shiftToExtend(order(3, "20:30", "22:15"), Arrays.asList(home, moved));
        assertNotNull(hit);
        assertEquals(2L, hit.getId());
        assertEquals(LocalTime.of(22, 15), hit.getEndTime());
    }

    @Test void ignoresShiftsOfOtherShops() {
        MassagistSchedules other = shift(1, 2, 0, "10:00", "21:00");
        assertNull(BookingAvailability.shiftToExtend(order(1, "20:30", "22:00"), Collections.singletonList(other)));
    }

    @Test void capsAtEndOfDayWhenOrderCrossesMidnight() {
        MassagistSchedules s = shift(1, 1, 0, "10:00", "22:00");
        OrderDetail d = order(1, "23:00", "23:00"); d.setEndTime(day.plusDays(1).atTime(0, 30));
        MassagistSchedules hit = BookingAvailability.shiftToExtend(d, Collections.singletonList(s));
        assertNotNull(hit);
        assertEquals(LocalTime.of(23, 59), hit.getEndTime());
    }

    @Test void skipsCanceledUnassignedAndOrdersStartingBeforeShift() {
        MassagistSchedules s = shift(1, 1, 0, "12:00", "21:00");
        OrderDetail canceled = order(1, "20:30", "22:00"); canceled.setState(3);
        OrderDetail unassigned = order(1, "20:30", "22:00"); unassigned.setMassagistId(null);
        assertNull(BookingAvailability.shiftToExtend(canceled, Collections.singletonList(s)));
        assertNull(BookingAvailability.shiftToExtend(unassigned, Collections.singletonList(s)));
        assertNull(BookingAvailability.shiftToExtend(order(1, "10:00", "22:00"), Collections.singletonList(s)));
    }

    @Test void leavesOvernightShiftsAlone() {
        MassagistSchedules s = shift(1, 1, 0, "18:00", "02:00");
        assertNull(BookingAvailability.shiftToExtend(order(1, "22:00", "23:30"), Collections.singletonList(s)));
    }

    @Test void mismatchMessageNamesScheduledShop() {
        Map<Long, String> names = new HashMap<>(); names.put(2L, "静安店"); names.put(3L, "徐汇店");
        MassagistSchedules a = shift(1, 2, 0, "10:00", "21:00");
        MassagistSchedules b = shift(2, 1, 3, "10:00", "21:00");
        String msg = BookingAvailability.shopMismatchMessage(Arrays.asList(a, b), names);
        assertTrue(msg.contains("静安店") && msg.contains("徐汇店"), msg);
        assertTrue(msg.contains("切换门店"), msg);
        assertEquals("所选疗愈师当天没有排班，请选择其他日期", BookingAvailability.shopMismatchMessage(Collections.emptyList(), names));
    }
}
