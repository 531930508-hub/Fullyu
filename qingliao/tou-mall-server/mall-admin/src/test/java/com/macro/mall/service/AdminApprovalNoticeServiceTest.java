package com.macro.mall.service;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.lang.reflect.InvocationTargetException;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminApprovalNoticeServiceTest {
    Object service,mapper;
    void setup()throws Exception {
        Class<?> type=null;try{type=Class.forName("com.macro.mall.service.AdminApprovalNoticeService");}catch(ClassNotFoundException ignored){}
        assertNotNull(type,"缺少事务型审批定向mock通知");service=type.getDeclaredConstructor().newInstance();
        mapper=mock(Class.forName("com.macro.mall.mapper.AdminApprovalNoticeMapper"),i -> Arrays.asList("attempt","finish","defer","advanceGeneration").contains(i.getMethod().getName())?1:org.mockito.Answers.RETURNS_DEFAULTS.answer(i));ReflectionTestUtils.setField(service,"mapper",mapper);
        ReflectionTestUtils.setField(service,"enabled",true);ReflectionTestUtils.setField(service,"appId","synthetic-app");ReflectionTestUtils.setField(service,"templateId","synthetic-template");ReflectionTestUtils.setField(service,"mode","mock");
        stub("lock",new Class<?>[]{Long.class},row(),1L);stub("current",new Class<?>[]{Long.class},1,1L);
        stub("activeAdmin",new Class<?>[]{Long.class},1,7L);stub("boundAndFollowing",new Class<?>[]{Long.class,String.class},1,7L,"synthetic-app");
        stub("finish",new Class<?>[]{Long.class,String.class},1,1L,"MOCK");stub("attempt",new Class<?>[]{Long.class,int.class,String.class,String.class},1,1L,1,"MOCK","synthetic-template");clearInvocations(mapper);
    }
    Map<String,Object> row(){Map<String,Object> row=new HashMap<>();row.put("id",1L);row.put("adminId",7L);row.put("attempts",0);row.put("state","PENDING");return row;}
    void stub(String name,Class<?>[] types,Object value,Object...args)throws Exception{when(mapper.getClass().getMethod(name,types).invoke(mapper,args)).thenReturn(value);}
    Object call(String name,Class<?>[] types,Object...args)throws Throwable{try{return service.getClass().getMethod(name,types).invoke(service,args);}catch(InvocationTargetException e){throw e.getCause();}}
    void process()throws Throwable{call("process",new Class<?>[]{Long.class},1L);}
    boolean used(String name,Object value){return mockingDetails(mapper).getInvocations().stream().anyMatch(i->i.getMethod().getName().equals(name)&&Arrays.asList(i.getArguments()).contains(value));}
    @Test void disabledFeatureDoesNotTouchMissingTables()throws Throwable{setup();ReflectionTestUtils.setField(service,"enabled",false);process();call("capture",new Class<?>[]{Long.class},100L);verifyNoInteractions(mapper);}
    @Test void captureOutsideTransactionFailsClosed()throws Throwable{setup();assertThrows(RuntimeException.class,()->call("capture",new Class<?>[]{Long.class},100L));verifyNoInteractions(mapper);}
    @Test void captureQueuesOnlyInsideBusinessTransactionWithoutDeliveryAttempt()throws Throwable{
        setup();TransactionSynchronizationManager.setActualTransactionActive(true);
        try{call("capture",new Class<?>[]{Long.class},100L);assertTrue(used("capture",100L));assertFalse(used("attempt",1L));}finally{TransactionSynchronizationManager.setActualTransactionActive(false);}
    }
    @Test void supersededPendingTaskDoesNotNotifyFormerApprover()throws Throwable{setup();stub("current",new Class<?>[]{Long.class},0,1L);stub("finish",new Class<?>[]{Long.class,String.class},1,1L,"SUPERSEDED");process();assertTrue(used("finish","SUPERSEDED"));assertFalse(used("boundAndFollowing",7L));}
    @Test void disabledAdminDoesNotReceiveMockNotification()throws Throwable{setup();stub("activeAdmin",new Class<?>[]{Long.class},0,7L);stub("finish",new Class<?>[]{Long.class,String.class},1,1L,"INACTIVE");process();assertTrue(used("finish","INACTIVE"));}
    @Test void missingTemplateIsRetryableNotClaimedAsSent()throws Throwable{setup();ReflectionTestUtils.setField(service,"templateId","");process();assertTrue(used("defer","NOT_CONFIGURED"));assertFalse(used("finish","MOCK"));}
    @Test void missingBindingIsRetryableAndNeverQueriesCustomerOpenId()throws Throwable{setup();stub("boundAndFollowing",new Class<?>[]{Long.class,String.class},0,7L,"synthetic-app");process();assertTrue(used("defer","NOT_BOUND"));assertFalse(used("finish","MOCK"));}
    @Test void followingBoundAdminGetsOneMockAttemptWithoutRealDelivery()throws Throwable{setup();process();assertTrue(used("attempt","MOCK"));assertTrue(used("finish","MOCK"));}
    @Test void completedMockIsNotReplayed()throws Throwable{setup();Map<String,Object> row=row();row.put("state","MOCK");stub("lock",new Class<?>[]{Long.class},row,1L);process();assertFalse(used("attempt","MOCK"));}
    @Test void liveSettingRemainsBlocked()throws Throwable{setup();ReflectionTestUtils.setField(service,"mode","live");stub("finish",new Class<?>[]{Long.class,String.class},1,1L,"LIVE_BLOCKED");process();assertTrue(used("finish","LIVE_BLOCKED"));assertFalse(used("finish","MOCK"));}
    @Test void failedQueueSettlementIsNotReportedAsSuccessful()throws Throwable{setup();stub("finish",new Class<?>[]{Long.class,String.class},0,1L,"MOCK");assertThrows(RuntimeException.class,this::process);}
    @Test void newGenerationRequiresBusinessTransaction()throws Throwable {
        setup();assertThrows(RuntimeException.class,()->call("advanceGeneration",new Class<?>[]{Long.class},100L));verifyNoInteractions(mapper);
    }
    @Test void resubmitAdvancesPersistentGenerationNotClockSeconds()throws Throwable {
        setup();TransactionSynchronizationManager.setActualTransactionActive(true);
        try{call("advanceGeneration",new Class<?>[]{Long.class},100L);assertTrue(used("advanceGeneration",100L));}finally{TransactionSynchronizationManager.setActualTransactionActive(false);}
    }
    @Test void currentNoticeChecksPersistentGeneration()throws Throwable {
        setup();Class<?> type=Class.forName("com.macro.mall.mapper.AdminApprovalNoticeMapper");
        String query=String.join("",type.getMethod("current",Long.class).getAnnotation(org.apache.ibatis.annotations.Select.class).value());
        assertTrue(query.contains("n.generation=COALESCE"),"通知必须比较持久化代际，不依赖秒级时间戳");
    }
    @Test void stoppedAdminCannotReadPersonalLogsWithStaleToken()throws Throwable {
        setup();stub("activeAdmin",new Class<?>[]{Long.class},0,7L);
        assertThrows(RuntimeException.class,()->call("logs",new Class<?>[]{Long.class,int.class,int.class},7L,1,10));assertFalse(used("logs",7L));
    }
    @Test void ownerLogPaginationRejectsAnonymousAndOversizedRequests()throws Throwable{setup();assertThrows(RuntimeException.class,()->call("logs",new Class<?>[]{Long.class,int.class,int.class},null,1,10));assertThrows(RuntimeException.class,()->call("logs",new Class<?>[]{Long.class,int.class,int.class},7L,1,101));}
    String sql(String method,Class<? extends java.lang.annotation.Annotation> kind,Class<?>...types)throws Exception{
        java.lang.annotation.Annotation a=Class.forName("com.macro.mall.mapper.AdminApprovalNoticeMapper").getMethod(method,types).getAnnotation(kind);
        return String.join("",(String[])a.annotationType().getMethod("value").invoke(a));
    }
    // 多实例同时取到同一批id时，先到者defer后，后到者的当前读看到未来时间必须跳过。
    @Test void lockOnlyClaimsRowsThatAreStillDue()throws Throwable{setup();assertTrue(sql("lock",org.apache.ibatis.annotations.Select.class,Long.class).contains("next_attempt_at<=NOW()"));}
    @Test void deferBacksOffExponentiallyUpToSixHours()throws Throwable{setup();String s=sql("defer",org.apache.ibatis.annotations.Update.class,Long.class,String.class);
        assertTrue(s.contains("LEAST(6,POW(2,attempts))"));
        // MySQL单表UPDATE从左到右赋值：必须先用旧attempts算退避，否则首次退避变成2小时。
        assertTrue(s.indexOf("next_attempt_at=")<s.indexOf("attempts=attempts+1"),s);}
    @Test void rowAlreadyClaimedByAnotherInstanceIsSkipped()throws Throwable{setup();stub("lock",new Class<?>[]{Long.class},null,1L);process();assertFalse(used("attempt",1L));assertFalse(used("defer",1L));assertFalse(used("finish",1L));}
}
