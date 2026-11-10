package com.macro.mall.service;

import com.macro.mall.entity.CustomerCoupon;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.InvocationTargetException;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CustomerNoticeScheduledTest {
    Object job; Object mapper; CustomerNoticeService notices;
    final LocalDate today = LocalDate.of(2026,11,8);
    void setup() throws Exception {
        Class<?> type;
        try { type=Class.forName("com.macro.mall.service.job.CustomerNoticeScheduled"); }
        catch (ClassNotFoundException e) { type=null; }
        assertNotNull(type,"缺少分页到期提醒调度"); job=type.getDeclaredConstructor().newInstance();
        mapper=mock(Class.forName("com.macro.mall.mapper.CustomerNoticeMapper")); notices=mock(CustomerNoticeService.class);
        when(notices.isEnabled()).thenReturn(true);
        ReflectionTestUtils.setField(job,"mapper",mapper); ReflectionTestUtils.setField(job,"notices",notices);
    }
    void due(Long afterId,List<CustomerCoupon> coupons) throws Exception {
        Object result=mapper.getClass().getMethod("dueCoupons",Long.class,LocalDate.class,LocalDate.class,LocalDate.class,int.class)
            .invoke(mapper,afterId,today,today.plusDays(5),today.plusDays(3),100);
        when(result).thenReturn(coupons);
    }
    void poll() throws Exception {
        job.getClass().getMethod("poll",LocalDate.class).invoke(job,today);
    }
    CustomerCoupon coupon(Long id) { CustomerCoupon c=new CustomerCoupon(); c.setId(id); return c; }
    @Test void disabledJobDoesNotQueryTables() throws Exception {
        setup(); when(notices.isEnabled()).thenReturn(false); poll(); verifyNoInteractions(mapper);
    }
    @Test void oneFailureDoesNotBlockNextCouponOrNextPage() throws Exception {
        setup(); CustomerCoupon a=coupon(9L),b=coupon(10L),c=coupon(11L);
        due(0L,Arrays.asList(a,b)); due(10L,Collections.singletonList(c)); due(11L,Collections.emptyList());
        doThrow(new IllegalStateException("synthetic failure")).when(notices).notifyCoupon(a,today);
        poll(); verify(notices).notifyCoupon(b,today); verify(notices).notifyCoupon(c,today);
    }
    @Test void scanUsesStableCursorInsteadOfGrowingOffset() throws Exception {
        setup(); due(0L,Collections.singletonList(coupon(900L))); due(900L,Collections.emptyList()); poll();
        assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i ->
            i.getMethod().getName().equals("dueCoupons") && i.getArguments()[0].equals(900L) && i.getArguments()[4].equals(100)));
    }
}
