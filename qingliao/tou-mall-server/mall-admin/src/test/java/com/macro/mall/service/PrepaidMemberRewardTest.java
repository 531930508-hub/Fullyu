package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.macro.mall.entity.*;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class PrepaidMemberRewardTest {
    PrepaidMemberRewardService reward;
    OrderService orders;
    CustomerCouponService coupons;
    MemberCardService members;
    Order source;
    List<CustomerCoupon> balance;
    Order usage;

    private void setup(int months) {
        reward=new PrepaidMemberRewardService();
        orders=mock(OrderService.class);coupons=mock(CustomerCouponService.class);members=mock(MemberCardService.class);
        reward.orderService=orders;reward.couponService=coupons;reward.memberCardService=members;
        source=new Order();source.setId(100L);source.setCustomerId(10L);source.setState(1);
        source.setPayAmount(new BigDecimal("1000"));source.setIsGift(false);
        source.setRewardMemberMonths(months);
        usage=new Order();usage.setId(200L);usage.setCustomerId(10L);usage.setState(1);usage.setAppointmentState(2);
        CustomerCoupon one=new CustomerCoupon();one.setId(1L);one.setOrderId(100L);one.setCustomerId(10L);
        one.setUseType(0);one.setState(0);one.setAmount(new BigDecimal("500"));
        one.setUseOrder(200L);one.setUseTime(LocalDateTime.now());
        balance=new ArrayList<>();balance.add(one);
        when(orders.getById(100L)).thenReturn(source);
        when(orders.getOne(any(Wrapper.class))).thenReturn(source);
        when(coupons.list(any(Wrapper.class))).thenAnswer(i->new ArrayList<>(balance));
        when(orders.listByIds(anyCollection())).thenAnswer(i->Collections.singletonList(usage));
    }
    private void grant() { reward.grantIfConsumed(100L); }
    private long writes() {
        return mockingDetails(members).getInvocations().stream()
            .filter(i->i.getMethod().getName().equals("grantPrepaidReward")).count();
    }
    @Test void defaultZeroNeverGrants() { setup(0);grant();assertEquals(0,writes()); }
    @Test void consumedAndCompletedGrantsConfiguredMonths() { setup(2);grant();assertEquals(1,writes()); }
    @Test void remainingCouponPreventsGift() { setup(2);balance.get(0).setState(1);grant();assertEquals(0,writes()); }
    @Test void expiryIsNotConsumption() { setup(2);balance.get(0).setState(2);grant();assertEquals(0,writes()); }
    @Test void refundedCouponIsNotConsumption() { setup(2);balance.get(0).setState(4);grant();assertEquals(0,writes()); }
    @Test void refundedServicePreventsGift() { setup(2);usage.setState(6);grant();assertEquals(0,writes()); }
    @Test void notCompletedPreventsGift() { setup(2);usage.setAppointmentState(1);grant();assertEquals(0,writes()); }
    @Test void refundedSourcePreventsGift() { setup(2);source.setState(6);grant();assertEquals(0,writes()); }
    @Test void transferDoesNotGiftToWrongOwner() { setup(2);balance.get(0).setCustomerId(11L);grant();assertEquals(0,writes()); }
    @Test void noCouponsNeverGrants() { setup(2);balance.clear();grant();assertEquals(0,writes()); }
    @Test void freeSourceNeverGrants() { setup(2);source.setPayAmount(BigDecimal.ZERO);grant();assertEquals(0,writes()); }
    @Test void giftedSourceNeverGrants() { setup(2);source.setIsGift(true);grant();assertEquals(0,writes()); }
    @Test void partiallyRefundedSourceNeverGrants() { setup(2);source.setHasRefundAmount(new BigDecimal("1"));grant();assertEquals(0,writes()); }
    @Test void partiallyRefundedConsumptionNeverGrants() { setup(2);usage.setHasRefundAmount(new BigDecimal("1"));grant();assertEquals(0,writes()); }
    @Test void consumptionForAnotherCustomerCannotProveDepletion() { setup(2);usage.setCustomerId(11L);grant();assertEquals(0,writes()); }
    private void multiQuantityPack(int lastState) {
        setup(2);source.setQuantity(3);
        Order later=new Order();later.setId(201L);later.setCustomerId(10L);later.setState(1);later.setAppointmentState(2);
        for(long id=2;id<=3;id++){CustomerCoupon c=new CustomerCoupon();c.setId(id);c.setOrderId(100L);c.setCustomerId(10L);
            c.setUseType(0);c.setState(id==3?lastState:0);c.setUseOrder(201L);c.setUseTime(LocalDateTime.now());balance.add(c);}
        when(orders.listByIds(anyCollection())).thenAnswer(i->Arrays.asList(usage,later));
        grant();
    }
    @Test void multiQuantityPackGrantsConfiguredMonthsOncePerOrder() {
        multiQuantityPack(0);assertEquals(1,writes());verify(members).grantPrepaidReward(source,2);
    }
    @Test void multiQuantityPackWithOneCouponLeftPreventsGift() { multiQuantityPack(1);assertEquals(0,writes()); }
    @Test void missingUseTimeIsNotConsumption() { setup(2);balance.get(0).setUseTime(null);grant();assertEquals(0,writes()); }
}
