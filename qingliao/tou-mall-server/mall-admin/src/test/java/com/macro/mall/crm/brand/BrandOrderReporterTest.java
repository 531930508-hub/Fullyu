package com.macro.mall.crm.brand;

import com.macro.mall.mapper.OrderMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 轻疗订单上报 CRM：开关、金额换算、幂等指纹、退款累计、失败语义。
 *
 * <p>Mockito 模拟订单表与 CRM 客户端，不连数据库与 CRM。</p>
 */
class BrandOrderReporterTest {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 9, 10, 0, 0);
    /** 库里 payTime 是北京时间墙钟；驱动读出来是"该墙钟在 +08 下的那一刻"。 */
    private static final ZoneId SHANGHAI = ZoneId.of("Asia/Shanghai");

    private OrderMapper orderMapper;
    private BrandMemberClient client;
    private final List<Map<String, Object>> rows = new ArrayList<>();

    @BeforeEach
    void setUp() {
        orderMapper = mock(OrderMapper.class);
        client = mock(BrandMemberClient.class);
        when(client.isActive()).thenReturn(true);
        when(orderMapper.selectMaps(any())).thenReturn(rows);
    }

    private BrandOrderReporter reporter(String flag) {
        return new BrandOrderReporter(orderMapper, client, flag);
    }

    private static Map<String, Object> order(long id, String code, Long customerId, String pay,
                                             String benefit, String refunded, int state) {
        Map<String, Object> row = new HashMap<>();
        row.put("id", id);
        row.put("code", code);
        row.put("customerId", customerId);
        row.put("payAmount", new BigDecimal(pay));
        row.put("benefitAmount", benefit == null ? null : new BigDecimal(benefit));
        row.put("hasRefundAmount", refunded == null ? null : new BigDecimal(refunded));
        row.put("payTime", Timestamp.from(NOW.minusHours(2).atZone(SHANGHAI).toInstant()));
        row.put("state", state);
        return row;
    }

    @Test
    void offByDefaultAndWhenClientInactive() {
        rows.add(order(1, "QL1", 42L, "300.00", null, null, 1));
        assertFalse(reporter("").isEnabled());
        assertEquals(0, reporter(null).runOnce(NOW).reported);
        when(client.isActive()).thenReturn(false);
        assertFalse(reporter("1").isEnabled());
        assertEquals(0, reporter("1").runOnce(NOW).reported);
        verify(client, never()).reportOrder(anyString(), anyString(), anyLong(), anyLong(), anyString());
        verify(orderMapper, never()).selectMaps(any());
    }

    @Test
    void reportsYuanAsCentsWithBenefitAndCrmTime() {
        rows.add(order(7, "QL20261109001", 42L, "328.50", "36.50", null, 2));

        BrandOrderReporter.Result result = reporter("1").runOnce(NOW);

        assertEquals(1, result.reported);
        verify(client).reportOrder("42", "QL20261109001", 32850L, 3650L, "2026-11-09T08:00:00+08:00");
        verify(client, never()).refundOrder(anyString(), anyString(), anyLong(), anyString());
    }

    /** 进程默认时区被改成 UTC 时，报给 CRM 的仍必须是北京时间 +08:00，不能整体偏 8 小时。 */
    @Test
    void crmTimeStaysShanghaiWhenJvmTimezoneIsUtc() {
        TimeZone original = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
            rows.add(order(7, "QL20261109001", 42L, "328.50", "36.50", null, 2));

            BrandOrderReporter.Result result = reporter("1").runOnce(NOW);

            assertEquals(1, result.reported);
            verify(client).reportOrder("42", "QL20261109001", 32850L, 3650L, "2026-11-09T08:00:00+08:00");
        } finally {
            TimeZone.setDefault(original);
        }
    }

    @Test
    void unchangedOrderIsNotResentButRefundIsReportedCumulatively() {
        Map<String, Object> row = order(7, "QL7", 42L, "300", null, null, 1);
        rows.add(row);
        BrandOrderReporter reporter = reporter("on");

        reporter.runOnce(NOW);
        BrandOrderReporter.Result second = reporter.runOnce(NOW.plusMinutes(1));
        assertEquals(1, second.skipped);
        verify(client, times(1)).reportOrder(anyString(), anyString(), anyLong(), anyLong(), anyString());

        row.put("hasRefundAmount", new BigDecimal("120.00"));
        row.put("state", 5);
        BrandOrderReporter.Result third = reporter.runOnce(NOW.plusMinutes(2));
        assertEquals(1, third.refunded);
        verify(client).refundOrder(eq("42"), eq("QL7"), eq(12000L), anyString());
    }

    @Test
    void legacyRefundedOrderWithoutAmountRefundsInFull() {
        rows.add(order(9, "QL9", 42L, "450", null, null, 6));

        reporter("1").runOnce(NOW);

        verify(client).reportOrder("42", "QL9", 45000L, 0L, "2026-11-09T08:00:00+08:00");
        verify(client).refundOrder(eq("42"), eq("QL9"), eq(45000L), anyString());
    }

    @Test
    void unsafeOrderCodeFallsBackToStableId() {
        assertEquals("id:12", BrandOrderReporter.orderRef(12L, "订单 12"));
        assertEquals("id:12", BrandOrderReporter.orderRef(12L, null));
        assertEquals("QL-12", BrandOrderReporter.orderRef(12L, " QL-12 "));
    }

    @Test
    void skipsMalformedRowsWithoutCallingCrm() {
        rows.add(order(1, "QL1", null, "300", null, null, 1));
        Map<String, Object> noTime = order(2, "QL2", 42L, "300", null, null, 1);
        noTime.put("payTime", null);
        rows.add(noTime);
        rows.add(order(3, "QL3", 42L, "0", null, null, 1));

        BrandOrderReporter.Result result = reporter("1").runOnce(NOW);

        assertEquals(3, result.skipped);
        verify(client, never()).reportOrder(anyString(), anyString(), anyLong(), anyLong(), anyString());
    }

    @Test
    void memberMissingBacksOffContractErrorsContinueAndOutageStopsBatch() {
        rows.addAll(Arrays.asList(
                order(1, "QL1", 41L, "300", null, null, 1),
                order(2, "QL2", 42L, "300", null, null, 1),
                order(3, "QL3", 43L, "300", null, null, 1),
                order(4, "QL4", 44L, "300", null, null, 1)));
        when(client.reportOrder(eq("41"), anyString(), anyLong(), anyLong(), anyString()))
                .thenThrow(new BrandMemberException("MEMBER_NOT_FOUND", "同步中", 404));
        when(client.reportOrder(eq("42"), anyString(), anyLong(), anyLong(), anyString()))
                .thenThrow(new BrandMemberException("IDEMPOTENCY_CONFLICT", "冲突", 409));
        when(client.reportOrder(eq("43"), anyString(), anyLong(), anyLong(), anyString()))
                .thenThrow(new BrandMemberException(BrandMemberException.UNAVAILABLE, "不可用", 503));
        BrandOrderReporter reporter = reporter("1");

        BrandOrderReporter.Result first = reporter.runOnce(NOW);
        assertEquals(3, first.failed);
        assertEquals(0, first.reported);
        verify(client, never()).reportOrder(eq("44"), anyString(), anyLong(), anyLong(), anyString());

        // 下一轮：41 仍在退避期，42/43 失败未记指纹会再试。
        BrandOrderReporter.Result second = reporter.runOnce(NOW.plusMinutes(1));
        assertTrue(second.skipped >= 1);
        verify(client, times(1)).reportOrder(eq("41"), anyString(), anyLong(), anyLong(), anyString());
        verify(client, times(2)).reportOrder(eq("42"), anyString(), anyLong(), anyLong(), anyString());

        // 退避一小时后再试。
        reporter.runOnce(NOW.plusMinutes(61));
        verify(client, times(2)).reportOrder(eq("41"), anyString(), anyLong(), anyLong(), anyString());
    }

    @Test
    void emptyScanIsHarmless() {
        when(orderMapper.selectMaps(any())).thenReturn(Collections.emptyList());
        assertEquals(0, reporter("1").runOnce(NOW).reported);
    }
}
