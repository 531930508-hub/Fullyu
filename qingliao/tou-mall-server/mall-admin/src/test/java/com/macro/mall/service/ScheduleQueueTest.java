package com.macro.mall.service;

import com.macro.mall.entity.RoundSchedule;
import com.macro.mall.utils.RedisUtil;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class ScheduleQueueTest {
    @Test void targetStoreWithOnlyTransferredPeopleStillHasAQueue() {
        MassagistSchedulesService service=spy(new MassagistSchedulesService());
        service.massagistService=mock(MassagistService.class); service.redisUtil=mock(RedisUtil.class);
        String day=LocalDate.now().toString();
        when(service.massagistService.sortList(2L)).thenReturn(Collections.emptyList());
        doReturn(Arrays.asList(99L)).when(service).getMassagistSchedulesListDiaoDian(day,2L);
        assertDoesNotThrow(() -> assertEquals(Arrays.asList(99L),service.getMassagistSchedulesList(day,2L)));
    }
    @Test void transferredPersonIsAtHeadOfNewRoundRatherThanTail() {
        RoundScheduleService service=spy(new RoundScheduleService());
        MassagistSchedulesService schedules=mock(MassagistSchedulesService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"massagistSchedulesService",schedules);
        doAnswer(i -> new ArrayList<RoundSchedule>()).when(service).list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class));
        doReturn(0L).when(service).findCurrentRound(anyString(),eq(2L));
        String day=LocalDate.now().toString();
        when(schedules.getMassagistSchedulesList(day,2L)).thenReturn(new ArrayList<>(Arrays.asList(1L,2L)));
        when(schedules.getMassagistSchedulesListDiaoDian(day,2L)).thenReturn(Arrays.asList(99L));
        List<RoundSchedule> result=service.findSortMassagistIdList(day,2L,1,Arrays.asList(99L,1L,2L),false);
        assertEquals(99L,result.get(0).getMassagistId());
        assertEquals(3,result.size());
    }
}
