package com.macro.mall.service;

import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.SalaryRecord;
import com.macro.mall.service.serviceStatistics.StatisticsService;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

// Real settlement calculations with synthetic records; transaction declaration is not a live rollback test.
class SalaryRecordPersistenceTest {
    SalaryRecordService service;
    StatisticsService statistics;
    SalaryOtherAmountService adjustments;
    SalaryRecord record;

    @BeforeEach void setup() {
        service = spy(new SalaryRecordService()); statistics = mock(StatisticsService.class); adjustments = mock(SalaryOtherAmountService.class);
        ReflectionTestUtils.setField(service, "statisticsService", statistics);
        ReflectionTestUtils.setField(service, "salaryOtherAmountService", adjustments);
        record = new SalaryRecord(); record.setId(21L); record.setMassagistId(7L); record.setMonthCode("2026-09"); record.setYear("2026");
        record.setCoefficient(new BigDecimal("1.4")); record.setCreateTime(LocalDateTime.of(2026, 9, 1, 0, 0));
        doReturn(new ArrayList<>(Collections.singletonList(record))).when(service).list(any(Wrapper.class));
        doReturn(true).when(service).updateBatchById(anyCollection());
        when(adjustments.calcOtherAmount(anyString(), eq(7L))).thenReturn(BigDecimal.ZERO);
        JSONObject duration = new JSONObject(); duration.put("periodCode", "2026-09"); duration.put("totalWorkingHours", 1068.0);
        when(statistics.serviceDuration(isNull(), anyString(), anyString(), eq(7L))).thenReturn(Collections.singletonList(duration));
    }
    @Test void singlePersonRecalculationDeclaresRollbackForAnyException() throws Exception {
        Transactional tx = SalaryRecordService.class.getMethod("resetMassagistSalaryRecords", Long.class, String.class).getAnnotation(Transactional.class);
        assertNotNull(tx, "跨月批量重算必须由事务包裹");
        assertTrue(Arrays.asList(tx.rollbackFor()).contains(Exception.class));
    }
    @Test void failedBatchResultCannotBeReportedAsSuccessfulRecalculation() {
        doReturn(false).when(service).updateBatchById(anyCollection());
        assertThrows(BusinessException.class, () -> service.resetMassagistSalaryRecords(7L, "2026-09"));
    }
    @Test void noMatchingRecordsMakesNoStatisticsReadOrWrite() {
        doReturn(Collections.emptyList()).when(service).list(any(Wrapper.class));
        service.resetMassagistSalaryRecords(7L, "2026-09");
        verifyNoInteractions(statistics, adjustments); verify(service, never()).updateBatchById(anyCollection());
    }
    @Test void successfulRecalculationPreservesOriginalCoefficientAndServiceFeeArithmetic() {
        service.resetMassagistSalaryRecords(7L, "2026-09");
        assertEquals(1068.0, record.getTotalDuration());
        assertEquals(0, new BigDecimal("1495.2").compareTo(record.getSalary()));
        assertEquals(0, new BigDecimal("1400").compareTo(record.getPreTaxIncome()));
        assertEquals(0, new BigDecimal("1400").compareTo(record.getActualIncome()));
        assertEquals(0, BigDecimal.ZERO.compareTo(record.getPayableIncomeTax()));
        verify(service).updateBatchById(argThat(rows -> rows.size() == 1 && rows.iterator().next().getId().equals(21L)));
    }
    @Test void futureMonthIsRejectedBeforeDataSourceOrWrite() {
        assertThrows(BusinessException.class, () -> service.resetMassagistSalaryRecords(7L, "2999-01"));
        verify(service, never()).list(any(Wrapper.class)); verify(service, never()).updateBatchById(anyCollection()); verifyNoInteractions(statistics, adjustments);
    }
}
