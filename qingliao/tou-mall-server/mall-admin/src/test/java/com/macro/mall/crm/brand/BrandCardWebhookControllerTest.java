package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * 品牌卡推送接收：验签、时间窗、未启用三种状态。
 *
 * <p>不启动 Spring 容器，也不连 CRM；签名算法与 X-Fy 契约一致。</p>
 */
class BrandCardWebhookControllerTest {
    private static final String SECRET = "test-secret-0123456789";
    private static final String KEY_ID = "retreat-test";
    private static final String PATH = "/api/crm/brand-card";
    private static final String BODY =
            "{\"topic\":\"brand_card.issued\",\"cardId\":\"MBC-1\",\"memberNo\":\"FY-1\"}";

    private BrandCardWebhookController controller(boolean active) {
        BrandMemberProperties properties = new BrandMemberProperties(
                active ? "1" : "0",
                "https://crm.example.com",
                KEY_ID,
                SECRET,
                3000);
        properties.init();
        return new BrandCardWebhookController(properties, PATH, new ObjectMapper());
    }

    private MockHttpServletRequest request(String signature, String timestamp) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/crm/brand-card");
        request.setContent(BODY.getBytes(StandardCharsets.UTF_8));
        request.addHeader("x-fy-key", KEY_ID);
        request.addHeader("x-fy-timestamp", timestamp);
        request.addHeader("x-fy-nonce", "nonce-1");
        request.addHeader("x-fy-signature", signature);
        return request;
    }

    @Test
    void acceptsValidSignature() throws Exception {
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000L);
        String signature = BrandCardWebhookController.sign(
                SECRET, timestamp, "nonce-1", PATH, BODY.getBytes(StandardCharsets.UTF_8));
        ResponseEntity<Map<String, Object>> response =
                controller(true).receive(request(signature, timestamp));
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(Boolean.TRUE, response.getBody().get("ok"));
    }

    @Test
    void rejectsBadSignature() throws Exception {
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000L);
        ResponseEntity<Map<String, Object>> response =
                controller(true).receive(request("deadbeef", timestamp));
        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
    }

    @Test
    void rejectsStaleTimestamp() throws Exception {
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000L - 600);
        String signature = BrandCardWebhookController.sign(
                SECRET, timestamp, "nonce-1", PATH, BODY.getBytes(StandardCharsets.UTF_8));
        ResponseEntity<Map<String, Object>> response =
                controller(true).receive(request(signature, timestamp));
        assertEquals(HttpStatus.UNAUTHORIZED, response.getStatusCode());
    }

    @Test
    void rejectsWhenBrandCrmInactive() throws Exception {
        String timestamp = String.valueOf(System.currentTimeMillis() / 1000L);
        ResponseEntity<Map<String, Object>> response =
                controller(false).receive(request("deadbeef", timestamp));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
    }
}
