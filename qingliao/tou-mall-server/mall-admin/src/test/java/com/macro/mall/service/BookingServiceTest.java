package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import com.macro.mall.mapper.*;
import com.macro.mall.service.shop.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BookingServiceTest {
    OrderDetailService service;
    OrderDetailMapper details;
    List<OrderDetail> bookings = new ArrayList<>();
    List<MassagistSchedules> shifts = new ArrayList<>();
    LocalDateTime start = LocalDateTime.of(2026, 11, 9, 14, 0);
    ShopService shops;
    MassagistSchedulesService schedules;

    @BeforeEach void setup() {
        service = spy(new OrderDetailService());
        details = mock(OrderDetailMapper.class);
        doReturn(details).when(service).getBaseMapper();
        ProjectService projects = mock(ProjectService.class);
        shops = mock(ShopService.class);
        BedService beds = mock(BedService.class);
        schedules = mock(MassagistSchedulesService.class);
        MassagistSchedulesMapper mapper = mock(MassagistSchedulesMapper.class);
        MassagistService people = mock(MassagistService.class);
        CustomerMassagistBlockService blocks = mock(CustomerMassagistBlockService.class);
        service.projectService = projects; service.shopService = shops; service.bedService = beds;
        service.massagistSchedulesService = schedules; service.massagistService = people;
        service.customerMassagistBlockService = blocks;
        Shop shop = new Shop(); shop.setId(1L); shop.setClockOutTime("22:00"); shop.setIntervalMinute(15);
        when(shops.findAvailableById(1L)).thenReturn(shop);
        when(projects.findTypeById(2L)).thenReturn(1);
        Bed a = new Bed(); a.setId(1L); a.setSerialNumber("1");
        Bed b = new Bed(); b.setId(2L); b.setSerialNumber("2");
        when(beds.listByStatusAndTypeAndShopId(anyInt(), anyInt(), eq(1L))).thenReturn(Arrays.asList(a, b));
        when(schedules.getBaseMapper()).thenReturn(mapper);
        when(mapper.findListByProjectIdAndShopId(eq(1L), anyString(), anyString())).thenAnswer(i -> shifts);
        when(details.findSimpleListByStartDateAndShop(anyString(), eq(1L))).thenAnswer(i -> bookings);
        when(blocks.excludeBlocked(any(), anyList())).thenAnswer(i -> i.getArgument(1));
        doAnswer(i -> i.getArgument(0)).when(service).sortMassagist(anyList(), any(), any(), anyLong(), anyInt());
        for (long id : new long[]{1, 2}) {
            MassagistSchedules s = new MassagistSchedules(); s.setMassagistId(id); s.setShopId(1L);
            s.setDay(start.toLocalDate()); s.setStartTime(start.minusHours(4).toLocalTime()); s.setEndTime(start.plusHours(7).toLocalTime()); shifts.add(s);
        }
    }
    private List<OrderDetail> build(Long specified) {
        return service.checkAndBuildOrderList(1L, 2L, start, 60, 1,
                specified == null ? new ArrayList<>() : new ArrayList<>(Arrays.asList(specified)),
                new ArrayList<>(), Collections.emptyList(), true, null);
    }
    @Test void foreignStoreSpecifiedPersonIsRejectedNotSilentlyReplaced() {
        BusinessException e = assertThrows(BusinessException.class, () -> build(99L));
        assertTrue(e.getMessage().contains("当天没有排班"), e.getMessage());
    }
    @Test void foreignStoreSpecifiedPersonNamesTheScheduledShop() {
        MassagistSchedules other = new MassagistSchedules(); other.setMassagistId(99L); other.setShopId(1L); other.setTargetShopId(2L);
        other.setDay(start.toLocalDate()); other.setStartTime(start.minusHours(4).toLocalTime()); other.setEndTime(start.plusHours(7).toLocalTime());
        when(schedules.listMassagistSchedulesByDate(anyString(), eq(99L))).thenReturn(Collections.singletonList(other));
        when(shops.findNameById(2L)).thenReturn("静安店");
        BusinessException e = assertThrows(BusinessException.class, () -> build(99L));
        assertTrue(e.getMessage().contains("静安店"), e.getMessage());
        assertTrue(e.getMessage().contains("切换门店"), e.getMessage());
    }
    @Test void busySpecifiedPersonIsRejectedNotSilentlyReplaced() {
        OrderDetail d = new OrderDetail(); d.setMassagistId(1L); d.setBedId(1L); d.setProjectId(2L);
        d.setStartTime(start); d.setEndTime(start.plusHours(1)); bookings.add(d);
        BusinessException e = assertThrows(BusinessException.class, () -> build(1L));
        assertTrue(e.getMessage().contains("时段"));
    }
    @Test void offShiftAssignedOrderDoesNotBlockOtherScheduledPeople() {
        shifts.remove(1);
        OrderDetail d = new OrderDetail(); d.setMassagistId(99L); d.setBedId(1L); d.setProjectId(2L);
        d.setStartTime(start); d.setEndTime(start.plusHours(1)); bookings.add(d);
        assertDoesNotThrow(() -> assertEquals(1L, build(1L).get(0).getMassagistId()));
    }
    @Test void therapistCanStartImmediatelyOnAnotherCleanBed() {
        shifts.remove(1);
        OrderDetail d = new OrderDetail(); d.setMassagistId(1L); d.setBedId(1L); d.setProjectId(2L);
        d.setStartTime(start.minusHours(1)); d.setEndTime(start); bookings.add(d);
        assertEquals(2L, build(1L).get(0).getBedId());
    }
}
