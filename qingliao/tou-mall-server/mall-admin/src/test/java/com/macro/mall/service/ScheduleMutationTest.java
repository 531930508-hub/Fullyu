package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.InvocationTargetException;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ScheduleMutationTest {
    MassagistSchedulesService service;
    LocalDate today = LocalDate.now();
    ControllerLogService logs;
    List<MassagistSchedules> rows = new ArrayList<>();
    @BeforeEach void setup() {
        service = spy(new MassagistSchedulesService());
        service.massagistService = mock(MassagistService.class);
        service.redisUtil = mock(com.macro.mall.utils.RedisUtil.class);
        service.roundScheduleService = mock(RoundScheduleService.class);
        logs = mock(ControllerLogService.class);
        when(logs.save(any())).thenReturn(true);
        try { ReflectionTestUtils.setField(service, "controllerLogService", logs); } catch (IllegalArgumentException ignored) { }
        doReturn(rows).when(service).list(any(Wrapper.class));
        doReturn(null).when(service).getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class));
        doReturn(true).when(service).saveOrUpdate(any());
        doReturn(true).when(service).save(any());
        doReturn(true).when(service).removeByIds(anyCollection());
        doReturn(true).when(service).removeById(any(java.io.Serializable.class));
        doReturn(true).when(service).updateById(any());
        Massagist person = new Massagist(); person.setId(7L); person.setShopId(1L); person.setName("测试疗愈师");
        when(service.massagistService.getById(7L)).thenReturn(person);
    }
    MassagistSchedules row(long id, LocalDate day, int start, int end) {
        MassagistSchedules s = new MassagistSchedules(); s.setId(id); s.setMassagistId(7L);
        s.setShopId(1L); s.setTargetShopId(0L); s.setSchedulesType(0L);
        s.setDay(day); s.setStartTime(LocalTime.of(start,0)); s.setEndTime(LocalTime.of(end,0)); return s;
    }
    MassagistSchedules transfer() {
        MassagistSchedules s = row(0, today.plusDays(1), 14, 18);
        s.setId(null); s.setTargetShopId(2L); s.setSchedulesType(1L); return s;
    }
    @Test void temporaryTransferClearsWholeOriginalDayNotOnlyOverlap() {
        rows.add(row(10, today.plusDays(1), 10, 22));
        rows.add(row(11, today.plusDays(1), 8, 9));
        service.batchTargetShop(transfer());
        verify(service).removeByIds(argThat(ids -> ids.size()==2 && ids.contains(10L) && ids.contains(11L)));
        verify(service, never()).updateById(any());
        verify(logs).save(any(ControllerLog.class));
    }
    @Test void incomingTransfersDoNotGetAppendedOutsideServerPagination() {
        MassagistSchedules s=row(10,today,10,22);
        List<MassagistSchedules> pageRows=new ArrayList<>(Arrays.asList(s));
        doReturn(new com.github.pagehelper.PageInfo<>(pageRows)).when(service).page(anyMap());
        doNothing().when(service).buildDetail(anyList());
        when(service.massagistService.listByIds(anyCollection())).thenReturn(Collections.emptyList());
        Map<String,Object> params=new HashMap<>(); params.put("shopId",1L); params.put("size",1);
        assertEquals(1,service.pageInfo(params).getList().size());
        verify(service,times(1)).page(anyMap());
    }
    @Test void deletingTransferDoesNotSilentlyCreateNewOriginalShopShift() {
        MassagistSchedules s=transfer(); s.setId(20L);
        doReturn(s).when(service).getById(20L);
        service.delete(20L);
        verify(service,never()).save(any());
        verify(logs).save(any(ControllerLog.class));
    }
    MassagistSchedules batch() {
        MassagistSchedules s=row(0,today.plusDays(1),10,22); s.setId(null);
        s.setDates(Arrays.asList(today.plusDays(1).toString(),today.plusDays(1).toString()));
        s.setMassagistIdList(Arrays.asList(7L,7L)); return s;
    }
    @Test void batchRejectsReversedTimesBeforeDatabaseWrites() {
        MassagistSchedules s=batch(); s.setEndTime(LocalTime.of(9,0));
        doReturn(true).when(service).saveBatch(anyCollection());
        assertThrows(BusinessException.class,()->service.batchAdd(s));
        verify(service,never()).saveBatch(anyCollection());
    }
    @Test void batchDeduplicatesAndAuditsEveryCreatedShift() {
        doReturn(true).when(service).saveBatch(anyCollection());
        assertEquals(1,service.batchAdd(batch()).size());
        verify(logs).save(any(ControllerLog.class));
        verify(service).clearMassgistSortMap(1L);
    }
    @Test void normalSaveCannotBypassTransferRules() {
        assertThrows(BusinessException.class,()->service.saveOrUpd(transfer()));
        verify(service,never()).saveOrUpdate(any());
    }
    @Test void auditFailureIsNotReportedAsSuccessfulWrite() {
        when(logs.save(any())).thenReturn(false);
        assertThrows(BusinessException.class,()->service.batchTargetShop(transfer()));
    }
    @Test void editedMissingShiftCannotBeRecreated() {
        doReturn(null).when(service).getById(999L);
        assertThrows(BusinessException.class,()->service.saveOrUpd(row(999,today,10,22)));
    }
    @Test void pageSequenceUsesWholeStoreQueueNotOnlyCurrentPage() {
        Massagist person=new Massagist(); person.setId(7L); person.setName("测试"); person.setShopId(1L);
        when(service.massagistService.listByIds(anyCollection())).thenReturn(Arrays.asList(person));
        doReturn(Arrays.asList(9L,8L,7L)).when(service).getMassagistSchedulesList(anyString(),eq(1L));
        MassagistSchedules s=row(1,today,10,22);
        service.buildDetail(new ArrayList<>(Arrays.asList(s)));
        assertEquals(3,s.getSequence());
    }
    @Test void invalidShiftCannotBeSaved() {
        assertThrows(BusinessException.class, () -> service.saveOrUpd(row(1,today,18,10)));
        verify(service, never()).saveOrUpdate(any());
    }
    @Test void transferResetsUnstartedRotationForBothShopsOnThatDay() {
        MassagistSchedules t = transfer();
        service.batchTargetShop(t);
        verify(service.roundScheduleService).removeExistData(t.getDay(), 1L);
        verify(service.roundScheduleService).removeExistData(t.getDay(), 2L);
    }
    @Test void singleShiftSaveResetsUnstartedRotationForThatShopAndDay() {
        MassagistSchedules s = row(0, today.plusDays(1), 10, 22); s.setId(null);
        service.saveOrUpd(s);
        verify(service.roundScheduleService).removeExistData(today.plusDays(1), 1L);
    }
    @Test void deletingTransferResetsUnstartedRotationForBothShops() {
        MassagistSchedules s = transfer(); s.setId(20L);
        doReturn(s).when(service).getById(20L);
        service.delete(20L);
        verify(service.roundScheduleService).removeExistData(s.getDay(), 1L);
        verify(service.roundScheduleService).removeExistData(s.getDay(), 2L);
    }
    @Test void futureClearingPreservesAlreadyStartedAndOtherPeopleAndShops() throws Exception {
        LocalDateTime now = today.atTime(14,0);
        rows.add(row(1,today,10,22)); rows.add(row(2,today,15,22));
        rows.add(row(3,today.plusDays(1),10,22));
        MassagistSchedules other = row(4,today.plusDays(1),10,22); other.setMassagistId(8L); rows.add(other);
        MassagistSchedules otherShop = row(5,today.plusDays(1),10,22); otherShop.setShopId(3L); rows.add(otherShop);
        java.lang.reflect.Method m;
        try { m = service.getClass().getMethod("clearFuture",Long.class,Long.class,LocalDateTime.class); }
        catch (NoSuchMethodException e) { fail("尚未实现安全清除未来未生效排班"); return; }
        Object result = m.invoke(service,7L,1L,now);
        assertEquals(2,result);
        verify(service).removeByIds(argThat(ids -> ids.size()==2 && ids.contains(2L) && ids.contains(3L)));
        verify(logs, times(2)).save(any(ControllerLog.class));
        verify(service.roundScheduleService).removeExistData(today, 1L);
        verify(service.roundScheduleService).removeExistData(today.plusDays(1), 1L);
    }
}
