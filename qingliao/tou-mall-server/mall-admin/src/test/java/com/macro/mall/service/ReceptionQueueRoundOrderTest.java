package com.macro.mall.service;

import com.macro.mall.entity.ReceptionQueue;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 一轮接待完的队序归一：下一轮回到班次顺序，而不是顺着上一轮被插单后的顺序一路漂下去。
 *
 * <p>守这条的原因：轮内是「谁上钟谁回队尾」，顺序本身是对的；但如果一轮结束时不归一，
 * 上一轮被手工指定/抢单打乱成 C→B→A，下一轮就变成 C 排第一，越跑越偏，
 * 旧口径（每轮从班次顺序重开、调店置前）也就丢了。这里只测纯函数，不碰库。</p>
 */
class ReceptionQueueRoundOrderTest {

    private ReceptionQueue row(Long massagistId, long seq) {
        ReceptionQueue q = new ReceptionQueue();
        q.setMassagistId(massagistId);
        q.setSeq(seq);
        q.setValid(ReceptionQueueService.VALID);
        return q;
    }

    @Test
    void roundOrderGoesBackToShiftOrderAfterManualJumps() {
        // 班次顺序 A,B,C；上一轮被手工指定打乱成 C(seq 4) → B(seq 5) → A(seq 6)
        List<ReceptionQueue> current = Arrays.asList(row(30L, 4L), row(20L, 5L), row(10L, 6L));

        List<Long> order = ReceptionQueueService.roundOrder(Arrays.asList(10L, 20L, 30L), current, ReceptionQueueService.KIND_SERVICE);

        assertEquals(Arrays.asList(10L, 20L, 30L), order, "下一轮回到班次顺序，不按上一轮被插单后的先后");
    }

    @Test
    void peopleNotOnRosterAreKeptAtTailInCurrentOrder() {
        // 30 号是调店补位进来的，今天的班表里没有他；他当时排在队头（seq 1）
        List<ReceptionQueue> current = Arrays.asList(row(30L, 1L), row(10L, 2L), row(20L, 3L));

        List<Long> order = ReceptionQueueService.roundOrder(Arrays.asList(10L, 20L), current, ReceptionQueueService.KIND_SERVICE);

        assertEquals(Arrays.asList(10L, 20L, 30L), order, "班表上没有的人不能丢，按当前队序垫在后面");
        assertEquals(3, order.size());
    }

    @Test
    void receptionKindUsesReversedShiftOrder() {
        List<ReceptionQueue> current = Arrays.asList(row(10L, 1L), row(20L, 2L), row(30L, 3L));

        List<Long> order = ReceptionQueueService.roundOrder(Arrays.asList(10L, 20L, 30L), current,
                ReceptionQueueService.KIND_RECEPTION);

        assertEquals(Arrays.asList(30L, 20L, 10L), order, "接待队和当日初始化一样取班次顺序的倒序");
    }

    @Test
    void duplicateRosterIdsAndEmptyInputAreTolerated() {
        List<ReceptionQueue> current = new ArrayList<>(Collections.singletonList(row(10L, 1L)));

        assertEquals(Collections.singletonList(10L),
                ReceptionQueueService.roundOrder(Arrays.asList(10L, 10L, 10L), current, ReceptionQueueService.KIND_SERVICE));
        assertEquals(Collections.emptyList(),
                ReceptionQueueService.roundOrder(Arrays.asList(10L, 20L), Collections.emptyList(), ReceptionQueueService.KIND_SERVICE));
    }
}