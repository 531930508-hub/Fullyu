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
    @Test void unauthorizedShopCannotBeMutated() {
        MassagistSchedulesController controller=new MassagistSchedulesController();
        MassagistSchedulesService schedules=mock(MassagistSchedulesService.class);
        IncentiveAccessService access=mock(IncentiveAccessService.class);
        ReflectionTestUtils.setField(controller,"massagistSchedulesService",schedules);
        try { ReflectionTestUtils.setField(controller,"access",access); } catch (IllegalArgumentException ignored) { }
        UmsAdmin admin=new UmsAdmin(); admin.setId(8L);
        when(access.currentAdmin()).thenReturn(admin);
        doThrow(new BusinessException("无权操作该门店")).when(access).requireShopAccess(2L);
        MassagistSchedules request=new MassagistSchedules(); request.setShopId(2L);
        assertThrows(BusinessException.class, () -> controller.saveOrUpd(request));
        verifyNoInteractions(schedules);
    }
}
