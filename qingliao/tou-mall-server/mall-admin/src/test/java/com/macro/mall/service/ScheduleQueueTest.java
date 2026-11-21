package com.macro.mall.service;

import com.macro.mall.entity.ReceptionQueue;
import com.macro.mall.entity.RoundSchedule;
import com.macro.mall.utils.RedisUtil;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

/**
 * 轮牌队列：顺序只认 ReceptionQueue 的 seq（含调店转移过来的人），不看排班表的原始 id 顺序。
 *
 * <p>2026-11 重构后 RoundScheduleService.findSortMassagistIdList 不再自己算顺序，
 * 而是拿 ReceptionQueueService.dispatchOrder 的结果逐行建/复用轮次行——所以这里断言的是
 * 「队序原样带出来」，队序本体的生成口径见 ReceptionQueueDispatchOrderTest。</p>
 */
class ScheduleQueueTest {

    @Test
    void targetStoreWithOnlyTransferredPeopleStillHasAQueue() {
        MassagistSchedulesService service = spy(new MassagistSchedulesService());
        service.massagistService = mock(MassagistService.class);
        service.redisUtil = mock(RedisUtil.class);
        String day = LocalDate.now().toString();
        when(service.massagistService.sortList(2L)).thenReturn(Collections.emptyList());
        doReturn(Arrays.asList(99L)).when(service).getMassagistSchedulesListDiaoDian(day, 2L);
        assertDoesNotThrow(() -> assertEquals(Arrays.asList(99L), service.getMassagistSchedulesList(day, 2L)));
    }

    @Test
    void queueOrderDrivesNewRoundInsteadOfRawMassagistIdOrder() {
        RoundScheduleService service = spy(new RoundScheduleService());
        ReceptionQueueService queueService = mock(ReceptionQueueService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service, "receptionQueueService", queueService);

        // 当天还没有任何轮次行
        doReturn(new ArrayList<RoundSchedule>()).when(service).list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class));

        String day = LocalDate.now().toString();
        // 调店转来的 99 在队首，随后才是本店的 1、2
        when(queueService.dispatchOrder(eq(day), eq(2L), anyCollection(), eq(ReceptionQueueService.KIND_SERVICE)))
                .thenReturn(Arrays.asList(queueRow(99L, 1), queueRow(1L, 2), queueRow(2L, 3)));

        List<RoundSchedule> result = service.findSortMassagistIdList(day, 2L, 1, Arrays.asList(99L, 1L, 2L), false);

        assertEquals(3, result.size());
        assertEquals(Arrays.asList(99L, 1L, 2L),
                result.stream().map(RoundSchedule::getMassagistId).collect(Collectors.toList()));
        // 队序/小票号必须随行带出去，看板直接显示，不再自己算
        assertEquals(1, result.get(0).getSortNo());
        assertEquals(1L, result.get(0).getQueueSeq());
        // save=false 是只读排序，不能在这里落库
        verify(queueService, never()).assign(anyString(), anyLong(), anyLong(), anyLong(), any(), anyInt());
    }

    private static ReceptionQueue queueRow(Long massagistId, int seq) {
        ReceptionQueue q = new ReceptionQueue();
        q.setMassagistId(massagistId);
        q.setSeq((long) seq);
        q.setReceiptNo(seq);
        q.setOnDuty(1);
        q.setAssignCount(0);
        return q;
    }
}