package com.macro.mall.service;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.incentive.service.IncentiveAccessService;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 排班管理身份判定：店长本身有疗愈师档案，不能被"有档案"挡在排班之外。
 */
class ScheduleManagePermissionTest {
    IncentiveAccessService access;
    UmsAdminService adminService;
    MassagistService massagistService;
    MassagistIdentityService identityService;

    @BeforeEach void setup() {
        access = new IncentiveAccessService();
        adminService = mock(UmsAdminService.class);
        massagistService = mock(MassagistService.class);
        identityService = mock(MassagistIdentityService.class);
        ReflectionTestUtils.setField(access, "adminService", adminService);
        ReflectionTestUtils.setField(access, "massagistService", massagistService);
        ReflectionTestUtils.setField(access, "massagistIdentityService", identityService);
        ReflectionTestUtils.setField(access, "globalRoles", "超级管理员,总助,运营,财务,admin");
        ReflectionTestUtils.setField(access, "shopManagerRole", "店长");
    }

    @AfterEach void clear() {
        SecurityContextHolder.clearContext();
    }

    private void login(UmsAdmin admin) {
        AdminUserDetails details = new AdminUserDetails(admin, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(details, null, details.getAuthorities()));
    }

    private UmsAdmin account(Long id, Long massagistId, Long shopId) {
        UmsAdmin admin = new UmsAdmin();
        admin.setId(id);
        admin.setUsername("admin-" + id);
        admin.setMassagistId(massagistId);
        admin.setShopId(shopId);
        admin.setShopIdArr("[" + shopId + "]");
        return admin;
    }

    private UmsRole role(String name) {
        UmsRole role = new UmsRole();
        role.setName(name);
        return role;
    }

    @Test void shopManagerWithMassagistArchiveCanManage() {
        login(account(24L, 12L, 1L));
        when(adminService.getRoleList(24L)).thenReturn(Arrays.asList(role("疗愈师"), role("店长")));
        when(identityService.hasCode(anyLong(), any())).thenReturn(false);
        assertTrue(access.canManageSchedules());
    }

    @Test void therapistOnlyCannotManage() {
        login(account(25L, 13L, 1L));
        when(adminService.getRoleList(25L)).thenReturn(Collections.singletonList(role("疗愈师")));
        when(identityService.hasCode(anyLong(), any())).thenReturn(false);
        assertFalse(access.canManageSchedules());
    }

    @Test void shopManagerIdentityAloneIsEnough() {
        login(account(26L, 14L, 1L));
        when(adminService.getRoleList(26L)).thenReturn(Collections.singletonList(role("疗愈师")));
        when(identityService.hasCode(anyLong(), any())).thenReturn(true);
        assertTrue(access.canManageSchedules());
    }

    @Test void globalRoleCanManage() {
        login(account(1L, 15L, 1L));
        when(adminService.getRoleList(1L)).thenReturn(Collections.singletonList(role("运营")));
        assertTrue(access.canManageSchedules());
    }

    @Test void accountWithoutMassagistArchiveCanManage() {
        login(account(27L, null, 1L));
        when(adminService.getRoleList(27L)).thenReturn(Collections.singletonList(role("前台")));
        assertTrue(access.canManageSchedules());
    }

    @Test void identityTableFailureFallsBackToNotShopManager() {
        login(account(28L, 16L, 1L));
        when(adminService.getRoleList(28L)).thenReturn(Collections.singletonList(role("疗愈师")));
        when(identityService.hasCode(anyLong(), any())).thenThrow(new RuntimeException("Table 'f_massagist_identity' doesn't exist"));
        assertFalse(access.isShopManager());
        assertFalse(access.canManageSchedules());
    }

    @Test void shopManagerCanTransferToUnauthorizedShop() {
        login(account(24L, 12L, 1L));
        when(adminService.getRoleList(24L)).thenReturn(Collections.singletonList(role("店长")));
        access.requireTransferShopAccess(8L);
        BusinessException e = assertThrows(BusinessException.class, () -> access.requireShopAccess(8L));
        assertEquals("无权查看该门店", e.getMessage());
    }

    @Test void ordinaryAccountStillNeedsTargetShopAccess() {
        login(account(29L, null, 1L));
        when(adminService.getRoleList(29L)).thenReturn(Collections.singletonList(role("前台")));
        BusinessException e = assertThrows(BusinessException.class, () -> access.requireTransferShopAccess(8L));
        assertEquals("无权查看该门店", e.getMessage());
    }
}