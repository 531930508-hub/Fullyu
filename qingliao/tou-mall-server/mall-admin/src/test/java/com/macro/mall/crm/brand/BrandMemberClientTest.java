package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.common.exception.BusinessException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 品牌会员（CRM X-Fy 契约）签名与客户端测试。
 *
 * <p>不连真实 CRM：本地 HttpServer 模拟响应，校验 nonce、完整路径与业务标识。</p>
 */
class BrandMemberClientTest {
    private static final String SECRET = "test-secret-0123456789";
    private static final String KEY_ID = "retreat-test";
    private static final String BUSINESS = "retreat";

    private HttpServer server;
    private final List<Captured> captured = new ArrayList<>();
    private volatile int nextStatus = 200;
    private volatile String nextBody = "{}";

    private static final class Captured {
        String method;
        String path;
        String key;
        String nonce;
        String timestamp;
        String signature;
        String body;
    }

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handle);
        server.start();
    }

    @AfterEach
    void stop() {
        if (server != null) {
            server.stop(0);
        }
    }

    private void handle(HttpExchange exchange) throws IOException {
        Captured item = new Captured();
        item.method = exchange.getRequestMethod();
        item.path = exchange.getRequestURI().toString();
        item.key = exchange.getRequestHeaders().getFirst("x-fy-key");
        item.nonce = exchange.getRequestHeaders().getFirst("x-fy-nonce");
        item.timestamp = exchange.getRequestHeaders().getFirst("x-fy-timestamp");
        item.signature = exchange.getRequestHeaders().getFirst("x-fy-signature");
        item.body = read(exchange.getRequestBody());
        captured.add(item);

        String payload = nextBody;
        byte[] bytes = payload.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(nextStatus, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream input = in; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[1024];
            int len;
            while ((len = input.read(buffer)) != -1) {
                out.write(buffer, 0, len);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private BrandMemberProperties properties() {
        BrandMemberProperties properties = new BrandMemberProperties(
                "1",
                "http://127.0.0.1:" + server.getAddress().getPort(),
                KEY_ID,
                SECRET,
                3000);
        properties.init();
        return properties;
    }

    @Test
    void signsWithNonceExactlyLikeCrm() {
        String body = "{\"business\":\"retreat\",\"localUserId\":\"42\",\"productCode\":\"FY_ANNUAL\"}";
        String signature = BrandMemberClient.sign(
                SECRET, "1762560000", "0123456789abcdef0123456789abcdef",
                "post", "/api/v1/brand-member/quote", body);
        assertEquals("69f45fa0d189927476febf3eb254e3a14c5c40f644269160094a9cb2e0cd9a55", signature);
    }

    @Test
    void disabledByDefaultAndRejectsIncompleteConfig() {
        assertFalse(new BrandMemberProperties("", "", "", "", 3000).isActive());
        BrandMemberProperties off = new BrandMemberProperties(
                "0", "https://crm.example.com", KEY_ID, SECRET, 3000);
        off.init();
        assertFalse(off.isActive());
        assertThrows(IllegalStateException.class,
                () -> new BrandMemberProperties("1", "", KEY_ID, SECRET, 3000).init());
        assertThrows(IllegalStateException.class,
                () -> new BrandMemberProperties("1", "http://crm.example.com", KEY_ID, SECRET, 3000).init());
        assertThrows(IllegalStateException.class,
                () -> new BrandMemberProperties("1", "https://crm.example.com", KEY_ID, "short", 3000).init());

        BrandMemberProperties enabled = new BrandMemberProperties(
                "1", "https://crm.example.com/", KEY_ID, SECRET, 50);
        enabled.init();
        assertTrue(enabled.isActive());
        assertEquals("https://crm.example.com", enabled.getBaseUrl());
        assertEquals(300, enabled.getTimeoutMs());
    }

    @Test
    void meSendsBusinessLocalUserAndFreshNonce() throws Exception {
        nextBody = "{\"member\":{\"memberNo\":\"FY-TEST-000003\",\"name\":\"轻疗会员\",\"phoneMasked\":\"139****0003\"},"
                + "\"card\":{\"state\":\"ACTIVE\"},\"points\":{\"balance\":500},"
                + "\"dice\":{\"balance\":12,\"station\":8,\"monthlyEarned\":12},"
                + "\"prizes\":{\"pending\":0},\"savedCents\":0,\"benefits\":[],"
                + "\"businessCards\":[],\"game\":{\"enabled\":true,\"url\":\"https://crm.test/game\"},"
                + "\"updatedAt\":\"2026-11-08T10:00:00+08:00\",\"stale\":false}";

        BrandMemberClient client = new BrandMemberClient(properties());
        JsonNode first = client.me("42");
        JsonNode second = client.me("42");

        assertEquals("FY-TEST-000003", first.path("member").path("memberNo").asText());
        assertEquals("ACTIVE", second.path("card").path("state").asText());
        assertEquals(2, captured.size());
        assertEquals("/api/v1/brand-member/me?business=retreat&localUserId=42", captured.get(0).path);
        assertEquals(KEY_ID, captured.get(0).key);
        assertTrue(captured.get(0).nonce != null && captured.get(0).nonce.length() >= 8);
        assertFalse(captured.get(0).nonce.equals(captured.get(1).nonce));
        assertTrue(captured.get(0).signature != null && captured.get(0).signature.matches("[0-9a-f]{64}"));
    }

    @Test
    void quoteSendsNoPriceAndReturnsCrmQuote() throws Exception {
        nextStatus = 201;
        nextBody = "{\"quoteId\":\"BCQ-1\",\"productCode\":\"FY_ANNUAL\",\"priceCents\":29900,"
                + "\"validDays\":365,\"expiresAt\":\"2026-11-08T11:00:00+08:00\"}";
        BrandMemberClient client = new BrandMemberClient(properties());

        JsonNode quote = client.quote("42", "FY_ANNUAL");
        assertEquals(29900, quote.path("priceCents").asInt());

        Captured sent = captured.get(0);
        assertEquals("POST", sent.method);
        JsonNode body = new ObjectMapper().readTree(sent.body);
        assertEquals("retreat", body.path("business").asText());
        assertEquals("42", body.path("localUserId").asText());
        assertEquals("FY_ANNUAL", body.path("productCode").asText());
        assertFalse(body.has("priceCents"));
    }

    @Test
    void mapsKnownErrorsWithoutLeakingInternalBody() {
        BrandMemberClient client = new BrandMemberClient(properties());

        nextStatus = 404;
        nextBody = "{\"error\":\"MEMBER_NOT_FOUND\",\"message\":\"stack /secret\"}";
        BusinessException missing = assertThrows(BusinessException.class, () -> client.me("42"));
        assertTrue(missing.getMessage().contains("同步"));
        assertFalse(missing.getMessage().contains("secret"));

        nextStatus = 403;
        nextBody = "{\"error\":\"GAME_UNAVAILABLE\"}";
        BusinessException game = assertThrows(BusinessException.class, () -> client.gameTicket("42"));
        assertTrue(game.getMessage().contains("愈行之旅"));

        nextStatus = 500;
        nextBody = "{\"message\":\"内部堆栈 /secret\"}";
        BusinessException failure = assertThrows(BusinessException.class, () -> client.me("42"));
        assertTrue(failure.getMessage().contains("暂时不可用"));
        assertFalse(failure.getMessage().contains("secret"));
        assertEquals(BrandMemberException.UNAVAILABLE, ((BrandMemberException) failure).getCode());
    }

    @Test
    void refundQuoteReadsCrmRuleByOrderRef() {
        nextBody = "{\"cardId\":\"MBC-1\",\"source\":\"PAID\",\"window\":\"AFTER_7D\",\"refundType\":\"AFTER_7D\","
                + "\"paidCents\":29900,\"savedCents\":12000,\"redeemedGiftCents\":5000,"
                + "\"refundableCents\":12900,\"allowed\":true,\"reasonCode\":null,\"message\":\"可退 ¥129\"}";
        BrandMemberClient client = new BrandMemberClient(properties());

        JsonNode quote = client.refundQuote("C20261108A");
        assertEquals(12900, quote.path("refundableCents").asInt());
        assertEquals("GET", captured.get(0).method);
        assertEquals("/api/v1/brand-member/refund-quote?orderRef=C20261108A", captured.get(0).path);

        nextBody = "{\"allowed\":\"yes\"}";
        BusinessException malformed = assertThrows(BusinessException.class, () -> client.refundQuote("C1"));
        assertEquals(503, malformed.getStatus());
    }

    @Test
    void customerFacingCrmMessagesPassThroughWithCode() {
        BrandMemberClient client = new BrandMemberClient(properties());

        nextStatus = 409;
        nextBody = "{\"error\":\"GIFT_CODE_FULL\",\"message\":\"已满，该会员码名额已领完\"}";
        BrandMemberException full = assertThrows(BrandMemberException.class, () -> client.claimGift("42", "WELCOME30"));
        assertEquals("GIFT_CODE_FULL", full.getCode());
        assertEquals(409, full.getStatus());
        assertEquals("已满，该会员码名额已领完", full.getMessage());

        nextStatus = 403;
        nextBody = "{\"error\":\"MEMBERS_ONLY\",\"message\":\"会员故事仅对品牌会员开放\"}";
        BrandMemberException members = assertThrows(BrandMemberException.class, () -> client.stories("42"));
        assertEquals(403, members.getStatus());
        assertTrue(members.getMessage().contains("品牌会员"));

        nextStatus = 404;
        nextBody = "{\"error\":\"CARD_NOT_FOUND\",\"message\":\"internal\"}";
        BrandMemberException missing = assertThrows(BrandMemberException.class,
                () -> client.refund("C1", null, 0, "WITHIN_7D", "", "2026-11-08T10:00:00+08:00", "k"));
        assertTrue(missing.is("CARD_NOT_FOUND"));
        assertFalse(missing.getMessage().contains("internal"));
    }

    @Test
    void giftClaimAndFeedbackSendBusinessAndLocalUser() throws Exception {
        nextStatus = 201;
        nextBody = "{\"card\":{\"state\":\"ACTIVE\",\"validUntil\":\"2026-12-07\"},\"days\":30,\"replayed\":false}";
        BrandMemberClient client = new BrandMemberClient(properties());

        JsonNode claimed = client.claimGift("42", "WELCOME30");
        assertEquals(30, claimed.path("days").asInt());
        JsonNode body = new ObjectMapper().readTree(captured.get(0).body);
        assertEquals("/api/v1/brand-member/gift/claim", captured.get(0).path);
        assertEquals(BUSINESS, body.path("business").asText());
        assertEquals("42", body.path("localUserId").asText());
        assertEquals("WELCOME30", body.path("code").asText());

        nextBody = "{\"replayed\":true,\"card\":null,\"days\":30}";
        assertTrue(client.claimGift("42", "WELCOME30").path("replayed").asBoolean());

        nextBody = "{\"id\":\"FB-1\"}";
        client.feedback("42", "按摩床很舒服", true);
        JsonNode feedback = new ObjectMapper().readTree(captured.get(2).body);
        assertEquals("按摩床很舒服", feedback.path("content").asText());
        assertTrue(feedback.path("allowQuote").asBoolean());
    }

    @Test
    void orderReportUsesStableIdempotencyKeys() throws Exception {
        List<String> keys = new ArrayList<>();
        server.removeContext("/");
        server.createContext("/", exchange -> {
            keys.add(exchange.getRequestHeaders().getFirst("idempotency-key"));
            handle(exchange);
        });
        BrandMemberClient client = new BrandMemberClient(properties());

        client.reportOrder("42", "QL-1001", 39800, 6000, "2026-11-08T10:00:00+08:00");
        client.refundOrder("42", "QL-1001", 19900, "2026-11-08T11:00:00+08:00");

        assertEquals("retreat:order:QL-1001", keys.get(0));
        assertEquals("retreat:refund:QL-1001:19900", keys.get(1));
        JsonNode report = new ObjectMapper().readTree(captured.get(0).body);
        assertEquals(39800, report.path("paidCents").asInt());
        assertEquals(6000, report.path("savedCents").asInt());
        assertEquals("/api/v1/brand-member/orders/refund", captured.get(1).path);
    }
}
