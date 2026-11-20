package com.macro.mall.service.base;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.MassagistSchedulesService;
import com.macro.mall.service.MassagistService;
import com.macro.mall.service.UmsAdminService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * 疗愈师按排班日期临时放开一家店：
 * 只有「这一天确有排班/调店」的门店才进授权范围，且只对本次请求生效。
 */
class ShopScopeScheduleDateTest {

    private static final LocalDate DAY = LocalDate.of(2026, 11, 14);
    /** 账号配置的门店 */
    private static final long OWN_SHOP = 2L;
    /** 她当天被调去的店，账号配置里没有 */
    private static final long OTHER_SHOP = 8L;

    ShopScopeService service;
    UmsAdminService admins;
    MassagistService massagists;
    MassagistSchedulesService schedules;

    @BeforeEach
    void setup() {
        service = new ShopScopeService();
        admins = mock(UmsAdminService.class);
        massagists = mock(MassagistService.class);
        schedules = mock(MassagistSchedulesService.class);
        ReflectionTestUtils.setField(service, "adminService", admins);
        ReflectionTestUtils.setField(service, "massagistService", massagists);
        ReflectionTestUtils.setField(service, "massagistSchedulesService", schedules);
        ReflectionTestUtils.setField(service, "environment", mock(Environment.class));

        UmsAdmin admin = new UmsAdmin();
        admin.setId(9L);
        admin.setShopId(OWN_SHOP);
        admin.setMassagistId(7L);
        when(admins.getRoleList(9L)).thenReturn(Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AdminUserDetails(admin, Collections.emptyList()), null, Collections.emptyList()));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private ShopScope restrictedScope(Long requestedShopId) {
        return new ShopScope(false, Collections.singletonList(OWN_SHOP),
                requestedShopId == null ? null : Collections.singletonList(requestedShopId));
    }

    @Test
    void 当天有排班或调店_放开该店且原作用域不变() {
        when(schedules.shopIdsByMassagistAndDay(7L, DAY)).thenReturn(Arrays.asList(OWN_SHOP, OTHER_SHOP));

        ShopScope original = restrictedScope(OTHER_SHOP);
        ShopScope extended = service.extendForScheduleDate(original, DAY);

        assertTrue(extended.contains(OTHER_SHOP), "当天的调店门店应临时可读");
        assertDoesNotThrow(() -> extended.assertAccess(OTHER_SHOP));

        // 原作用域不因扩展而变宽：同一请求之外的判断仍按账号授权
        assertFalse(original.contains(OTHER_SHOP));
        assertThrows(BusinessException.class, original::checkRequested);
    }

    @Test
    void 换一天没有排班_仍然拒绝() {
        when(schedules.shopIdsByMassagistAndDay(7L, DAY)).thenReturn(Collections.emptyList());

        ShopScope extended = service.extendForScheduleDate(restrictedScope(OTHER_SHOP), DAY);

        BusinessException error = assertThrows(BusinessException.class, extended::checkRequested);
        assertEquals("无权查看该门店", error.getMessage());
    }

    @Test
    void 排班在别家店_不能拿来读这家店() {
        when(schedules.shopIdsByMassagistAndDay(7L, DAY)).thenReturn(Collections.singletonList(3L));

        ShopScope extended = service.extendForScheduleDate(restrictedScope(OTHER_SHOP), DAY);

        assertThrows(BusinessException.class, extended::checkRequested);
    }

    @Test
    void 没传日期或没传门店_不查排班() {
        service.extendForScheduleDate(restrictedScope(OTHER_SHOP), null);
        service.extendForScheduleDate(restrictedScope(null), DAY);
        service.extendForScheduleDate(restrictedScope(OWN_SHOP), DAY);

        verifyNoInteractions(schedules);
    }

    @Test
    void 全局角色不参与按日期放开() {
        ShopScope global = new ShopScope(true, null, Collections.singletonList(OTHER_SHOP));

        ShopScope result = service.extendForScheduleDate(global, DAY);

        assertSame(global, result);
        verifyNoInteractions(schedules);
    }
}