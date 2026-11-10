package com.macro.mall.service;

import com.alibaba.excel.EasyExcel;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.macro.mall.entity.Activity;
import com.macro.mall.entity.GiftCard;
import com.macro.mall.enums.GiftCardStatus;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.invocation.Invocation;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 礼品卡预收台账：发放记正向、作废已发放卡记负向；按卡+事件幂等（唯一键 + INSERT IGNORE）。 */
class GiftCardPrepaidLedgerTest {
    GiftCardService service;
    Object ledger;
    Class<?> mapperType;

    @BeforeEach void setup() throws Exception {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "gift-card-test"), GiftCard.class);
        try { mapperType = Class.forName("com.macro.mall.mapper.GiftCardPrepaidLogMapper"); }
        catch (ClassNotFoundException e) { fail("礼品卡预收台账尚未实现"); }
        ledger = mock(mapperType);
        service = mock(GiftCardService.class, CALLS_REAL_METHODS);
        ReflectionTestUtils.setField(service, "prepaidLogMapper", ledger);
        doReturn(true).when(service).updateById(any(GiftCard.class));
        doReturn(true).when(service).updateBatchById(anyCollection());
    }

    private GiftCard card(long id, int status, String amount) {
        GiftCard c = new GiftCard();
        c.setId(id); c.setCode("CODE" + id); c.setStatus(status); c.setActivityId(3L); c.setShopId(1L);
        c.setAmount(amount == null ? null : new BigDecimal(amount));
        return c;
    }

    /** 读出所有写入台账的条目：[giftCardId, eventType, amount]。 */
    private List<Object[]> entries() throws Exception {
        List<Object[]> rows = new ArrayList<>();
        for (Invocation inv : mockingDetails(ledger).getInvocations()) {
            if (!"insertIgnore".equals(inv.getMethod().getName())) continue;
            for (Object e : (List<?>) inv.getArgument(0)) {
                rows.add(new Object[]{
                        e.getClass().getMethod("getGiftCardId").invoke(e),
                        e.getClass().getMethod("getEventType").invoke(e),
                        e.getClass().getMethod("getAmount").invoke(e)});
            }
        }
        return rows;
    }

    @Test void distributionRecordsPositiveFaceValueOnce() throws Exception {
        doReturn(card(1, GiftCardStatus.TO_BE_DISTRIBUTED.getValue(), "199.00")).when(service).getById(1L);
        service.distribution(1L, 9L);
        List<Object[]> rows = entries();
        assertEquals(1, rows.size());
        assertEquals(1L, rows.get(0)[0]);
        assertEquals("DISTRIBUTE", rows.get(0)[1]);
        assertEquals(0, new BigDecimal("199.00").compareTo((BigDecimal) rows.get(0)[2]));
    }

    @Test void batchDistributionRecordsOnePositivePerCard() throws Exception {
        doReturn(Arrays.asList(card(1, 1, "100"), card(2, 1, null))).when(service).listByIds(anyCollection());
        service.batchDistribution(Arrays.asList(1L, 2L), 9L);
        List<Object[]> rows = entries();
        assertEquals(2, rows.size());
        assertEquals(0, new BigDecimal("100").compareTo((BigDecimal) rows.get(0)[2]));
        assertEquals(0, BigDecimal.ZERO.compareTo((BigDecimal) rows.get(1)[2]), "无面值记 0，不留 null");
        assertTrue(rows.stream().allMatch(r -> "DISTRIBUTE".equals(r[1])));
    }

    @Test void voidingDistributedCardRecordsNegative() throws Exception {
        doReturn(card(5, GiftCardStatus.TO_BE_RECEIVED.getValue(), "88.80")).when(service).getById(5L);
        service.failure(5L);
        List<Object[]> rows = entries();
        assertEquals(1, rows.size());
        assertEquals("VOID", rows.get(0)[1]);
        assertEquals(0, new BigDecimal("-88.80").compareTo((BigDecimal) rows.get(0)[2]));
    }

    @Test void voidingUndistributedCardRecordsNothing() throws Exception {
        doReturn(card(6, GiftCardStatus.TO_BE_DISTRIBUTED.getValue(), "88.80")).when(service).getById(6L);
        service.failure(6L);
        assertTrue(entries().isEmpty(), "未发放的卡没有预收，作废不冲减");
    }

    @Test void batchVoidOnlyReversesDistributedCards() throws Exception {
        doReturn(Arrays.asList(card(7, 2, "50"), card(8, 1, "50"), card(9, 2, "20"))).when(service).listByIds(anyCollection());
        service.batchFailure(Arrays.asList(7L, 8L, 9L));
        List<Object[]> rows = entries();
        assertEquals(2, rows.size());
        assertEquals(7L, rows.get(0)[0]);
        assertEquals(9L, rows.get(1)[0]);
        assertTrue(rows.stream().allMatch(r -> "VOID".equals(r[1]) && ((BigDecimal) r[2]).signum() < 0));
    }

    @Test void importedCardsAreDistributedOnCreationAndUseFaceValueColumn() throws Exception {
        ActivityService activities = mock(ActivityService.class);
        ReflectionTestUtils.setField(service, "activityService", activities);
        Activity a = new Activity(); a.setId(3L); a.setCode("ACT1");
        when(activities.listByCodes(anyList())).thenReturn(Collections.singletonList(a));
        doReturn(true).when(service).checkByPasswordList(anyList());
        doReturn(new ArrayList<>(Arrays.asList("C000000001", "C000000002", "C000000003"))).when(service).generate10DigitCode(anyInt());
        long[] ids = {100};
        doAnswer(inv -> { for (Object o : (Collection<?>) inv.getArgument(0)) ((GiftCard) o).setId(ids[0]++); return true; })
                .when(service).saveBatch(anyCollection());
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        List<List<String>> head = new ArrayList<>();
        for (String label : new String[]{"活动编码", "密码", "兑换券数量", "兑换券有效天数", "面值"}) head.add(Collections.singletonList(label));
        EasyExcel.write(out).head(head).sheet("礼品卡").doWrite(Arrays.asList(
                Arrays.asList("ACT1", "pw000001", "2", "30", "120"),
                Arrays.asList("ACT1", "pw000002", "1", "30", "")));
        service.importBatchSave(new MockMultipartFile("file", "g.xlsx", "application/octet-stream", out.toByteArray()), 1L, 9L);
        List<Object[]> rows = entries();
        assertEquals(2, rows.size());
        assertEquals(100L, rows.get(0)[0]);
        assertEquals(0, new BigDecimal("120").compareTo((BigDecimal) rows.get(0)[2]));
        assertEquals(0, BigDecimal.ZERO.compareTo((BigDecimal) rows.get(1)[2]));
    }

    @Test void statusChangeAndLedgerShareOneTransaction() throws Exception {
        for (String m : new String[]{"distribution", "batchDistribution", "failure", "batchFailure"}) {
            boolean found = Arrays.stream(GiftCardService.class.getMethods())
                    .filter(x -> x.getName().equals(m)).anyMatch(x -> x.isAnnotationPresent(Transactional.class));
            assertTrue(found, m + " 需与台账同一事务");
        }
    }

    @Test void ledgerInsertIsIdempotentPerCardAndEvent() throws Exception {
        Configuration configuration = new Configuration();
        configuration.addMapper(mapperType);
        Map<String, Object> params = new HashMap<>();
        params.put("list", Collections.emptyList());
        String id = mapperType.getName() + ".insertIgnore";
        String sql = configuration.getMappedStatement(id).getSqlSource().getBoundSql(params).getSql();
        assertTrue(sql.toUpperCase().contains("INSERT IGNORE"), sql);
        String migration = new String(Files.readAllBytes(Paths.get("..", "sql", "2026-11-08-gift-card-prepaid-log.sql")), StandardCharsets.UTF_8);
        assertTrue(migration.contains("UNIQUE KEY `uk_gift_card_event` (`gift_card_id`,`event_type`)"), "缺少卡+事件唯一键");
    }
}
