package com.macro.mall.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.crm.brand.BrandMemberClient;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.CustomerMemberCard;
import com.macro.mall.entity.MemberCardOrder;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * CRM 后台内部接口：查询快照、规则退款金额校验、协商退款幂等、补偿重试与按手机号解锁。
 *
 * <p>全部 Mockito，不启动 Spring，不访问真实支付/数据库。</p>
 */
class BrandCardCrmInternalTest {

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
        when(customerService.updateById(any())).thenReturn(true);
        when(orderMapper.updateById(any())).thenReturn(1);
        when(mallOrderMapper.selectMaps(any())).thenReturn(Collections.emptyList());
        stubQuote(true, ANNUAL_CENTS, "WITHIN_7D", 0, 0, "7 天内无理由全额退款，可退 ¥299.00");
    }

    @Test
    void crmOrderReturnsSnapshotWithoutPhone() {
        MemberCardOrder order = paidOrder(61L);
        when(orderMapper.selectOne(any())).thenReturn(order);

        Map<String, Object> result = service.crmOrder(order.getOrderSn());

        assertEquals(order.getOrderSn(), result.get("orderSn"));
        assertEquals(ANNUAL_CENTS, result.get("paidCents"));
        assertEquals("crm-61", result.get("crmCardId"));
        assertEquals(Boolean.TRUE, result.get("refundable"));
        assertFalse(result.containsKey("phone"));
        assertFalse(result.containsKey("nickname"));
    }

    @Test
    void ruleRefundRejectsCrmAmountMismatchBeforeMoneyMoves() {
        MemberCardOrder order = paidOrder(62L);
        when(orderMapper.selectOne(any())).thenReturn(order);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.crmRefund(order.getOrderSn(), 10000, "WITHIN_7D", "客户申请", "CRM"));

        assertTrue(error.getMessage().contains("不一致"));
        verify(orderMapper, never()).updateById(any());
        verify(payService, never()).refundPay(any(), any());
        assertEquals(Integer.valueOf(MemberCardOrder.STATE_PAID), order.getState());
    }

    @Test
    void ruleRefundDoesNotCountAbuseLock() throws Exception {
        MemberCardOrder order = paidOrder(63L);
        CustomerMemberCard card = new CustomerMemberCard();
        card.setId(5L);
        card.setStatus(CustomerMemberCard.STATUS_ACTIVE);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(memberCardService.getById(5L)).thenReturn(card);

        Map<String, Object> result = service.crmRefund(order.getOrderSn(), ANNUAL_CENTS,
                "WITHIN_7D", "CRM 后台退款", "CRM");

        assertEquals(ANNUAL_CENTS, result.get("refundCents"));
        assertEquals("SUCCESS", order.getRefundState());
        assertEquals(Integer.valueOf(1), order.getCrmRefunded());
        // CRM 发起退款不再回调 CRM，也不计入防薅羊毛
        verify(brandMemberClient, never()).refund(anyString(), any(), anyLong(), anyString(),
                anyString(), anyString(), anyString());
        verify(customerService, never()).updateById(any());
    }

    @Test
    void negotiatedRefundMovesMoneyAndReplaysSameAmount() {
        MemberCardOrder order = paidOrder(64L);
        CustomerMemberCard card = new CustomerMemberCard();
        card.setId(5L);
        card.setStatus(CustomerMemberCard.STATUS_ACTIVE);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(memberCardService.getById(5L)).thenReturn(card);

        Map<String, Object> first = service.crmRefund(order.getOrderSn(), 12345, "NEGOTIATED",
                "使用三个月后协商退", "王店长");

        assertEquals(Integer.valueOf(MemberCardOrder.STATE_REFUNDED), order.getState());
        assertEquals("NEGOTIATED", order.getRefundType());
        assertEquals(12345, order.getRefundCents());
        assertEquals("SUCCESS", order.getRefundState());
        assertEquals(Integer.valueOf(1), order.getCrmRefunded());
        assertNull(order.getRefundOperatorId());
        assertTrue(order.getRefundReason().contains("王店长"));
        assertEquals(Integer.valueOf(CustomerMemberCard.STATUS_REFUNDED), card.getStatus());
        assertFalse(Boolean.TRUE.equals(first.get("replayed")));

        Map<String, Object> replay = service.crmRefund(order.getOrderSn(), 12345, "NEGOTIATED",
                "使用三个月后协商退", "王店长");

        assertEquals(Boolean.TRUE, replay.get("replayed"));
        verify(orderMapper, times(1)).updateById(any());
        verify(payService, never()).refundPay(any(), any());
    }

    @Test
    void negotiatedRefundRejectsDifferentAmountOnReplay() {
        MemberCardOrder order = paidOrder(65L);
        order.setState(MemberCardOrder.STATE_REFUNDED);
        order.setRefundCents(12345);
        when(orderMapper.selectOne(any())).thenReturn(order);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.crmRefund(order.getOrderSn(), 20000, "NEGOTIATED", "改金额", "CRM"));
        assertTrue(error.getMessage().contains("不能改为其他金额"));
        verify(orderMapper, never()).updateById(any());
    }

    @Test
    void negotiatedRefundRejectsAbovePaidAmount() {
        MemberCardOrder order = paidOrder(66L);
        when(orderMapper.selectOne(any())).thenReturn(order);

        assertThrows(BusinessException.class,
                () -> service.crmRefund(order.getOrderSn(), ANNUAL_CENTS + 1, "NEGOTIATED", "超付", "CRM"));
        verify(orderMapper, never()).updateById(any());
    }

    @Test
    void crmRetrySettleRejectsNonPendingOrder() {
        MemberCardOrder order = paidOrder(67L);
        when(orderMapper.selectOne(any())).thenReturn(order);
        when(orderMapper.selectById(67L)).thenReturn(order);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.crmRetry(order.getOrderSn(), "SETTLE"));
        assertTrue(error.getMessage().contains("重试开卡"));
    }

    @Test
    void crmRetryRejectsUnknownKind() {
        MemberCardOrder order = paidOrder(68L);
        when(orderMapper.selectOne(any())).thenReturn(order);

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.crmRetry(order.getOrderSn(), "WHATEVER"));
        assertEquals(400, error.getStatus());
    }

    @Test
    void unlockByPhoneClearsLockAndHidesPhone() {
        Customer customer = new Customer();
        customer.setId(CUSTOMER_ID);
        customer.setPhone("13800000000");
        customer.setBrandCardLocked(1);
        when(customerService.list(org.mockito.ArgumentMatchers
                .<com.baomidou.mybatisplus.core.conditions.Wrapper<Customer>>any()))
                .thenReturn(new ArrayList<>(Collections.singletonList(customer)));
        when(customerService.getById(CUSTOMER_ID)).thenReturn(customer);

        Map<String, Object> result = service.crmUnlockByPhone("13800000000");

        assertEquals(CUSTOMER_ID, result.get("customerId"));
        assertEquals(Boolean.TRUE, result.get("wasLocked"));
        assertEquals(Boolean.TRUE, result.get("unlocked"));
        assertFalse(result.containsKey("phone"));
        verify(customerService).update(any());
    }

    @Test
    void unlockByPhoneReturns404WhenCustomerMissing() {
        when(customerService.list(org.mockito.ArgumentMatchers
                .<com.baomidou.mybatisplus.core.conditions.Wrapper<Customer>>any()))
                .thenReturn(Collections.emptyList());

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.crmUnlockByPhone("13900000000"));
        assertEquals(404, error.getStatus());
    }

    // ==================== 构造 ====================

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
            JsonNode node = json.readTree(body);
            when(brandMemberClient.refundQuote(anyString())).thenReturn(node);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static void initTableInfo(Class<?> type) {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(),
                "brand-card-crm-test"), type);
    }

    private MemberCardOrder paidOrder(long id) {
        MemberCardOrder order = new MemberCardOrder();
        order.setId(id);
        order.setOrderSn("C20261108120000" + String.format("%04d", id));
        order.setCustomerId(CUSTOMER_ID);
        order.setConfigId(7L);
        order.setCardType(MemberCardService.TYPE_YEAR);
        order.setProductCode("FY_ANNUAL");
        order.setAmount(new BigDecimal("299.00"));
        order.setPaidCents(ANNUAL_CENTS);
        order.setState(MemberCardOrder.STATE_PAID);
        order.setRefundState("NONE");
        order.setCrmRefunded(0);
        order.setCardId(5L);
        order.setCrmCardId("crm-" + id);
        order.setMerOrdId(order.getOrderSn() + "A001");
        order.setHfSeqId("H-PAY-" + id);
        order.setPayTime(LocalDateTime.now().minusDays(2));
        order.setCreateTime(LocalDateTime.now().minusDays(2));
        order.setIdempotencyKey("brand-card:issue:" + order.getOrderSn());
        return order;
    }
}
