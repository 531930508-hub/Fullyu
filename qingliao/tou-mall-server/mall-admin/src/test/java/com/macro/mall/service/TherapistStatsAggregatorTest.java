package com.macro.mall.service;

import com.macro.mall.dto.TherapistStatsRow;
import com.macro.mall.dto.TherapistStatsSource;
import com.macro.mall.service.serviceStatistics.TherapistStatsAggregator;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

class TherapistStatsAggregatorTest {

    private TherapistStatsSource src(long detailId, long massagistId, long orderId, Long customerId, Integer specify,
                                     LocalDateTime start, Integer payType, String parts, Integer gender) {
        TherapistStatsSource s = new TherapistStatsSource();
        s.setDetailId(detailId); s.setMassagistId(massagistId); s.setOrderId(orderId); s.setCustomerId(customerId);
        s.setSpecifyType(specify); s.setStartTime(start); s.setPayType(payType); s.setParts(parts); s.setGender(gender);
        return s;
    }

    private static final LocalDateTime D1 = LocalDateTime.of(2026, 11, 1, 10, 0);
    private static final LocalDateTime D2 = LocalDateTime.of(2026, 11, 2, 10, 0);
    private static final LocalDateTime D3 = LocalDateTime.of(2026, 11, 3, 10, 0);

    @Test
    void countsOrdersPayTypesGenderAndPartsPerTherapistByDistinctOrderAndCustomer() {
        List<TherapistStatsSource> rows = Arrays.asList(
                // 同一订单两条明细：订单、支付方式、部位只计一次
                src(1, 7, 100, 1L, 0, D1, 1, "[\"头\",\"肩\"]", 1),
                src(2, 7, 100, 1L, 0, D1, 1, "[\"头\",\"肩\"]", 1),
                src(3, 7, 101, 2L, null, D2, 3, "[\"耳\"]", 2),
                src(4, 7, 102, 2L, 0, D3, 2, "[\"头\",\"背\"]", 2),
                src(5, 7, 103, null, 0, D3, 9, "坏数据", null),
                src(6, 8, 200, 3L, 0, D1, 4, null, 2));
        Map<Long, String> names = new HashMap<>();
        names.put(7L, "安然"); names.put(8L, "知微");

        List<TherapistStatsRow> out = TherapistStatsAggregator.aggregate(Arrays.asList(7L, 8L), names,
                Collections.emptyMap(), rows, Collections.emptyMap());

        TherapistStatsRow a = out.get(0);
        assertEquals("安然", a.getMassagistName());
        assertEquals(4, a.getOrderCount());
        assertEquals(5, a.getServiceCount());
        assertEquals(1, a.getWechatCount());
        assertEquals(1, a.getMeituanCount());
        assertEquals(1, a.getCouponCount());
        assertEquals(1, a.getOtherPayCount(), "未知支付方式归其他");
        assertEquals(1, a.getMaleCustomers());
        assertEquals(1, a.getFemaleCustomers(), "同一女客两单只计 1 人");
        assertEquals(0, a.getUnknownGenderCustomers(), "无顾客的明细不计入顾客数");
        assertEquals(2, a.getHeadCount());
        assertEquals(1, a.getShoulderCount());
        assertEquals(1, a.getEarCount());
        assertEquals(1, a.getOtherPartCount(), "未列名部位归其他");
        assertEquals(1, out.get(1).getCashCount());
    }

    @Test
    void countsSpecifyAndNewSpecifyOnlyAtFirstEverSpecifyWithSameTherapist() {
        List<TherapistStatsSource> rows = Arrays.asList(
                src(1, 7, 100, 1L, 1, D1, 1, null, 1),   // 顾客1首次点钟 → 新增
                src(2, 7, 101, 1L, 2, D2, 1, null, 1),   // 再次点钟 → 非新增
                src(3, 7, 102, 2L, 2, D2, 1, null, 2),   // 顾客2历史上更早点过 → 非新增
                src(4, 7, 103, 3L, 0, D2, 1, null, 2),   // 非点钟
                src(5, 7, 104, 4L, 1, D3, 1, null, 2),   // 同一时间两条首次点钟只计一次
                src(6, 7, 104, 4L, 1, D3, 1, null, 2));
        Map<String, LocalDateTime> first = new HashMap<>();
        first.put("7:1", D1);
        first.put("7:2", LocalDateTime.of(2026, 10, 1, 9, 0));
        first.put("7:4", D3);

        TherapistStatsRow a = TherapistStatsAggregator.aggregate(Collections.singletonList(7L),
                Collections.singletonMap(7L, "安然"), Collections.emptyMap(), rows, first).get(0);

        assertEquals(5, a.getSpecifyCount());
        assertEquals(2, a.getNewSpecifyCount());
    }

    @Test
    void keepsRequestedOrderAndReturnsZeroRowForTherapistWithoutService() {
        Map<Long, String> names = new HashMap<>();
        names.put(8L, "知微"); names.put(7L, "安然");
        Map<Long, Integer> status = new HashMap<>();
        status.put(8L, 1); status.put(7L, 0);

        List<TherapistStatsRow> out = TherapistStatsAggregator.aggregate(Arrays.asList(8L, 7L), names, status,
                Collections.singletonList(src(1, 7, 100, 1L, 0, D1, 0, null, 1)), Collections.emptyMap());

        assertEquals(Arrays.asList(8L, 7L), Arrays.asList(out.get(0).getMassagistId(), out.get(1).getMassagistId()));
        assertEquals(0, out.get(0).getOrderCount());
        assertEquals("合作中", out.get(0).getStatusText());
        assertEquals("已结束合作", out.get(1).getStatusText());
        assertEquals(1, out.get(1).getQrCount());
    }

    @Test
    void appendsTotalRowSummingAllColumns() {
        List<TherapistStatsRow> out = TherapistStatsAggregator.aggregate(Arrays.asList(7L, 8L),
                Collections.emptyMap(), Collections.emptyMap(), Arrays.asList(
                        src(1, 7, 100, 1L, 1, D1, 1, "[\"头\"]", 1),
                        src(2, 8, 200, 2L, 0, D1, 1, "[\"头\"]", 2)),
                Collections.singletonMap("7:1", D1));

        TherapistStatsRow total = TherapistStatsAggregator.totalRow(out);
        assertEquals("合计", total.getMassagistName());
        assertEquals(2, total.getOrderCount());
        assertEquals(2, total.getWechatCount());
        assertEquals(1, total.getMaleCustomers());
        assertEquals(1, total.getNewSpecifyCount());
        assertEquals(2, total.getHeadCount());
    }
}
