package com.macro.mall.service;

import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.entity.RoundSchedule;
import com.macro.mall.entity.Shop;
import com.macro.mall.enums.AppointmentState;
import com.macro.mall.enums.SpecifyType;
import com.macro.mall.mapper.MassagistSchedulesMapper;
import com.macro.mall.mapper.OrderDetailMapper;
import com.macro.mall.service.shop.ShopService;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 一键安排疗愈师：不允许"提示成功但其实没安排上"，也不允许写入 0/-1 这类脏疗愈师id。
 */
class ExceArganizeMassagistTest {

    private OrderDetailService service;
    private OrderDetailMapper mapper;

    private void setup() {
        service = new OrderDetailService();
        mapper = mock(OrderDetailMapper.class);
        ReflectionTestUtils.setField(service, "baseMapper", mapper);
    }

    private OrderDetail detail(Integer state) {
        LocalDate day = LocalDate.now().plusDays(1);
        OrderDetail detail = new OrderDetail();
        detail.setId(1L);
        detail.setShopId(1L);
        detail.setProjectId(2L);
        detail.setState(state);
        detail.setStartTime(day.atTime(14, 0));
        detail.setEndTime(day.atTime(15, 0));
        return detail;
    }

    @Test
    void successfulArrangeCountsIntoRotationAndClearsSpecifyMark() {
        setup();
        // 到店接待单：库里 is_update_sort=0、留着一个历史点钟标记
        OrderDetail detail = detail(AppointmentState.WAITING.getValue());
        detail.setMassagistId(null);
        detail.setIsUpdateSort(false);
        detail.setSpecifyType(SpecifyType.PC.getValue());
        when(mapper.selectById(9L)).thenReturn(detail);
        when(mapper.updateById(any(OrderDetail.class))).thenReturn(1);

        Shop shop = new Shop();
        shop.setId(1L);
        shop.setClockInTime("10:00");
        shop.setClockOutTime("22:00");
        ShopService shopService = mock(ShopService.class);
        when(shopService.findAvailableById(1L)).thenReturn(shop);
        ReflectionTestUtils.setField(service, "shopService", shopService);

        ProjectService projectService = mock(ProjectService.class);
        when(projectService.findTypeById(2L)).thenReturn(1);
        ReflectionTestUtils.setField(service, "projectService", projectService);

        MassagistSchedulesService schedulesService = mock(MassagistSchedulesService.class);
        MassagistSchedulesMapper schedulesMapper = mock(MassagistSchedulesMapper.class);
        when(schedulesService.getBaseMapper()).thenReturn(schedulesMapper);
        MassagistSchedules schedules = new MassagistSchedules();
        schedules.setMassagistId(11L);
        schedules.setShopId(1L);
        schedules.setDay(LocalDate.now().plusDays(1));
        schedules.setStartTime(LocalTime.of(10, 0));
        schedules.setEndTime(LocalTime.of(22, 0));
        when(schedulesMapper.findListByProjectIdAndShopId(eq(1L), anyString(), anyString()))
                .thenReturn(new ArrayList<>(Arrays.asList(schedules)));
        ReflectionTestUtils.setField(service, "massagistSchedulesService", schedulesService);

        when(mapper.findOverlapListByShopAndTime(eq(1L), any(), any())).thenReturn(new ArrayList<>());

        RoundSchedule pick = new RoundSchedule();
        pick.setMassagistId(11L);
        // 只读排序（save=false）：新一轮落库/移位统一由 updateByDetailList 做（OrderDetailService.sortMassagist）
        RoundScheduleService roundScheduleService = mock(RoundScheduleService.class);
        when(roundScheduleService.findSortMassagistIdList(anyString(), eq(1L), eq(1), anyList(), eq(false)))
                .thenReturn(Arrays.asList(pick));
        ReflectionTestUtils.setField(service, "roundScheduleService", roundScheduleService);

        Massagist massagist = new Massagist();
        massagist.setId(11L);
        massagist.setName("小颜");
        MassagistService massagistService = mock(MassagistService.class);
        when(massagistService.getById(11L)).thenReturn(massagist);
        ReflectionTestUtils.setField(service, "massagistService", massagistService);

        JSONObject result = service.exceArganizeMassagist(9L);

        assertEquals(11L, result.getLong("massagistId"));
        // 系统指派 = 计入轮次：轮次必须真的往前推（否则看板会挂"未计入轮次"角标，且下次还选同一个人）
        assertTrue(detail.getIsUpdateSort());
        // 系统指派不是点名，历史点钟标记要清掉
        assertEquals(0, detail.getSpecifyType());
        assertEquals(11L, detail.getMassagistId());
        verify(roundScheduleService).updateByDetailList(anyList(), anyString(), eq(1L), eq(true));
    }

