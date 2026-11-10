package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 品牌会员 CRM 客户端（X-Fy 契约，见 CRM docs/brand-member-api-v1.md）。
 *
 * <p>签名串：{@code timestamp\nnonce\nMETHOD\n完整路径（含查询串）\nsha256hex(body)}，
 * HMAC-SHA256 后取小写十六进制；每次请求生成新 nonce，重复使用会被 CRM 拒绝。</p>
 *
 * <p>会员身份只传本地客户 id；卡期、价格、积分、骰子以 CRM 为唯一账本，
 * 不可达时显式报错，绝不回退成本地合成数据。</p>
 */
@Component
@Slf4j
public class BrandMemberClient {
    public static final String BUSINESS = "retreat";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final BrandMemberProperties properties;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public BrandMemberClient(BrandMemberProperties properties) {
        this.properties = properties;
    }

    public boolean isActive() {
        return properties.isActive();
    }

    /** 品牌会员身份、卡期、积分与骰子。 */
    public JsonNode me(String localUserId) {
        String path = "/api/v1/brand-member/me?business=" + BUSINESS
                + "&localUserId=" + encode(localUserId);
        return requireMember(call("GET", path, null, null));
    }

    /** 商品目录由 CRM 定价与版本控制。 */
    public JsonNode products() {
        JsonNode node = call("GET", "/api/v1/brand-member/products", null, null);
        if (node == null || !node.path("products").isArray()) {
            throw unavailable();
        }
        return node;
    }

