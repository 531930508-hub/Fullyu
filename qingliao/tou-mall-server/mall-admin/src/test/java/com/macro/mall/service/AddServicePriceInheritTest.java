package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.CheckoutData;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.OrderDetail;
import com.macro.mall.entity.OrderDiscount;
import com.macro.mall.entity.Product;
import com.macro.mall.enums.OrderState;
import com.macro.mall.enums.OrderType;
import com.macro.mall.mapper.OrderMapper;
import com.macro.mall.membercard.calc.MemberCardPriceEngine;
import com.macro.mall.membercard.dto.MemberCardPriceOption;
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
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 加钟单结算：优惠方案必须沿用原单，不能自己再算一次（原单走券，加钟又被判成新客价就是这里的问题）。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AddServicePriceInheritTest {

    private static final long ADD_ORDER_ID = 100L;
    private static final long ORIGIN_ORDER_ID = 99L;

    @Mock
    private OrderMapper orderMapper;
    @Mock
    private ProductService productService;
    @Mock
    private OrderDiscountService orderDiscountService;
    @Mock
    private IntegrationService integrationService;
    @Mock
    private MemberCardService memberCardService;
    @Mock
    private CustomerCouponService customerCouponService;
    @Mock
    private OrderDetailService orderDetailService;

    @InjectMocks
    private OrderService service;

    @BeforeEach
    void setUp() {
        // updatePriceFields 用 LambdaUpdateWrapper，需要 TableInfo 缓存，单测里手动初始化
        MybatisConfiguration configuration = new MybatisConfiguration();
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(configuration, ""), Order.class);
        when(orderMapper.update(any(), any())).thenReturn(1);
        Product product = new Product();
        product.setAmount(BigDecimal.valueOf(300));
        lenient().when(productService.getProductLimit(anyLong())).thenReturn(product);
        lenient().when(orderDiscountService.getDiscountByCount(anyLong(), anyLong(), any(), any())).thenReturn(null);
        lenient().when(integrationService.getIntegrationByCustomerId(anyLong())).thenReturn(0L);
        lenient().when(memberCardService.getActiveCard(anyLong())).thenReturn(null);
        lenient().when(memberCardService.renewalView(anyLong())).thenReturn(null);
        lenient().when(orderDetailService.listByOrderId(ADD_ORDER_ID)).thenReturn(Collections.singletonList(detail()));
    }

    @Test
    void addServiceKeepsCouponPlanOfOriginOrder() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(5);
        givenOrigin(originOrder(MemberCardPriceEngine.SOURCE_COUPON));

        CheckoutData data = service.getCheckoutData(42L, ADD_ORDER_ID);

        assertEquals(MemberCardPriceEngine.SOURCE_COUPON, data.getSelectedPriceSource());
        assertEquals(0, BigDecimal.ZERO.compareTo(data.getOrder().getPayAmount()));
        assertEquals(1, data.getPriceOptions().size());
        MemberCardPriceOption option = data.getPriceOptions().get(0);
        assertEquals(MemberCardPriceEngine.SOURCE_COUPON, option.getSource());
        // 60 分钟 = 2 张券
        assertEquals(2, option.getCouponCost());
    }

    @Test
    void addServiceFallsBackToBasePriceWhenCouponsRunOut() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(0);
        givenOrigin(originOrder(MemberCardPriceEngine.SOURCE_COUPON));

        CheckoutData data = service.getCheckoutData(42L, ADD_ORDER_ID);

        // 券不够就不再默认选券，也不把应付改成 0，客户按原价这笔钱在结算页可自由换方案
        assertNull(data.getSelectedPriceSource());
        assertEquals(0, data.getOrder().getTotalAmount().compareTo(data.getOrder().getPayAmount()));
        assertTrue(data.getPriceOptions().get(0).getAvailable() != null
                && !data.getPriceOptions().get(0).getAvailable());
        assertTrue(data.getPriceOptions().get(0).getUnavailableReason().contains("券"));
    }

    @Test
    void addServiceKeepsDiscountOfOriginOrder() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(0);
        Order origin = originOrder(MemberCardPriceEngine.SOURCE_DISCOUNT);
        origin.setDiscount(85);
        origin.setDiscountType(1);
        givenOrigin(origin);

        CheckoutData data = service.getCheckoutData(42L, ADD_ORDER_ID);

        assertEquals(MemberCardPriceEngine.SOURCE_DISCOUNT, data.getSelectedPriceSource());
        // 300 * 8.5折 = 255.00
        assertEquals(0, new BigDecimal("255.00").compareTo(data.getOrder().getPayAmount()));
        assertEquals(Integer.valueOf(85), data.getOrder().getDiscount());
        assertEquals(Integer.valueOf(1), data.getOrder().getDiscountType());
    }

    @Test
    void normalOrderWithoutOriginIsUnaffected() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(5);
        OrderDetail plain = detail();
        plain.setFromOrderId(0);
        when(orderDetailService.listByOrderId(ADD_ORDER_ID)).thenReturn(Collections.singletonList(plain));
        when(orderMapper.selectById(ADD_ORDER_ID)).thenReturn(order(MemberCardPriceEngine.SOURCE_COUPON, null));

        CheckoutData data = service.getCheckoutData(42L, ADD_ORDER_ID);

        // 普通单仍然走四选一，不会被「沿用原单」锁死
        assertTrue(data.getPriceOptions().size() >= 1);
    }

    @Test
    void addServiceInheritsMemberPriceOfOriginOrder() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(0);
        Order origin = originOrder(MemberCardPriceEngine.SOURCE_CARD_ADVANCE);
        origin.setMemberRate(new BigDecimal("0.7800"));
        origin.setMemberCardId(7L);
        givenOrigin(origin);

        CheckoutData data = service.getCheckoutData(42L, ADD_ORDER_ID);

        //原单提前预约享了会员价：当天加钟不再被「必须提前预约」拦住
        assertEquals(MemberCardPriceEngine.SOURCE_CARD_ADVANCE, data.getSelectedPriceSource());
        assertEquals(0, new BigDecimal("234.00").compareTo(data.getOrder().getPayAmount()));
        assertEquals(0, new BigDecimal("0.7800").compareTo(data.getOrder().getMemberRate()));
        assertEquals("沿用原单会员价（7.8折）", sourceOption(data, MemberCardPriceEngine.SOURCE_CARD_ADVANCE).getLabel());
    }

    @Test
    void addServiceInfersMemberPriceWhenOriginOrderHasNoPriceSource() {
        //前台建的加钟原单没有 price_source，只能靠落单时写下的 member_rate 反推
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(0);
        Order origin = originOrder(null);
        origin.setMemberRate(new BigDecimal("0.7800"));
        origin.setMemberCardId(7L);
        givenOrigin(origin);

        CheckoutData data = service.getCheckoutData(42L, ADD_ORDER_ID);

        assertEquals(MemberCardPriceEngine.SOURCE_CARD_ADVANCE, data.getSelectedPriceSource());
        assertEquals(0, new BigDecimal("234.00").compareTo(data.getOrder().getPayAmount()));
    }

    @Test
    void addServiceDoesNotRegrantNewCustomerDiscount() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(0);
        //即使实时折扣查得到（新客 5 折），加钟也不能再享受一次
        OrderDiscount newCustomerDiscount = new OrderDiscount();
        newCustomerDiscount.setType(1);
        newCustomerDiscount.setDiscount(50);
        when(orderDiscountService.getDiscountByCount(anyLong(), anyLong(), any(), any()))
                .thenReturn(newCustomerDiscount);
        givenOrigin(originOrder(MemberCardPriceEngine.SOURCE_COUPON));

        CheckoutData data = service.getCheckoutData(42L, ADD_ORDER_ID);

        assertEquals(0, data.getOrder().getTotalAmount().compareTo(data.getOrder().getPayAmount()));
        assertNull(data.getOrder().getDiscount());
        verify(orderDiscountService, never()).getDiscountByCount(anyLong(), anyLong(), any(), any());
    }

    @Test
    void addServiceRefusesCanceledOriginOrder() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(5);
        Order origin = originOrder(MemberCardPriceEngine.SOURCE_COUPON);
        origin.setState(OrderState.CANCELED.getValue());
        givenOrigin(origin);

        //原单已取消，券也退回去了：加钟不能静默按原价算，要让前台重新下单
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.getCheckoutData(42L, ADD_ORDER_ID));
        assertTrue(ex.getMessage().contains("已取消"));
    }

    @Test
    void addServiceRefusesRefundedOriginOrder() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(0);
        Order origin = originOrder(MemberCardPriceEngine.SOURCE_DISCOUNT);
        origin.setDiscount(85);
        origin.setDiscountType(1);
        origin.setState(OrderState.REFUNDED.getValue());
        givenOrigin(origin);

        //退款时优惠已经冲回，加钟再继承一次 8.5 折就是重复让利
        assertThrows(BusinessException.class, () -> service.getCheckoutData(42L, ADD_ORDER_ID));
    }

    @Test
    void addServiceRefusesUnpaidOriginOrder() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(0);
        Order origin = originOrder(MemberCardPriceEngine.SOURCE_CARD_ADVANCE);
        origin.setMemberRate(new BigDecimal("0.7800"));
        origin.setMemberCardId(7L);
        origin.setState(OrderState.NOT_PAY.getValue());
        givenOrigin(origin);

        assertThrows(BusinessException.class, () -> service.getCheckoutData(42L, ADD_ORDER_ID));
    }

    @Test
    void addServiceRefusesMissingOriginOrder() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(0);
        when(orderMapper.selectById(ADD_ORDER_ID)).thenReturn(order(null, null));
        when(orderMapper.selectById(ORIGIN_ORDER_ID)).thenReturn(null);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.getCheckoutData(42L, ADD_ORDER_ID));
        assertTrue(ex.getMessage().contains("原订单不存在"));
    }

    @Test
    void addServiceRefusesOriginOrderOfAnotherCustomer() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(0);
        Order origin = originOrder(MemberCardPriceEngine.SOURCE_COUPON);
        origin.setCustomerId(43L);
        givenOrigin(origin);

        //from_order_id 是前端传的：挂到别人的单上继承会员价比原单作废更该拦
        assertThrows(BusinessException.class, () -> service.getCheckoutData(42L, ADD_ORDER_ID));
    }

    @Test
    void addServiceRefusesOriginOrderOfAnotherShop() {
        when(customerCouponService.getCouponCountByCustomerId(anyLong())).thenReturn(0);
        Order origin = originOrder(MemberCardPriceEngine.SOURCE_COUPON);
        origin.setShopId(2L);
        givenOrigin(origin);

        assertThrows(BusinessException.class, () -> service.getCheckoutData(42L, ADD_ORDER_ID));
    }

    private MemberCardPriceOption sourceOption(CheckoutData data, int source) {
        return data.getPriceOptions().stream()
                .filter(option -> option.getSource() != null && option.getSource() == source)
                .findFirst().orElseThrow(() -> new AssertionError("缺少方案 " + source));
    }

    private void givenOrigin(Order origin) {
        // getById 走 baseMapper.selectById
        when(orderMapper.selectById(ADD_ORDER_ID)).thenReturn(order(null, null));
        when(orderMapper.selectById(ORIGIN_ORDER_ID)).thenReturn(origin);
    }

    private Order order(Integer priceSource, Integer state) {
        Order order = new Order();
        order.setId(ADD_ORDER_ID);
        order.setType(OrderType.PRODUCT.getValue());
        order.setCustomerId(42L);
        order.setShopId(1L);
        order.setProductId(2L);
        order.setTotalAmount(new BigDecimal("300.00"));
        order.setPayAmount(new BigDecimal("300.00"));
        order.setVisitNo(3);
        order.setState(state == null ? OrderState.NOT_PAY.getValue() : state);
        order.setPriceSource(priceSource);
        order.setUseIntegrationState(0);
        return order;
    }

    private Order originOrder(int priceSource) {
        Order origin = order(priceSource, OrderState.PAID_NOT_COMMENT.getValue());
        origin.setId(ORIGIN_ORDER_ID);
        return origin;
    }

    private OrderDetail detail() {
        OrderDetail detail = new OrderDetail();
        detail.setOrderId(ADD_ORDER_ID);
        detail.setShopId(1L);
        detail.setDuration(60);
        detail.setStartTime(LocalDateTime.of(2026, 11, 16, 10, 0));
        detail.setEndTime(detail.getStartTime().plusMinutes(60));
        detail.setFromOrderId(ORIGIN_ORDER_ID);
        return detail;
    }
}