    @Test
    void finishedOrderIsRejectedInsteadOfSilentlySucceeding() {
        setup();
        when(mapper.selectById(5L)).thenReturn(detail(AppointmentState.FINISHED.getValue()));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.exceArganizeMassagist(5L));

        assertTrue(ex.getMessage().contains("已完成"), ex.getMessage());
        verify(mapper, never()).updateById(any(OrderDetail.class));
    }

    @Test
    void canceledOrderIsRejectedInsteadOfSilentlySucceeding() {
        setup();
        when(mapper.selectById(5L)).thenReturn(detail(AppointmentState.CANCELED.getValue()));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.exceArganizeMassagist(5L));

        assertTrue(ex.getMessage().contains("已取消"), ex.getMessage());
        verify(mapper, never()).updateById(any(OrderDetail.class));
    }

    @Test
    void alreadyAssignedTherapistIsReturnedBackToFrontend() {
        setup();
        OrderDetail detail = detail(AppointmentState.WAITING.getValue());
        detail.setMassagistId(7L);
        when(mapper.selectById(6L)).thenReturn(detail);
        MassagistService massagistService = mock(MassagistService.class);
        ReflectionTestUtils.setField(service, "massagistService", massagistService);
        Massagist massagist = new Massagist();
        massagist.setId(7L);
        massagist.setName("小颜");
        when(massagistService.getById(7L)).thenReturn(massagist);

        JSONObject result = service.exceArganizeMassagist(6L);

        assertEquals(7L, result.getLong("massagistId"));
        assertEquals("小颜", result.getString("massagistName"));
        assertTrue(result.getBooleanValue("alreadyAssigned"));
        // 已经安排好了就不要再整行回写，避免把并发的其他改动覆盖掉
        verify(mapper, never()).updateById(any(OrderDetail.class));
    }

    @Test
    void noSortableTherapistThrowsInsteadOfWritingDirtyId() {
        setup();
        OrderDetail detail = detail(AppointmentState.WAITING.getValue());
        detail.setMassagistId(null);
        when(mapper.selectById(9L)).thenReturn(detail);

        Shop shop = new Shop();
        shop.setId(1L);
        shop.setClockInTime("10:00");
        shop.setClockOutTime("22:00");
        ShopService shopService = mock(ShopService.class);
        when(shopService.findAvailableById(1L)).thenReturn(shop);
        ReflectionTestUtils.setField(service, "shopService", shopService);

        ProjectService projectService = mock(ProjectService.class);
        when(projectService.findTypeById(2L)).thenReturn(1);
        ReflectionTestUtils.setField(service, "projectService", projectService);

        MassagistSchedulesService schedulesService = mock(MassagistSchedulesService.class);
        MassagistSchedulesMapper schedulesMapper = mock(MassagistSchedulesMapper.class);
        when(schedulesService.getBaseMapper()).thenReturn(schedulesMapper);
        MassagistSchedules schedules = new MassagistSchedules();
        schedules.setMassagistId(11L);
        schedules.setShopId(1L);
        schedules.setDay(LocalDate.now().plusDays(1));
        schedules.setStartTime(LocalTime.of(10, 0));
        schedules.setEndTime(LocalTime.of(22, 0));
        when(schedulesMapper.findListByProjectIdAndShopId(eq(1L), anyString(), anyString()))
                .thenReturn(Arrays.asList(schedules));
        ReflectionTestUtils.setField(service, "massagistSchedulesService", schedulesService);

        when(mapper.findOverlapListByShopAndTime(eq(1L), any(), any())).thenReturn(new ArrayList<>());

        // 轮值表给回来的是一个脏疗愈师id（0）→ 必须在这里被拦住
        RoundSchedule dirty = new RoundSchedule();
        dirty.setMassagistId(0L);
        RoundScheduleService roundScheduleService = mock(RoundScheduleService.class);
        when(roundScheduleService.findSortMassagistIdList(anyString(), eq(1L), eq(1), anyList(), eq(false)))
                .thenReturn(Arrays.asList(dirty));
        ReflectionTestUtils.setField(service, "roundScheduleService", roundScheduleService);

        MassagistService massagistService = mock(MassagistService.class);
        ReflectionTestUtils.setField(service, "massagistService", massagistService);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.exceArganizeMassagist(9L));

        assertTrue(ex.getMessage().contains("可安排的疗愈师"), ex.getMessage());
        // 关键：不能把 0/null 写进订单，也不能回一个"成功"给前端
        verify(mapper, never()).updateById(any(OrderDetail.class));
    }
}