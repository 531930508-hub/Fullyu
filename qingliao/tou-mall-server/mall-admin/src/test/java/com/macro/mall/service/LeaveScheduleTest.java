package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LeaveScheduleTest {
    MassagistLeaveService service;
    List<MassagistSchedules> shifts = new ArrayList<>();
    LocalDate day = LocalDate.now().plusDays(1);
    @BeforeEach void setup() {
        service = spy(new MassagistLeaveService());
        service.approvalDetailService = mock(ApprovalDetailService.class);
        service.massagistService = mock(MassagistService.class);
        service.massagistSchedulesService = mock(MassagistSchedulesService.class);
        Massagist p = new Massagist(); p.setId(7L); p.setShopId(1L);
        when(service.massagistService.getById(7L)).thenReturn(p);
        when(service.massagistSchedulesService.list(any(Wrapper.class))).thenReturn(shifts);
        doReturn(null).when(service).getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class));
        doReturn(true).when(service).save(any());
        doReturn(true).when(service).remove(any(Wrapper.class));
        doReturn(Collections.emptyList()).when(service).list(any(Wrapper.class));
        doReturn(true).when(service).updateById(any());
        when(service.approvalDetailService.addRelationMassagistLeaveId(anyLong(),any(),anyLong(),anyInt())).thenReturn(20L);
    }
    MassagistLeave request() {
        MassagistLeave r = new MassagistLeave(); r.setMassagistId(7); r.setCreateUser(8L);
        r.setDates(new String[]{day.toString()}); r.setStartTime(LocalTime.of(14,0)); r.setEndTime(LocalTime.of(16,0)); return r;
    }
    void addShift(LocalDate date, int start, int end) {
        MassagistSchedules s = new MassagistSchedules(); s.setMassagistId(7L); s.setDay(date);
        s.setStartTime(LocalTime.of(start,0)); s.setEndTime(LocalTime.of(end,0)); shifts.add(s);
    }
    @Test void nullDateReturnsBusinessError() {
        MassagistLeave r=request(); r.setDates(new String[]{null});
        assertThrows(BusinessException.class,()->service.add(r));
    }
    @Test void approvalOnlyCutsSelectedDatesAndDailyRequestedHours() {
        MassagistLeave r=request(); r.setId(50L); r.setApprovalId(20L);
        r.setStartDate(day); r.setEndDate(day.plusDays(2));
        r.setDatesStr(day+","+day.plusDays(2));
        r.setStartDatetime(day.atTime(14,0)); r.setEndDatetime(day.plusDays(2).atTime(16,0));
        doReturn(r).when(service).getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class));
        addShift(day,10,22); addShift(day.plusDays(1),10,22); addShift(day.plusDays(2),10,22);
        for(int i=0;i<shifts.size();i++){shifts.get(i).setId((long)i+1);shifts.get(i).setShopId(1L);}
        when(service.massagistSchedulesService.removeByIds(anyCollection())).thenReturn(true);
        when(service.massagistSchedulesService.saveBatch(anyCollection())).thenReturn(true);
        service.changeRelateRecordState(20L,com.macro.mall.enums.FlowState.PASSED);
        verify(service.massagistSchedulesService).removeByIds(argThat(ids->ids.size()==2 && ids.contains(1L) && ids.contains(3L)));
        verify(service.massagistSchedulesService).saveBatch(argThat(rows->rows.size()==4 && rows.stream().allMatch(s->
            !s.getDay().equals(day.plusDays(1)) && (s.getEndTime().equals(LocalTime.of(14,0)) || s.getStartTime().equals(LocalTime.of(16,0))))));
        verify(service.massagistSchedulesService).recordScheduleChange(anyString(),eq(1L),eq(7L),any(),any());
    }
    @Test void legacyCancellationWithoutSnapshotCannotInventFullDaySchedule() {
        MassagistLeave r=request(); r.setId(50L); r.setApprovalId(20L); r.setDatesStr(day.toString());
        doReturn(r).when(service).getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class));
        when(service.approvalDetailService.getApprovalState(20L)).thenReturn(3);
        service.massagistSchedulesService.controllerLogService=mock(ControllerLogService.class);
        when(service.massagistSchedulesService.controllerLogService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        assertThrows(BusinessException.class,()->service.cancelLeave(20L));
        verify(service.massagistSchedulesService,never()).save(any());
        verify(service.massagistSchedulesService,never()).removeById(any(java.io.Serializable.class));
    }
    @Test void approvedCancellationRestoresSnapshotInsteadOfDefaultHours() {
        MassagistLeave r=request(); r.setId(50L); r.setApprovalId(20L); r.setDatesStr(day.toString());
        doReturn(r).when(service).getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class));
        when(service.approvalDetailService.getApprovalState(20L)).thenReturn(3);
        addShift(day,9,14); addShift(day,16,19);
        for(int i=0;i<shifts.size();i++){shifts.get(i).setId((long)i+101);shifts.get(i).setShopId(1L);}
        MassagistSchedules original=new MassagistSchedules(); original.setId(10L);original.setMassagistId(7L);original.setShopId(1L);
        original.setDay(day);original.setStartTime(LocalTime.of(9,0));original.setEndTime(LocalTime.of(19,0));
        com.alibaba.fastjson2.JSONObject payload=new com.alibaba.fastjson2.JSONObject();
        payload.put("before",Arrays.asList(original));payload.put("after",shifts);
        ControllerLog audit=new ControllerLog();audit.setParams(payload.toJSONString());
        service.massagistSchedulesService.controllerLogService=mock(ControllerLogService.class);
        when(service.massagistSchedulesService.controllerLogService.list(any(Wrapper.class))).thenReturn(Arrays.asList(audit));
        when(service.massagistSchedulesService.removeByIds(anyCollection())).thenReturn(true);
        when(service.massagistSchedulesService.saveBatch(anyCollection())).thenReturn(true);
        service.cancelLeave(20L);
        verify(service.massagistSchedulesService).saveBatch(argThat(rows->rows.size()==1
            && rows.iterator().next().getStartTime().equals(LocalTime.of(9,0)) && rows.iterator().next().getEndTime().equals(LocalTime.of(19,0))));
    }
    @Test void noScheduleCannotCreateApproval() {
        assertThrows(BusinessException.class, () -> service.add(request()));
        verifyNoInteractions(service.approvalDetailService);
    }
    @Test void everyRequestedDateMustIntersectSchedule() {
        addShift(day,10,22);
        MassagistLeave r = request(); r.setDates(new String[]{day.toString(),day.plusDays(1).toString()});
        assertThrows(BusinessException.class, () -> service.add(r));
        verifyNoInteractions(service.approvalDetailService);
    }
    @Test void nonOverlappingScheduleCannotCreateApproval() {
        addShift(day,10,12);
        assertThrows(BusinessException.class, () -> service.add(request()));
    }
    @Test void emptyDatesReturnBusinessErrorNotArrayError() {
        MassagistLeave r=request(); r.setDates(new String[0]);
        assertThrows(BusinessException.class, () -> service.add(r));
    }
    @Test void nullRequestReturnsBusinessErrorBeforeAnyDataAccess() {
        assertThrows(BusinessException.class,()->service.add(null));
        verifyNoInteractions(service.massagistService,service.massagistSchedulesService,service.approvalDetailService);
    }
    @Test void missingPersonIdIsRejectedBeforeScheduleQuery() {
        MassagistLeave r=request(); r.setMassagistId(0L);
        assertThrows(BusinessException.class,()->service.add(r));
        verifyNoInteractions(service.massagistSchedulesService,service.approvalDetailService);
    }
    @Test void missingApplicantIsRejectedBeforeScheduleQuery() {
        addShift(day,10,22); MassagistLeave r=request(); r.setCreateUser(null);
        assertThrows(BusinessException.class,()->service.add(r));
        verifyNoInteractions(service.massagistSchedulesService,service.approvalDetailService);
    }
    @Test void invalidDatesAreRejectedBeforeDatabaseQuery() {
        for(String invalid:Arrays.asList("2026-02-30","2026-1-01","", "2026-01-01T00:00:00")) {
            MassagistLeave r=request(); r.setDates(new String[]{invalid});
            assertThrows(BusinessException.class,()->service.add(r));
        }
        verifyNoInteractions(service.massagistSchedulesService,service.approvalDetailService);
    }
    @Test void mixedNullDatesReturnBusinessErrorBeforeSortingOrQueries() {
        MassagistLeave r=request(); r.setDates(new String[]{day.toString(),null});
        assertThrows(BusinessException.class,()->service.add(r));
        verifyNoInteractions(service.massagistSchedulesService,service.approvalDetailService);
    }
    @Test void missingPersonCannotCreateAnApprovalInClientSuppliedShop() {
        addShift(day,10,22); when(service.massagistService.getById(7L)).thenReturn(null);
        MassagistLeave r=request(); r.setShopId(999L);
        assertThrows(BusinessException.class,()->service.add(r));
        verifyNoInteractions(service.approvalDetailService);
        verify(service,never()).save(any());
    }
    MassagistLeave existing(LocalDate date,int start,int end) {
        MassagistLeave r=request(); r.setId(51L); r.setApprovalId(21L);
        r.setDates(new String[]{date.toString()}); r.setDatesStr(date.toString());
        r.setStartTime(LocalTime.of(start,0)); r.setEndTime(LocalTime.of(end,0));
        r.setStartDatetime(date.atTime(start,0)); r.setEndDatetime(date.atTime(end,0)); return r;
    }
    @Test void partialOverlapOnActualSelectedDateRejectsBeforeApproval() {
        addShift(day,10,22);
        doReturn(Arrays.asList(existing(day,15,17))).when(service).list(any(Wrapper.class));
        assertThrows(BusinessException.class,()->service.add(request()));
        verifyNoInteractions(service.approvalDetailService);
        verify(service,never()).save(any());
    }
    @Test void nonconsecutiveExistingLeaveDoesNotBlockUnselectedGapDate() {
        LocalDate gap=day.plusDays(1); addShift(gap,10,22);
        MassagistLeave old=existing(day,14,16);
        old.setDatesStr(day+","+day.plusDays(2)); old.setEndDatetime(day.plusDays(2).atTime(16,0));
        doReturn(Arrays.asList(old)).when(service).list(any(Wrapper.class));
        MassagistLeave r=request(); r.setDates(new String[]{gap.toString()});
        assertDoesNotThrow(()->service.add(r));
        verify(service).save(r);
    }
    @Test void selectedDateAtEitherEndOfNonconsecutiveRequestIsChecked() {
        addShift(day,10,22); addShift(day.plusDays(2),10,22);
        doReturn(Arrays.asList(existing(day.plusDays(2),15,17))).when(service).list(any(Wrapper.class));
        MassagistLeave r=request(); r.setDates(new String[]{day.toString(),day.plusDays(2).toString()});
        assertThrows(BusinessException.class,()->service.add(r));
        verifyNoInteractions(service.approvalDetailService);
    }
    @Test void touchingDailyIntervalsAreNotDuplicateLeave() {
        addShift(day,10,22);
        doReturn(Arrays.asList(existing(day,16,18))).when(service).list(any(Wrapper.class));
        assertDoesNotThrow(()->service.add(request()));
    }
    @Test void legacyRecordWithoutDateListStillRejectsActualOverlap() {
        addShift(day,10,22); MassagistLeave old=existing(day,15,17); old.setDatesStr(null);
        doReturn(Arrays.asList(old)).when(service).list(any(Wrapper.class));
        assertThrows(BusinessException.class,()->service.add(request()));
        verifyNoInteractions(service.approvalDetailService);
    }
    @Test void failedInsertCannotReportSuccess() {
        addShift(day,10,22); doReturn(false).when(service).save(any());
        assertThrows(BusinessException.class,()->service.add(request()));
        verify(service.approvalDetailService,never()).reSubmit(anyLong());
    }
    MassagistLeave editRequest() {
        MassagistLeave stored=existing(day,14,16); stored.setId(50L); stored.setApprovalId(20L);
        doReturn(stored).when(service).getById(50L);
        MassagistLeave edit=request(); edit.setId(50L); edit.setApprovalId(20L); return edit;
    }
    @Test void failedUpdateCannotAdvanceApproval() {
        addShift(day,10,22); MassagistLeave edit=editRequest();
        doReturn(false).when(service).updateById(any());
        assertThrows(BusinessException.class,()->service.add(edit));
        verifyNoInteractions(service.approvalDetailService);
    }
    @Test void successfulEditUsesStoredApprovalNotClientSuppliedId() {
        addShift(day,10,22); MassagistLeave edit=editRequest(); edit.setApprovalId(999L);
        service.add(edit);
        assertEquals(20L,edit.getApprovalId());
        verify(service.approvalDetailService).reSubmit(20L);
        verify(service.approvalDetailService,never()).reSubmit(999L);
    }
    @Test void editCannotChangePersonOrApplicantOrRecreateMissingRecord() {
        addShift(day,10,22);
        MassagistLeave wrongPerson=editRequest(); wrongPerson.setMassagistId(8L);
        assertThrows(BusinessException.class,()->service.add(wrongPerson));
        MassagistLeave wrongApplicant=editRequest(); wrongApplicant.setCreateUser(9L);
        assertThrows(BusinessException.class,()->service.add(wrongApplicant));
        MassagistLeave missing=editRequest(); doReturn(null).when(service).getById(50L);
        assertThrows(BusinessException.class,()->service.add(missing));
        verifyNoInteractions(service.approvalDetailService);
        verify(service,never()).updateById(any());
    }
    @Test void addDeclaresRollbackForAllExceptions() throws Exception {
        org.springframework.transaction.annotation.Transactional tx=MassagistLeaveService.class
            .getMethod("add",MassagistLeave.class).getAnnotation(org.springframework.transaction.annotation.Transactional.class);
        assertNotNull(tx); assertTrue(Arrays.asList(tx.rollbackFor()).contains(Exception.class));
    }
    @Test void validLeaveUsesTypedDateTimesAndCreatesOneApproval() {
        addShift(day,10,22);
        MassagistLeave r=service.add(request());
        assertEquals(day.atTime(14,0),r.getStartDatetime());
        assertEquals(day.atTime(16,0),r.getEndDatetime());
        verify(service.approvalDetailService).addRelationMassagistLeaveId(eq(1L),any(),eq(8L),eq(1));
    }
}
