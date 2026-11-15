package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.macro.mall.dto.OrderDetailDto;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.enums.AppointmentState;
import com.macro.mall.enums.ServiceState;
import com.macro.mall.mapper.OrderDetailMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 需求6（到店/已服务明细不被新单覆盖）+ 到店次数静态自然日编号的回归用例。
 */
class OrderEditKeepsServedDetailsTest {

    OrderService orderService;
    OrderDetailService orderDetailService;

    @BeforeEach
    void setup() {
        orderService = spy(new OrderService());
        orderDetailService = mock(OrderDetailService.class);
        orderService.orderDetailService = orderDetailService;
        doReturn(true).when(orderService).updateById(any());
    }

    @org.junit.jupiter.api.BeforeAll
    static void initTableInfo() {
        // LambdaQueryWrapper 的字段解析依赖 TableInfo 缓存，纯单测里没有 Spring 扫描，需要手动初始化
        com.baomidou.mybatisplus.core.MybatisConfiguration configuration =
                new com.baomidou.mybatisplus.core.MybatisConfiguration();
        org.apache.ibatis.builder.MapperBuilderAssistant assistant =
                new org.apache.ibatis.builder.MapperBuilderAssistant(configuration, "");
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(assistant, Order.class);
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(assistant, OrderDetail.class);
    }

    private OrderDetail detail(long id, int appointmentState) {
        OrderDetail d = new OrderDetail();
        d.setId(id);
        d.setOrderId(1L);
        d.setCustomerId(9L);
        d.setShopId(1L);
        d.setProjectId(100L);
        d.setState(appointmentState);
        d.setDuration(60);
        d.setStartTime(LocalDateTime.of(2026, 12, 1, 10, 0));
        d.setEndTime(LocalDateTime.of(2026, 12, 1, 11, 0));
        return d;
    }

    private Order waitingOrder() {
        Order order = new Order();
        order.setId(1L);
        order.setCustomerId(9L);
        order.setShopId(1L);
        order.setState(1);
        order.setAppointmentState(ServiceState.WAITING.getValue());
        order.setProductId(5L);
        return order;
    }

    private OrderDetailDto dto() {
        OrderDetailDto dto = new OrderDetailDto();
        dto.setOrderId(1L);
        dto.setShopId(1L);
        dto.setProductId(5L);
        dto.setPersonCount(2);
        dto.setStartTime(LocalDateTime.of(2026, 12, 1, 10, 0));
        dto.setDurationMinutes(60);
        return dto;
    }

    @Test
    void isServedDetailTreatsDoingFinishedAndFinishTimeAsLocked() {
        assertTrue(OrderDetailService.isServedDetail(detail(1, AppointmentState.DOING.getValue())));
        assertTrue(OrderDetailService.isServedDetail(detail(2, AppointmentState.FINISHED.getValue())));
        OrderDetail finished = detail(3, AppointmentState.WAITING.getValue());
        finished.setFinishTime(LocalDateTime.now());
        assertTrue(OrderDetailService.isServedDetail(finished));
        assertFalse(OrderDetailService.isServedDetail(detail(4, AppointmentState.WAITING.getValue())));
        assertFalse(OrderDetailService.isServedDetail(null));
    }

    @Test
    void updateOrderOnlyRebuildsUnservedDetails() {
        OrderDetail served = detail(11L, AppointmentState.DOING.getValue());
        served.setMassagistId(7L);
        OrderDetail editable = detail(12L, AppointmentState.WAITING.getValue());
        doReturn(waitingOrder()).when(orderService).getById(1L);
        when(orderDetailService.listByOrderId(1L)).thenReturn(new ArrayList<>(Arrays.asList(served, editable)));

        OrderDetailDto dto = dto();
        orderService.updateOrder(dto);

        // 已到店的行不删，只重建未服务的行
        verify(orderDetailService).removeByIds(argThat(ids -> ids.size() == 1 && ids.contains(12L)));
        ArgumentCaptor<OrderDetailDto> captor = ArgumentCaptor.forClass(OrderDetailDto.class);
        verify(orderDetailService).createDetail(captor.capture(), eq(false), eq(false));
        OrderDetailDto rebuilt = captor.getValue();
        assertEquals(Collections.singletonList(11L),
                rebuilt.getServedOrderDetails().stream().map(OrderDetail::getId)
                        .collect(java.util.stream.Collectors.toList()));
        assertEquals(Collections.singletonList(12L),
                rebuilt.getOldOrderDetails().stream().map(OrderDetail::getId)
                        .collect(java.util.stream.Collectors.toList()));
    }

