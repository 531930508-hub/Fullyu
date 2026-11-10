package com.macro.mall.service;

import com.alibaba.excel.EasyExcel;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.Integration;
import com.macro.mall.entity.IntegrationOperation;
import com.macro.mall.model.UmsAdmin;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 积分管理：单笔调整与导入必须留下操作人、时间与结果，扣减不足时明确失败。 */
class IntegrationOperationTest {
    IntegrationOperationService service;
    IntegrationService integrations;
    CustomerService customers;
    UmsAdmin operator;

    @BeforeEach void setup() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "integration-op"), IntegrationOperation.class);
        service = mock(IntegrationOperationService.class, CALLS_REAL_METHODS);
        integrations = mock(IntegrationService.class);
        customers = mock(CustomerService.class);
        ReflectionTestUtils.setField(service, "integrationService", integrations);
        ReflectionTestUtils.setField(service, "customerService", customers);
        doReturn(true).when(service).save(any(IntegrationOperation.class));
        doReturn(true).when(service).saveBatch(anyCollection());
        operator = new UmsAdmin(); operator.setId(9L); operator.setUsername("ops"); operator.setNickName("运营小王");
        when(customers.getByPhone("13800000001")).thenReturn(customer(10L, "13800000001"));
    }

    private Customer customer(Long id, String phone) { Customer c = new Customer(); c.setId(id); c.setPhone(phone); return c; }
    private Integration deducted(long score) { Integration i = new Integration(); i.setId(500L); i.setScore(score); return i; }
    private IntegrationOperation savedLog() {
        ArgumentCaptor<IntegrationOperation> c = ArgumentCaptor.forClass(IntegrationOperation.class);
        verify(service).save(c.capture()); return c.getValue();
    }

    @Test void positiveAdjustAddsPointsAndRecordsOperator() {
        IntegrationOperation log = service.adjust("13800000001", 10L, " 线下活动补发 ", operator);
        verify(integrations).addIntegration(10L, null, 10L, "线下活动补发");
        assertSame(log, savedLog());
        assertEquals(10L, log.getScore()); assertEquals(IntegrationOperation.ADJUST, log.getOpType());
        assertEquals(10L, log.getCustomerId()); assertEquals("13800000001", log.getPhone());
        assertEquals(9L, log.getOperatorId()); assertEquals("运营小王", log.getOperatorName());
        assertEquals(Boolean.TRUE, log.getSuccess()); assertEquals("线下活动补发", log.getReason());
    }

    @Test void negativeAdjustDeductsExactlyAndRecordsSignedScore() {
        when(integrations.getIntegrationByCustomerId(10L)).thenReturn(30L);
        when(integrations.useIntegration(10L, 10L, "误发扣回")).thenReturn(deducted(10L));
        IntegrationOperation log = service.adjust("13800000001", -10L, "误发扣回", operator);
        assertEquals(-10L, log.getScore()); assertEquals(500L, log.getIntegrationId());
        verify(integrations, never()).addIntegration(anyLong(), any(), anyLong(), anyString());
    }

    @Test void insufficientBalanceIsRejectedWithoutPartialDeduction() {
        when(integrations.getIntegrationByCustomerId(10L)).thenReturn(5L);
        BusinessException e = assertThrows(BusinessException.class, () -> service.adjust("13800000001", -10L, "扣回", operator));
        assertTrue(e.getMessage().contains("积分不足"), e.getMessage());
        assertTrue(e.getMessage().contains("5"), e.getMessage());
        verify(integrations, never()).useIntegration(anyLong(), anyLong(), anyString());
        verify(service, never()).save(any(IntegrationOperation.class));
    }

    @Test void partialDeductionFromConcurrentUseRollsBack() throws Exception {
        when(integrations.getIntegrationByCustomerId(10L)).thenReturn(30L);
        when(integrations.useIntegration(10L, 10L, "扣回")).thenReturn(deducted(4L));
        assertThrows(BusinessException.class, () -> service.adjust("13800000001", -10L, "扣回", operator));
        Transactional tx = IntegrationOperationService.class.getMethod("adjust", String.class, Long.class, String.class, UmsAdmin.class)
                .getAnnotation(Transactional.class);
        assertNotNull(tx, "抛错必须回滚已扣减的部分积分");
        assertTrue(Arrays.asList(tx.rollbackFor()).contains(Exception.class));
    }

    @Test void invalidInputsAreRejectedBeforeAnyWrite() {
        assertThrows(BusinessException.class, () -> service.adjust("13800000001", 0L, "原因", operator));
        assertThrows(BusinessException.class, () -> service.adjust("13800000001", null, "原因", operator));
        assertThrows(BusinessException.class, () -> service.adjust("13800000001", 10L, "  ", operator));
        assertThrows(BusinessException.class, () -> service.adjust("13800000001", 100001L, "原因", operator));
        assertThrows(BusinessException.class, () -> service.adjust("13800000001", 10L, "原因", null));
        assertThrows(BusinessException.class, () -> service.adjust("13900000000", 10L, "原因", operator), "单笔调整不自动建客户");
        verifyNoInteractions(integrations);
        verify(service, never()).save(any(IntegrationOperation.class));
    }

    private MockMultipartFile file(String[]... rows) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        List<List<String>> head = new ArrayList<>();
        for (String label : new String[]{"手机号", "变动积分数", "变动原因"}) head.add(Collections.singletonList(label));
        EasyExcel.write(out).head(head).sheet("积分").doWrite(new ArrayList<>(Arrays.asList(rows)).stream()
                .map(Arrays::asList).collect(java.util.stream.Collectors.toList()));
        return new MockMultipartFile("file", "points.xlsx", "application/octet-stream", out.toByteArray());
    }

    @SuppressWarnings("unchecked")
    @Test void importRecordsEveryRowWithSharedBatchAndExplicitFailures() {
        when(customers.getByPhone("13800000002")).thenReturn(customer(11L, "13800000002"));
        when(customers.getByPhone("13800000003")).thenReturn(null);
        when(customers.initCustomer("13800000003")).thenReturn(customer(null, "13800000003"));
        doAnswer(inv -> { ((Customer) inv.getArgument(0)).setId(12L); return true; }).when(customers).save(any(Customer.class));
        when(integrations.getIntegrationByCustomerId(11L)).thenReturn(3L);
        Map<String, Object> result = service.importFile(file(
                new String[]{"13800000001", "5", "活动"},
                new String[]{"13800000002", "-100", "扣回"},
                new String[]{"13800000003", "8积分", "新客"},
                new String[]{"13800000001", "abc", "格式错"}), operator);

        verify(integrations).addIntegration(5L, null, 10L, "活动");
        verify(integrations).addIntegration(8L, null, 12L, "新客");
        verify(integrations, never()).useIntegration(anyLong(), anyLong(), anyString());
        assertEquals(4, result.get("total")); assertEquals(2, result.get("success")); assertEquals(2, result.get("failed"));
        ArgumentCaptor<Collection> c = ArgumentCaptor.forClass(Collection.class);
        verify(service).saveBatch(c.capture());
        List<IntegrationOperation> logs = new ArrayList<>((Collection<IntegrationOperation>) c.getValue());
        assertEquals(4, logs.size());
        String batch = logs.get(0).getBatchNo(); assertNotNull(batch);
        for (IntegrationOperation l : logs) {
            assertEquals(batch, l.getBatchNo()); assertEquals(IntegrationOperation.IMPORT, l.getOpType());
            assertEquals(9L, l.getOperatorId()); assertEquals("运营小王", l.getOperatorName());
        }
        assertEquals(Boolean.FALSE, logs.get(1).getSuccess()); assertTrue(logs.get(1).getMessage().contains("积分不足"));
        assertEquals(-100L, logs.get(1).getScore());
        assertEquals(Boolean.FALSE, logs.get(3).getSuccess()); assertTrue(logs.get(3).getMessage().contains("积分数"));
        assertEquals(batch, result.get("batchNo"));
    }

    @Test void importAbortsWholeBatchWhenBalanceChangesMidDeduction() {
        when(integrations.getIntegrationByCustomerId(10L)).thenReturn(30L);
        when(integrations.useIntegration(10L, 10L, "扣回")).thenReturn(deducted(4L));
        assertThrows(IntegrationOperationService.BalanceChangedException.class, () -> service.importFile(file(
                new String[]{"13800000001", "-10", "扣回"}), operator));
        verify(service, never()).saveBatch(anyCollection());
    }

    @Test void importWithoutRequiredColumnsFailsWithoutLogs() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        EasyExcel.write(out).head(Collections.singletonList(Collections.singletonList("手机号"))).sheet("x")
                .doWrite(Collections.singletonList(Collections.singletonList("13800000001")));
        assertThrows(BusinessException.class, () -> service.importFile(
                new MockMultipartFile("file", "x.xlsx", "application/octet-stream", out.toByteArray()), operator));
        verifyNoInteractions(integrations);
        verify(service, never()).saveBatch(anyCollection());
    }

    @Test void historyFiltersByPhoneTypeOperatorAndDateRange() {
        Map<String, Object> params = new HashMap<>();
        params.put("phone", "1380"); params.put("op_type", "1"); params.put("operator_name", "王");
        params.put("start_time", "2026-11-01"); params.put("end_time", "2026-11-08");
        String sql = service.buildWrapper(params, new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>()).getCustomSqlSegment();
        assertTrue(sql.contains("phone LIKE"), sql); assertTrue(sql.contains("op_type ="), sql);
        assertTrue(sql.contains("operator_name LIKE"), sql);
        assertTrue(sql.contains("create_time >="), sql); assertTrue(sql.contains("create_time <"), sql);
    }
}
