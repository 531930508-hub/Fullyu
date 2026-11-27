package com.macro.mall.service;

import com.macro.mall.entity.ReceptionQueueLog;
import com.macro.mall.mapper.ReceptionQueueLogMapper;
import org.junit.jupiter.api.Test;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 换人后新技师要真占一轮（A 回原位 + B 推队尾）。
 *
 * <p>守这条的原因：PC 改单换人会把未服务的旧明细删掉再重建，B 的新行<b>沿用 A 的旧 detail_id</b>，
 * 而 assign 的幂等判断原先只数「这条明细有没有 ASSIGN/GRAB 日志」、不扣 REVERT——A 那条上钟日志
 * 还在库里，于是 {@code assign(B, 同 id)} 直接返回：A 回了原位、B 一步没动，换人后顺序全错。
 * 判据必须是「最近一次上钟的就是他本人、且这次上钟还没被回位」，既保住重复同步不重复推队尾，
 * 又让换人/回位后重新派照常占一轮。这里只测判断本身，不碰库。</p>
 */
class ReceptionQueueReassignTurnTest {

    private static final long A = 10L;
    private static final long B = 20L;
    private static final long DETAIL = 9001L;
    private static final long SHOP = 1L;
    private static final String DAY = "2026-11-25";

    private ReceptionQueueService serviceWith(ReceptionQueueLog latestAssign, long assigns, long reverts) {
        ReceptionQueueService service = new ReceptionQueueService();
        ReceptionQueueLogMapper logMapper = mock(ReceptionQueueLogMapper.class);
        when(logMapper.selectList(any()))
                .thenReturn(latestAssign == null ? Collections.emptyList() : Collections.singletonList(latestAssign));
        // 判据里先数 ASSIGN/GRAB 的条数，再数 REVERT 的条数
        when(logMapper.selectCount(any())).thenReturn(assigns, reverts);
        service.queueLogMapper = logMapper;
        return service;
    }

    private ReceptionQueueLog assignLog(long massagistId) {
        ReceptionQueueLog row = new ReceptionQueueLog();
        row.setMassagistId(massagistId);
        row.setDetailId(DETAIL);
        return row;
    }

    @Test
    void sameMassagistNotRevertedIsSkipped() {
        // 同一条明细被重复同步（建单后再次同步）：上钟已经记过，不能再把人推到队尾一次
        ReceptionQueueService service = serviceWith(assignLog(A), 1, 0);

        assertTrue(service.alreadyAssigned(DAY, SHOP, DETAIL, A, ReceptionQueueService.KIND_SERVICE));
    }

    @Test
    void reassignedToAnotherMassagistTakesTurn() {
        // A→B 换人：B 的新行沿用 A 的 detail_id，库里最近一条 ASSIGN 还是 A
        ReceptionQueueService service = serviceWith(assignLog(A), 1, 1);

        assertFalse(service.alreadyAssigned(DAY, SHOP, DETAIL, B, ReceptionQueueService.KIND_SERVICE),
                "换人后 B 必须能占一轮，不能被 A 的旧上钟日志挡掉");
    }

    @Test
    void sameMassagistAfterRevertTakesTurnAgain() {
        // 改期/取消已经把他放回原位，再派回同一个人时要重新占一轮
        ReceptionQueueService service = serviceWith(assignLog(A), 1, 1);

        assertFalse(service.alreadyAssigned(DAY, SHOP, DETAIL, A, ReceptionQueueService.KIND_SERVICE));
    }

    @Test
    void detailWithoutAnyAssignLogTakesTurn() {
        ReceptionQueueService service = serviceWith(null, 0, 0);

        assertFalse(service.alreadyAssigned(DAY, SHOP, DETAIL, A, ReceptionQueueService.KIND_SERVICE));
    }
}