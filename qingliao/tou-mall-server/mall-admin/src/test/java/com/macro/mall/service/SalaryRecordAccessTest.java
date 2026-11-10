package com.macro.mall.service;

import com.github.pagehelper.PageInfo;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.api.CommonResult;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.controller.SalaryRecordController;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.Massagist;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.lang.reflect.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SalaryRecordAccessTest {
    SalaryRecordController controller;
    SalaryRecordService records;
    UmsAdminService admins;
    MassagistService people;
    UmsAdmin admin;
    Massagist person;

    @BeforeEach void setup() {
        controller = new SalaryRecordController(); records = mock(SalaryRecordService.class);
        admins = mock(UmsAdminService.class); people = mock(MassagistService.class);
        ReflectionTestUtils.setField(controller, "salaryRecordService", records);
        for (Field field : controller.getClass().getDeclaredFields()) {
            if (field.getName().equals("adminService")) ReflectionTestUtils.setField(controller, "adminService", admins);
            if (field.getName().equals("massagistService")) ReflectionTestUtils.setField(controller, "massagistService", people);
        }
        admin = new UmsAdmin(); admin.setId(9L); admin.setStatus(1); admin.setMassagistId(7L);
        person = new Massagist(); person.setId(7L); person.setName("合成疗愈师"); person.setStatus(1); person.setUmsAdminId(9L);
        when(admins.getItem(9L)).thenReturn(admin);
        when(admins.getRoleList(9L)).thenReturn(Collections.emptyList());
        when(people.getById(7L)).thenReturn(person);
        login(admin, true);
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    void login(UmsAdmin snapshot, boolean authenticated) {
        AdminUserDetails details = new AdminUserDetails(snapshot, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(authenticated
            ? new UsernamePasswordAuthenticationToken(details, null, Collections.emptyList())
            : new UsernamePasswordAuthenticationToken(details, null));
    }
    void role(String name, Integer status) {
        UmsRole role = new UmsRole(); role.setName(name); role.setStatus(status);
        when(admins.getRoleList(9L)).thenReturn(Collections.singletonList(role));
    }
    CommonResult people(Integer status, int page, int size, String name) throws Throwable {
        Method method = null;
        try { method = controller.getClass().getMethod("people", Integer.class, int.class, int.class, String.class); }
        catch (NoSuchMethodException ignored) { }
        assertNotNull(method, "结算选人必须有独立的最小字段分页接口");
        try { return (CommonResult) method.invoke(controller, status, page, size, name); }
        catch (InvocationTargetException e) { throw e.getCause(); }
    }
    void denyAll() {
        assertThrows(BusinessException.class, () -> controller.info(7L, "2026-10"));
        assertThrows(BusinessException.class, () -> controller.findMassagistAllMonthCode(7L));
        assertThrows(BusinessException.class, () -> controller.reset(7L, "2026-10"));
        assertThrows(BusinessException.class, () -> controller.resetRecordNew());
        verifyNoInteractions(records);
    }

    @Test void anonymousCannotReadOrRecalculate() { SecurityContextHolder.clearContext(); denyAll(); }
    @Test void unauthenticatedAdminPrincipalCannotRead() { login(admin, false); denyAll(); }
    @Test void customerPrincipalCannotReadAdminSettlement() {
        Customer customer = new Customer();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
            new AdminUserDetails(customer, Collections.emptyList()), null, Collections.emptyList()));
        denyAll(); verifyNoInteractions(admins);
    }
    @Test void disabledAccountIsReloadedInsteadOfTrustingLoginSnapshot() {
        UmsAdmin stale = new UmsAdmin(); stale.setId(9L); stale.setStatus(1); stale.setMassagistId(7L);
        login(stale, true); admin.setStatus(0); denyAll(); verify(admins, atLeastOnce()).getItem(9L);
    }
    @Test void deletedAccountCannotRead() { when(admins.getItem(9L)).thenReturn(null); denyAll(); }
    @Test void selfMayReadOnlyOwnDetailAndMonths() {
        controller.info(7L, "2026-10"); controller.findMassagistAllMonthCode(7L);
        verify(records).findMassagistSalaryRecordDetail(7L, "2026-10"); verify(records).findMassagistAllMonthCode(7L);
    }
    @Test void sameStoreDoesNotGrantOtherPersonsSettlement() {
        admin.setShopId(5L);
        assertThrows(BusinessException.class, () -> controller.info(8L, "2026-10"));
        assertThrows(BusinessException.class, () -> controller.findMassagistAllMonthCode(8L)); verifyNoInteractions(records);
    }
    @Test void selfCannotRecalculateEvenOwnRecordOrAllRecords() {
        assertThrows(BusinessException.class, () -> controller.reset(7L, "2026-10"));
        assertThrows(BusinessException.class, () -> controller.resetRecordNew()); verifyNoInteractions(records);
    }
    @Test void activeOriginalThreeManagerRolesMayRecalculate() {
        for (String name : Arrays.asList("超级管理员", "总助", "财务")) {
            role(name, 1); controller.info(7L, "2026-10"); controller.reset(7L, "2026-10");
        }
        verify(records, times(3)).resetMassagistSalaryRecords(7L, "2026-10");
    }
    @Test void operationsAndShopManagerDoNotGainSettlementManagement() {
        for (String name : Arrays.asList("运营", "店长", "admin")) {
            role(name, 1); assertThrows(BusinessException.class, () -> controller.reset(7L, "2026-10"));
            assertThrows(BusinessException.class, () -> controller.info(8L, "2026-10"));
        }
        verifyNoInteractions(records);
    }
    @Test void disabledManagerRoleDoesNotAuthorizeReset() { role("财务", 0); assertThrows(BusinessException.class, () -> controller.reset(7L, "2026-10")); verifyNoInteractions(records); }
    @Test void changedAccountBindingCannotUseStaleSelfId() {
        UmsAdmin stale = new UmsAdmin(); stale.setId(9L); stale.setStatus(1); stale.setMassagistId(7L); login(stale, true);
        admin.setMassagistId(8L); assertThrows(BusinessException.class, () -> controller.info(7L, "2026-10")); verifyNoInteractions(records);
    }
    @Test void mismatchedOrMissingPersonBindingFailsClosed() {
        person.setUmsAdminId(99L); assertThrows(BusinessException.class, () -> controller.info(7L, "2026-10"));
        when(people.getById(7L)).thenReturn(null); assertThrows(BusinessException.class, () -> controller.findMassagistAllMonthCode(7L)); verifyNoInteractions(records);
    }
    @Test void legacyAccountLinkCanReadSelfButNotOthers() {
        admin.setMassagistId(null); when(people.getOne(any(), eq(false))).thenReturn(person);
        controller.info(7L, "2026-10"); verify(records).findMassagistSalaryRecordDetail(7L, "2026-10");
        assertThrows(BusinessException.class, () -> controller.info(8L, "2026-10"));
    }
    @Test void invalidPersonOrMonthNeverReachesCalculations() {
        role("财务", 1);
        for (String month : Arrays.asList("2026-13", "2026-1", "bad", "2026-10-01")) {
            assertThrows(BusinessException.class, () -> controller.info(7L, month));
            assertThrows(BusinessException.class, () -> controller.reset(7L, month));
        }
        assertThrows(BusinessException.class, () -> controller.info(0L, "2026-10")); verifyNoInteractions(records);
    }
    @Test void peopleRejectsNonmanagerAndInvalidPagingBeforeQuery() throws Throwable {
        assertThrows(BusinessException.class, () -> people(1, 1, 20, null)); role("财务", 1);
        for (int page : Arrays.asList(0, -1, 100001)) assertThrows(BusinessException.class, () -> people(1, page, 20, null));
        for (int size : Arrays.asList(0, -1, 101)) assertThrows(BusinessException.class, () -> people(1, 1, size, null));
        assertThrows(BusinessException.class, () -> people(3, 1, 20, null));
        assertThrows(BusinessException.class, () -> people(1, 1, 20, String.join("", Collections.nCopies(101, "a"))));
        verifyNoInteractions(people);
    }
    @Test void peopleReturnsOnlyThreeFieldsAndServerTotalWithFixedSort() throws Throwable {
        role("财务", 1); person.setPhone("合成敏感字段不得回传"); person.setUmsAdminUsername("合成账号不得回传");
        PageInfo<Massagist> data = new PageInfo<>(Collections.singletonList(person)); data.setTotal(55); data.setPageNum(2); data.setPageSize(20);
        when(people.pageInfo(anyMap())).thenReturn(data);
        Map<String, Object> result = (Map<String, Object>) people(1, 2, 20, "  合成  ").getData();
        assertEquals(55L, result.get("total")); assertEquals(2, result.get("pageNum")); assertEquals(20, result.get("pageSize"));
        Map<?, ?> row = (Map<?, ?>) ((List<?>) result.get("list")).get(0);
        assertEquals(new HashSet<>(Arrays.asList("id", "name", "status")), row.keySet());
        verify(people).pageInfo(argThat(p -> Integer.valueOf(2).equals(p.get("page")) && Integer.valueOf(20).equals(p.get("size"))
            && "name,id".equals(p.get("order")) && "合成".equals(p.get("name")) && Integer.valueOf(1).equals(p.get("status"))));
    }
    @Test void allStateOmitsStatusWhileNullDefaultsToCooperating() throws Throwable {
        role("财务", 1); when(people.pageInfo(anyMap())).thenReturn(new PageInfo<Massagist>(Collections.emptyList()));
        people(-1, 1, 20, " "); verify(people).pageInfo(argThat(p -> !p.containsKey("status") && !p.containsKey("name")));
        people(null, 1, 20, null); verify(people).pageInfo(argThat(p -> Integer.valueOf(1).equals(p.get("status"))));
    }
}
