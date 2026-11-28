package com.macro.mall.service;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 接待单取人顺序：只认接待队队序。
 *
 * <p>店里反馈「接待单没按轮牌顺序走：莎莎→别人→莎莎」。两个原因叠在一起：
 * ① 占位接待（每 15 分钟补的空岗）以前显式不推队，队首永远不动；
 * ② 派单时还有一条「这一小段窗口里接待单最少的优先」，刚下接待岗的人窗口里已经数不到他的单，
 * 又被拉回队首。①改成占位也推队（见 {@code RoundScheduleService#advanceReceptionTurn}），
 * ②这里直接去掉，派单只看队序。守卫的就是②：队序排第一的人在岗有空就还是他，不许被接待量插队。</p>
 */
class ReceptionQueueReceptionPickOrderTest {

    @Test
    void queueHeadWinsEvenIfSomeoneElseTookFewerReceptionsToday() {
        // 接待队：11 在队首，22、33 排在后面；今天 11 已经接过几张，22 一张没接
        List<Long> queueOrder = Arrays.asList(11L, 22L, 33L);
        List<Long> available = Arrays.asList(11L, 22L, 33L);

        List<Long> order = ReceptionQueueService.queueFirstOrder(queueOrder, available);

        assertEquals(Arrays.asList(11L, 22L, 33L), order, "按队序，不按当天接待量");
    }

    @Test
    void busyQueueHeadIsSkippedSoTheNextOneGoes() {
        // 11 这一单时段没空，22 顶上；只是这次跳过，11 在接待队里的 seq 不动（那是 assign/revert 的事）
        List<Long> queueOrder = Arrays.asList(11L, 22L, 33L);
        List<Long> available = Arrays.asList(22L, 33L);

        assertEquals(Arrays.asList(22L, 33L), ReceptionQueueService.queueFirstOrder(queueOrder, available),
                "忙的人这一单跳过，剩下的人还是按队序");
    }

    @Test
    void peopleNotInQueueYetGoLast() {
        // 44 是今天临时调店补位的，还没进接待队；不能因为「不认识」就排到队首
        List<Long> queueOrder = Arrays.asList(11L, 22L);
        List<Long> available = Arrays.asList(44L, 11L, 22L);

        assertEquals(Arrays.asList(11L, 22L, 44L), ReceptionQueueService.queueFirstOrder(queueOrder, available));
    }

    @Test
    void emptyQueueFallsBackToAvailableOrder() {
        assertEquals(Arrays.asList(11L, 22L), ReceptionQueueService.queueFirstOrder(Collections.emptyList(), Arrays.asList(11L, 22L)));
        assertTrue(ReceptionQueueService.queueFirstOrder(Arrays.asList(11L, 22L), Collections.emptyList()).isEmpty());
        assertTrue(ReceptionQueueService.queueFirstOrder(null, Collections.emptyList()).isEmpty());
    }
}