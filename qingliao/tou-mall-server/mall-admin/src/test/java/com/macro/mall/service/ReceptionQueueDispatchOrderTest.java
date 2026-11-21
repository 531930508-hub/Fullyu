package com.macro.mall.service;

import com.macro.mall.entity.ReceptionQueue;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 派单口径：只看队序 seq，不看值班分组。
 *
 * <p>店里确认过的口径是「按队序找第一个这一单时段有空的人」——值班只是看板上把人分到
 * 值班区/休息区，点值班不该让排在后面的人插队。之前 pickNext 走的是展示顺序（值班在前），
 * 结果「点一下值班」就变成下一个接单人，前台看着像系统乱派，所以单独守一条。</p>
 */
class ReceptionQueueDispatchOrderTest {

    private ReceptionQueue row(Long massagistId, Long seq, int onDuty) {
        ReceptionQueue q = new ReceptionQueue();
        q.setMassagistId(massagistId);
        q.setSeq(seq);
        q.setOnDuty(onDuty);
        q.setValid(ReceptionQueueService.VALID);
        return q;
    }

    @Test
    void dispatchFollowsSeqEvenWhenDutyPeopleSitAtFront() {
        // 展示口径会把值班的人放最前，派单只认 seq：Mia(2) 先于值班的 Jason(9)/Benny(10)
        List<ReceptionQueue> rows = Arrays.asList(
                row(28L, 9L, ReceptionQueueService.DUTY_ON),
                row(37L, 10L, ReceptionQueueService.DUTY_ON),
                row(12L, 2L, ReceptionQueueService.DUTY_OFF),
                row(9L, 4L, ReceptionQueueService.DUTY_OFF),
                row(22L, 5L, ReceptionQueueService.DUTY_OFF));

        List<Long> order = ReceptionQueueService.sortForDispatch(rows).stream()
                .map(ReceptionQueue::getMassagistId).collect(Collectors.toList());

        assertEquals(Arrays.asList(12L, 9L, 22L, 28L, 37L), order, "按 seq 升序，与值班无关");
    }

    @Test
    void togglingDutyDoesNotMoveAnyone() {
        List<ReceptionQueue> before = Arrays.asList(row(12L, 2L, ReceptionQueueService.DUTY_OFF), row(28L, 9L, ReceptionQueueService.DUTY_ON));
        List<ReceptionQueue> after = Arrays.asList(row(12L, 2L, ReceptionQueueService.DUTY_ON), row(28L, 9L, ReceptionQueueService.DUTY_OFF));

        assertEquals(ReceptionQueueService.sortForDispatch(before).stream().map(ReceptionQueue::getMassagistId).collect(Collectors.toList()),
                ReceptionQueueService.sortForDispatch(after).stream().map(ReceptionQueue::getMassagistId).collect(Collectors.toList()));
    }

    @Test
    void invalidRowsAreSkippedAndNullSeqSortsFirst() {
        ReceptionQueue invalid = row(99L, 1L, ReceptionQueueService.DUTY_ON);
        invalid.setValid(ReceptionQueueService.INVALID);
        List<ReceptionQueue> rows = new ArrayList<>(Arrays.asList(row(12L, 2L, 0), invalid));
        rows.add(row(9L, null, 0));

        List<Long> order = ReceptionQueueService.sortForDispatch(rows).stream()
                .map(ReceptionQueue::getMassagistId).collect(Collectors.toList());

        assertEquals(Arrays.asList(9L, 12L), order, "作废行不参与派单，seq 为空按 0 算");
        assertTrue(ReceptionQueueService.sortForDispatch(Collections.emptyList()).isEmpty());
    }
}