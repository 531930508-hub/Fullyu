package com.macro.mall.crm;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 会员中心签名契约测试。
 *
 * <p>期望值由 CRM 侧同一算法生成（Node crypto 计算），用于跨语言锁定
 * {@code timestamp\nMETHOD\n/api/...\nsha256hex(body)} 的格式、大小写与十六进制编码。</p>
 */
class CrmClientSignTest {
    private static final String SECRET = "test-secret-0123456789";
    private static final String TIMESTAMP = "1762560000";

    @Test
    void signsPostBodyExactlyLikeCrm() {
        String body = "{\"localUserId\":\"1\",\"phone\":\"13900000001\"}";
        String signature = CrmClient.sign(SECRET, TIMESTAMP, "post",
                "/api/external/members/resolve", body);
        assertEquals("3a07b3718160b7954130e14a05b5cfc93eefa0ea3e741d6947271197196f74a4", signature);
    }

    @Test
    void signsGetWithEmptyBodyHash() {
        String signature = CrmClient.sign(SECRET, TIMESTAMP, "GET",
                "/api/external/members/1", "");
        assertEquals("559b1d5a867f28ae01080752a1da2f84d45016c15ca90ca780d524dc74673ff5", signature);
    }

    @Test
    void enablesOnlyWhenConfigured() {
        assertFalse(CrmProperties.resolveActive(null, null));
        assertFalse(CrmProperties.resolveActive("", "  "));
        assertFalse(CrmProperties.resolveActive("0", "https://crm.example.com"));
        assertFalse(CrmProperties.resolveActive("off", "https://crm.example.com"));
        assertTrue(CrmProperties.resolveActive("1", null));
        assertTrue(CrmProperties.resolveActive(null, "https://crm.example.com"));
    }
}
