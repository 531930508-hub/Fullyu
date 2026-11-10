package com.macro.mall.service;

import com.alibaba.fastjson2.JSONObject;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PrepaidRewardIntegrationTest {
    CustomerCouponService service;
    Order source;
    Product product;
    PrepaidMemberRewardService reward;
    @BeforeEach void setup() {
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
            new org.apache.ibatis.builder.MapperBuilderAssistant(new com.baomidou.mybatisplus.core.MybatisConfiguration(), "test"),
            CustomerCoupon.class);
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
            new org.apache.ibatis.builder.MapperBuilderAssistant(new com.baomidou.mybatisplus.core.MybatisConfiguration(), "test"),
            Order.class);
        service=spy(new CustomerCouponService());service.productService=mock(ProductService.class);
        service.orderService=mock(OrderService.class);service.couponService=mock(CouponService.class);
        reward=mock(PrepaidMemberRewardService.class);
        source=new Order();source.setId(100L);source.setCustomerId(10L);
        product=new Product();product.setId(5L);product.setType(1);product.setRewardMemberMonths(2);
        when(service.productService.getById(5L)).thenReturn(product);
        when(service.orderService.getById(100L)).thenReturn(source);
        when(service.orderService.getOne(any(Wrapper.class))).thenReturn(source);
        when(service.orderService.update(any(Wrapper.class))).thenReturn(true);
        when(service.orderService.updateById(any())).thenReturn(true);
        JSONObject content=new JSONObject();content.put("couponId",7L);content.put("size",2);
        when(service.productService.getProductContent(5L)).thenReturn(Collections.singletonList(content));
        Coupon coupon=new Coupon();coupon.setId(7L);coupon.setState(1);coupon.setUseType(0);coupon.setValidDate(365);
        when(service.couponService.getCouponMap(anyList())).thenReturn(Collections.singletonMap(7L,coupon));
        doReturn(Collections.singletonList(new CustomerCoupon())).when(service).buildBatch(anyInt(),anyLong(),anyLong(),any(),anyInt(),anyLong(),any(),anyBoolean());
        doReturn(true).when(service).saveBatch(anyCollection());
        doReturn(Collections.emptyList()).when(service).list(any(Wrapper.class));
    }
    @Test void purchaseSnapshotsMonthsOncePerOrderNotPerQuantity() {
        service.buildCouponList(100L,5L,10L,false,3,new BigDecimal("1000"));
        assertEquals(2,source.getRewardMemberMonths());
        verify(service.orderService).updateById(source);
    }
    @Test void duplicatePaidCallbackCannotIssueSecondCouponPack() {
        when(service.orderService.update(any(Wrapper.class))).thenReturn(false);
        service.buildCouponList(100L,5L,10L,false,1,new BigDecimal("1000"));
        verify(service,never()).buildBatch(anyInt(),anyLong(),anyLong(),any(),anyInt(),anyLong(),any(),anyBoolean());
        verify(service,never()).saveBatch(anyCollection());
        verify(service.orderService,never()).updateById(any());
    }
    @Test void issuanceIsClaimedByConditionalOrderUpdateBeforeLockedRead() {
        service.buildCouponList(100L,5L,10L,false,1,new BigDecimal("1000"));
        org.mockito.ArgumentCaptor<Wrapper> claim=org.mockito.ArgumentCaptor.forClass(Wrapper.class);
        org.mockito.InOrder order=inOrder(service.orderService);
        order.verify(service.orderService).update(claim.capture());
        org.mockito.ArgumentCaptor<Wrapper> read=org.mockito.ArgumentCaptor.forClass(Wrapper.class);
        order.verify(service.orderService).getOne(read.capture());
        assertEquals("coupon_issued = 1",((com.baomidou.mybatisplus.core.conditions.update.Update<?,?>)claim.getValue()).getSqlSet());
        assertTrue(claim.getValue().getSqlSegment().contains("coupon_issued = 0"),"必须以未发放为条件领取");
        assertTrue(read.getValue().getSqlSegment().contains("FOR UPDATE"),"快照须读取最新订单");
        verify(service.orderService,never()).getById(100L);
    }
    @Test void paidCallbackFailureCannotSilentlySkipSnapshot() {
        when(service.orderService.updateById(any())).thenReturn(false);
        assertThrows(BusinessException.class,()->service.buildCouponList(100L,5L,10L,false,1,new BigDecimal("1000")));
    }
    @Test void failedCouponBatchCannotReportPurchasedEntitlements() {
        doReturn(false).when(service).saveBatch(anyCollection());
        assertThrows(BusinessException.class,()->service.buildCouponList(100L,5L,10L,false,1,new BigDecimal("1000")));
    }
    @Test void failedBalanceConsumptionCannotReturnConsumedCouponIds() {
        CustomerCoupon coupon=new CustomerCoupon();coupon.setId(7L);
        doReturn(Collections.singletonList(coupon)).when(service).list(any(Wrapper.class));
        doReturn(false).when(service).updateBatchById(anyCollection());
        assertThrows(BusinessException.class,()->service.useCoupon(1,10L,200L));
    }
    @Test void completionCallbackUsesRewardServiceEvenWithoutLegacyVipCoupons() {
        assertNotNull(org.springframework.util.ReflectionUtils.findField(CustomerCouponService.class,
            "prepaidMemberRewardService"),"完成消费尚未接入耗尽赠会员回调");
        ReflectionTestUtils.setField(service,"prepaidMemberRewardService",reward);
        service.giveCouponOrderIdList(Collections.singletonList(200L));
        verify(reward).onCompletedOrders(Collections.singletonList(200L));
    }
    @Test void backendRejectsNegativeGiftConfiguration() {
        ProductService products=spy(new ProductService());doReturn(null).when(products).getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class));
        product.setRewardMemberMonths(-1);
        assertThrows(BusinessException.class,()->products.verify(product));
    }
    @Test void serviceProductCannotConfigurePrepaidGift() {
        ProductService products=spy(new ProductService());doReturn(null).when(products).getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class));
        product.setType(0);
        assertThrows(BusinessException.class,()->products.verify(product));
    }
}
