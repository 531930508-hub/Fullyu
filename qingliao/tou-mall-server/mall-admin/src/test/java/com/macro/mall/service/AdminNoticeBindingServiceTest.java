package com.macro.mall.service;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.InvocationTargetException;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminNoticeBindingServiceTest {
    Object service, mapper;
    final LocalDateTime now=LocalDateTime.of(2026,11,8,12,0);
    final String nonce="abcdefghijklmnopqrstuvwxyz123456";
    void setup() throws Exception {
        Class<?> type=null;
        try { type=Class.forName("com.macro.mall.service.AdminNoticeBindingService"); } catch(ClassNotFoundException ignored) { }
        assertNotNull(type,"缺少后台人员独立服务号绑定服务");
        service=type.getDeclaredConstructor().newInstance();
        mapper=mock(Class.forName("com.macro.mall.mapper.AdminNoticeBindingMapper"),i -> Arrays.asList("insertChallenge","insertBinding","updateBinding","candidate","audit").contains(i.getMethod().getName()) ? 1 : org.mockito.Answers.RETURNS_DEFAULTS.answer(i));
        ReflectionTestUtils.setField(service,"mapper",mapper);
        ReflectionTestUtils.setField(service,"enabled",true);
        ReflectionTestUtils.setField(service,"appId","synthetic-app");
        ReflectionTestUtils.setField(service,"clock",Clock.fixed(now.atZone(ZoneId.of("Asia/Shanghai")).toInstant(),ZoneId.of("Asia/Shanghai")));
        stub("activeAdmin",new Class<?>[]{Long.class},1,7L);
        stub("lockAdmin",new Class<?>[]{Long.class},1,7L);
        stub("binding",new Class<?>[]{Long.class,String.class},null,7L,"synthetic-app");
        stub("lockChallenge",new Class<?>[]{String.class},challenge(),hash());
        stub("consume",new Class<?>[]{String.class},1,hash());
        clearInvocations(mapper);
    }
    String hash() throws Exception { StringBuilder out=new StringBuilder();for(byte b:java.security.MessageDigest.getInstance("SHA-256").digest(nonce.getBytes(java.nio.charset.StandardCharsets.UTF_8)))out.append(String.format("%02x",b&255));return out.toString(); }
    Object call(String name,Class<?>[] types,Object...args) throws Throwable {
        try { return service.getClass().getMethod(name,types).invoke(service,args); }
        catch(InvocationTargetException e) { throw e.getCause(); }
    }
    void stub(String name,Class<?>[] types,Object value,Object...args)throws Exception {
        when(mapper.getClass().getMethod(name,types).invoke(mapper,args)).thenReturn(value);
    }
    Map<String,Object> challenge() {
        Map<String,Object> row=new HashMap<>();row.put("adminId",7L);row.put("appId","synthetic-app");row.put("expiresAt",now.plusMinutes(10));
        row.put("candidateOpenId","synthetic-open-id");row.put("candidateFollowing",1);row.put("eventAt",now);return row;
    }
    final Class<?>[] confirmTypes={Long.class,String.class};
    final Class<?>[] eventTypes={String.class,String.class,String.class,String.class,LocalDateTime.class};
    void event(String type,String scene,LocalDateTime time)throws Throwable {
        call("acceptVerifiedEvent",eventTypes,"synthetic-app","synthetic-open-id",type,scene,time);
    }
    @Test void disabledFeatureNeverTouchesTablesOrExternalService()throws Throwable {
        setup();ReflectionTestUtils.setField(service,"enabled",false);
        event("SCAN","admin_notice_"+nonce,now);verifyNoInteractions(mapper);
    }
    @Test void anonymousCannotBeginBinding()throws Throwable {
        setup();assertThrows(RuntimeException.class,()->call("begin",new Class<?>[]{Long.class},null));verifyNoInteractions(mapper);
    }
    @Test void disabledAdminCannotBeginBinding()throws Throwable {
        setup();stub("activeAdmin",new Class<?>[]{Long.class},0,7L);
        assertThrows(RuntimeException.class,()->call("begin",new Class<?>[]{Long.class},7L));
    }
    @Test void challengeStoresOnlyHashAndCannotPretendQrIsReady()throws Throwable {
        setup();Map<?,?> result=(Map<?,?>)call("begin",new Class<?>[]{Long.class},7L);
        assertEquals(false,result.get("qrAvailable"));String scene=result.get("scene").toString();assertTrue(scene.startsWith("admin_notice_"));
        assertTrue(mockingDetails(mapper).getInvocations().stream().filter(i->i.getMethod().getName().equals("insertChallenge"))
            .noneMatch(i->Arrays.asList(i.getArguments()).contains(scene.substring(13))));
    }
    @Test void anotherAdminCannotConfirmChallenge()throws Throwable {
        setup();Map<String,Object> row=challenge();row.put("adminId",99L);stub("lockChallenge",new Class<?>[]{String.class},row,hash());
        assertThrows(RuntimeException.class,()->call("confirm",confirmTypes,7L,nonce));
    }
    @Test void expiredChallengeCannotBind()throws Throwable {
        setup();Map<String,Object> row=challenge();row.put("expiresAt",now);stub("lockChallenge",new Class<?>[]{String.class},row,hash());
        assertThrows(RuntimeException.class,()->call("confirm",confirmTypes,7L,nonce));
    }
    @Test void confirmationRequiresVerifiedScanAndFollowing()throws Throwable {
        setup();Map<String,Object> row=challenge();row.put("candidateOpenId",null);stub("lockChallenge",new Class<?>[]{String.class},row,hash());
        assertThrows(RuntimeException.class,()->call("confirm",confirmTypes,7L,nonce));
        row.put("candidateOpenId","synthetic-open-id");row.put("candidateFollowing",0);
        assertThrows(RuntimeException.class,()->call("confirm",confirmTypes,7L,nonce));
    }
    @Test void successfulConfirmationConsumesOnceAndAuditsWithoutIdentityPayload()throws Throwable {
        setup();call("confirm",confirmTypes,7L,nonce);
        assertEquals(1,mockingDetails(mapper).getInvocations().stream().filter(i->i.getMethod().getName().equals("consume")).count());
        assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i->i.getMethod().getName().equals("audit")&&Arrays.asList(i.getArguments()).contains("BOUND")));
    }
    @Test void staleEventsAndWrongAppCannotChangeBinding()throws Throwable {
        setup();event("SCAN","admin_notice_"+nonce,now.minusMinutes(6));
        call("acceptVerifiedEvent",eventTypes,"other-app","synthetic-open-id","SCAN","admin_notice_"+nonce,now);verifyNoInteractions(mapper);
    }
    @Test void scannedAccountCannotBeChangedBySecondScanner()throws Throwable {
        setup();Map<String,Object> row=challenge();row.put("candidateOpenId","another-open-id");stub("lockChallenge",new Class<?>[]{String.class},row,hash());
        assertThrows(RuntimeException.class,()->event("SCAN","admin_notice_"+nonce,now));
    }
    @Test void unsubscribeRevokesPendingScanBeforeExistingBinding()throws Throwable {
        setup();event("unsubscribe",null,now);
        List<String> calls=new ArrayList<>();mockingDetails(mapper).getInvocations().forEach(i->calls.add(i.getMethod().getName()));
        assertEquals(Arrays.asList("revokeCandidates","following"),calls);
    }
    @Test void statusDoesNotExposeOpenIdOrChallengeAndLocalUnlinkCannotBeRevived()throws Throwable {
        setup();Map<String,Object> row=new HashMap<>();row.put("openId","synthetic-open-id");row.put("following",1);row.put("boundAt",now);
        stub("binding",new Class<?>[]{Long.class,String.class},row,7L,"synthetic-app");
        Map<?,?> status=(Map<?,?>)call("status",new Class<?>[]{Long.class},7L);assertEquals(true,status.get("bound"));assertFalse(status.toString().contains("synthetic-open-id"));
        call("unlink",new Class<?>[]{Long.class},7L);assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i->i.getMethod().getName().equals("unlink")));
    }
}
