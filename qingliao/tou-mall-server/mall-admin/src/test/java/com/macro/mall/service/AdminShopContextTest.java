package com.macro.mall.service;

import com.macro.mall.service.impl.UmsAdminServiceImpl;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.mapper.UmsAdminMapper;
import com.macro.mall.entity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.time.*;

class AdminShopContextTest {
    UmsAdminServiceImpl service;
    UmsAdminCacheService cache;
    UmsAdminMapper mapper;
    MassagistService people;
    MassagistSchedulesService schedules;
    UmsAdmin account;
    @BeforeEach void setup() {
        service=spy(new UmsAdminServiceImpl()); cache=mock(UmsAdminCacheService.class);
        mapper=mock(UmsAdminMapper.class); people=mock(MassagistService.class); schedules=mock(MassagistSchedulesService.class);
        doReturn(cache).when(service).getCacheService();
        ReflectionTestUtils.setField(service,"adminMapper",mapper);
        ReflectionTestUtils.setField(service,"massagistService",people);
        ReflectionTestUtils.setField(service,"massagistSchedulesService",schedules);
        account=new UmsAdmin(); account.setId(8L); account.setUsername("test-only"); account.setMassagistId(7L);
        account.setShopId(1L); account.setShopIdArr("[1]");
        Massagist p=new Massagist(); p.setId(7L); p.setShopId(1L); p.setUmsAdminId(8L);
        when(people.getByUmsAdminId(8L)).thenReturn(p); when(people.getById(7L)).thenReturn(p);
    }
    MassagistSchedules transfer() {
        MassagistSchedules s=new MassagistSchedules(); s.setMassagistId(7L); s.setShopId(1L); s.setTargetShopId(2L);
        s.setDay(LocalDate.now()); s.setStartTime(LocalTime.MIN); s.setEndTime(LocalTime.MAX); s.setSchedulesType(1L); return s;
    }
    @Test void databaseCacheMissAlsoUsesTodaysTemporaryShop() {
        when(mapper.selectByExample(any())).thenReturn(Arrays.asList(account));
        when(schedules.getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class))).thenReturn(transfer());
        assertEquals(2L,service.getAdminByUsername("test-only").getShopId());
    }
    @Test void noTransferRestoresHomeEvenIfCachedAccountStillHasYesterdayShop() {
        account.setShopId(2L); account.setShopIdArr("[2]");
        when(cache.getAdmin("test-only")).thenReturn(account);
        assertEquals(1L,service.getAdminByUsername("test-only").getShopId());
    }
    @Test void temporaryScopeDoesNotMutateCachedAccount() {
        when(cache.getAdmin("test-only")).thenReturn(account);
        when(schedules.getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class))).thenReturn(transfer());
        assertEquals(2L,service.getAdminByUsername("test-only").getShopId());
        assertEquals(1L,account.getShopId());
    }

    @Test void accountAuthorizedShopsAreMergedWithArchiveShop() {
        account.setShopIdArr("[1,2,3]");
        when(cache.getAdmin("test-only")).thenReturn(account);
        UmsAdmin scoped = service.getAdminByUsername("test-only");
        assertEquals(1L, scoped.getShopId());
        assertEquals("[1,2,3]", scoped.getShopIdArr());
    }

    @Test void authorizedShopsIgnoreBlankAndIllegalValues() {
        account.setShopIdArr("[ 1 , x ,0 ]");
        when(cache.getAdmin("test-only")).thenReturn(account);
        assertEquals("[1]", service.getAdminByUsername("test-only").getShopIdArr());
    }

    @Test void transferKeepsBothHomeAndTargetShops() {
        when(cache.getAdmin("test-only")).thenReturn(account);
        when(schedules.getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class))).thenReturn(transfer());
        UmsAdmin scoped = service.getAdminByUsername("test-only");
        assertEquals(2L, scoped.getShopId());
        assertEquals("[1,2]", scoped.getShopIdArr());
    }

    @Test void transferOnlyAppliesInsideItsTimeWindow() {
        MassagistSchedules t = transfer();
        t.setStartTime(LocalTime.of(9, 0));
        t.setEndTime(LocalTime.of(12, 0));
        assertFalse(active(t, LocalTime.of(8, 59)));
        assertTrue(active(t, LocalTime.of(9, 0)));
        assertTrue(active(t, LocalTime.of(11, 59)));
        assertFalse(active(t, LocalTime.of(12, 0)));
        assertFalse(active(t, LocalTime.of(20, 0)));
    }

    @Test void transferWithoutWindowOrTargetIsNotSpecialCased() {
        MassagistSchedules allDay = transfer(); allDay.setStartTime(null); allDay.setEndTime(null);
        assertTrue(active(allDay, LocalTime.of(20, 0)));
        MassagistSchedules noTarget = transfer(); noTarget.setTargetShopId(0L);
        assertFalse(active(noTarget, LocalTime.of(10, 0)));
        assertFalse(active((MassagistSchedules) null, LocalTime.of(10, 0)));
    }

    private boolean active(MassagistSchedules transfer, LocalTime now) {
        return ReflectionTestUtils.invokeMethod(service, "isTransferActive", transfer, now);
    }
}