    /** 报价只传产品编码；金额、版本与有效期全部由 CRM 决定。 */
    public JsonNode quote(String localUserId, String productCode) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("business", BUSINESS);
        payload.put("localUserId", localUserId);
        payload.put("productCode", productCode);
        JsonNode node = call("POST", "/api/v1/brand-member/quote", toJson(payload), null);
        if (node == null || node.path("quoteId").asText("").isEmpty()
                || !node.path("priceCents").isNumber()) {
            throw unavailable();
        }
        return node;
    }

    /**
     * 支付成功后开卡。只能由本服务端在验签回调后调用；
     * 小程序没有直接入口，避免未付款就开卡。
     */
    public JsonNode issue(String quoteId, String orderRef, long paidCents, String paidAt, String idempotencyKey) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("quoteId", quoteId);
        payload.put("orderRef", orderRef);
        payload.put("paidCents", paidCents);
        payload.put("paidAt", paidAt);
        JsonNode node = call("POST", "/api/v1/brand-member/issue", toJson(payload), idempotencyKey);
        if (node == null || !node.path("card").path("state").isTextual()) {
            throw unavailable();
        }
        return node;
    }

    /** 愈行之旅一次性入口票据（5 分钟有效，每次进入都换新）。 */
    public JsonNode gameTicket(String localUserId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("business", BUSINESS);
        payload.put("localUserId", localUserId);
        JsonNode node = call("POST", "/api/v1/brand-member/game/ticket", toJson(payload), null);
        if (node == null || node.path("ticket").asText("").isEmpty()
                || node.path("url").asText("").isEmpty()) {
            throw unavailable();
        }
        return node;
    }

    /**
     * 退款成功后撤销 CRM 卡。只能由本服务端在退款完成后调用；
     * orderRef 是开卡订单号，CRM 按 (soldBy, orderRef) 定位并保证只撤销一次。
     */
    public JsonNode refund(String orderRef, String cardId, long refundCents,
                           String refundType, String reason, String refundedAt,
                           String idempotencyKey) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("orderRef", orderRef);
        if (cardId != null && !cardId.isEmpty()) {
            payload.put("cardId", cardId);
        }
        payload.put("refundCents", refundCents);
        payload.put("refundType", refundType);
        payload.put("reason", reason == null ? "" : reason);
        payload.put("refundedAt", refundedAt);
        JsonNode node = call("POST", "/api/v1/brand-member/refund", toJson(payload), idempotencyKey);
        if (node == null || !node.path("card").path("state").isTextual()) {
            throw unavailable();
        }
        return node;
    }

    /**
     * 退款试算：CRM 是退款规则的唯一来源（7 天内全额减已兑礼券；之后再减已享优惠；
     * ≤0 或赠送/附赠资格不可退）。按开卡订单号定位，本端不再自行计算。
     */
    public JsonNode refundQuote(String orderRef) {
        JsonNode node = call("GET", "/api/v1/brand-member/refund-quote?orderRef=" + encode(orderRef), null, null);
        if (node == null || !node.path("allowed").isBoolean()
                || !node.path("refundableCents").isNumber()
                || !node.path("refundType").isTextual()) {
            throw unavailable();
        }
        return node;
    }

    /** 兑换赠送会员码；名额、截止、暂停与重复领取全部由 CRM 判定。 */
    public JsonNode claimGift(String localUserId, String code) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("business", BUSINESS);
        payload.put("localUserId", localUserId);
        payload.put("code", code);
        JsonNode node = call("POST", "/api/v1/brand-member/gift/claim", toJson(payload), null);
        // 重复领取（replayed）时 CRM 可能已无对应卡，只要求结果可识别
        boolean replayed = node != null && node.path("replayed").asBoolean(false);
        if (node == null || (!replayed && !node.path("card").path("state").isTextual())) {
            throw unavailable();
        }
        return node;
    }

    /** 意见反馈；频率限制由 CRM 控制。 */
    public JsonNode feedback(String localUserId, String content, boolean allowQuote) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("business", BUSINESS);
        payload.put("localUserId", localUserId);
        payload.put("content", content);
        payload.put("allowQuote", allowQuote);
        JsonNode node = call("POST", "/api/v1/brand-member/feedback", toJson(payload), null);
        return node == null ? objectMapper.createObjectNode() : node;
    }

    /** 会员故事：仅有效会员可读，由 CRM 判定（非会员返回 MEMBERS_ONLY）。 */
    public JsonNode stories(String localUserId) {
        String path = "/api/v1/brand-member/stories?business=" + BUSINESS
                + "&localUserId=" + encode(localUserId);
        JsonNode node = call("GET", path, null, null);
        if (node == null || !node.path("stories").isArray()) {
            throw unavailable();
        }
        return node;
    }

    /**
     * 消费订单上报（每满 ¥300 得一颗骰子、累计会员已享优惠）。只由服务端定时任务调用；
     * CRM 按 orderRef 幂等：同额重放成功、改额 409。
     */
    public JsonNode reportOrder(String localUserId, String orderRef, long paidCents,
                                long savedCents, String occurredAt) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("localUserId", localUserId);
        payload.put("orderRef", orderRef);
        payload.put("paidCents", paidCents);
        payload.put("savedCents", savedCents);
        payload.put("occurredAt", occurredAt);
        return call("POST", "/api/v1/brand-member/orders/report", toJson(payload),
                "retreat:order:" + orderRef);
    }

    /** 订单累计退款上报；refundCents 是该单累计已退金额（分），不是本次增量。 */
    public JsonNode refundOrder(String localUserId, String orderRef, long refundCents, String occurredAt) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("localUserId", localUserId);
        payload.put("orderRef", orderRef);
        payload.put("refundCents", refundCents);
        payload.put("occurredAt", occurredAt);
        return call("POST", "/api/v1/brand-member/orders/refund", toJson(payload),
                "retreat:refund:" + orderRef + ":" + refundCents);
    }

    private JsonNode requireMember(JsonNode node) {
        if (node == null
                || node.path("member").path("memberNo").asText("").isEmpty()
                || !node.path("card").path("state").isTextual()
                || !node.path("points").path("balance").isNumber()) {
            throw unavailable();
        }
        return node;
    }

    private JsonNode call(String method, String path, String body, String idempotencyKey) {
        if (!properties.isActive()) {
            throw new BrandMemberException("BRAND_MEMBER_DISABLED", "品牌会员服务尚未开启", 503);
        }
        HttpURLConnection connection = null;
        try {
            URL url = new URL(properties.getBaseUrl() + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(properties.getTimeoutMs());
            connection.setReadTimeout(properties.getTimeoutMs());
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("x-fy-key", properties.getKeyId());

            String timestamp = String.valueOf(System.currentTimeMillis() / 1000L);
            String nonce = newNonce();
            String rawBody = body == null ? "" : body;
            connection.setRequestProperty("x-fy-timestamp", timestamp);
            connection.setRequestProperty("x-fy-nonce", nonce);
            connection.setRequestProperty("x-fy-signature",
                    sign(properties.getSecret(), timestamp, nonce, method, path, rawBody));
            if (idempotencyKey != null) {
                connection.setRequestProperty("idempotency-key", idempotencyKey);
            }
            if (body != null) {
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(bytes);
                }
            }

            int status = connection.getResponseCode();
            String response = readAll(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            JsonNode node = response == null || response.isEmpty() ? null : objectMapper.readTree(response);
            if (status >= 200 && status < 300) {
                return node;
            }
            throw mapError(status, node);
        } catch (BusinessException e) {
            throw e;
        } catch (IOException e) {
            log.warn("品牌会员 CRM 调用异常，method={} path={} error={}", method, path, e.getClass().getSimpleName());
            throw unavailable();
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    /**
     * CRM 的这些提示本身就是写给顾客看的（会员码已满/已过期、仅会员可用、反馈太频繁、不可退款原因），
     * 原样透出，截断防止异常长文本。
     */
    private static final java.util.Set<String> PASSTHROUGH = new java.util.HashSet<>(java.util.Arrays.asList(
            "GIFT_CODE_INVALID", "GIFT_CODE_PAUSED", "GIFT_CODE_EXPIRED", "GIFT_CODE_FULL",
            "MEMBERS_ONLY", "FEEDBACK_RATE_LIMIT", "REFUND_NOT_ALLOWED", "BAD_REQUEST"));

    /** 只透出顾客可理解、可行动的情况；内部错误统一按服务不可用处理。 */
    BrandMemberException mapError(int status, JsonNode body) {
        String code = body == null ? "" : body.path("error").asText("");
        if (PASSTHROUGH.contains(code)) {
            String message = body.path("message").asText("");
            if (message.isEmpty()) {
                message = "请求未通过，请核对后重试";
            } else if (message.length() > 120) {
                message = message.substring(0, 120);
            }
            return new BrandMemberException(code, message, status >= 400 && status < 500 ? status : 400);
        }
        if ("MEMBER_NOT_FOUND".equals(code)) {
            return new BrandMemberException(code, "你的会员档案正在同步，请稍后重试", 404);
        }
        if ("GAME_UNAVAILABLE".equals(code)) {
            return new BrandMemberException(code, "开通有效 Full愈卡后才能进入愈行之旅", 403);
        }
        if ("PRODUCT_NOT_FOUND".equals(code)) {
            return new BrandMemberException(code, "该会员卡暂不可售，请稍后重试", 404);
        }
        if ("QUOTE_EXPIRED".equals(code)) {
            return new BrandMemberException(code, "报价已失效，请重新发起支付", 409);
        }
        if ("AMOUNT_MISMATCH".equals(code)) {
            return new BrandMemberException(code, "支付金额与报价不一致，请重新支付", 409);
        }
        if ("CARD_NOT_FOUND".equals(code)) {
            return new BrandMemberException(code, "未找到对应的品牌会员卡，请联系工作人员核对", 404);
        }
        if ("CARD_NOT_REFUNDABLE".equals(code)) {
            return new BrandMemberException(code, "赠送或附赠的会员资格无需退款，如有疑问请联系工作人员", 409);
        }
        if ("ALREADY_REFUNDED".equals(code)) {
            return new BrandMemberException(code, "该会员卡已退款", 409);
        }
        if ("REFUND_AMOUNT_MISMATCH".equals(code)) {
            return new BrandMemberException(code, "退款金额与会员中心试算不一致，请刷新后重试", 409);
        }
        if ("ORDER_NOT_FOUND".equals(code)) {
            return new BrandMemberException(code, "会员中心未找到该订单的上报记录", 404);
        }
        if ("IDEMPOTENCY_CONFLICT".equals(code)) {
            return new BrandMemberException(code, "该订单已按其他金额同步，请联系工作人员核对", 409);
        }
        if ("BUSINESS_MISMATCH".equals(code)) {
            return new BrandMemberException(code, "该会员卡不属于轻疗，请联系工作人员核对", 403);
        }
        log.warn("品牌会员 CRM 调用失败，status={} code={}", status, code);
        return unavailable();
    }

    private BrandMemberException unavailable() {
        return new BrandMemberException(BrandMemberException.UNAVAILABLE, "会员服务暂时不可用，请稍后重试", 503);
    }

    private String toJson(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (IOException e) {
            throw new IllegalArgumentException("品牌会员请求序列化失败", e);
        }
    }

    private static String newNonce() {
        byte[] bytes = new byte[16];
        RANDOM.nextBytes(bytes);
        return hex(bytes);
    }

    private String encode(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 与 CRM 完全一致的签名算法；body 必须是实际发送的原始字节。 */
    static String sign(String secret, String timestamp, String nonce, String method, String path, String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bodyHash = digest.digest(body.getBytes(StandardCharsets.UTF_8));
            String signing = timestamp + "\n" + nonce + "\n" + method.toUpperCase() + "\n"
                    + path + "\n" + hex(bodyHash);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return hex(mac.doFinal(signing.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("品牌会员签名失败", e);
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            builder.append(Character.forDigit((b >> 4) & 0xF, 16));
            builder.append(Character.forDigit(b & 0xF, 16));
        }
        return builder.toString();
    }

    private static String readAll(InputStream stream) throws IOException {
        if (stream == null) {
            return null;
        }
        try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int len;
            while ((len = in.read(buffer)) != -1) {
                out.write(buffer, 0, len);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
