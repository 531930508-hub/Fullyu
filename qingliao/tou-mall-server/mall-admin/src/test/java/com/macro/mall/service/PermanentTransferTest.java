package com.macro.mall.service;

import com.macro.mall.entity.Massagist;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import com.macro.mall.utils.RedisUtil;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PermanentTransferTest {
    @Test void permanentTransferUsesPersistedHomeShopAndClearsOnlyThatShopsFutureShifts() {
        MassagistService service=spy(new MassagistService());
        MassagistSchedulesService schedules=mock(MassagistSchedulesService.class);
        UmsAdminServiceImpl accounts=mock(UmsAdminServiceImpl.class);
        MassagistIdentityService identities=mock(MassagistIdentityService.class);
        RedisUtil redis=mock(RedisUtil.class);
        service.massagistSchedulesService=schedules; service.umsAdminService=accounts;
        service.massagistIdentityService=identities;
        when(identities.codesOf(7L)).thenReturn(new ArrayList<>());
        ReflectionTestUtils.setField(service,"redisUtil",redis);
        Massagist old=new Massagist(); old.setId(7L); old.setShopId(1L);
        Massagist input=new Massagist(); input.setId(7L); input.setShopId(2L); input.setUmsAdminId(8L); input.setStatus(1);
        UmsAdmin account=new UmsAdmin(); account.setId(8L); account.setShopId(2L);
        when(accounts.getById(8L)).thenReturn(account);
        doReturn(old).when(service).getById(7L);
        doReturn(true).when(service).saveOrUpdate(any());
        doNothing().when(service).rerank(anyLong(),anyLong(),anyLong());
        when(redis.getKeys(anyString())).thenReturn(Collections.emptySet());
        service.saveOrUpd(input);
        verify(schedules).clearFuture(eq(7L),eq(1L),any(LocalDateTime.class));
        verify(service).rerank(2L,1L,7L);
        // 永久调店本身也要留痕，原店与新店的变更记录里都能查到“1号店→2号店”。
        verify(schedules).recordScheduleChange(eq("永久调店"),eq(1L),eq(7L),argThat(b->Long.valueOf(1L).equals(((Map<?,?>)b).get("shopId"))),argThat(a->Long.valueOf(2L).equals(((Map<?,?>)a).get("shopId"))));
        verify(schedules).recordScheduleChange(eq("永久调店"),eq(2L),eq(7L),any(),any());
    }
    @Test void sameShopEditDoesNotLogTransfer() {
        MassagistService service=spy(new MassagistService());
        MassagistSchedulesService schedules=mock(MassagistSchedulesService.class);
        UmsAdminServiceImpl accounts=mock(UmsAdminServiceImpl.class);
        MassagistIdentityService identities=mock(MassagistIdentityService.class);
        RedisUtil redis=mock(RedisUtil.class);
        service.massagistSchedulesService=schedules; service.umsAdminService=accounts;
        service.massagistIdentityService=identities;
        when(identities.codesOf(7L)).thenReturn(new ArrayList<>());
        ReflectionTestUtils.setField(service,"redisUtil",redis);
        Massagist old=new Massagist(); old.setId(7L); old.setShopId(1L);
        Massagist input=new Massagist(); input.setId(7L); input.setShopId(1L); input.setUmsAdminId(8L); input.setStatus(1);
        UmsAdmin account=new UmsAdmin(); account.setId(8L); account.setShopId(1L);
        when(accounts.getById(8L)).thenReturn(account);
        doReturn(old).when(service).getById(7L);
        doReturn(true).when(service).saveOrUpdate(any());
        when(redis.getKeys(anyString())).thenReturn(Collections.emptySet());
        service.saveOrUpd(input);
        verify(schedules,never()).recordScheduleChange(eq("永久调店"),anyLong(),anyLong(),any(),any());
    }
}
