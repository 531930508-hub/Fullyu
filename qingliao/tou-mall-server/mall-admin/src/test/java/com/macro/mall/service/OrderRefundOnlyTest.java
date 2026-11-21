package com.macro.mall.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.macro.mall.common.exception.ApiException;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.entity.RefundApply;
import com.macro.mall.enums.AppointmentState;
import com.macro.mall.enums.OrderPayType;
import com.macro.mall.enums.OrderState;
import com.macro.mall.enums.OrderType;
import com.macro.mall.enums.RefundState;
import com.macro.mall.enums.RefundType;
import com.macro.mall.mapper.OrderDetailMapper;
import com.macro.mall.mapper.OrderMapper;
import com.macro.mall.pay.PayService;
import com.macro.mall.pay.RefundPayResult;
import com.macro.mall.service.approval.RefundApplyService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 仅退款（不取消预约）之后订单落在哪：
 * 真金白银付过的单退完钱就是「未付款」，预约留在看板等门店重收；
 * 卡券单/券支付退的是券，保持「已退款」。
 *
 * <p>顺带钉住几条配套约束：同一轮不能退两次、重新收款要清掉上一轮退款痕迹、
 * 上一轮退款的回调迟到不能把订单再打回退款中。</p>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OrderRefundOnlyTest {

    private static final long ORDER_ID = 9101L;
    private static final String ORDER_SN = "T20261121000001";
    private static final BigDecimal PAY_AMOUNT = new BigDecimal("100.00");

    @Mock
    private OrderMapper orderMapper;
    @Mock
    private OrderDetailMapper orderDetailMapper;
    @Mock
    private PayService payService;
    @Mock
    private RefundApplyService refundApplyService;
    @Mock
    private CustomerCouponService customerCouponService;
    @Mock
    private IntegrationService integrationService;
    @Mock
    private OrderDetailService orderDetailService;

    @InjectMocks
    private OrderService service;

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), Order.class);
        // 回调收敛后会重排到店编号，按服务日期查明细，OrderDetail 的 lambda 缓存也要在
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), OrderDetail.class);
        // getById 走 ServiceImpl.baseMapper，必须指到 mock 的 mapper 上
        ReflectionTestUtils.setField(service, "baseMapper", orderMapper);
        lenient().when(orderMapper.updateById(any())).thenReturn(1);
        lenient().when(orderMapper.update(any(), any())).thenReturn(1);
        lenient().when(orderMapper.selectById(any())).thenReturn(order(OrderState.PAID_NOT_COMMENT.getValue(), OrderPayType.CASH.getValue()));
        // getByOrderSn 走 getOne → selectList；refreshVisitNoFrom 也用它，默认给同一张单
        lenient().when(orderMapper.selectList(any())).thenAnswer(inv -> Collections.singletonList(
                order(OrderState.PAID_NOT_COMMENT.getValue(), OrderPayType.CASH.getValue())));
        lenient().when(orderDetailService.getBaseMapper()).thenReturn(orderDetailMapper);
        lenient().when(orderDetailMapper.selectList(any())).thenReturn(Collections.emptyList());
        lenient().when(orderDetailService.listByOrderId(anyLong())).thenReturn(Collections.emptyList());
    }

    private Order order(int state, int payType) {
        Order order = new Order();
        order.setId(ORDER_ID);
        order.setCode(ORDER_SN);
        order.setType(OrderType.PRODUCT.getValue());
        order.setState(state);
        order.setPayType(payType);
        order.setPayAmount(PAY_AMOUNT);
        order.setTotalAmount(PAY_AMOUNT);
        order.setHasRefundAmount(BigDecimal.ZERO);
        order.setIntegrationAmount(BigDecimal.ZERO);
        order.setAppointmentState(AppointmentState.WAITING.getValue());
        order.setPayTime(LocalDateTime.of(2026, 11, 20, 10, 0));
        return order;
    }

    private void stubOrder(Order order) {
        when(orderMapper.selectById(ANY_ID)).thenReturn(order);
        // getByOrderSn 走 ServiceImpl.getOne → baseMapper.selectOne(wrapper, true) 这个重载
        when(orderMapper.selectOne(any(), anyBoolean())).thenReturn(order);
    }

    private static final Long ANY_ID = ORDER_ID;

    @Test
    @DisplayName("现金单仅退款：钱退回去，订单回到未付款，预约不动")
    void refundOnlyCashGoesBackToNotPay() {
        Order order = order(OrderState.PAID_NOT_COMMENT.getValue(), OrderPayType.CASH.getValue());
        stubOrder(order);

        service.doRefundOrder(ORDER_ID, PAY_AMOUNT, RefundType.REFUND.getValue());

        assertEquals(OrderState.NOT_PAY.getValue(), order.getState(), "现金单仅退款应回到未付款，等门店重收");
        assertEquals(RefundState.SUCCESS.getValue(), order.getRefundState());
        assertEquals(0, PAY_AMOUNT.compareTo(order.getHasRefundAmount()), "线下退款要自己累计已退金额");
        assertEquals(AppointmentState.WAITING.getValue(), order.getAppointmentState(), "仅退款不能动预约");
        verify(orderDetailService, never()).refundOrder(any(), eq(true));
        verify(payService, never()).refundPay(any(), any());
    }

    @Test
    @DisplayName("微信单仅退款：先挂退款中，等渠道回调再收敛")
    void refundOnlyWechatWaitsForCallback() {
        Order order = order(OrderState.PAID_NOT_COMMENT.getValue(), OrderPayType.WECHAT.getValue());
        stubOrder(order);
        when(payService.refundPay(any(), any())).thenReturn(RefundPayResult.accepted("HF-1", "REQ-1", "000000"));

        service.doRefundOrder(ORDER_ID, PAY_AMOUNT, RefundType.REFUND.getValue());

        assertEquals(OrderState.REFUNDING.getValue(), order.getState());
        assertEquals(RefundState.DOING.getValue(), order.getRefundState());
        assertEquals("HF-1", order.getRefundHfSeqId());
    }

    @Test
    @DisplayName("券支付的仅退款：券已退回，订单保持已退款，不可能再结算")
    void refundOnlyCouponPayStaysRefunded() {
        Order order = order(OrderState.PAID_NOT_COMMENT.getValue(), OrderPayType.COUPON.getValue());
        stubOrder(order);

        service.doRefundOrder(ORDER_ID, PAY_AMOUNT, RefundType.REFUND.getValue());

        assertEquals(OrderState.REFUNDED.getValue(), order.getState());
        assertEquals(RefundState.SUCCESS.getValue(), order.getRefundState());
        verify(customerCouponService).handleRefund(order);
    }

    @Test
    @DisplayName("同一轮已经退过的单，再批一次不能再退")
    void refundOnlyCannotRunTwiceInSameRound() {
        Order order = order(OrderState.NOT_PAY.getValue(), OrderPayType.CASH.getValue());
        order.setRefundState(RefundState.SUCCESS.getValue());
        order.setHasRefundAmount(PAY_AMOUNT);
        stubOrder(order);

        ApiException ex = assertThrows(ApiException.class,
                () -> service.doRefundOrder(ORDER_ID, PAY_AMOUNT, RefundType.REFUND.getValue()));
        assertEquals("该订单本轮已退款，请勿重复操作", ex.getMessage());
    }

    @Test
    @DisplayName("微信退款成功回调：仅退款落未付款，取消型落已退款并退预约")
    void refundNotifySplitsByApplyType() {
        Order order = order(OrderState.REFUNDING.getValue(), OrderPayType.WECHAT.getValue());
        order.setRefundState(RefundState.DOING.getValue());
        order.setRefundHfSeqId("HF-1");
        stubOrder(order);
        when(orderMapper.selectList(any())).thenReturn(Collections.singletonList(order));

        RefundApply refundOnly = new RefundApply();
        refundOnly.setType(RefundType.REFUND.getValue());
        when(refundApplyService.getByOrderId(ORDER_ID)).thenReturn(refundOnly);

        service.handleRefundNotify2(ORDER_SN, "HF-1", PAY_AMOUNT, "S", "success");

        assertEquals(OrderState.NOT_PAY.getValue(), order.getState(), "仅退款回调后订单回到未付款");
        assertEquals(RefundState.SUCCESS.getValue(), order.getRefundState());
        assertEquals(0, PAY_AMOUNT.compareTo(order.getHasRefundAmount()));
        verify(orderDetailService, never()).refundOrder(any(), eq(true));
    }

    @Test
    @DisplayName("微信退款成功回调：取消型的申请单仍然把订单落已退款")
    void cancelRefundNotifyStaysRefunded() {
        Order order = order(OrderState.REFUNDING.getValue(), OrderPayType.WECHAT.getValue());
        order.setRefundState(RefundState.DOING.getValue());
        order.setRefundHfSeqId("HF-2");
        stubOrder(order);
        when(orderMapper.selectList(any())).thenReturn(Collections.singletonList(order));

        RefundApply cancel = new RefundApply();
        cancel.setType(RefundType.CANCEL.getValue());
        when(refundApplyService.getByOrderId(ORDER_ID)).thenReturn(cancel);

        service.handleRefundNotify2(ORDER_SN, "HF-2", PAY_AMOUNT, "S", "success");

        assertEquals(OrderState.REFUNDED.getValue(), order.getState());
        assertEquals(AppointmentState.CANCELED.getValue(), order.getAppointmentState());
        verify(orderDetailService).refundOrder(ORDER_ID, true);
    }

    @Test
    @DisplayName("上一轮退款回调迟到：订单已重收回到未付款就不许再动")
    void staleRefundNotifyIgnoredAfterRepay() {
        Order order = order(OrderState.NOT_PAY.getValue(), OrderPayType.CASH.getValue());
        order.setRefundState(null);
        order.setRefundHfSeqId("HF-OLD");
        stubOrder(order);
        when(orderMapper.selectList(any())).thenReturn(Collections.singletonList(order));

        service.handleRefundNotify2(ORDER_SN, "HF-OLD", PAY_AMOUNT, "S", "success");

        assertEquals(OrderState.NOT_PAY.getValue(), order.getState());
        assertNull(order.getRefundState(), "老回调不能把退款状态写回来");
        assertEquals(0, BigDecimal.ZERO.compareTo(order.getHasRefundAmount()), "老回调不能再记一次退款金额");
        verify(orderMapper, never()).updateById(any());
    }

    @Test
    @DisplayName("上一轮退款回调迟到：订单重收后已经付款，同样不许再动")
    void staleRefundNotifyIgnoredAfterRepayWhenPaid() {
        // 重收之后订单是「已付款」而不是「未付款」，按状态判断会漏掉，必须看本轮退款有没有收口
        Order order = order(OrderState.PAID_NOT_COMMENT.getValue(), OrderPayType.CASH.getValue());
        order.setRefundState(null);
        order.setRefundHfSeqId("HF-OLD");
        stubOrder(order);
        when(orderMapper.selectList(any())).thenReturn(Collections.singletonList(order));

        service.handleRefundNotify2(ORDER_SN, "HF-OLD", PAY_AMOUNT, "S", "success");

        assertEquals(OrderState.PAID_NOT_COMMENT.getValue(), order.getState(), "老回调不能把已付款单打回未付款");
        assertNull(order.getRefundState());
        assertEquals(0, BigDecimal.ZERO.compareTo(order.getHasRefundAmount()), "老回调不能再记一次退款金额");
        verify(orderMapper, never()).updateById(any());
    }

    @Test
    @DisplayName("退款失败后渠道又回调成功：本轮还没收口，要落成功")
    void refundNotifyStillAppliedAfterError() {
        Order order = order(OrderState.REFUNDING.getValue(), OrderPayType.WECHAT.getValue());
        order.setRefundState(RefundState.ERROR.getValue());
        order.setRefundHfSeqId("HF-3");
        stubOrder(order);
        when(orderMapper.selectList(any())).thenReturn(Collections.singletonList(order));
        RefundApply refundOnly = new RefundApply();
        refundOnly.setType(RefundType.REFUND.getValue());
        when(refundApplyService.getByOrderId(ORDER_ID)).thenReturn(refundOnly);

        service.handleRefundNotify2(ORDER_SN, "HF-3", PAY_AMOUNT, "S", "success");

        assertEquals(OrderState.NOT_PAY.getValue(), order.getState());
        assertEquals(RefundState.SUCCESS.getValue(), order.getRefundState());
    }

    @Test
    @DisplayName("仅退款后重新收款：微信单改记现金，并清掉上一轮退款痕迹")
    void confirmPayAfterRefundOnlyMarksCashAndClearsRefundTrace() {
        Order order = order(OrderState.NOT_PAY.getValue(), OrderPayType.WECHAT.getValue());
        order.setRefundState(RefundState.SUCCESS.getValue());
        order.setHasRefundAmount(PAY_AMOUNT);
        order.setRefundHfSeqId("HF-OLD");
        stubOrder(order);

        service.confirmPay(ORDER_ID, PAY_AMOUNT, null);

        assertEquals(OrderState.PAID_NOT_COMMENT.getValue(), order.getState());
        assertEquals(OrderPayType.CASH.getValue(), order.getPayType(), "线下重收要记现金，后面退款才走线下");
        assertNull(order.getRefundState(), "不清理的话这一单以后再也退不了");
        assertEquals(0, BigDecimal.ZERO.compareTo(order.getHasRefundAmount()));
        assertEquals("HF-OLD", order.getRefundHfSeqId(), "上一轮流水号留着，用来识别迟到的退款回调");
        assertNotNull(order.getPayTime());
    }

    @Test
    @DisplayName("仅退款后重新收款：带券号则记美团")
    void confirmPayAfterRefundOnlyWithCouponMarksMeituan() {
        Order order = order(OrderState.NOT_PAY.getValue(), OrderPayType.WECHAT.getValue());
        order.setRefundState(RefundState.SUCCESS.getValue());
        order.setHasRefundAmount(PAY_AMOUNT);
        stubOrder(order);

        service.confirmPay(ORDER_ID, PAY_AMOUNT, "MT-778899");

        assertEquals(OrderPayType.MEITUAN.getValue(), order.getPayType());
        assertEquals("MT-778899", order.getCouponCode());
        assertEquals(OrderState.PAID_NOT_COMMENT.getValue(), order.getState());
    }

    @Test
    @DisplayName("仅退款后重新收款：已完成/已取消的预约不许倒回已到店")
    void confirmPayAfterRefundOnlyKeepsSettledAppointment() {
        Order order = order(OrderState.NOT_PAY.getValue(), OrderPayType.CASH.getValue());
        order.setRefundState(RefundState.SUCCESS.getValue());
        order.setHasRefundAmount(PAY_AMOUNT);
        order.setAppointmentState(AppointmentState.FINISHED.getValue());
        stubOrder(order);

        service.confirmPay(ORDER_ID, PAY_AMOUNT, null);

        assertEquals(AppointmentState.FINISHED.getValue(), order.getAppointmentState(),
                "客人做完才退款的单，重收不能把预约改回在店");
        assertEquals(OrderState.PAID_NOT_COMMENT.getValue(), order.getState());
    }

    @Test
    @DisplayName("仅退款回到未付款：客人不再重收时门店还能把这一单取消掉")
    void cancelOrderAllowedForNotPayOrderAfterRefundOnly() {
        // 已付款的单退完钱回到未付款，预约可能还停在已到店/已完成，这里必须还能正常取消，
        // 否则这一单永远挂在看板上既不能收钱也不能关单
        Order order = order(OrderState.NOT_PAY.getValue(), OrderPayType.CASH.getValue());
        order.setRefundState(RefundState.SUCCESS.getValue());
        order.setHasRefundAmount(PAY_AMOUNT);
        order.setAppointmentState(AppointmentState.FINISHED.getValue());
        stubOrder(order);
        when(orderMapper.selectList(any())).thenReturn(Collections.singletonList(order));

        service.cancelOrder(ORDER_ID, "退款后客人不做了");

        assertEquals(OrderState.CANCELED.getValue(), order.getState());
        assertEquals(AppointmentState.CANCELED.getValue(), order.getAppointmentState());
        assertEquals("退款后客人不做了", order.getCancelReason());
        assertEquals(Integer.valueOf(0), order.getCancelOrderType(), "后台取消要记下来源");
        verify(orderDetailService).refundOrder(ORDER_ID, true);
    }

    @Test
    @DisplayName("仅退款后取消：预约还没做的单照旧给客人推取消通知")
    void cancelNotPayOrderStillNotifiesCustomerBeforeAppointment() {
        Order order = order(OrderState.NOT_PAY.getValue(), OrderPayType.CASH.getValue());
        order.setRefundState(RefundState.SUCCESS.getValue());
        order.setHasRefundAmount(PAY_AMOUNT);
        order.setAppointmentState(AppointmentState.WAITING.getValue());
        stubOrder(order);
        when(orderMapper.selectList(any())).thenReturn(Collections.singletonList(order));
        OrderService cancelSpy = spy(service);

        cancelSpy.cancelOrder(ORDER_ID, "退款后客人不做了");

        verify(cancelSpy).handleBookingCancelNotice(ORDER_ID);
    }

    @Test
    @DisplayName("仅退款后取消：服务已经做完的单只关账，不推「预约已取消」")
    void cancelNotPayOrderSkipsNoticeAfterServiceDone() {
        Order order = order(OrderState.NOT_PAY.getValue(), OrderPayType.CASH.getValue());
        order.setRefundState(RefundState.SUCCESS.getValue());
        order.setHasRefundAmount(PAY_AMOUNT);
        order.setAppointmentState(AppointmentState.FINISHED.getValue());
        stubOrder(order);
        when(orderMapper.selectList(any())).thenReturn(Collections.singletonList(order));
        OrderService cancelSpy = spy(service);

        cancelSpy.cancelOrder(ORDER_ID, "退款后客人不做了");

        assertEquals(OrderState.CANCELED.getValue(), order.getState());
        verify(cancelSpy, never()).handleBookingCancelNotice(anyLong());
    }

    @Test
    @DisplayName("第一次收款的单不动支付方式（只对回到未付款的单改）")
    void confirmPayKeepsOriginalPayTypeOnFirstCollect() {
        Order order = order(OrderState.NOT_PAY.getValue(), OrderPayType.WECHAT.getValue());
        order.setPayTime(null);
        stubOrder(order);

        service.confirmPay(ORDER_ID, PAY_AMOUNT, null);

        assertEquals(OrderPayType.WECHAT.getValue(), order.getPayType());
        assertEquals(OrderState.PAID_NOT_COMMENT.getValue(), order.getState());
    }
}