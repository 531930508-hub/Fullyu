package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Bed;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.enums.AppointmentState;
import com.macro.mall.enums.NormalState;
import com.macro.mall.mapper.OrderDetailMapper;
import com.macro.mall.service.shop.BedService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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
 * 看板拖动排期：落点被占用时本次拖动直接失败，不允许把原来那单盖掉或互换；
 * 已完成/已取消的明细按运营动作挪动，不校验冲突也不去动别人的排期。
 */
class DragScheduleConflictTest {

    private static final LocalDate DAY = LocalDate.now().plusDays(2);

    private OrderDetailService service;
    private OrderDetailMapper mapper;
    private BedService bedService;
    private MassagistService massagistService;
    private ProjectService projectService;
    private RoundScheduleService roundScheduleService;

    @BeforeEach
    void setup() {
        service = new OrderDetailService();
        mapper = mock(OrderDetailMapper.class);
        bedService = mock(BedService.class);
        massagistService = mock(MassagistService.class);
        projectService = mock(ProjectService.class);
        roundScheduleService = mock(RoundScheduleService.class);
        ReflectionTestUtils.setField(service, "baseMapper", mapper);
        ReflectionTestUtils.setField(service, "bedService", bedService);
        ReflectionTestUtils.setField(service, "massagistService", massagistService);
        ReflectionTestUtils.setField(service, "projectService", projectService);
        ReflectionTestUtils.setField(service, "roundScheduleService", roundScheduleService);
        when(projectService.isReceptionOrder(anyLong())).thenReturn(false);
        when(mapper.updateById(any(OrderDetail.class))).thenReturn(1);
    }

    private OrderDetail detail(long id, Integer state, Long massagistId, Long bedId, int hour, int minute, int minutes) {
        OrderDetail detail = new OrderDetail();
        detail.setId(id);
        detail.setShopId(1L);
        detail.setProjectId(2L);
        detail.setState(state);
        detail.setMassagistId(massagistId);
        detail.setBedId(bedId);
        detail.setIsUpdateSort(false);
        LocalDateTime start = DAY.atTime(hour, minute);
        detail.setStartTime(start);
        detail.setDuration(minutes);
        detail.setEndTime(start.plusMinutes(minutes));
        return detail;
    }

    private void givenOccupiedBy(OrderDetail dragged, OrderDetail other) {
        when(mapper.selectById(dragged.getId())).thenReturn(dragged);
        when(mapper.findOverlapListByShopAndTime(eq(1L), any(), any()))
                .thenReturn(new ArrayList<>(Arrays.asList(dragged, other)));
    }

    private String at(int hour, int minute) {
        return DAY + " " + String.format("%02d:%02d", hour, minute) + ":00";
    }

    @Test
    void dragOntoOccupiedMassagistFailsAndLeavesExistingOrderUntouched() {
        OrderDetail dragged = detail(1L, AppointmentState.WAITING.getValue(), null, 5L, 14, 0, 60);
        OrderDetail occupied = detail(2L, AppointmentState.WAITING.getValue(), 11L, 6L, 14, 30, 60);
        givenOccupiedBy(dragged, occupied);
        when(massagistService.findNameById(11L)).thenReturn("小颜");

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.updateDetail(1L, null, 11L, at(14, 30)));

        assertTrue(e.getMessage().contains("小颜"), e.getMessage());
        assertTrue(e.getMessage().contains("14:30~15:30"), e.getMessage());
        // 原来那单一个字都不改，本次拖动整单不落库
        verify(mapper, never()).updateById(any(OrderDetail.class));
    }

    @Test
    void dragOntoOccupiedBedFails() {
        OrderDetail dragged = detail(1L, AppointmentState.WAITING.getValue(), 11L, 5L, 14, 0, 60);
        OrderDetail occupied = detail(2L, AppointmentState.DOING.getValue(), 12L, 7L, 14, 0, 60);
        givenOccupiedBy(dragged, occupied);
        Bed target = new Bed();
        target.setId(7L);
        target.setName("床7");
        target.setStatus(NormalState.EFFECTIVE.getValue());
        when(bedService.getById(7L)).thenReturn(target);

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.updateDetail(1L, 7L, null, at(14, 30)));

        assertTrue(e.getMessage().contains("床7"), e.getMessage());
        verify(mapper, never()).updateById(any(OrderDetail.class));
    }

    @Test
    void finishedDetailCanBeMovedWithoutCheckingOrTouchingOthers() {
        OrderDetail dragged = detail(1L, AppointmentState.FINISHED.getValue(), 11L, 5L, 14, 0, 60);
        when(mapper.selectById(1L)).thenReturn(dragged);
        Bed target = new Bed();
        target.setId(7L);
        target.setName("床7");
        target.setStatus(NormalState.EFFECTIVE.getValue());
        when(bedService.getById(7L)).thenReturn(target);

        service.updateDetail(1L, 7L, null, at(16, 0));

        ArgumentCaptor<OrderDetail> captor = ArgumentCaptor.forClass(OrderDetail.class);
        verify(mapper, times(1)).updateById(captor.capture());
        assertEquals(Long.valueOf(7L), captor.getValue().getBedId());
        assertEquals(DAY.atTime(16, 0), captor.getValue().getStartTime());
        assertEquals(DAY.atTime(17, 0), captor.getValue().getEndTime());
        verify(mapper, never()).findOverlapListByShopAndTime(any(), any(), any());
    }

    @Test
    void adjacentSlotIsNotAConflict() {
        // 目标是 14:00~15:00：前一张 13:00~14:00、后一张 15:00~16:00，首尾相接都不算冲突
        OrderDetail dragged = detail(1L, AppointmentState.WAITING.getValue(), 11L, 5L, 13, 0, 60);
        OrderDetail next = detail(2L, AppointmentState.WAITING.getValue(), 11L, 6L, 15, 0, 60);
        givenOccupiedBy(dragged, next);

        service.updateDetail(1L, null, 11L, at(14, 0));

        ArgumentCaptor<OrderDetail> captor = ArgumentCaptor.forClass(OrderDetail.class);
        verify(mapper, times(1)).updateById(captor.capture());
        assertEquals(DAY.atTime(14, 0), captor.getValue().getStartTime());
        assertEquals(DAY.atTime(15, 0), captor.getValue().getEndTime());
    }
}