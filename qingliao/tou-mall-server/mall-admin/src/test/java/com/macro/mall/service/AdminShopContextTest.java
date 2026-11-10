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
}
