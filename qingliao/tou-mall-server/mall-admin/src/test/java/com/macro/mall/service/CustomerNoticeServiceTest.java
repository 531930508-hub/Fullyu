package com.macro.mall.service;

import com.macro.mall.entity.CustomerCoupon;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.InvocationTargetException;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CustomerNoticeServiceTest {
    Object service; Object mapper;
    Object setup() throws Exception {
        Class<?> type;
        try { type = Class.forName("com.macro.mall.service.CustomerNoticeService"); }
        catch (ClassNotFoundException e) { type = null; }
        assertNotNull(type, "缺少站内提醒和mock订阅链");
        service = type.getDeclaredConstructor().newInstance();
        Class<?> repo = Class.forName("com.macro.mall.mapper.CustomerNoticeMapper");
        mapper = mock(repo); ReflectionTestUtils.setField(service, "mapper", mapper);
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "templateId", "synthetic-template");
        ReflectionTestUtils.setField(service, "mode", "mock");
        stub("lockCoupon",new Class<?>[]{Long.class},coupon(),9L);
        // MyBatis无记录返回null；Mockito对Map/Long的默认空Map/0不代表真实查询结果。
        stub("ownedNotice",new Class<?>[]{Long.class,Long.class},null,7L,99L);
        stub("claimableConsent",new Class<?>[]{Long.class,String.class},null,7L,"synthetic-template");
        stub("loggedSubscription",new Class<?>[]{String.class},null,KEY);
        clearInvocations(mapper);
        return service;
    }
    static final String KEY = "coupon:9:2026-11-13:5";
    boolean invoked(String name, Object... args) {
        return mockingDetails(mapper).getInvocations().stream().anyMatch(i ->
            i.getMethod().getName().equals(name) && (args.length == 0 || Arrays.equals(i.getArguments(), args)));
    }
    Object call(String name, Class<?>[] types, Object... args) throws Throwable {
        try { return service.getClass().getMethod(name, types).invoke(service, args); }
        catch (InvocationTargetException e) { throw e.getCause(); }
    }
    Object repository(String name, Class<?>[] types, Object... args) throws Exception {
        return mapper.getClass().getMethod(name, types).invoke(mapper, args);
    }
    void stub(String name, Class<?>[] types, Object value, Object... args) throws Exception {
        repository(name, types, args); org.mockito.Mockito.when(repository(name, types, args)).thenReturn(value);
    }
    CustomerCoupon coupon() {
        CustomerCoupon c = new CustomerCoupon(); c.setId(9L); c.setCustomerId(7L); c.setState(1);
        c.setEndTime(LocalDate.of(2026,11,13)); return c;
    }
    final Class<?>[] notifyTypes = {CustomerCoupon.class, LocalDate.class};
    final Class<?>[] pageTypes = {Long.class, int.class, int.class};
    @Test void disabledFeatureNeverTouchesMissingTables() throws Throwable {
        setup(); ReflectionTestUtils.setField(service,"enabled",false);
        call("notifyCoupon",notifyTypes,coupon(),LocalDate.of(2026,11,8)); verifyNoInteractions(mapper);
    }
    @Test void invalidCouponNeverWrites() throws Throwable {
        setup(); CustomerCoupon c = coupon(); c.setState(4);
        call("notifyCoupon",notifyTypes,c,LocalDate.of(2026,11,8)); verifyNoInteractions(mapper);
    }
    @Test void anonymousReadIsRejectedBeforeDatabase() throws Throwable {
        setup(); assertThrows(RuntimeException.class, () -> call("page",pageTypes,null,1,10)); verifyNoInteractions(mapper);
    }
    @Test void paginationHasStrictBounds() throws Throwable {
        setup(); assertThrows(RuntimeException.class, () -> call("page",pageTypes,7L,0,10));
        assertThrows(RuntimeException.class, () -> call("page",pageTypes,7L,1,101)); verifyNoInteractions(mapper);
    }
    @Test void pageAndUnreadAreAlwaysScopedToCurrentCustomer() throws Throwable {
        setup(); stub("count",new Class<?>[]{Long.class},3L,7L);
        stub("unread",new Class<?>[]{Long.class},2L,7L);
        Map<?,?> result = (Map<?,?>) call("page",pageTypes,7L,2,10);
        assertEquals(3L,result.get("total")); assertEquals(2L,result.get("unreadCount"));
        assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i ->
            i.getMethod().getName().equals("page") && Arrays.equals(i.getArguments(), new Object[]{7L,10,10})));
    }
    @Test void readingUnknownOrOtherCustomerNoticeIsRejected() throws Throwable {
        setup(); assertThrows(RuntimeException.class, () -> call("read",new Class<?>[]{Long.class,Long.class},7L,99L));
    }
    @Test void repeatedReadKeepsOriginalReadTimestamp() throws Throwable {
        setup(); stub("ownedNotice",new Class<?>[]{Long.class,Long.class},Collections.singletonMap("id",99L),7L,99L);
        call("read",new Class<?>[]{Long.class,Long.class},7L,99L);
        assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i -> i.getMethod().getName().equals("markRead")));
    }
    @Test void rejectionIsRecordedNotMisreportedAsSubscribed() throws Throwable {
        setup(); call("consent",new Class<?>[]{Long.class,String.class,String.class,String.class},7L,"synthetic-template","reject","request-1234");
        assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i ->
            i.getMethod().getName().equals("insertConsent") && Arrays.asList(i.getArguments()).contains("reject")));
    }
    @Test void unconfiguredTemplateCannotBeFabricatedByClient() throws Throwable {
        setup(); assertThrows(RuntimeException.class, () -> call("consent",new Class<?>[]{Long.class,String.class,String.class,String.class},7L,"fake","accept","request-1234")); verifyNoInteractions(mapper);
    }
    @Test void invalidDecisionAndMissingIdempotencyKeyAreRejected() throws Throwable {
        setup(); assertThrows(RuntimeException.class, () -> call("consent",new Class<?>[]{Long.class,String.class,String.class,String.class},7L,"synthetic-template","delivered","request-1234"));
        assertThrows(RuntimeException.class, () -> call("consent",new Class<?>[]{Long.class,String.class,String.class,String.class},7L,"synthetic-template","accept","")); verifyNoInteractions(mapper);
    }
    @Test void absentTemplateCreatesStationNoticeAndExplicitSkipLog() throws Throwable {
        setup(); ReflectionTestUtils.setField(service,"templateId","");
        call("notifyCoupon",notifyTypes,coupon(),LocalDate.of(2026,11,8));
        assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i -> i.getMethod().getName().equals("insertNotice")));
        assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i ->
            i.getMethod().getName().equals("logSubscription") && Arrays.asList(i.getArguments()).contains("NOT_CONFIGURED")));
    }
    @Test void configuredTemplateWithoutAuthorizationIsNotSent() throws Throwable {
        setup(); call("notifyCoupon",notifyTypes,coupon(),LocalDate.of(2026,11,8));
        assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i ->
            i.getMethod().getName().equals("logSubscription") && Arrays.asList(i.getArguments()).contains("NO_CONSENT")));
    }
    @Test void acceptedConsentOnlyCreatesMockLogWithoutExternalSdk() throws Throwable {
        setup(); stub("claimableConsent",new Class<?>[]{Long.class,String.class},1L,7L,"synthetic-template");
        stub("claimConsent",new Class<?>[]{Long.class,String.class},1,1L,KEY);
        call("notifyCoupon",notifyTypes,coupon(),LocalDate.of(2026,11,8));
        assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i ->
            i.getMethod().getName().equals("logSubscription") && Arrays.asList(i.getArguments()).contains("MOCK")));
    }
    @Test void mockEvaluationConsumesExactlyThatAcceptedReceipt() throws Throwable {
        setup(); stub("claimableConsent",new Class<?>[]{Long.class,String.class},5L,7L,"synthetic-template");
        stub("claimConsent",new Class<?>[]{Long.class,String.class},1,5L,KEY);
        call("notifyCoupon",notifyTypes,coupon(),LocalDate.of(2026,11,8));
        // 微信一次性订阅：一次accept只对应一次提醒，后续提醒必须有新的accept。
        assertTrue(invoked("claimConsent",5L,KEY));
        assertTrue(invoked("logSubscription",KEY,7L,"MOCK","synthetic-template"));
    }
    @Test void lostClaimRaceRollsBackInsteadOfLoggingMock() throws Throwable {
        setup(); stub("claimableConsent",new Class<?>[]{Long.class,String.class},5L,7L,"synthetic-template");
        stub("claimConsent",new Class<?>[]{Long.class,String.class},0,5L,KEY);
        assertThrows(RuntimeException.class, () -> call("notifyCoupon",notifyTypes,coupon(),LocalDate.of(2026,11,8)));
        assertFalse(invoked("logSubscription"));
    }
    @Test void rescanOfAlreadyEvaluatedEventNeverClaimsAnotherReceipt() throws Throwable {
        setup(); stub("loggedSubscription",new Class<?>[]{String.class},"MOCK",KEY);
        stub("claimableConsent",new Class<?>[]{Long.class,String.class},6L,7L,"synthetic-template");
        clearInvocations(mapper);
        call("notifyCoupon",notifyTypes,coupon(),LocalDate.of(2026,11,8));
        // 调度每30分钟重扫当天到期券，重复扫描不得再消耗授权或追加日志。
        assertFalse(invoked("claimableConsent")); assertFalse(invoked("claimConsent"));
        assertFalse(invoked("logSubscription"));
    }
    @Test void unconfiguredTemplateNeverConsumesReceipt() throws Throwable {
        setup(); ReflectionTestUtils.setField(service,"templateId","");
        call("notifyCoupon",notifyTypes,coupon(),LocalDate.of(2026,11,8));
        assertFalse(invoked("claimConsent"));
    }
    @Test void liveModeCannotAccidentallySendRealMessage() throws Throwable {
        setup(); ReflectionTestUtils.setField(service,"mode","live");
        stub("claimableConsent",new Class<?>[]{Long.class,String.class},1L,7L,"synthetic-template");
        call("notifyCoupon",notifyTypes,coupon(),LocalDate.of(2026,11,8));
        assertTrue(mockingDetails(mapper).getInvocations().stream().anyMatch(i ->
            i.getMethod().getName().equals("logSubscription") && Arrays.asList(i.getArguments()).contains("LIVE_BLOCKED")));
    }
}
