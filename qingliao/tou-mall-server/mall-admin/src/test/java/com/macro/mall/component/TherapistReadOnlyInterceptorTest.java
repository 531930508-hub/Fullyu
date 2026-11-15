package com.macro.mall.component;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import com.macro.mall.service.UmsAdminService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.method.HandlerMethod;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 疗愈师只能读看板，看板相关写接口按角色拒绝；服务备注与精油部位单独放行。 */
class TherapistReadOnlyInterceptorTest {

    private TherapistReadOnlyInterceptor interceptor;
    private TherapistGuard therapistGuard;
    private UmsAdminService adminService;

    @BeforeEach
    void setUp() {
        adminService = mock(UmsAdminService.class);
        therapistGuard = new TherapistGuard();
        ReflectionTestUtils.setField(therapistGuard, "adminService", adminService);
        ReflectionTestUtils.setField(therapistGuard, "therapistRole", "疗愈师");

        interceptor = new TherapistReadOnlyInterceptor();
        ReflectionTestUtils.setField(interceptor, "therapistGuard", therapistGuard);

        UmsAdmin admin = new UmsAdmin();
        admin.setId(9L);
        AdminUserDetails details = new AdminUserDetails(admin, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(details, null, Collections.emptyList()));
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void therapistCannotWriteBoardResources() throws Exception {
        when(adminService.getRoleList(9L)).thenReturn(Collections.singletonList(role("疗愈师")));

        assertBlocked("POST", "/order");
        assertBlocked("PUT", "/order/doing/service");
        assertBlocked("POST", "/orderDetail/update/order/detail");
        assertBlocked("PUT", "/orderDetail/finish");
        assertBlocked("POST", "/massagistSchedules/batchTargetShop");
        assertBlocked("POST", "/adminTodo/complete");
    }

    @Test
    void therapistCanWriteServiceCommentAndOilParts() throws Exception {
        when(adminService.getRoleList(9L)).thenReturn(Collections.singletonList(role("疗愈师")));

        assertPassed("PUT", "/orderDetail/comment");
        assertPassed("PUT", "/orderDetail/comment/");
        assertPassed("POST", "/order/addLabel");
    }

    @Test
    void whitelistDoesNotOpenNeighbouringEndpoints() throws Exception {
        when(adminService.getRoleList(9L)).thenReturn(Collections.singletonList(role("疗愈师")));

        //放行按「方法 + 路径」精确匹配，换方法或近似路径仍然拦
        assertBlocked("POST", "/orderDetail/comment");
        assertBlocked("POST", "/order/addLabelBatch");
        assertBlocked("PUT", "/order/label");
    }

    @Test
    void therapistCanReadBoard() throws Exception {
        when(adminService.getRoleList(9L)).thenReturn(Collections.singletonList(role("疗愈师")));

        assertTrue(interceptor.preHandle(request("GET", "/orderDetail/schedulingMap"),
                new MockHttpServletResponse(), handler()));
        assertTrue(interceptor.preHandle(request("OPTIONS", "/order"),
                new MockHttpServletResponse(), handler()));
    }

    @Test
    void therapistCanStillUseLeaveAndOtherPaths() throws Exception {
        when(adminService.getRoleList(9L)).thenReturn(Collections.singletonList(role("疗愈师")));

        assertTrue(interceptor.preHandle(request("POST", "/massagistLeave/add"),
                new MockHttpServletResponse(), handler()));
        assertTrue(interceptor.preHandle(request("POST", "/orders/import"),
                new MockHttpServletResponse(), handler()));
    }

    @Test
    void nonTherapistCanWriteBoard() throws Exception {
        when(adminService.getRoleList(9L)).thenReturn(Collections.singletonList(role("店长")));

        assertTrue(interceptor.preHandle(request("POST", "/order"),
                new MockHttpServletResponse(), handler()));
    }

    @Test
    void anonymousRequestIsLeftToAuthentication() throws Exception {
        SecurityContextHolder.clearContext();

        assertTrue(interceptor.preHandle(request("POST", "/order"),
                new MockHttpServletResponse(), handler()));
        verifyNoInteractions(adminService);
    }

    private void assertBlocked(String method, String uri) throws Exception {
        assertThrows(BusinessException.class, () -> interceptor.preHandle(
                request(method, uri), new MockHttpServletResponse(), handler()));
    }

    private void assertPassed(String method, String uri) throws Exception {
        assertTrue(interceptor.preHandle(request(method, uri), new MockHttpServletResponse(), handler()),
                method + " " + uri + " 应放行");
    }

    private MockHttpServletRequest request(String method, String uri) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setRequestURI(uri);
        return request;
    }

    private HandlerMethod handler() {
        return mock(HandlerMethod.class);
    }

    private UmsRole role(String name) {
        UmsRole role = new UmsRole();
        role.setName(name);
        return role;
    }
}