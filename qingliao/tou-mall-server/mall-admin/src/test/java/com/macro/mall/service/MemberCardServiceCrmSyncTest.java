package com.macro.mall.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.CustomerMemberCard;
import com.macro.mall.entity.MemberCardConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MemberCardServiceCrmSyncTest {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private MemberCardService service;
    private CustomerService customerService;

    @BeforeEach
    void setUp() {
        service = spy(new MemberCardService());
        customerService = mock(CustomerService.class);
        ReflectionTestUtils.setField(service, "customerService", customerService);
        when(customerService.getById(42L)).thenReturn(new Customer());

        MemberCardConfig config = new MemberCardConfig();
        config.setCardType(MemberCardService.TYPE_YEAR);
        config.setCardName("Full愈大会员");
        config.setValidDays(365);
        config.setAdvanceRate(new BigDecimal("0.7550"));
        doReturn(config).when(service).getConfigByType(anyString());
        doReturn(null).when(service).getOne(any(), anyBoolean());
        doReturn(0L).when(service).count(any());
        doAnswer(invocation -> {
            invocation.<CustomerMemberCard>getArgument(0).setId(100L);
            return true;
        }).when(service).save(any(CustomerMemberCard.class));
        doReturn(true).when(service).updateById(any(CustomerMemberCard.class));
    }

    @Test
    void dryRunReportsInsertWithoutWriting() {
        Map<String, Object> result = service.syncCrmCard(row("ACTIVE", "PAID", "FY_ANNUAL", 29900, null), false);

        assertEquals("insert", result.get("action"));
        verify(service, never()).save(any(CustomerMemberCard.class));
        verify(service, never()).updateById(any(CustomerMemberCard.class));
    }

    @Test
    void applyInsertsCrmOwnedCardAndReplayIsUnchanged() {
        service.syncCrmCard(row("ACTIVE", "PAID", "FY_ANNUAL", 29900, null), true);
        ArgumentCaptor<CustomerMemberCard> saved = ArgumentCaptor.forClass(CustomerMemberCard.class);
        verify(service).save(saved.capture());
        CustomerMemberCard card = saved.getValue();
        assertEquals("BC-1", card.getCrmCardId());
        assertEquals(CustomerMemberCard.CHANNEL_CRM, card.getChannel());
        assertEquals(CustomerMemberCard.STATUS_ACTIVE, card.getStatus());
        assertEquals(new BigDecimal("299.00"), card.getAmount());
        assertEquals(1, card.getPeriodNo());

        doReturn(card).when(service).getOne(any(), anyBoolean());
        Map<String, Object> replay = service.syncCrmCard(row("ACTIVE", "PAID", "FY_ANNUAL", 29900, null), true);

        assertEquals("unchanged", replay.get("action"));
        verify(service, never()).updateById(any(CustomerMemberCard.class));
    }

    @Test
    void giftCardGetsTheSameActiveRights() {
        service.syncCrmCard(row("ACTIVE", "GIFT", "FY_GIFT", 0, null), true);
        ArgumentCaptor<CustomerMemberCard> saved = ArgumentCaptor.forClass(CustomerMemberCard.class);
        verify(service).save(saved.capture());

        CustomerMemberCard card = saved.getValue();
        assertEquals(CustomerMemberCard.CHANNEL_CRM, card.getChannel());
        assertEquals(CustomerMemberCard.STATUS_ACTIVE, card.getStatus());
        assertEquals(MemberCardService.TYPE_YEAR, card.getCardType());
        assertEquals(BigDecimal.ZERO.setScale(2), card.getAmount());
    }

    @Test
    void refundUpdatesAmountTimeAndReason() {
        CustomerMemberCard existing = existingCard();
        doReturn(existing).when(service).getOne(any(), anyBoolean());
        LocalDateTime refundedAt = LocalDateTime.now().minusHours(1).withNano(0);
        ObjectNode refund = MAPPER.createObjectNode();
        refund.put("type", "FULL");
        refund.put("cents", 12345);
        refund.put("at", DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
                refundedAt.atZone(ZoneId.systemDefault()).toOffsetDateTime()));
        refund.put("reason", "顾客申请退款");

        Map<String, Object> result = service.syncCrmCard(
                row("REFUNDED", "PAID", "FY_ANNUAL", 29900, refund), true);

        assertEquals("update", result.get("action"));
        assertTrue(result.get("changes").toString().contains("refundAmount"));
        assertTrue(result.get("changes").toString().contains("refundTime"));
        assertTrue(result.get("changes").toString().contains("refundReason"));
        assertEquals(CustomerMemberCard.STATUS_REFUNDED, existing.getStatus());
        assertEquals(new BigDecimal("123.45"), existing.getRefundAmount());
        assertEquals(refundedAt, existing.getRefundTime());
        assertEquals("顾客申请退款", existing.getRefundReason());
        verify(service).updateById(existing);
    }

    @Test
    void refundedCrmCardInsertKeepsRefundDetails() {
        LocalDateTime refundedAt = LocalDateTime.now().minusHours(1).withNano(0);
        ObjectNode refund = MAPPER.createObjectNode();
        refund.put("type", "FULL");
        refund.put("cents", 29900);
        refund.put("at", DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
                refundedAt.atZone(ZoneId.systemDefault()).toOffsetDateTime()));
        refund.put("reason", "全额退款");

        service.syncCrmCard(row("REFUNDED", "PAID", "FY_ANNUAL", 29900, refund), true);
        ArgumentCaptor<CustomerMemberCard> saved = ArgumentCaptor.forClass(CustomerMemberCard.class);
        verify(service).save(saved.capture());

        CustomerMemberCard card = saved.getValue();
        assertEquals(CustomerMemberCard.STATUS_REFUNDED, card.getStatus());
        assertEquals(new BigDecimal("299.00"), card.getRefundAmount());
        assertEquals(refundedAt, card.getRefundTime());
        assertEquals("全额退款", card.getRefundReason());
    }

    @Test
    void matchedMiniPaymentCardKeepsItsAmount() {
        CustomerMemberCard existing = existingCard();
        existing.setChannel(CustomerMemberCard.CHANNEL_MINI);
        existing.setAmount(new BigDecimal("199.00"));
        doReturn(existing).when(service).getOne(any(), anyBoolean());

        service.syncCrmCard(row("ACTIVE", "PAID", "FY_ANNUAL", 29900, null), true);

        assertEquals(new BigDecimal("199.00"), existing.getAmount());
        assertEquals(CustomerMemberCard.CHANNEL_MINI, existing.getChannel());
    }

    private CustomerMemberCard existingCard() {
        ObjectNode row = row("ACTIVE", "PAID", "FY_ANNUAL", 29900, null);
        CustomerMemberCard card = new CustomerMemberCard();
        card.setId(7L);
        card.setCustomerId(42L);
        card.setCrmCardId("BC-1");
        card.setCardNo("FY0007");
        card.setCardType(MemberCardService.TYPE_YEAR);
        card.setCardName("Full愈大会员");
        card.setStartTime(LocalDateTime.parse(row.get("validFrom").asText() + "T00:00:00"));
        card.setEndTime(LocalDateTime.parse(row.get("validUntil").asText() + "T23:59:59"));
        card.setValidDays(365);
        card.setAmount(new BigDecimal("299.00"));
        card.setChannel(CustomerMemberCard.CHANNEL_CRM);
        card.setStatus(CustomerMemberCard.STATUS_ACTIVE);
        return card;
    }

    private ObjectNode row(String state, String source, String productCode, int paidCents, ObjectNode refund) {
        LocalDateTime now = LocalDateTime.now();
        ObjectNode row = MAPPER.createObjectNode();
        row.put("cardId", "BC-1");
        row.put("localUserId", "42");
        row.put("productCode", productCode);
        row.put("source", source);
        row.put("state", state);
        row.put("validFrom", now.minusDays(1).toLocalDate().toString());
        row.put("validUntil", now.plusDays(364).toLocalDate().toString());
        row.put("validDays", 365);
        row.put("paidCents", paidCents);
        if (refund != null) {
            row.set("refund", refund);
        }
        return row;
    }
}
