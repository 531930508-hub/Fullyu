package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Order;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class OrderCompletionPersistenceTest {
    OrderService service;CustomerCouponService coupons;Order order;
    @BeforeEach void setup() {
        service=spy(new OrderService());coupons=mock(CustomerCouponService.class);
        ReflectionTestUtils.setField(service,"customerCouponService",coupons);
        CustomerService customers=mock(CustomerService.class);
        when(customers.findReferrerCustomerId(10L)).thenReturn(null);
        ReflectionTestUtils.setField(service,"customerService",customers);
        order=new Order();order.setId(200L);order.setCustomerId(10L);order.setAppointmentState(1);order.setState(1);
        doReturn(order).when(service).getById(200L);
        doReturn(Collections.singletonList(order)).when(service).listByIds(anyCollection());
        doReturn(true).when(service).updateById(any());doReturn(true).when(service).updateBatchById(anyCollection());
    }
    @Test void failedSingleCompletionCannotQueueEntitlements() {
        doReturn(false).when(service).updateById(any());
        assertThrows(BusinessException.class,()->service.finish(200L));verifyNoInteractions(coupons);
    }
    @Test void failedBatchCompletionCannotQueueEntitlements() {
        doReturn(false).when(service).updateBatchById(anyCollection());
        assertThrows(BusinessException.class,()->service.finishBatch(Arrays.asList(200L)));verifyNoInteractions(coupons);
    }
    @Test void batchOnlyQueuesActuallyCompletedOrders() {
        service.finishBatch(Arrays.asList(200L,201L));
        verify(coupons).giveCouponOrderIdList(Collections.singletonList(200L));
    }
    @Test void paidCouponFailureCannotBeSwallowedByCallback() {
        order.setType(1);order.setIsGift(false);order.setQuantity(1);
        doThrow(new BusinessException("synthetic coupon write failure")).when(coupons).buildCouponList(any(),any(),any(),any(),any(),any());
        assertThrows(BusinessException.class,()->service.afterOrderPaid(order));
    }
    @Test void paidCallbackPreservesSnapshotInCallerBeforeSubsequentOrderWrite() {
        order.setType(1);order.setIsGift(false);order.setQuantity(1);order.setRewardMemberMonths(0);
        Order persisted=new Order();persisted.setRewardMemberMonths(2);doReturn(persisted).when(service).getById(200L);
        service.afterOrderPaid(order);assertEquals(2,order.getRewardMemberMonths());
    }
    @Test void successQueuesOnceAfterPersistence() {
        service.finish(200L);
        org.mockito.InOrder sequence=inOrder(service,coupons);
        sequence.verify(service).updateById(order);
        sequence.verify(coupons).giveCouponOrderIdList(Collections.singletonList(200L));
    }
}
