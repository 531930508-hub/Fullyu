package com.macro.mall.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.crm.brand.BrandMemberClient;
import com.macro.mall.crm.brand.BrandMemberException;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.CustomerMemberCard;
import com.macro.mall.entity.MemberCardConfig;
import com.macro.mall.entity.MemberCardOrder;
import com.macro.mall.entity.Order;
import com.macro.mall.mapper.MemberCardOrderMapper;
import com.macro.mall.mapper.OrderMapper;
import com.macro.mall.pay.PayService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 品牌会员卡支付：下单防重、回调幂等、金额校验、重复支付、退款规则与防薅羊毛。
 *
 * <p>全部使用 Mockito 模拟持久层与 CRM，不启动 Spring，不访问任何真实支付/数据库。</p>
 */
class BrandCardPaymentServiceTest {

    private static final long CUSTOMER_ID = 42L;
    private static final int ANNUAL_CENTS = 29900;

    private final ObjectMapper json = new ObjectMapper();

    private BrandCardPaymentService service;
    private MemberCardService memberCardService;
    private CustomerService customerService;
    private MemberCardOrderMapper orderMapper;
    private OrderMapper mallOrderMapper;
    private BrandMemberClient brandMemberClient;
    private PayService payService;

    @BeforeEach
    void setUp() {
        initTableInfo(MemberCardOrder.class);
        initTableInfo(CustomerMemberCard.class);
        initTableInfo(Customer.class);

        memberCardService = mock(MemberCardService.class);
        customerService = mock(CustomerService.class);
        orderMapper = mock(MemberCardOrderMapper.class);
        mallOrderMapper = mock(OrderMapper.class);
        brandMemberClient = mock(BrandMemberClient.class);
        payService = mock(PayService.class);
        PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);
        when(txManager.getTransaction(any())).thenReturn(mock(TransactionStatus.class));

        service = new BrandCardPaymentService();
        ReflectionTestUtils.setField(service, "memberCardService", memberCardService);
        ReflectionTestUtils.setField(service, "customerService", customerService);
        ReflectionTestUtils.setField(service, "orderMapper", orderMapper);
        ReflectionTestUtils.setField(service, "mallOrderMapper", mallOrderMapper);
        ReflectionTestUtils.setField(service, "brandMemberClient", brandMemberClient);
        ReflectionTestUtils.setField(service, "payService", payService);
        ReflectionTestUtils.setField(service, "transactionManager", txManager);

