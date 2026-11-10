package com.macro.mall.service;

import com.macro.mall.common.exception.BusinessException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.lang.reflect.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PrepaidRewardQueueTest {
    PrepaidMemberRewardService service;
    Object mapper;
    Class<?> mapperType;
    private void setup() throws Exception {
        mapperType=null;
        try {mapperType=Class.forName("com.macro.mall.mapper.PrepaidMemberRewardMapper");}catch(ClassNotFoundException ignored){}
        assertNotNull(mapperType,"缺少消费提交后持久化赠月任务");
        mapper=mock(mapperType);service=spy(new PrepaidMemberRewardService());
        ReflectionTestUtils.setField(service,"mapper",mapper);
        ReflectionTestUtils.setField(service,"enabled",true);
    }
    private Object call(Object target,String method,Class<?> parameter,Object value)throws Exception {
        try{return target.getClass().getMethod(method,parameter).invoke(target,value);}
        catch(InvocationTargetException e){if(e.getCause() instanceof RuntimeException)throw (RuntimeException)e.getCause();throw e;}
    }
    @AfterEach void clear(){TransactionSynchronizationManager.clear();}
    @Test void disabledFeatureDoesNotReadRewardTables()throws Exception {
        setup();ReflectionTestUtils.setField(service,"enabled",false);
        service.onCompletedOrders(Arrays.asList(2L));verifyNoInteractions(mapper);
    }
    @Test void captureRequiresBusinessTransaction()throws Exception {
        setup();assertThrows(BusinessException.class,()->service.onCompletedOrders(Arrays.asList(2L)));
        verifyNoInteractions(mapper);
    }
    @Test void completionQueuesUniqueOrdersWithoutGrantingInsideCompletion()throws Exception {
        setup();TransactionSynchronizationManager.setActualTransactionActive(true);
        when(call(mapper,"queue",Long.class,2L)).thenReturn(1);
        service.onCompletedOrders(Arrays.asList(2L,2L));
        call(verify(mapper,times(1)),"queue",Long.class,2L);
        verify(service,never()).grantIfConsumed(anyLong());
    }
    @Test void queueSqlUsesActualCouponEntityTable()throws Exception {
        setup();String actual=com.macro.mall.entity.CustomerCoupon.class.getAnnotation(com.baomidou.mybatisplus.annotation.TableName.class).value();
        String sql=mapperType.getMethod("queue",Long.class).getAnnotation(org.apache.ibatis.annotations.Insert.class).value()[0];
        assertTrue(sql.contains("FROM "+actual+" c"),"队列必须关联真实客户券表");
    }
    @Test void processRunsInIndependentReadCommittedTransaction()throws Exception {
        setup();Transactional tx=PrepaidMemberRewardService.class.getMethod("process",Long.class).getAnnotation(Transactional.class);
        assertNotNull(tx);assertEquals(Propagation.REQUIRES_NEW,tx.propagation());assertEquals(Isolation.READ_COMMITTED,tx.isolation());
    }
    @Test void committedTaskEvaluatesAndFinishesAtomically()throws Exception {
        setup();when(call(mapper,"lock",Long.class,100L)).thenReturn("PENDING");
        when(call(mapper,"finish",Long.class,100L)).thenReturn(1);
        doNothing().when(service).grantIfConsumed(100L);
        call(service,"process",Long.class,100L);
        org.mockito.InOrder order=inOrder(mapper,service);
        call(order.verify(mapper),"lock",Long.class,100L);
        order.verify(service).grantIfConsumed(100L);
        call(order.verify(mapper),"finish",Long.class,100L);
    }
    @Test void failedGrantDoesNotConsumeTask()throws Exception {
        setup();when(call(mapper,"lock",Long.class,100L)).thenReturn("PENDING");
        doThrow(new BusinessException("synthetic write failure")).when(service).grantIfConsumed(100L);
        assertThrows(BusinessException.class,()->call(service,"process",Long.class,100L));
        call(verify(mapper,never()),"finish",Long.class,100L);
    }
    @Test void failedTaskFinalizationFailsClosed()throws Exception {
        setup();when(call(mapper,"lock",Long.class,100L)).thenReturn("PENDING");
        doNothing().when(service).grantIfConsumed(100L);
        assertThrows(BusinessException.class,()->call(service,"process",Long.class,100L));
    }
    @Test void completedOrMissingTaskIsNotGrantedAgain()throws Exception {
        setup();when(call(mapper,"lock",Long.class,100L)).thenReturn("DONE");
        call(service,"process",Long.class,100L);verify(service,never()).grantIfConsumed(anyLong());
    }
}
