package com.macro.mall.service;

import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.entity.*;
import com.macro.mall.mapper.*;
import com.macro.mall.service.shop.*;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BookingTimeListTest {
    private boolean timeAvailable(Long assigned, boolean endsAtFourteen) {
        OrderService service = new OrderService();
        ShopService shops = mock(ShopService.class); ProjectService projects = mock(ProjectService.class);
        BedService beds = mock(BedService.class); MassagistSchedulesService schedules = mock(MassagistSchedulesService.class);
        MassagistSchedulesMapper mapper = mock(MassagistSchedulesMapper.class);
        OrderDetailService details = mock(OrderDetailService.class); OrderDetailMapper detailMapper = mock(OrderDetailMapper.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "shopService", shops);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "projectService", projects);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "bedService", beds);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "massagistSchedulesService", schedules);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "orderDetailService", details);
        LocalDate day = LocalDate.now().plusDays(1);
        Shop shop = new Shop(); shop.setId(1L); shop.setClockInTime("10:00"); shop.setClockOutTime("18:00"); shop.setIntervalMinute(15);
        when(shops.findAvailableShopList()).thenReturn(Arrays.asList(shop)); when(projects.findTypeById(2L)).thenReturn(1);
        Bed a = new Bed(); a.setId(1L); Bed b = new Bed(); b.setId(2L);
        when(beds.listByStatusAndTypeAndShopId(anyInt(), anyInt(), eq(1L))).thenReturn(Arrays.asList(a,b));
        MassagistSchedules s = new MassagistSchedules(); s.setMassagistId(1L); s.setShopId(1L); s.setDay(day);
        s.setStartTime(day.atTime(10,0).toLocalTime()); s.setEndTime(day.atTime(18,0).toLocalTime());
        when(schedules.getBaseMapper()).thenReturn(mapper);
        when(mapper.findListByProjectIdAndShopId(eq(1L), anyString(), anyString())).thenReturn(Arrays.asList(s));
        when(details.getBaseMapper()).thenReturn(detailMapper);
        OrderDetail d = new OrderDetail(); d.setMassagistId(assigned); d.setBedId(1L); d.setProjectId(2L);
        d.setStartTime(day.atTime(endsAtFourteen ? 13 : 14,0)); d.setEndTime(d.getStartTime().plusHours(1));
        when(detailMapper.findSimpleListByStartDateAndShopId(anyString(), eq(1L))).thenReturn(Arrays.asList(d));
        List<JSONObject> result = service.findArriveTimeList(day.toString(),1,2L,60,1L,1L);
        return result.stream().anyMatch(t -> "14:00".equals(t.getString("time")) && Integer.valueOf(1).equals(t.getInteger("state")));
    }
    @Test void availableTimesHaveBedOnlyGap() { assertTrue(timeAvailable(1L, true)); }
    @Test void offShiftAssignedBookingDoesNotReduceTimeCapacity() { assertTrue(timeAvailable(99L, false)); }
    @Test void unassignedBookingStillReservesCapacity() { assertFalse(timeAvailable(null, false)); }
}