        when(memberCardService.isTestMode()).thenReturn(true);
        when(memberCardService.getConfigByType(anyString())).thenReturn(config(7L, 1));
        when(memberCardService.issuePaidCard(anyLong(), anyString(), any(BigDecimal.class), anyLong(),
                any(LocalDate.class), any(LocalDate.class), anyString())).thenReturn(localCard(55L));
        doNothing().when(memberCardService).lockCustomer(anyLong());
        when(customerService.updateById(any())).thenReturn(true);
        when(orderMapper.insert(any())).thenReturn(1);
        when(orderMapper.updateById(any())).thenReturn(1);
        when(orderMapper.selectCount(any())).thenReturn(0L);
        when(mallOrderMapper.selectMaps(any())).thenReturn(Collections.emptyList());
        // 默认 CRM 试算：7 天内全额可退；个别用例覆盖
        stubQuote(true, ANNUAL_CENTS, "WITHIN_7D", 0, 0, "7 天内无理由全额退款，可退 ¥299.00");
    }

    /** CRM 退款试算是唯一口径；本地不再自行计算 7 天后倒扣金额。 */
    private void stubQuote(boolean allowed, int refundableCents, String window, int savedCents,
                           int giftCents, String message) {
        String reason = allowed ? "null" : "\"REFUND_NOT_ALLOWED\"";
        String body = "{\"cardId\":\"crm-card\",\"source\":\"PAID\",\"window\":\"" + window + "\","
                + "\"refundType\":\"" + window + "\",\"paidCents\":" + ANNUAL_CENTS + ","
                + "\"savedCents\":" + savedCents + ",\"redeemedGiftCents\":" + giftCents + ","
                + "\"windowEndsAt\":\"2026-11-15T12:00:00+08:00\","
                + "\"refundableCents\":" + refundableCents + ",\"allowed\":" + allowed + ","
                + "\"reasonCode\":" + reason + ",\"message\":\"" + message + "\"}";
        try {
            when(brandMemberClient.refundQuote(anyString())).thenReturn(json.readTree(body));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static void initTableInfo(Class<?> type) {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(),
                "brand-card-test"), type);
    }

    // ==================== 下单 ====================

    @Test
    void createOrderRejectsLockedCustomerBeforeQuote() {
        Customer customer = customer(1);
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.createOrder(CUSTOMER_ID, purchaseParams(true, "FY_ANNUAL", null)));
        assertTrue(error.getMessage().contains("解锁"));
        verify(brandMemberClient, never()).quote(anyString(), anyString());
        verify(orderMapper, never()).insert(any());
    }

    @Test
    void createOrderRequiresTermsAndKnownProduct() {
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer(0));

        assertThrows(BusinessException.class,
                () -> service.createOrder(CUSTOMER_ID, purchaseParams(false, "FY_ANNUAL", null)));
        assertThrows(BusinessException.class,
                () -> service.createOrder(CUSTOMER_ID, purchaseParams(true, "UNKNOWN", null)));
        verify(orderMapper, never()).insert(any());
    }

    @Test
    void createOrderRejectsSoldOutCard() {
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer(0));
        when(memberCardService.getConfigByType(anyString())).thenReturn(config(7L, 0));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.createOrder(CUSTOMER_ID, purchaseParams(true, "FY_ANNUAL", null)));
        assertTrue(error.getMessage().contains("暂未开放"));
        verify(brandMemberClient, never()).quote(anyString(), anyString());
    }

    @Test
    void testModeOrderStoresCrmPriceAndNeverCallsPayChannel() throws Exception {
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer(0));
        when(brandMemberClient.quote(anyString(), anyString())).thenReturn(quote(ANNUAL_CENTS, "Q-1"));

        Map<String, Object> result = service.createOrder(CUSTOMER_ID,
                purchaseParams(true, "FY_ANNUAL", null));

        assertEquals(Boolean.TRUE, result.get("testMode"));
        assertEquals(0, new BigDecimal("299.00").compareTo((BigDecimal) result.get("amount")));
        ArgumentCaptor<MemberCardOrder> captor = ArgumentCaptor.forClass(MemberCardOrder.class);
        verify(orderMapper).insert(captor.capture());
        MemberCardOrder saved = captor.getValue();
        assertEquals(Integer.valueOf(MemberCardOrder.STATE_UNPAID), saved.getState());
        assertEquals(ANNUAL_CENTS, saved.getPaidCents());
        assertEquals("Q-1", saved.getQuoteId());
        assertEquals("brand-card:issue:" + saved.getOrderSn(), saved.getIdempotencyKey());
        assertTrue(saved.getOrderSn().startsWith("C"));
        assertNull(saved.getMerOrdId());
        verify(payService, never()).generatePay(any(), anyString(), anyString());
    }

    @Test
    void createOrderBlocksDuplicateWithinAntiDoublePayWindow() {
        // 2026-11-09 口径：续费合法，已支付的同款卡不拦；只拦 60 秒内同款未支付单（409）
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer(0));
        when(orderMapper.selectCount(any())).thenReturn(1L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.createOrder(CUSTOMER_ID, purchaseParams(true, "FY_ANNUAL", null)));
        assertTrue(error.getMessage().contains("支付单正在创建"));
        verify(brandMemberClient, never()).quote(anyString(), anyString());
        verify(orderMapper, never()).insert(any());
    }

    @Test
    void createOrderAllowsRenewalAfterAntiDoublePayWindow() throws Exception {
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer(0));
        MemberCardOrder previousPaid = paidOrder(901L, LocalDateTime.now().minusMinutes(5));
        when(orderMapper.selectOne(any())).thenReturn(previousPaid);
        when(brandMemberClient.quote(anyString(), anyString())).thenReturn(quote(ANNUAL_CENTS, "Q-RENEW"));

        Map<String, Object> result = service.createOrder(CUSTOMER_ID,
                purchaseParams(true, "FY_ANNUAL", null));

        assertEquals(Boolean.TRUE, result.get("testMode"));
        ArgumentCaptor<MemberCardOrder> captor = ArgumentCaptor.forClass(MemberCardOrder.class);
        verify(orderMapper).insert(captor.capture());
        assertEquals("Q-RENEW", captor.getValue().getQuoteId());
        verify(brandMemberClient).quote(anyString(), anyString());
        verify(orderMapper).insert(any());
    }

    @Test
    void createOrderRejectsConcurrentClickWithinMinute() {
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer(0));
        when(orderMapper.selectCount(any())).thenReturn(1L);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.createOrder(CUSTOMER_ID, purchaseParams(true, "FY_ANNUAL", null)));
        assertTrue(error.getMessage().contains("正在创建"));
        verify(orderMapper, never()).insert(any());
    }

    @Test
    void realModeRequiresOpenIdBeforePersistingOrder() {
        when(memberCardService.isTestMode()).thenReturn(false);
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer(0));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.createOrder(CUSTOMER_ID, purchaseParams(true, "FY_ANNUAL", null)));
        assertTrue(error.getMessage().contains("微信支付参数"));
        verify(orderMapper, never()).insert(any());
        verify(brandMemberClient, never()).quote(anyString(), anyString());
    }

    @Test
    void realModeReturnsPayParamsAndSavesMerchantOrderSn() throws Exception {
        when(memberCardService.isTestMode()).thenReturn(false);
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer(0));
        when(brandMemberClient.quote(anyString(), anyString())).thenReturn(quote(ANNUAL_CENTS, "Q-2"));
        Map<String, String> payResult = new HashMap<>();
        payResult.put("orderSn", "C202611081200000000A123");
        payResult.put("payParams", "{\"prepay_id\":\"wx-prepay\"}");
        when(payService.generatePay(any(Order.class), anyString(), anyString())).thenReturn(payResult);

        Map<String, Object> result = service.createOrder(CUSTOMER_ID,
                purchaseParams(true, "FY_ANNUAL", "openid-1"));

        assertEquals(Boolean.FALSE, result.get("testMode"));
        assertNotNull(result.get("payParams"));
        assertEquals("C202611081200000000A123", result.get("payOrderSn"));
        ArgumentCaptor<MemberCardOrder> captor = ArgumentCaptor.forClass(MemberCardOrder.class);
        verify(orderMapper).insert(captor.capture());
        assertEquals("C202611081200000000A123", captor.getValue().getMerOrdId());
        verify(orderMapper).updateById(captor.getValue());
    }

    // ==================== 模拟支付（测试环境） ====================

    @Test
    void mockPayIsIdempotentOnPaidOrder() {
        MemberCardOrder order = order(9L, MemberCardOrder.STATE_PAID, "H-1");
        when(orderMapper.selectOne(any())).thenReturn(order);

        Map<String, Object> status = service.mockPay(CUSTOMER_ID, order.getOrderSn());

        assertEquals(Integer.valueOf(MemberCardOrder.STATE_PAID), status.get("state"));
        verify(brandMemberClient, never()).issue(anyString(), anyString(), anyLong(), anyString(), anyString());
        verify(orderMapper, never()).updateById(any());
    }

    @Test
    void mockPayRefusesTerminatedOrders() {
        MemberCardOrder refunded = order(10L, MemberCardOrder.STATE_REFUNDED, "H-2");
        when(orderMapper.selectOne(any())).thenReturn(refunded);
        assertThrows(BusinessException.class, () -> service.mockPay(CUSTOMER_ID, refunded.getOrderSn()));

        MemberCardOrder closed = order(11L, MemberCardOrder.STATE_CLOSED, null);
        when(orderMapper.selectOne(any())).thenReturn(closed);
        assertThrows(BusinessException.class, () -> service.mockPay(CUSTOMER_ID, closed.getOrderSn()));
        verify(brandMemberClient, never()).issue(anyString(), anyString(), anyLong(), anyString(), anyString());
    }

    @Test
    void mockPayCannotTouchAnotherCustomersOrder() {
        MemberCardOrder order = order(12L, MemberCardOrder.STATE_UNPAID, null);
        when(orderMapper.selectOne(any())).thenReturn(order);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.mockPay(99L, order.getOrderSn()));
        assertTrue(error.getMessage().contains("不存在"));
    }

    // ==================== 回调开卡 ====================

    @Test
    void payCallbackIssuesCardOnceAndStoresPaymentRefs() throws Exception {
        MemberCardOrder order = unpaidOrder(20L);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(brandMemberClient.issue(anyString(), anyString(), anyLong(), anyString(), anyString()))
                .thenReturn(issue("crm-1"));

        service.handlePayCallback(order.getOrderSn() + "A001", new BigDecimal("299.00"),
                "H-PAY-1", "PARTY-1", "OUT-1", 1, "WX_MINI");

        assertEquals(Integer.valueOf(MemberCardOrder.STATE_PAID), order.getState());
        assertEquals("H-PAY-1", order.getHfSeqId());
        assertEquals("PARTY-1", order.getPartyOrderId());
        assertEquals("OUT-1", order.getOutTransId());
        assertEquals("crm-1", order.getCrmCardId());
        assertEquals(55L, order.getCardId());
        assertEquals(1, order.getPayType());
        assertNotNull(order.getPayTime());
        assertNull(order.getPayError());
        verify(brandMemberClient, times(1)).issue(eq("Q-20"), eq(order.getOrderSn()),
                eq((long) ANNUAL_CENTS), anyString(), eq("brand-card:issue:" + order.getOrderSn()));
        verify(memberCardService).lockCustomer(CUSTOMER_ID);
    }

    @Test
    void repeatedCallbackWithSameFlowDoesNotIssueTwice() throws Exception {
        MemberCardOrder order = order(21L, MemberCardOrder.STATE_PAID, "H-PAY-1");
        when(orderMapper.selectOne(any())).thenReturn(order);

        service.handlePayCallback(order.getOrderSn() + "A001", new BigDecimal("299.00"),
                "H-PAY-1", "PARTY-1", "OUT-1", 1, "WX_MINI");

        verify(brandMemberClient, never()).issue(anyString(), anyString(), anyLong(), anyString(), anyString());
        verify(orderMapper, never()).updateById(any());
        assertNull(order.getPayError());
    }

    @Test
    void secondDifferentPaymentOnPaidOrderIsFlaggedForRefund() throws Exception {
        MemberCardOrder order = order(22L, MemberCardOrder.STATE_PAID, "H-PAY-1");
        when(orderMapper.selectOne(any())).thenReturn(order);

        service.handlePayCallback(order.getOrderSn() + "A002", new BigDecimal("299.00"),
                "H-PAY-2", "PARTY-2", "OUT-2", 1, "WX_MINI");

        assertEquals(MemberCardOrder.STATE_PAID, order.getState());
        assertTrue(order.getPayError().contains("重复支付"), order.getPayError());
        verify(brandMemberClient, never()).issue(anyString(), anyString(), anyLong(), anyString(), anyString());
        verify(orderMapper).updateById(order);
    }

    @Test
    void amountMismatchHoldsOrderForManualRefundAndBlocksRetry() throws Exception {
        MemberCardOrder order = unpaidOrder(23L);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(orderMapper.selectById(23L)).thenReturn(order);

        service.handlePayCallback(order.getOrderSn() + "A001", new BigDecimal("1.00"),
                "H-LOW", "PARTY-1", "OUT-1", 1, "WX_MINI");

        assertEquals(Integer.valueOf(MemberCardOrder.STATE_PAID_PENDING), order.getState());
        assertTrue(order.getPayError().contains("不一致"), order.getPayError());
        assertEquals("H-LOW", order.getHfSeqId());
        assertNotNull(order.getMerOrdId());
        verify(brandMemberClient, never()).issue(anyString(), anyString(), anyLong(), anyString(), anyString());

        BusinessException retry = assertThrows(BusinessException.class, () -> service.retrySettle(23L));
        assertTrue(retry.getMessage().contains("人工核对"), retry.getMessage());

        BusinessException selfRefund = assertThrows(BusinessException.class,
                () -> service.refund(CUSTOMER_ID, order.getOrderSn(), "测试", true, null));
        assertTrue(selfRefund.getMessage().contains("人工"), selfRefund.getMessage());
    }

    @Test
    void duplicatePaymentForSameProductIsHeldForManualRefund() throws Exception {
        MemberCardOrder order = unpaidOrder(24L);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(orderMapper.selectCount(any())).thenReturn(1L);

        service.handlePayCallback(order.getOrderSn() + "A001", new BigDecimal("299.00"),
                "H-DUP", "PARTY-1", "OUT-1", 1, "WX_MINI");

        assertEquals(Integer.valueOf(MemberCardOrder.STATE_PAID_PENDING), order.getState());
        assertTrue(order.getPayError().contains("重复支付"), order.getPayError());
        assertEquals("H-DUP", order.getHfSeqId());
        verify(brandMemberClient, never()).issue(anyString(), anyString(), anyLong(), anyString(), anyString());
    }

    @Test
    void crmFailureKeepsPaymentForRetryAndRetryIssuesCard() throws Exception {
        MemberCardOrder order = unpaidOrder(25L);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(orderMapper.selectById(25L)).thenReturn(order);
        when(brandMemberClient.issue(anyString(), anyString(), anyLong(), anyString(), anyString()))
                .thenThrow(new BusinessException("CRM 暂不可用"))
                .thenReturn(issue("crm-retry"));
        // 首次开卡失败后的重新报价也失败：保留原始错误，进入人工重试
        when(brandMemberClient.quote(anyString(), anyString()))
                .thenThrow(new BusinessException("CRM 暂不可用"));

        assertThrows(BusinessException.class, () -> service.handlePayCallback(
                order.getOrderSn() + "A001", new BigDecimal("299.00"), "H-RETRY",
                "PARTY-1", "OUT-1", 1, "WX_MINI"));

        assertEquals(Integer.valueOf(MemberCardOrder.STATE_PAID_PENDING), order.getState());
        assertEquals("H-RETRY", order.getHfSeqId());
        assertNotNull(order.getMerOrdId());
        assertTrue(order.getPayError().contains("CRM"));

        service.retrySettle(25L);

        assertEquals(Integer.valueOf(MemberCardOrder.STATE_PAID), order.getState());
        assertEquals("crm-retry", order.getCrmCardId());
        assertNull(order.getPayError());
        verify(brandMemberClient, times(2)).issue(anyString(), anyString(), anyLong(), anyString(), anyString());
    }

    @Test
    void retrySettleReusesExistingLocalCardInsteadOfDuplicating() throws Exception {
        MemberCardOrder order = order(26L, MemberCardOrder.STATE_PAID_PENDING, "H-3");
        when(orderMapper.selectById(26L)).thenReturn(order);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(memberCardService.getOne(any())).thenReturn(localCard(77L));
        when(brandMemberClient.issue(anyString(), anyString(), anyLong(), anyString(), anyString()))
                .thenReturn(issue("crm-3"));

        service.retrySettle(26L);

        assertEquals(77L, order.getCardId());
        verify(memberCardService, never()).issuePaidCard(anyLong(), anyString(), any(BigDecimal.class),
                anyLong(), any(LocalDate.class), any(LocalDate.class), anyString());
    }

    @Test
    void unknownMerchantOrderIsIgnored() {
        when(orderMapper.selectOne(any())).thenReturn(null);
        service.handlePayCallback("C202611089999990000A001", new BigDecimal("299.00"),
                "H-X", null, null, 1, "WX_MINI");
        verify(brandMemberClient, never()).issue(anyString(), anyString(), anyLong(), anyString(), anyString());
    }

    // ==================== 退款 ====================

    @Test
    void refundWithin7DaysReturnsFullAmountAndKeepsPaymentSeq() throws Exception {
        MemberCardOrder order = paidOrder(30L, LocalDateTime.now().minusDays(2));
        CustomerMemberCard card = localCard(5L);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(memberCardService.getById(5L)).thenReturn(card);
        when(brandMemberClient.refund(anyString(), anyString(), anyLong(), anyString(), anyString(),
                anyString(), anyString())).thenReturn(json.readTree("{\"ok\":true}"));
        when(orderMapper.selectList(any())).thenReturn(new ArrayList<>());

        Map<String, Object> result = service.refund(CUSTOMER_ID, order.getOrderSn(), "不想用了", false, null);

        assertEquals(ANNUAL_CENTS, result.get("refundCents"));
        assertEquals("WITHIN_7D", result.get("refundType"));
        assertEquals(Integer.valueOf(MemberCardOrder.STATE_REFUNDED), order.getState());
        assertEquals("SUCCESS", order.getRefundState());
        assertEquals(Integer.valueOf(1), order.getCrmRefunded());
        assertEquals("H-PAY-ORIGIN", order.getHfSeqId(), "退款不能覆盖原支付流水");
        assertTrue(order.getRefundHfSeqId().startsWith("MOCK-REFUND-"));
        assertEquals(Integer.valueOf(CustomerMemberCard.STATUS_REFUNDED), card.getStatus());
        verify(brandMemberClient).refund(eq(order.getOrderSn()), eq("crm-30"), eq((long) ANNUAL_CENTS),
                eq("WITHIN_7D"), eq("不想用了"), anyString(),
                eq("brand-card:refund:" + order.getOrderSn()));
        assertFalse(Boolean.TRUE.equals(result.get("customerLocked")));
    }

    @Test
    void refundAfter7DaysUsesCrmQuoteWithSavingsAndGifts() {
        MemberCardOrder order = paidOrder(31L, LocalDateTime.now().minusDays(8));
        when(orderMapper.selectOne(any())).thenReturn(order);
        // 本地记录的会员优惠 ¥80 已全部同步到 CRM（CRM 记 ¥80 + 实物礼 ¥20）
        when(mallOrderMapper.selectMaps(any())).thenReturn(benefitRows("80.00"));
        stubQuote(true, 19900, "AFTER_7D", 8000, 2000, "已超过 7 天，按实付扣除已享优惠 ¥100.00 后可退 ¥199.00");
        when(orderMapper.selectList(any())).thenReturn(new ArrayList<>());

        Map<String, Object> result = service.refund(CUSTOMER_ID, order.getOrderSn(), "超期退款", false, null);

        assertEquals(19900, result.get("refundCents"));
        assertEquals("AFTER_7D", result.get("refundType"));
        assertEquals(8000, result.get("savedCents"));
        assertEquals(2000, result.get("redeemedGiftCents"));
        assertEquals(10000, result.get("usedBenefitCents"));
        assertEquals(0, new BigDecimal("199.00").compareTo((BigDecimal) result.get("refundAmount")));
        verify(brandMemberClient).refundQuote(order.getOrderSn());
        verify(brandMemberClient).refund(eq(order.getOrderSn()), eq("crm-31"), eq(19900L),
                eq("AFTER_7D"), eq("超期退款"), anyString(), anyString());
        // 7 天后退款不计入防薅羊毛
        verify(customerService, never()).updateById(any());
    }

    @Test
    void notAllowedRefundIsBlockedEvenWithLegacyConfirmFlag() {
        MemberCardOrder order = paidOrder(32L, LocalDateTime.now().minusDays(30));
        when(orderMapper.selectOne(any())).thenReturn(order);
        stubQuote(false, 0, "AFTER_7D", 29900, 0, "享受的优惠已超出，不能退款。");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.refund(CUSTOMER_ID, order.getOrderSn(), "退卡", true, null));
        assertEquals(409, error.getStatus());
        assertTrue(error.getMessage().contains("不能退款"));
        assertFalse(error.getMessage().contains("CRM 后台"));

        BusinessException admin = assertThrows(BusinessException.class,
                () -> service.refund(null, order.getOrderSn(), "后台退卡", true, 9L));
        assertTrue(admin.getMessage().contains("协商退款"));

        assertEquals(Integer.valueOf(MemberCardOrder.STATE_PAID), order.getState());
        verify(payService, never()).refundPay(any(), any());
        verify(brandMemberClient, never()).refund(anyString(), any(), anyLong(), anyString(),
                any(), anyString(), anyString());
    }

    @Test
    void unsyncedLocalSavingsBlockOnlineRefundAfter7Days() {
        MemberCardOrder order = paidOrder(41L, LocalDateTime.now().minusDays(10));
        when(orderMapper.selectOne(any())).thenReturn(order);
        // CRM 只收到 ¥20 优惠，本地订单记录了 ¥120：按 CRM 试算会多退，必须拦住
        when(mallOrderMapper.selectMaps(any())).thenReturn(benefitRows("120.00"));
        stubQuote(true, 27900, "AFTER_7D", 2000, 0, "可退 ¥279.00");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.refund(CUSTOMER_ID, order.getOrderSn(), "退卡", false, null));
        assertTrue(error.getMessage().contains("同步"), error.getMessage());
        verify(payService, never()).refundPay(any(), any());

        @SuppressWarnings("unchecked")
        Map<String, Object> row = ((List<Map<String, Object>>) customerOrdersFor(order).get("orders")).get(0);
        assertEquals(Boolean.FALSE, row.get("allowed"));
        assertEquals("SAVINGS_SYNC_PENDING", row.get("reasonCode"));
        assertEquals(0, row.get("refundCents"));
    }

    @Test
    void crmQuoteAboveLocalPaidAmountIsRejected() {
        MemberCardOrder order = paidOrder(42L, LocalDateTime.now().minusDays(1));
        when(orderMapper.selectOne(any())).thenReturn(order);
        stubQuote(true, ANNUAL_CENTS + 100, "WITHIN_7D", 0, 0, "可退");

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.refund(CUSTOMER_ID, order.getOrderSn(), "退卡", false, null));
        assertEquals(409, error.getStatus());
        assertTrue(error.getMessage().contains("不一致"));
        verify(payService, never()).refundPay(any(), any());
    }

    @Test
    void crmOutageFailsRefundInsteadOfFallingBackToLocalRule() {
        MemberCardOrder order = paidOrder(43L, LocalDateTime.now().minusDays(1));
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(brandMemberClient.refundQuote(anyString())).thenThrow(
                new BrandMemberException(BrandMemberException.UNAVAILABLE, "会员服务暂时不可用，请稍后重试", 503));

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.refund(CUSTOMER_ID, order.getOrderSn(), "退卡", false, null));
        assertEquals(503, error.getStatus());
        assertEquals(Integer.valueOf(MemberCardOrder.STATE_PAID), order.getState());

        @SuppressWarnings("unchecked")
        Map<String, Object> row = ((List<Map<String, Object>>) customerOrdersFor(order).get("orders")).get(0);
        assertEquals(Boolean.FALSE, row.get("allowed"));
        assertTrue(String.valueOf(row.get("refundQuoteError")).contains("暂时不可用"));
    }

    @Test
    void revokeTreatsMissingCrmCardAsDoneOnlyWhenNoCardWasIssued() {
        MemberCardOrder neverIssued = paidOrder(44L, LocalDateTime.now().minusDays(1));
        neverIssued.setCrmCardId(null);
        MemberCardOrder issued = paidOrder(45L, LocalDateTime.now().minusDays(1));
        when(brandMemberClient.refund(anyString(), any(), anyLong(), anyString(), any(), anyString(), anyString()))
                .thenThrow(new BrandMemberException("CARD_NOT_FOUND", "未找到", 404));

        assertTrue(service.revokeCrmCard(neverIssued, ANNUAL_CENTS, "WITHIN_7D", "退款", true));
        assertFalse(service.revokeCrmCard(issued, ANNUAL_CENTS, "WITHIN_7D", "退款", true));
    }

    private Map<String, Object> customerOrdersFor(MemberCardOrder order) {
        when(orderMapper.selectList(any())).thenReturn(Collections.singletonList(order));
        Customer customer = new Customer();
        customer.setId(CUSTOMER_ID);
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer);
        return service.customerOrders(CUSTOMER_ID);
    }

    @Test
    void refundTwiceIsRejected() {
        MemberCardOrder order = paidOrder(33L, LocalDateTime.now().minusDays(1));
        order.setRefundState("SUCCESS");
        when(orderMapper.selectOne(any())).thenReturn(order);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.refund(CUSTOMER_ID, order.getOrderSn(), "重复", false, null));
        assertTrue(error.getMessage().contains("已退款"));
        verify(brandMemberClient, never()).refund(anyString(), anyString(), anyLong(), anyString(),
                anyString(), anyString(), anyString());
    }

    @Test
    void twoSelfRefundsWithin7DaysLockPurchase() {
        MemberCardOrder order = paidOrder(34L, LocalDateTime.now().minusDays(1));
        Customer customer = customer(0);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer);
        when(orderMapper.selectList(any())).thenReturn(java.util.Arrays.asList(
                refundedOrder(1L), refundedOrder(2L)));

        Map<String, Object> result = service.refund(CUSTOMER_ID, order.getOrderSn(), "第二次退", false, null);

        assertEquals(Boolean.TRUE, result.get("customerLocked"));
        assertEquals(Integer.valueOf(1), customer.getBrandCardLocked());
        assertNotNull(customer.getBrandCardLockReason());

        BusinessException blocked = assertThrows(BusinessException.class,
                () -> service.createOrder(CUSTOMER_ID, purchaseParams(true, "FY_ANNUAL", null)));
        assertTrue(blocked.getMessage().contains("解锁"));
    }

    @Test
    void adminRefundDoesNotTriggerAbuseLock() {
        MemberCardOrder order = paidOrder(35L, LocalDateTime.now().minusDays(1));
        when(orderMapper.selectById(35L)).thenReturn(order);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(orderMapper.selectList(any())).thenReturn(java.util.Arrays.asList(
                refundedOrder(1L), refundedOrder(2L)));
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer(0));

        Map<String, Object> result = service.adminRefund(35L, "客服退款", false, 9L);

        assertFalse(Boolean.TRUE.equals(result.get("customerLocked")));
        verify(customerService, never()).updateById(any());
        assertEquals(9L, order.getRefundOperatorId());
    }

    @Test
    void realModeRefundRequiresPaymentSeqAndUsesRefundSeq() {
        MemberCardOrder missing = paidOrder(36L, LocalDateTime.now().minusDays(1));
        missing.setMerOrdId(null);
        when(orderMapper.selectOne(any())).thenReturn(missing);
        when(memberCardService.isTestMode()).thenReturn(false);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.refund(CUSTOMER_ID, missing.getOrderSn(), "退款", false, null));
        assertTrue(error.getMessage().contains("缺少支付流水"));
        verify(payService, never()).refundPay(any(), any());

        MemberCardOrder order = paidOrder(37L, LocalDateTime.now().minusDays(1));
        order.setMerOrdId("C202611081200000037A001");
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(payService.refundPay(any(Order.class), any(BigDecimal.class))).thenReturn("H-REFUND-37");
        when(orderMapper.selectList(any())).thenReturn(new ArrayList<>());

        service.refund(CUSTOMER_ID, order.getOrderSn(), "退款", false, null);

        assertEquals("H-PAY-ORIGIN", order.getHfSeqId());
        assertEquals("H-REFUND-37", order.getRefundHfSeqId());
        ArgumentCaptor<Order> payOrder = ArgumentCaptor.forClass(Order.class);
        verify(payService).refundPay(payOrder.capture(), eq(new BigDecimal("299.00")));
        assertEquals("C202611081200000037A001", payOrder.getValue().getMerOrdId());
        assertEquals("H-PAY-ORIGIN", payOrder.getValue().getHfSeqId());
    }

    @Test
    void adminPreviewOnRefundedOrderIsGraceful() {
        MemberCardOrder order = order(38L, MemberCardOrder.STATE_REFUNDED, "H-1");
        order.setRefundCents(ANNUAL_CENTS);
        order.setRefundAmount(new BigDecimal("299.00"));
        when(orderMapper.selectById(38L)).thenReturn(order);

        Map<String, Object> preview = service.adminPreview(38L);

        assertEquals(Boolean.TRUE, preview.get("alreadyRefunded"));
        assertEquals(Boolean.FALSE, preview.get("needConfirm"));
    }

    @Test
    void refundCallbackRecordsFailureForManualCheck() {
        MemberCardOrder order = order(39L, MemberCardOrder.STATE_REFUNDED, "H-1");
        when(orderMapper.selectOne(any())).thenReturn(order);

        service.handleRefundCallback(order.getOrderSn(), new BigDecimal("299.00"),
                "H-REFUND-39", "F", "账户余额不足");

        assertTrue(order.getPayError().contains("退款失败"), order.getPayError());
        assertTrue(order.getPayError().contains("账户余额不足"));
        verify(orderMapper).updateById(order);
    }

    @Test
    void unlockCustomerClearsLockAndRequiresExistingCustomer() {
        when(customerService.getById(77L)).thenReturn(null);
        assertThrows(BusinessException.class, () -> service.unlockCustomer(77L));

        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer(1));
        service.unlockCustomer(CUSTOMER_ID);
        verify(customerService).update(any());
    }

    @Test
    void orderStatusHidesOtherCustomersOrders() {
        MemberCardOrder order = order(40L, MemberCardOrder.STATE_PAID, "H-1");
        when(orderMapper.selectOne(any())).thenReturn(order);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.orderStatus(99L, order.getOrderSn()));
        assertTrue(error.getMessage().contains("不存在"));
    }

    // ==================== 构造 ====================

    private Map<String, Object> purchaseParams(boolean agree, String productCode, String openId) {
        Map<String, Object> form = new LinkedHashMap<>();
        form.put("agreeTerms", agree);
        form.put("productCode", productCode);
        if (openId != null) {
            form.put("openId", openId);
        }
        return form;
    }

    private MemberCardConfig config(Long id, int status) {
        MemberCardConfig config = new MemberCardConfig();
        config.setId(id);
        config.setCardType(MemberCardService.TYPE_YEAR);
        config.setCardName("Full愈年卡");
        config.setStatus(status);
        config.setValidDays(365);
        config.setPrice(new BigDecimal("299.00"));
        return config;
    }

    private JsonNode quote(int cents, String quoteId) throws Exception {
        return json.readTree("{\"priceCents\":" + cents + ",\"quoteId\":\"" + quoteId
                + "\",\"productCode\":\"FY_ANNUAL\"}");
    }

    private JsonNode issue(String crmCardId) throws Exception {
        return json.readTree("{\"card\":{\"cardId\":\"" + crmCardId
                + "\",\"validFrom\":\"2026-11-08\",\"validUntil\":\"2027-11-07\","
                + "\"productName\":\"Full愈年卡\"}}");
    }

    private Customer customer(int locked) {
        Customer customer = new Customer();
        customer.setId(CUSTOMER_ID);
        customer.setNickname("测试客户");
        customer.setPhone("13800000000");
        customer.setBrandCardLocked(locked);
        return customer;
    }

    private CustomerMemberCard localCard(long id) {
        CustomerMemberCard card = new CustomerMemberCard();
        card.setId(id);
        card.setCustomerId(CUSTOMER_ID);
        card.setCardNo("FY20261108" + id);
        card.setStatus(CustomerMemberCard.STATUS_ACTIVE);
        return card;
    }

    private MemberCardOrder unpaidOrder(long id) {
        MemberCardOrder order = order(id, MemberCardOrder.STATE_UNPAID, null);
        order.setPayTime(null);
        return order;
    }

    private MemberCardOrder paidOrder(long id, LocalDateTime payTime) {
        MemberCardOrder order = order(id, MemberCardOrder.STATE_PAID, "H-PAY-ORIGIN");
        order.setPayTime(payTime);
        order.setMerOrdId(order.getOrderSn() + "A001");
        order.setCrmCardId("crm-" + id);
        order.setCardId(5L);
        return order;
    }

    private MemberCardOrder refundedOrder(long id) {
        MemberCardOrder order = order(id, MemberCardOrder.STATE_REFUNDED, "H-" + id);
        order.setRefundType("WITHIN_7D");
        order.setRefundTime(LocalDateTime.now().minusHours(id));
        order.setRefundState("SUCCESS");
        return order;
    }

    private MemberCardOrder order(long id, int state, String hfSeqId) {
        MemberCardOrder order = new MemberCardOrder();
        order.setId(id);
        order.setOrderSn("C20261108120000" + String.format("%04d", id));
        order.setCustomerId(CUSTOMER_ID);
        order.setConfigId(7L);
        order.setCardType(MemberCardService.TYPE_YEAR);
        order.setProductCode("FY_ANNUAL");
        order.setAmount(new BigDecimal("299.00"));
        order.setPaidCents(ANNUAL_CENTS);
        order.setState(state);
        order.setPayType(1);
        order.setPayChannel("WX_MINI");
        order.setQuoteId("Q-" + id);
        order.setIdempotencyKey("brand-card:issue:" + order.getOrderSn());
        order.setRefundState("NONE");
        order.setCrmRefunded(0);
        order.setCreateTime(LocalDateTime.now());
        order.setHfSeqId(hfSeqId);
        return order;
    }

    /** 小程序订单页要把品牌卡单与卡券单合并按时间排序，列表必须带 createTime。 */
    @Test
    void customerOrdersIncludeCreateTimeForOrderPageMerge() {
        MemberCardOrder order = order(9L, MemberCardOrder.STATE_UNPAID, null);
        order.setCreateTime(LocalDateTime.of(2026, 11, 9, 0, 14, 19));
        when(orderMapper.selectList(any())).thenReturn(Collections.singletonList(order));
        Customer customer = new Customer();
        customer.setId(CUSTOMER_ID);
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer);

        Map<String, Object> result = service.customerOrders(CUSTOMER_ID);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) result.get("orders");
        assertEquals(1, rows.size());
        assertEquals("2026-11-09 00:14:19", rows.get(0).get("createTime"));
    }

    private List<Map<String, Object>> benefitRows(String yuan) {
        Map<String, Object> row = new HashMap<>();
        row.put("benefit", new BigDecimal(yuan));
        return Collections.singletonList(row);
    }
}
