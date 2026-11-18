package com.macro.mall.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.macro.mall.common.exception.ApiException;
import com.macro.mall.entity.Integration;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.enums.OrderPayType;
import com.macro.mall.enums.OrderState;
import com.macro.mall.enums.OrderType;
import com.macro.mall.mapper.OrderMapper;
import com.macro.mall.membercard.calc.MemberCardPriceEngine;
import com.macro.mall.service.shop.ShopService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 0 元单结清时「券到底要不要核销」只认用户在结算页选中的优惠来源。
 * 拿不到用户意图（老客户端、合并支付）就宁可让订单超时取消，也不能静默扣券。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OrderSettleZeroIntentTest {

    private static final long ORDER_ID = 7001L;
    private static final long CUSTOMER_ID = 42L;

    @Mock
    private OrderMapper orderMapper;
    @Mock
    private ProductService productService;
    @Mock
    private IntegrationService integrationService;
    @Mock
    private CustomerCouponService customerCouponService;
    @Mock
    private OrderDetailService orderDetailService;
    @Mock
    private ShopService shopService;
    @Mock
    private WxMpTemplateMessageService wxMpTemplateMessageService;

    @InjectMocks
    private OrderService service;

    @BeforeEach
    void setUp() {
        // updateById 用 LambdaUpdateWrapper 之外的表信息，单测里手动初始化
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), Order.class);
        lenient().when(orderMapper.updateById(any())).thenReturn(1);
        lenient().when(orderDetailService.listByOrderId(ORDER_ID))
                .thenReturn(Collections.singletonList(detail()));
        lenient().when(customerCouponService.getCouponCountByCustomerId(CUSTOMER_ID)).thenReturn(5);
        lenient().when(customerCouponService.useCoupon(anyInt(), anyLong(), anyLong()))
                .thenReturn(Arrays.asList(11L, 12L));
        lenient().when(shopService.findNameById(anyLong())).thenReturn("测试门店");
        lenient().when(shopService.findAddressById(anyLong())).thenReturn("测试地址");
    }

    @Test
    void couponZeroOrderWithoutClientIntentIsNotSettled() {
        Order order = zeroOrder(MemberCardPriceEngine.SOURCE_COUPON);
        when(orderMapper.selectById(ORDER_ID)).thenReturn(order);

        // 老客户端 / 合并支付传不上来用户选了什么：不能猜成券
        assertFalse(service.settleZeroOrder(CUSTOMER_ID, ORDER_ID, null));

        verify(customerCouponService, never()).useCoupon(anyInt(), anyLong(), anyLong());
        assertEquals(OrderState.NOT_PAY.getValue(), order.getState());
    }

    @Test
    void couponZeroOrderSettlesWhenClientExplicitlyPickedCoupon() {
        Order order = zeroOrder(MemberCardPriceEngine.SOURCE_COUPON);
        when(orderMapper.selectById(ORDER_ID)).thenReturn(order);

        assertTrue(service.settleZeroOrder(CUSTOMER_ID, ORDER_ID, MemberCardPriceEngine.SOURCE_COUPON));

        // 60 分钟 = 2 张券，核销和置为已支付一起落下
        verify(customerCouponService).useCoupon(2, CUSTOMER_ID, ORDER_ID);
        assertEquals(OrderState.PAID_NOT_COMMENT.getValue(), order.getState());
        assertEquals(OrderPayType.COUPON.getValue(), order.getPayType());
        assertEquals(0, BigDecimal.ZERO.compareTo(order.getPayAmount()));
    }

    @Test
    void couponZeroOrderRefusesIntentThatDoesNotMatchOrder() {
        // 界面上显示的是折扣价，服务端订单还停在券上：先让客户端刷新，不能按猜的口径扣券
        Order order = zeroOrder(MemberCardPriceEngine.SOURCE_COUPON);
        when(orderMapper.selectById(ORDER_ID)).thenReturn(order);

        ApiException ex = assertThrows(ApiException.class,
                () -> service.settleZeroOrder(CUSTOMER_ID, ORDER_ID, MemberCardPriceEngine.SOURCE_DISCOUNT));

        assertTrue(ex.getMessage().contains("刷新"));
        verify(customerCouponService, never()).useCoupon(anyInt(), anyLong(), anyLong());
    }

    @Test
    void discountZeroOrderStillSettlesWithoutIntent() {
        // 非券来源本来就不该收钱：老客户端只调 OrderSplit 也要能结清，别把人卡在未支付
        Order order = zeroOrder(MemberCardPriceEngine.SOURCE_DISCOUNT);
        when(orderMapper.selectById(ORDER_ID)).thenReturn(order);

        assertTrue(service.settleZeroOrder(CUSTOMER_ID, ORDER_ID, null));

        assertEquals(OrderState.PAID_NOT_COMMENT.getValue(), order.getState());
        verify(customerCouponService, never()).useCoupon(anyInt(), anyLong(), anyLong());
    }

    @Test
    void alreadyPaidOrderIsIdempotent() {
        Order order = zeroOrder(MemberCardPriceEngine.SOURCE_COUPON);
        order.setState(OrderState.PAID_NOT_COMMENT.getValue());
        order.setPayType(OrderPayType.COUPON.getValue());
        when(orderMapper.selectById(ORDER_ID)).thenReturn(order);

        // 积分全额抵扣时 jifenPayOrder 已经结清，再调一次不能再扣一次券
        assertTrue(service.settleZeroOrder(CUSTOMER_ID, ORDER_ID, MemberCardPriceEngine.SOURCE_COUPON));

        verify(customerCouponService, never()).useCoupon(anyInt(), anyLong(), anyLong());
    }

    @Test
    void orderWithCashLeftIsNotSettledHere() {
        Order order = zeroOrder(MemberCardPriceEngine.SOURCE_POINTS);
        order.setPayAmount(new BigDecimal("120.00"));
        when(orderMapper.selectById(ORDER_ID)).thenReturn(order);

        // 还有现金要走微信支付，结清接口直接放行给收银台
        assertFalse(service.settleZeroOrder(CUSTOMER_ID, ORDER_ID, MemberCardPriceEngine.SOURCE_POINTS));
        assertEquals(OrderState.NOT_PAY.getValue(), order.getState());
    }

    @Test
    void pointsCannotSettleCouponOrderInsteadOfUsingCoupon() {
        // 券单 + 勾了积分（历史数据里存在）：积分把应付抵成 0 也不能直接置为已支付，
        // 否则订单显示已付、券却没核销，等于白送一单
        Order order = zeroOrder(MemberCardPriceEngine.SOURCE_COUPON);
        order.setPayAmount(new BigDecimal("10.00"));
        order.setUseIntegrationState(1);
        when(orderMapper.selectById(ORDER_ID)).thenReturn(order);
        Integration integration = new Integration();
        integration.setScore(10L);
        when(integrationService.useIntegration(anyLong(), anyLong(), any())).thenReturn(integration);

        service.jifenPayOrder(CUSTOMER_ID, ORDER_ID);

        assertEquals(OrderState.NOT_PAY.getValue(), order.getState());
        verify(customerCouponService, never()).useCoupon(anyInt(), anyLong(), anyLong());
    }

    private Order zeroOrder(Integer priceSource) {
        Order order = new Order();
        order.setId(ORDER_ID);
        order.setType(OrderType.PRODUCT.getValue());
        order.setCustomerId(CUSTOMER_ID);
        order.setShopId(1L);
        order.setProductId(2L);
        order.setCode("FY7001");
        order.setProductTitle("全身舒缓 60 分钟");
        order.setState(OrderState.NOT_PAY.getValue());
        order.setPriceSource(priceSource);
        order.setTotalAmount(new BigDecimal("300.00"));
        order.setBenefitAmount(new BigDecimal("300.00"));
        order.setPayAmount(BigDecimal.ZERO);
        order.setIntegrationAmount(BigDecimal.ZERO);
        order.setUseIntegrationState(0);
        return order;
    }

    private OrderDetail detail() {
        OrderDetail detail = new OrderDetail();
        detail.setOrderId(ORDER_ID);
        detail.setShopId(1L);
        detail.setDuration(60);
        detail.setStartTime(LocalDateTime.of(2026, 11, 16, 10, 0));
        detail.setEndTime(LocalDateTime.of(2026, 11, 16, 11, 0));
        return detail;
    }
}
