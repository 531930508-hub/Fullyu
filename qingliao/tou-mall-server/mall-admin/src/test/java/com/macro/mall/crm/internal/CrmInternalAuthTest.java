package com.macro.mall.crm.internal;

import com.macro.mall.common.exception.BusinessException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import javax.servlet.http.HttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * CRM → 轻疗内部接口签名校验：正确签名放行、错签/过期/重放拒绝、未启用返回 404。
 */
class CrmInternalAuthTest {
    private static final String KEY_ID = "crm-retreat";
    private static final String SECRET = "test-secret-0123456789";
    private static final String PATH = "/crm-internal/member-card/refund";

    private CrmInternalAuth auth;

    @BeforeEach
    void setUp() {
        CrmInternalProperties properties = new CrmInternalProperties("", KEY_ID, SECRET, 300);
        properties.init();
        auth = new CrmInternalAuth();
        ReflectionTestUtils.setField(auth, "properties", properties);
    }

    @Test
    void acceptsValidSignatureOnceAndRejectsReplay() {
        String body = "{\"orderSn\":\"C1\",\"refundCents\":12345}";
        long now = System.currentTimeMillis() / 1000L;
        String nonce = "nonce-000001";
        HttpServletRequest request = request("POST", PATH, "", body, now, nonce,
                sign(now, nonce, "POST", PATH, body));

        auth.verify(request, body);

        BusinessException replay = assertThrows(BusinessException.class, () -> auth.verify(request, body));
        assertEquals(401, replay.getStatus());
    }

    @Test
    void rejectsExpiredTimestamp() {
        String body = "{}";
        long stale = System.currentTimeMillis() / 1000L - 1000L;
        HttpServletRequest request = request("POST", PATH, "", body, stale, "nonce-000002",
                sign(stale, "nonce-000002", "POST", PATH, body));

        BusinessException error = assertThrows(BusinessException.class, () -> auth.verify(request, body));
        assertEquals(401, error.getStatus());
    }

    @Test
    void rejectsWrongSignatureWithoutLeakingReason() {
        String body = "{}";
        HttpServletRequest request = request("POST", PATH, "", body, System.currentTimeMillis() / 1000L,
                "nonce-000003", repeat('a'));

        BusinessException error = assertThrows(BusinessException.class, () -> auth.verify(request, body));
        assertEquals(401, error.getStatus());
        assertEquals("签名校验失败", error.getMessage());
    }

    @Test
    void rejectsWrongKey() {
        String body = "{}";
        long now = System.currentTimeMillis() / 1000L;
        String nonce = "nonce-000004";
        HttpServletRequest request = request("POST", PATH, "", body, now, nonce,
                sign(now, nonce, "POST", PATH, body));
        when(request.getHeader("x-crm-key")).thenReturn("someone-else");

        BusinessException error = assertThrows(BusinessException.class, () -> auth.verify(request, body));
        assertEquals(401, error.getStatus());
    }

    @Test
    void inactiveServiceReturns404() {
        CrmInternalProperties off = new CrmInternalProperties("0", KEY_ID, SECRET, 300);
        off.init();
        CrmInternalAuth disabled = new CrmInternalAuth();
        ReflectionTestUtils.setField(disabled, "properties", off);

        BusinessException error = assertThrows(BusinessException.class,
                () -> disabled.verify(mock(HttpServletRequest.class), ""));
        assertEquals(404, error.getStatus());
    }

    private String sign(long timestamp, String nonce, String method, String path, String body) {
        return CrmInternalAuth.sign(SECRET, String.valueOf(timestamp), nonce, method, path, body);
    }

    private HttpServletRequest request(String method, String path, String query, String body,
                                       long timestamp, String nonce, String signature) {
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getMethod()).thenReturn(method);
        when(request.getRequestURI()).thenReturn(path);
        when(request.getQueryString()).thenReturn(query);
        when(request.getHeader("x-crm-key")).thenReturn(KEY_ID);
        when(request.getHeader("x-crm-timestamp")).thenReturn(String.valueOf(timestamp));
        when(request.getHeader("x-crm-nonce")).thenReturn(nonce);
        when(request.getHeader("x-crm-signature")).thenReturn(signature);
        return request;
    }

    private static String repeat(char value) {
        StringBuilder builder = new StringBuilder(64);
        for (int i = 0; i < 64; i++) {
            builder.append(value);
        }
        return builder.toString();
    }
}
