package com.macro.mall.service;

import com.macro.mall.controller.MassagistSchedulesController;
import com.macro.mall.incentive.service.IncentiveAccessService;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.MassagistSchedules;
import com.macro.mall.model.UmsAdmin;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

class SchedulePermissionTest {
    private MassagistSchedulesController controller(IncentiveAccessService access, MassagistSchedulesService schedules) {
        MassagistSchedulesController controller = new MassagistSchedulesController();
        ReflectionTestUtils.setField(controller, "massagistSchedulesService", schedules);
        try { ReflectionTestUtils.setField(controller, "access", access); } catch (IllegalArgumentException ignored) { }
        return controller;
    }

    @Test void unauthorizedShopCannotBeMutated() {
        IncentiveAccessService access = mock(IncentiveAccessService.class);
        MassagistSchedulesService schedules = mock(MassagistSchedulesService.class);
        MassagistSchedulesController controller = controller(access, schedules);
        UmsAdmin admin = new UmsAdmin(); admin.setId(8L);
        when(access.currentAdmin()).thenReturn(admin);
        when(access.canManageSchedules()).thenReturn(true);
        doThrow(new BusinessException("无权操作该门店")).when(access).requireShopAccess(2L);
        MassagistSchedules request = new MassagistSchedules(); request.setShopId(2L);
        assertThrows(BusinessException.class, () -> controller.saveOrUpd(request));
        verifyNoInteractions(schedules);
    }

    @Test void therapistOnlyAccountCannotMutate() {
        IncentiveAccessService access = mock(IncentiveAccessService.class);
        MassagistSchedulesService schedules = mock(MassagistSchedulesService.class);
        MassagistSchedulesController controller = controller(access, schedules);
        when(access.canManageSchedules()).thenReturn(false);
        MassagistSchedules request = new MassagistSchedules(); request.setShopId(1L);
        BusinessException e = assertThrows(BusinessException.class, () -> controller.saveOrUpd(request));
        assertEquals("请由门店管理人员操作排班", e.getMessage());
        verify(access, never()).requireShopAccess(anyLong());
        verifyNoInteractions(schedules);
    }

    @Test void transferTargetUsesTransferCheck() {
        IncentiveAccessService access = mock(IncentiveAccessService.class);
        MassagistSchedulesService schedules = mock(MassagistSchedulesService.class);
        MassagistSchedulesController controller = controller(access, schedules);
        when(access.canManageSchedules()).thenReturn(true);
        MassagistSchedules request = new MassagistSchedules();
        request.setShopId(1L); request.setTargetShopId(8L);
        controller.saveTargetShop(request);
        verify(access).requireShopAccess(1L);
        verify(access).requireTransferShopAccess(8L);
        verify(access, never()).requireShopAccess(8L);
    }
}