    @Test
    void updateOrderKeepsAllRowsWhenEveryoneAlreadyArrived() {
        OrderDetail servedA = detail(21L, AppointmentState.DOING.getValue());
        OrderDetail servedB = detail(22L, AppointmentState.FINISHED.getValue());
        doReturn(waitingOrder()).when(orderService).getById(1L);
        when(orderDetailService.listByOrderId(1L)).thenReturn(new ArrayList<>(Arrays.asList(servedA, servedB)));

        orderService.updateOrder(dto());

        // 没有可重建的行：一条都不能删
        verify(orderDetailService, never()).removeByIds(anyCollection());
        ArgumentCaptor<OrderDetailDto> captor = ArgumentCaptor.forClass(OrderDetailDto.class);
        verify(orderDetailService).createDetail(captor.capture(), eq(false), eq(false));
        assertTrue(captor.getValue().getOldOrderDetails() == null
                || captor.getValue().getOldOrderDetails().isEmpty());
        assertEquals(2, captor.getValue().getServedOrderDetails().size());
    }

    @Test
    void effectivePersonCountSubtractsServedPersonsOfSameProject() {
        List<OrderDetail> served = Arrays.asList(detail(31L, AppointmentState.DOING.getValue()),
                detail(32L, AppointmentState.FINISHED.getValue()));
        OrderDetailService real = new OrderDetailService();
        java.util.Map<Long, Integer> servedByProject = ReflectionTestUtils.invokeMethod(real,
                "countServedByProject", served);
        assertNotNull(servedByProject);
        assertEquals(2, servedByProject.get(100L));

        Integer remaining = ReflectionTestUtils.invokeMethod(real,
                "effectivePersonCount", 3, servedByProject, 100L);
        assertEquals(1, remaining);
        Integer noneLeft = ReflectionTestUtils.invokeMethod(real,
                "effectivePersonCount", 1, servedByProject, 100L);
        assertEquals(0, noneLeft);
        Integer otherProject = ReflectionTestUtils.invokeMethod(real,
                "effectivePersonCount", 2, servedByProject, 200L);
        assertEquals(2, otherProject);
    }

    @Test
    void visitNoFirstVisitIsOne() {
        doReturn(new ArrayList<Order>()).when(orderService).list(any(Wrapper.class));
        assertEquals(1, orderService.resolveVisitNo(9L, LocalDateTime.of(2026, 12, 1, 10, 0)));
    }

    @Test
    void visitNoReusesNumberWithinSameNaturalDay() {
        Order earlierToday = new Order();
        earlierToday.setId(41L);
        earlierToday.setVisitNo(3);
        doReturn(new ArrayList<>(Collections.singletonList(earlierToday)))
                .when(orderService).list(any(Wrapper.class));
        OrderDetail sameDay = detail(0L, AppointmentState.FINISHED.getValue());
        sameDay.setOrderId(41L);
        sameDay.setStartTime(LocalDateTime.of(2026, 12, 1, 9, 0));
        OrderDetailMapper mapper = mock(OrderDetailMapper.class);
        when(mapper.selectList(any())).thenReturn(Collections.singletonList(sameDay));
        when(orderDetailService.getBaseMapper()).thenReturn(mapper);

        Integer visitNo = orderService.resolveVisitNo(9L, LocalDateTime.of(2026, 12, 1, 15, 0));
        assertEquals(3, visitNo);
    }

    @Test
    void visitNoCountsEachNaturalDayOnce() {
        Order d3a = new Order();
        d3a.setId(51L);
        Order d3b = new Order();
        d3b.setId(52L);
        Order d1 = new Order();
        d1.setId(53L);
        doReturn(new ArrayList<>(Arrays.asList(d3a, d3b, d1))).when(orderService).list(any(Wrapper.class));
        OrderDetail a = detail(0L, AppointmentState.FINISHED.getValue());
        a.setOrderId(51L);
        a.setStartTime(LocalDateTime.of(2026, 11, 28, 10, 0));
        OrderDetail b = detail(0L, AppointmentState.FINISHED.getValue());
        b.setOrderId(52L);
        b.setStartTime(LocalDateTime.of(2026, 11, 28, 16, 0));
        OrderDetail c = detail(0L, AppointmentState.FINISHED.getValue());
        c.setOrderId(53L);
        c.setStartTime(LocalDateTime.of(2026, 11, 30, 10, 0));
        OrderDetailMapper mapper = mock(OrderDetailMapper.class);
        when(mapper.selectList(any())).thenReturn(Arrays.asList(a, b, c));
        when(orderDetailService.getBaseMapper()).thenReturn(mapper);

        // 之前来过 11-28、11-30 两个自然日 -> 这单是第 3 次到店
        Integer visitNo = orderService.resolveVisitNo(9L, LocalDateTime.of(2026, 12, 1, 10, 0));
        assertEquals(3, visitNo);
    }

