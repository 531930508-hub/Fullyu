package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.macro.mall.service.MemberCardService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * CRM 卡账本对账：开关、分页追平、动作计数、失败不推进水位、dryRun 不推进水位。
 *
 * <p>Mockito 模拟 CRM 客户端与会员卡服务，不连数据库与 CRM。</p>
 */
class BrandCardSyncTest {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 11, 24, 10, 0, 0);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private BrandMemberClient client;
    private MemberCardService memberCardService;

    @BeforeEach
    void setUp() {
        client = mock(BrandMemberClient.class);
        memberCardService = mock(MemberCardService.class);
        when(client.isActive()).thenReturn(true);
    }

    private BrandCardSync sync() {
        return new BrandCardSync(client, memberCardService, 200, 50, 2);
    }

    private static ObjectNode ledgerPage(String nextCursor, String... cardIds) {
        ObjectNode node = MAPPER.createObjectNode();
        ArrayNode cards = node.putArray("cards");
        for (String cardId : cardIds) {
            cards.addObject().put("cardId", cardId).put("localUserId", "42");
        }
        if (nextCursor != null) {
            node.put("nextCursor", nextCursor);
        }
        return node;
    }

    private static ObjectNode page(boolean hasMore, String nextCursor, String... cardIds) {
        ObjectNode node = MAPPER.createObjectNode();
        ArrayNode cards = node.putArray("cards");
        for (String cardId : cardIds) {
            cards.addObject().put("cardId", cardId).put("localUserId", "42");
        }
        node.put("hasMore", hasMore);
        if (nextCursor != null) {
            node.put("nextCursor", nextCursor);
        }
        return node;
    }

    private static Map<String, Object> action(String action) {
        Map<String, Object> one = new LinkedHashMap<>();
        one.put("action", action);
        return one;
    }

    @Test
    void followsBrandCrmClientActivation() {
        BrandCardSync sync = sync();
        assertTrue(sync.isEnabled());
        when(client.cards(any(), any(), anyInt())).thenReturn(page(false, null));
        sync.tick();
        verify(client).cards(any(), any(), anyInt());
    }

    @Test
    void disabledWhenBrandCrmClientInactive() {
        when(client.isActive()).thenReturn(false);
        BrandCardSync sync = sync();
        assertFalse(sync.isEnabled());
        sync.tick();
        verify(client, never()).cards(any(), any(), anyInt());
    }

    @Test
    void firstRoundRequestsFullLedgerWithoutSince() {
        when(client.cards(any(), any(), anyInt())).thenReturn(page(false, null, "BC-1"));
        when(memberCardService.syncCrmCard(any(), anyBoolean())).thenReturn(action("insert"));

        BrandCardSync.Result result = sync().runOnce(NOW, true, null);

        assertNull(result.since);
        verify(client).cards(isNull(), isNull(), anyInt());
    }

    @Test
    void followsNextCursorWhenHasMoreIsAbsent() {
        when(client.cards(any(), isNull(), anyInt()))
                .thenReturn(ledgerPage("c2", "BC-1"));
        when(client.cards(any(), eq("c2"), anyInt()))
                .thenReturn(ledgerPage(null, "BC-2"));
        when(memberCardService.syncCrmCard(any(), anyBoolean())).thenReturn(action("insert"));

        BrandCardSync.Result result = sync().runOnce(NOW, true, null);

        assertEquals(2, result.pages);
        assertEquals(2, result.rows);
        assertEquals(0, result.failed);
    }

    @Test
    void cardFailureKeepsWatermark() {
        when(client.cards(any(), any(), anyInt())).thenReturn(page(false, null, "BC-1"));
        when(memberCardService.syncCrmCard(any(), anyBoolean()))
                .thenThrow(new IllegalStateException("坏数据"));
        BrandCardSync sync = sync();

        BrandCardSync.Result first = sync.runOnce(NOW, true, null);
        BrandCardSync.Result second = sync.runOnce(NOW.plusHours(1), true, null);

        assertEquals(1, first.failed);
        assertEquals(first.since, second.since);
    }

    @Test
    void runsEveryHour() throws Exception {
        Scheduled scheduled = BrandCardSync.class.getMethod("tick")
                .getAnnotation(Scheduled.class);
        assertEquals("0 17 * * * ?", scheduled.cron());
    }

    @Test
    void pagesThroughLedgerAndCountsActions() {
        when(client.cards(any(), isNull(), anyInt()))
                .thenReturn(page(true, "c2", "BC-1", "BC-2"));
        when(client.cards(any(), eq("c2"), anyInt()))
                .thenReturn(page(false, null, "BC-3"));
        when(memberCardService.syncCrmCard(any(), anyBoolean()))
                .thenReturn(action("insert"), action("update"), action("unchanged"));

        BrandCardSync.Result result = sync().runOnce(NOW, true, null);

        assertEquals(2, result.pages);
        assertEquals(3, result.rows);
        assertEquals(1, result.inserted);
        assertEquals(1, result.updated);
        assertEquals(1, result.unchanged);
        assertEquals(0, result.failed);
        assertNull(result.error);
        // 差异样本只留会对账关注的，未变的卡不进样本
        assertEquals(2, result.samples.size());
        assertNull(result.since);
    }

    @Test
    void crmFailureAbortsRoundAndKeepsWatermark() {
        when(client.cards(any(), any(), anyInt()))
                .thenThrow(new BrandMemberException(BrandMemberException.UNAVAILABLE, "boom", 503));
        BrandCardSync sync = sync();

        BrandCardSync.Result first = sync.runOnce(NOW, true, null);
        assertEquals(1, first.failed);
        assertTrue(first.error != null);

        // 水位没推进：下一轮仍从同一个起点扫（upsert 幂等，多扫无副作用）
        BrandCardSync.Result second = sync.runOnce(NOW.plusHours(2), true, null);
        assertEquals(first.since, second.since);
    }

    @Test
    void successfulRoundAdvancesWatermarkAndDryRunDoesNot() {
        when(client.cards(any(), any(), anyInt())).thenReturn(page(false, null, "BC-1"));
        when(memberCardService.syncCrmCard(any(), anyBoolean())).thenReturn(action("insert"));
        BrandCardSync sync = sync();

        String drySince = sync.runOnce(NOW, false, null).since;
        String dryAgain = sync.runOnce(NOW.plusHours(2), false, null).since;
        assertEquals(drySince, dryAgain);

        String applied = sync.runOnce(NOW.plusHours(4), true, null).since;
        String next = sync.runOnce(NOW.plusHours(6), true, null).since;
        assertNotEquals(applied, next);
        verify(memberCardService, times(4)).syncCrmCard(any(), anyBoolean());
    }

    @Test
    void stopsAfterMaxPages() {
        when(client.cards(any(), isNull(), anyInt())).thenReturn(page(true, "c2", "BC-1"));
        when(client.cards(any(), eq("c2"), anyInt())).thenReturn(page(true, "c3", "BC-2"));
        when(client.cards(any(), eq("c3"), anyInt())).thenReturn(page(true, "c4", "BC-3"));
        BrandCardSync sync = new BrandCardSync(client, memberCardService, 200, 3, 2);
        when(memberCardService.syncCrmCard(any(), anyBoolean())).thenReturn(action("insert"));

        BrandCardSync.Result result = sync.runOnce(NOW, true, null);
        assertEquals(3, result.pages);
        assertEquals(3, result.inserted);
        assertTrue(result.error.contains("未追平"));
        verify(client, times(3)).cards(any(), any(), anyInt());
    }

    @Test
    void sinceOverrideUsesCallerValue() {
        when(client.cards(any(), any(), anyInt())).thenReturn(page(false, null));
        BrandCardSync.Result result = sync().runOnce(NOW, false, "2026-01-01T00:00:00Z");
        assertEquals("2026-01-01T00:00:00Z", result.since);
    }
}