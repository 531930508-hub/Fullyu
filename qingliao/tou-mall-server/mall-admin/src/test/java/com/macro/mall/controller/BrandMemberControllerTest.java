package com.macro.mall.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.crm.brand.BrandMemberCatalog;
import com.macro.mall.crm.brand.BrandMemberClient;
import com.macro.mall.crm.brand.BrandMemberNaming;
import com.macro.mall.crm.brand.CrmCardDiscountSource;
import com.macro.mall.service.BrandCardPaymentService;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 轻疗品牌会员接口：身份只认登录客户，支付单只认服务端客户 id，
 * 前端不能伪造会员号、金额或绕过支付。
 */
class BrandMemberControllerTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    private BrandMemberController controller(BrandMemberClient client,
                                             BrandCardPaymentService paymentService,
                                             Long customerId) {
        BrandMemberCatalog catalog = new BrandMemberCatalog(client, mock(CrmCardDiscountSource.class));
        return new BrandMemberController(client, catalog, paymentService) {
            @Override
            public Long curCustomerId() {
                return customerId;
            }
        };
    }

    @Test
    void meRequiresLoginAndUsesServerSideCustomerId() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        BrandCardPaymentService paymentService = mock(BrandCardPaymentService.class);
        JsonNode payload = objectMapper.readTree("{\"member\":{\"memberNo\":\"FY-TEST-000003\"}}");
        when(client.me("42")).thenReturn(payload);
        Map<String, Object> profile = new LinkedHashMap<>();
        profile.put("contactName", "林晚");
        profile.put("contactGender", "2");
        profile.put("contactBirthday", "1995-06-18");
        when(paymentService.latestProfile(42L)).thenReturn(profile);

        CommonResult result = controller(client, paymentService, 42L).me();
        assertEquals(payload, result.getData());
        // 已有档案随 me 返回，会员页开通/续费时直接带出，不再重复填写。
        assertEquals("林晚", ((JsonNode) result.getData()).get("profile").get("contactName").asText());
        assertEquals("1995-06-18", ((JsonNode) result.getData()).get("profile").get("contactBirthday").asText());
        verify(client).me("42");
        verify(paymentService).latestProfile(42L);

        BusinessException anonymous = assertThrows(BusinessException.class,
                () -> controller(client, paymentService, null).me());
        assertTrue(anonymous.getMessage().contains("登录"));
        verify(client, never()).me("null");
        verify(paymentService, never()).latestProfile(null);
    }

    @Test
    void meRenamesCrmCardToUnifiedDisplayName() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        BrandCardPaymentService paymentService = mock(BrandCardPaymentService.class);
        JsonNode payload = objectMapper.readTree("{\"card\":{\"productCode\":\"FY_ANNUAL\","
                + "\"productName\":\"Full愈年卡\",\"validUntil\":\"2027-11-07\"}}");
        when(client.me("42")).thenReturn(payload);

        JsonNode data = (JsonNode) controller(client, paymentService, 42L).me().getData();
        // CRM 旧名不再露出，卡期与价格负责区分卡型
        assertEquals(BrandMemberNaming.DISPLAY_NAME, data.path("card").path("productName").asText());
    }

    @Test
    void gameTicketRequiresLoginAndDelegatesOnce() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        JsonNode ticket = objectMapper.readTree("{\"ticket\":\"t\",\"url\":\"https://crm.test/game\"}");
        when(client.gameTicket("42")).thenReturn(ticket);

        assertEquals(ticket, controller(client, mock(BrandCardPaymentService.class), 42L)
                .gameTicket().getData());
        verify(client).gameTicket("42");

        assertThrows(BusinessException.class, () -> controller(client,
                mock(BrandCardPaymentService.class), null).gameTicket());
        verify(client, never()).gameTicket("null");
    }

    @Test
    void purchaseCreatesServerSideOrderWithLoginCustomer() {
        BrandMemberClient client = mock(BrandMemberClient.class);
        BrandCardPaymentService paymentService = mock(BrandCardPaymentService.class);
        Map<String, Object> created = new LinkedHashMap<>();
        created.put("orderSn", "C202611081200000001");
        created.put("testMode", true);
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("productCode", "FY_ANNUAL");
        params.put("agreeTerms", true);
        when(paymentService.createOrder(42L, params)).thenReturn(created);

        assertEquals(created, controller(client, paymentService, 42L).purchase(params).getData());
        verify(paymentService).createOrder(42L, params);

        assertThrows(BusinessException.class,
                () -> controller(client, paymentService, null).purchase(params));
        verify(paymentService, never()).createOrder(null, params);
    }

    @Test
    void ordersRequiresLoginAndReturnsOnlyOwnRecords() {
        BrandMemberClient client = mock(BrandMemberClient.class);
        BrandCardPaymentService paymentService = mock(BrandCardPaymentService.class);
        Map<String, Object> mine = new LinkedHashMap<>();
        mine.put("locked", false);
        mine.put("orders", java.util.Collections.emptyList());
        when(paymentService.customerOrders(42L)).thenReturn(mine);

        assertEquals(mine, controller(client, paymentService, 42L).orders().getData());
        verify(paymentService).customerOrders(42L);

        assertThrows(BusinessException.class,
                () -> controller(client, paymentService, null).orders());
        verify(paymentService, never()).customerOrders(null);
    }

    @Test
    void giftClaimNormalizesCodeAndRejectsMalformedBeforeCrm() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        JsonNode claimed = objectMapper.readTree("{\"card\":{\"state\":\"ACTIVE\"},\"replayed\":false}");
        when(client.claimGift("42", "FYGIFT30")).thenReturn(claimed);
        BrandMemberController controller = controller(client, mock(BrandCardPaymentService.class), 42L);

        assertEquals(claimed, controller.claimGift(body("code", " fy gift30 ")).getData());
        verify(client).claimGift("42", "FYGIFT30");

        BusinessException empty = assertThrows(BusinessException.class, () -> controller.claimGift(body("code", " ")));
        assertEquals(400, empty.getStatus());
        BusinessException bad = assertThrows(BusinessException.class,
                () -> controller.claimGift(body("code", "FY-<script>")));
        assertEquals(404, bad.getStatus());
        BusinessException anonymous = assertThrows(BusinessException.class,
                () -> controller(client, mock(BrandCardPaymentService.class), null).claimGift(body("code", "FYGIFT30")));
        assertEquals(401, anonymous.getStatus());
        verify(client, never()).claimGift(org.mockito.ArgumentMatchers.eq("null"), org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void feedbackValidatesLengthAndPassesQuoteConsent() throws Exception {
        BrandMemberClient client = mock(BrandMemberClient.class);
        BrandMemberController controller = controller(client, mock(BrandCardPaymentService.class), 42L);
        when(client.feedback("42", "希望晚上多开放几个时段", true)).thenReturn(objectMapper.readTree("{\"id\":\"FB1\"}"));

        Map<String, Object> params = body("content", "希望晚上多开放几个时段");
        params.put("allowQuote", true);
        controller.feedback(params);
        verify(client).feedback("42", "希望晚上多开放几个时段", true);

        assertThrows(BusinessException.class, () -> controller.feedback(body("content", "好")));
        // 与 CRM、时叙一致：最多 1000 字，1000 字通过、1001 字拒绝
        StringBuilder maxText = new StringBuilder();
        for (int i = 0; i < 1000; i++) {
            maxText.append('长');
        }
        controller.feedback(body("content", maxText.toString()));
        verify(client).feedback("42", maxText.toString(), false);
        String longText = maxText.toString() + "长";
        assertThrows(BusinessException.class, () -> controller.feedback(body("content", longText)));
        verify(client, never()).feedback("42", "好", false);
        verify(client, never()).feedback("42", longText, false);
    }

    @Test
    void customerRefundNeverForwardsZeroConfirmation() {
        BrandCardPaymentService paymentService = mock(BrandCardPaymentService.class);
        Map<String, Object> params = body("orderSn", "C202611081200000001");
        params.put("confirmZero", true);

        controller(mock(BrandMemberClient.class), paymentService, 42L).refund(params);

        verify(paymentService).refund(42L, "C202611081200000001", null, false, null);
    }

    private static Map<String, Object> body(String key, Object value) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put(key, value);
        return map;
    }
}