    @Test
    void visitNoFallsBackWhenSameDayOrderHasNoNumber() {
        Order legacySameDay = new Order();
        legacySameDay.setId(61L);
        doReturn(new ArrayList<>(Collections.singletonList(legacySameDay))).when(orderService).list(any(Wrapper.class));
        OrderDetail sameDay = detail(0L, AppointmentState.WAITING.getValue());
        sameDay.setOrderId(61L);
        sameDay.setStartTime(LocalDateTime.of(2026, 12, 1, 9, 0));
        OrderDetailMapper mapper = mock(OrderDetailMapper.class);
        when(mapper.selectList(any())).thenReturn(Collections.singletonList(sameDay));
        when(orderDetailService.getBaseMapper()).thenReturn(mapper);

        // 历史单没有编号、且当天只有这一单：仍算第 1 次到店，不因为「当天已有单」跳到第 2 次
        Integer visitNo = orderService.resolveVisitNo(9L, LocalDateTime.of(2026, 12, 1, 15, 0));
        assertEquals(1, visitNo);
    }

    @Test
    void cancelledOrRefundedOrderIsNotCounted() {
        Order paid = new Order();
        paid.setState(1);
        paid.setAppointmentState(AppointmentState.WAITING.getValue());
        assertTrue(orderService.isVisitCounted(paid));

        Order refunded = new Order();
        refunded.setState(6);
        assertFalse(orderService.isVisitCounted(refunded));

        Order refunding = new Order();
        refunding.setState(5);
        assertFalse(orderService.isVisitCounted(refunding));

        Order timeout = new Order();
        timeout.setState(3);
        assertFalse(orderService.isVisitCounted(timeout));

        Order cancelledAppointment = new Order();
        cancelledAppointment.setState(1);
        cancelledAppointment.setAppointmentState(AppointmentState.CANCELED.getValue());
        assertFalse(orderService.isVisitCounted(cancelledAppointment));
    }

    @Test
    void renumberFillsGapLeftByCancelledDay() {
        // 11-28 第1次、11-30 第2次（后来取消）、12-01 第3次
        Order nov28 = new Order();
        nov28.setId(71L);
        nov28.setVisitNo(1);
        Order nov30 = new Order();
        nov30.setId(72L);
        nov30.setVisitNo(2);
        Order dec01 = new Order();
        dec01.setId(73L);
        dec01.setVisitNo(3);
        java.util.Map<Long, java.time.LocalDate> dateMap = new java.util.HashMap<>();
        dateMap.put(71L, java.time.LocalDate.of(2026, 11, 28));
        dateMap.put(73L, java.time.LocalDate.of(2026, 12, 1));

        // 11-30 取消后只剩两单，12-01 应从第 3 次回落到第 2 次
        java.util.Map<Long, Integer> plan = ReflectionTestUtils.invokeMethod(orderService,
                "planVisitNo", Arrays.asList(nov28, nov30, dec01), dateMap, java.time.LocalDate.of(2026, 11, 30));
        assertNotNull(plan);
        assertEquals(2, plan.get(73L));
        assertFalse(plan.containsKey(71L));

        java.util.Map<Long, Integer> fullPlan = ReflectionTestUtils.invokeMethod(orderService,
                "planVisitNo", Arrays.asList(nov28, nov30, dec01), dateMap, java.time.LocalDate.of(2026, 11, 28));
        assertEquals(1, fullPlan.get(71L));
        assertEquals(2, fullPlan.get(73L));
    }

    @Test
    void visitNoMapMarksCancelledOrderWithoutNumber() {
        Order active = new Order();
        active.setId(81L);
        active.setVisitNo(1);
        active.setState(1);
        active.setAppointmentState(AppointmentState.WAITING.getValue());
        Order cancelled = new Order();
        cancelled.setId(82L);
        cancelled.setVisitNo(2);
        cancelled.setState(4);
        cancelled.setAppointmentState(AppointmentState.CANCELED.getValue());
        doReturn(new ArrayList<>(Arrays.asList(active, cancelled))).when(orderService).list(any(Wrapper.class));
        OrderDetail a = detail(0L, AppointmentState.FINISHED.getValue());
        a.setOrderId(81L);
        a.setStartTime(LocalDateTime.of(2026, 11, 28, 10, 0));
        OrderDetail b = detail(0L, AppointmentState.CANCELED.getValue());
        b.setOrderId(82L);
        b.setStartTime(LocalDateTime.of(2026, 11, 30, 10, 0));
        OrderDetailMapper mapper = mock(OrderDetailMapper.class);
        when(mapper.selectList(any())).thenReturn(Arrays.asList(a, b));
        when(orderDetailService.getBaseMapper()).thenReturn(mapper);

        java.util.Map<Long, Integer> map = orderService.visitNoMapByCustomer(9L);
        assertEquals(1, map.get(81L));
        assertTrue(map.containsKey(82L));
        assertNull(map.get(82L));
    }
}