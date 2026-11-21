package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Bed;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.Project;
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
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.mockito.Mockito.verifyNoInteractions;

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
 * 看板拖动排期：落点被占用时默认让本次拖动失败，不允许把原来那单盖掉；
 * 只有运营确认了互换（带 swapWithId）才两单对调档期，且任何一方撞到第三单都整体失败；
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
    private OrderService orderService;

    @BeforeEach
    void setup() {
        service = new OrderDetailService();
        mapper = mock(OrderDetailMapper.class);
        bedService = mock(BedService.class);
        massagistService = mock(MassagistService.class);
        projectService = mock(ProjectService.class);
        roundScheduleService = mock(RoundScheduleService.class);
        orderService = mock(OrderService.class);
        ReflectionTestUtils.setField(service, "baseMapper", mapper);
        ReflectionTestUtils.setField(service, "bedService", bedService);
        ReflectionTestUtils.setField(service, "massagistService", massagistService);
        ReflectionTestUtils.setField(service, "projectService", projectService);
        ReflectionTestUtils.setField(service, "roundScheduleService", roundScheduleService);
        ReflectionTestUtils.setField(service, "orderService", orderService);
        ReflectionTestUtils.setField(service, "massagistSchedulesService", mock(MassagistSchedulesService.class));
        when(projectService.isReceptionOrder(anyLong())).thenReturn(false);
        when(mapper.updateById(any(OrderDetail.class))).thenReturn(1);
    }

    private OrderDetail detail(long id, Integer state, Long massagistId, Long bedId, int hour, int minute, int minutes) {
        OrderDetail detail = new OrderDetail();
        detail.setId(id);
        detail.setOrderId(id + 100L);
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
        when(mapper.selectById(other.getId())).thenReturn(other);
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
    void completedSourceRejectsConfirmedSwapInsteadOfMovingAlone() {
        OrderDetail dragged = detail(1L, AppointmentState.FINISHED.getValue(), 11L, 5L, 14, 0, 60);
        OrderDetail occupied = detail(2L, AppointmentState.WAITING.getValue(), 12L, 7L, 14, 30, 60);
        givenOccupiedBy(dragged, occupied);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.updateDetail(1L, 7L, null, at(14, 30), 2L));

        assertTrue(error.getMessage().contains("本次未调整"));
        assertEquals(Long.valueOf(5L), dragged.getBedId());
        assertNoScheduleWrites();
    }

    @Test
    void confirmedSwapExchangesBothBedAndTime() {
        OrderDetail dragged = detail(1L, AppointmentState.WAITING.getValue(), 11L, 5L, 14, 0, 60);
        OrderDetail occupied = detail(2L, AppointmentState.WAITING.getValue(), 12L, 7L, 14, 30, 60);
        givenOccupiedBy(dragged, occupied);
        Bed target = new Bed();
        target.setId(7L);
        target.setName("床7");
        target.setStatus(NormalState.EFFECTIVE.getValue());
        when(bedService.getById(7L)).thenReturn(target);

        service.updateDetail(1L, 7L, null, at(14, 30), 2L);

        // 本单去对方的床位和时段，对方回到本单原来的床位和时段，时长各归各
        assertEquals(Long.valueOf(7L), dragged.getBedId());
        assertEquals(DAY.atTime(14, 30), dragged.getStartTime());
        assertEquals(DAY.atTime(15, 30), dragged.getEndTime());
        assertEquals(Long.valueOf(5L), occupied.getBedId());
        assertEquals(DAY.atTime(14, 0), occupied.getStartTime());
        assertEquals(DAY.atTime(15, 0), occupied.getEndTime());
        verify(mapper, times(2)).updateById(any(OrderDetail.class));
    }

    @Test
    void confirmedSwapExchangesTherapists() {
        OrderDetail dragged = detail(1L, AppointmentState.WAITING.getValue(), 11L, 5L, 14, 0, 60);
        OrderDetail occupied = detail(2L, AppointmentState.WAITING.getValue(), 12L, 6L, 14, 30, 60);
        givenOccupiedBy(dragged, occupied);

        service.updateDetail(1L, null, 12L, at(14, 30), 2L);

        assertEquals(Long.valueOf(12L), dragged.getMassagistId());
        assertEquals(DAY.atTime(14, 30), dragged.getStartTime());
        assertEquals(Long.valueOf(11L), occupied.getMassagistId());
        assertEquals(DAY.atTime(14, 0), occupied.getStartTime());
        assertEquals(Long.valueOf(5L), dragged.getBedId());
        assertEquals(Long.valueOf(6L), occupied.getBedId());
        verify(mapper, times(2)).updateById(any(OrderDetail.class));
    }

    @Test
    void swapWithFinishedOrderIsRejected() {
        OrderDetail dragged = detail(1L, AppointmentState.WAITING.getValue(), 11L, 5L, 14, 0, 60);
        OrderDetail occupied = detail(2L, AppointmentState.FINISHED.getValue(), 12L, 7L, 14, 30, 60);
        givenOccupiedBy(dragged, occupied);
        Bed target = new Bed();
        target.setId(7L);
        target.setName("床7");
        target.setStatus(NormalState.EFFECTIVE.getValue());
        when(bedService.getById(7L)).thenReturn(target);

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.updateDetail(1L, 7L, null, at(14, 30), 2L));

        assertTrue(e.getMessage().contains("已完成"), e.getMessage());
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

    private void givenCrossZoneBeds() {
        Map<Long, Integer> bedTypes = new HashMap<>();
        bedTypes.put(5L, 1);
        bedTypes.put(7L, 2);
        when(bedService.findTypeMapByIdList(any())).thenReturn(bedTypes);
        Map<Integer, Long> projects = new HashMap<>();
        projects.put(1, 1L);
        projects.put(2, 2L);
        when(projectService.findIdMapByTypeList(any())).thenReturn(projects);
        for (long id = 1; id <= 2; id++) {
            Project project = new Project();
            project.setId(id);
            project.setType((int) id);
            project.setTitle(id == 1 ? "头部水疗" : "全感舒筋");
            when(projectService.getById(id)).thenReturn(project);
        }
        givenSkills(11L, "疗愈师甲", "[1, 2]");
        givenSkills(12L, "疗愈师乙", "[1, 2]");
    }

    private void givenSkills(long id, String name, String projects) {
        Massagist massagist = new Massagist();
        massagist.setId(id);
        massagist.setName(name);
        massagist.setProjectArr(projects);
        when(massagistService.getByIdAcrossShops(id)).thenReturn(massagist);
        when(massagistService.findNameById(id)).thenReturn(name);
    }

    private void assertNoScheduleWrites() {
        verify(mapper, never()).updateById(any(OrderDetail.class));
        verify(mapper, never()).update(any(), any());
        verify(orderService, never()).updateById(any(Order.class));
        verifyNoInteractions(roundScheduleService);
    }

    @Test
    void crossZoneMoveKeepsTherapistAndChangesProjectWithoutChangingQueue() {
        givenCrossZoneBeds();
        OrderDetail source = detail(1L, 0, 11L, 5L, 14, 0, 60);
        source.setProjectId(1L);
        source.setSpecifyType(1);
        source.setIsUpdateSort(true);
        Order order = new Order();
        order.setId(source.getOrderId());
        order.setProductId(4L);
        when(orderService.getById(order.getId())).thenReturn(order);
        when(mapper.selectById(1L)).thenReturn(source);

        service.updateDetail(1L, 7L, null, at(14, 0));

        assertEquals(2L, source.getProjectId());
        assertEquals(11L, source.getMassagistId());
        assertEquals(1, source.getSpecifyType());
        assertEquals(60, source.getDuration());
        assertEquals(DAY.atTime(15, 0), source.getEndTime());
        assertEquals(5L, order.getProductId());
        assertTrue(source.getIsLockBed());
        assertTrue(source.getIsUpdateSort());
        verify(mapper, never()).update(any(), any());
        verifyNoInteractions(roundScheduleService);
    }

    @Test
    void crossZoneSwapKeepsBothTherapistsAndChangesBothProjects() {
        givenCrossZoneBeds();
        OrderDetail source = detail(1L, 0, 11L, 5L, 14, 0, 60);
        source.setProjectId(1L);
        OrderDetail target = detail(2L, 0, 12L, 7L, 15, 0, 45);
        givenOccupiedBy(source, target);

        service.updateDetail(1L, 7L, null, at(15, 0), 2L);

        assertEquals(2L, source.getProjectId());
        assertEquals(1L, target.getProjectId());
        assertEquals(11L, source.getMassagistId());
        assertEquals(12L, target.getMassagistId());
        assertEquals(DAY.atTime(15, 0), source.getStartTime());
        assertEquals(DAY.atTime(14, 0), target.getStartTime());
        assertEquals(60, source.getDuration());
        assertEquals(45, target.getDuration());
        verify(mapper, times(2)).updateById(any(OrderDetail.class));
        verify(mapper, never()).update(any(), any());
        verifyNoInteractions(roundScheduleService);
    }

    @Test
    void missingNewProjectSkillRejectsMoveBeforeChangingAnything() {
        givenCrossZoneBeds();
        givenSkills(11L, "疗愈师甲", "[1, 12]");
        OrderDetail source = detail(1L, 0, 11L, 5L, 14, 0, 60);
        source.setProjectId(1L);
        when(mapper.selectById(1L)).thenReturn(source);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.updateDetail(1L, 7L, null, at(14, 0)));

        assertTrue(error.getMessage().contains("疗愈师甲"));
        assertTrue(error.getMessage().contains("全感舒筋"));
        assertEquals(5L, source.getBedId());
        assertEquals(1L, source.getProjectId());
        assertEquals(11L, source.getMassagistId());
        assertNoScheduleWrites();
    }

    @Test
    void targetMissingSkillRejectsWholeSwapBeforeEitherOrderChanges() {
        givenCrossZoneBeds();
        givenSkills(12L, "疗愈师乙", "[2]");
        OrderDetail source = detail(1L, 0, 11L, 5L, 14, 0, 60);
        source.setProjectId(1L);
        OrderDetail target = detail(2L, 0, 12L, 7L, 15, 0, 60);
        givenOccupiedBy(source, target);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.updateDetail(1L, 7L, null, at(15, 0), 2L));

        assertTrue(error.getMessage().contains("疗愈师乙"));
        assertTrue(error.getMessage().contains("头部水疗"));
        assertEquals(5L, source.getBedId());
        assertEquals(7L, target.getBedId());
        assertEquals(1L, source.getProjectId());
        assertEquals(2L, target.getProjectId());
        assertEquals(DAY.atTime(14, 0), source.getStartTime());
        assertEquals(DAY.atTime(15, 0), target.getStartTime());
        assertNoScheduleWrites();
    }

    @Test
    void missingProjectMappingRejectsCrossZoneMove() {
        givenCrossZoneBeds();
        when(projectService.findIdMapByTypeList(any())).thenReturn(Collections.emptyMap());
        OrderDetail source = detail(1L, 0, 11L, 5L, 14, 0, 60);
        when(mapper.selectById(1L)).thenReturn(source);

        assertThrows(BusinessException.class, () -> service.updateDetail(1L, 7L, null, at(14, 0)));

        assertEquals(5L, source.getBedId());
        assertNoScheduleWrites();
    }

    @Test
    void bedMoveRejectsRetainedTherapistTimeConflict() {
        OrderDetail source = detail(1L, 0, 11L, 5L, 14, 0, 60);
        OrderDetail blocker = detail(3L, 0, 11L, 8L, 15, 0, 60);
        givenOccupiedBy(source, blocker);
        when(massagistService.findNameById(11L)).thenReturn("疗愈师甲");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.updateDetail(1L, 7L, null, at(15, 0)));

        assertTrue(error.getMessage().contains("疗愈师甲"));
        assertEquals(DAY.atTime(14, 0), source.getStartTime());
        assertNoScheduleWrites();
    }

    @Test
    void bedSwapRejectsOtherTherapistTimeConflict() {
        OrderDetail source = detail(1L, 0, 11L, 5L, 14, 0, 60);
        OrderDetail target = detail(2L, 0, 12L, 7L, 15, 0, 60);
        OrderDetail blocker = detail(3L, 0, 12L, 8L, 14, 0, 60);
        givenOccupiedBy(source, target);
        when(mapper.findOverlapListByShopAndTime(eq(1L), any(), any()))
                .thenReturn(Arrays.asList(source, target, blocker));
        when(massagistService.findNameById(12L)).thenReturn("疗愈师乙");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.updateDetail(1L, 7L, null, at(15, 0), 2L));

        assertTrue(error.getMessage().contains("疗愈师乙"));
        assertNoScheduleWrites();
    }

    @Test
    void staleSwapNeverDegradesIntoSingleOrderMove() {
        OrderDetail source = detail(1L, 0, 11L, 5L, 14, 0, 60);
        when(mapper.selectById(1L)).thenReturn(source);

        assertThrows(BusinessException.class,
                () -> service.updateDetail(1L, 7L, null, at(15, 0), 2L));

        assertEquals(5L, source.getBedId());
        assertNoScheduleWrites();
    }

    @Test
    void differentDurationsCannotOverlapEachOtherAfterSwap() {
        OrderDetail source = detail(1L, 0, 11L, 5L, 14, 0, 30);
        OrderDetail target = detail(2L, 0, 11L, 5L, 14, 30, 90);
        givenOccupiedBy(source, target);

        assertThrows(BusinessException.class,
                () -> service.updateDetail(1L, 5L, null, at(14, 30), 2L));

        assertNoScheduleWrites();
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