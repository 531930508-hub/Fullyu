package com.macro.mall.crm.brand;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.Map;

/**
 * CRM 品牌卡事件接收（X-Fy 推送契约）。
 *
 * <p>只验签并确认收到，不落本地卡状态：轻疗会员页仍实时向 CRM 取数，
 * 重复/乱序投递不会改变业务结果，重试由 CRM 侧负责。</p>
 *
 * <p>注意：nginx 把外网 {@code /api/} 前缀去掉后转发，而 CRM 是对配置的外网地址
 * 计算签名，因此签名路径必须用 {@code brand-crm.webhook-path}（默认
 * {@code /api/crm/brand-card}），不能用 {@code request.getRequestURI()}。</p>
 */
@Slf4j
@RestController
@RequestMapping("/crm/brand-card")
public class BrandCardWebhookController {
    private static final int MAX_SKEW_SECONDS = 300;
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final BrandMemberProperties properties;
    private final String webhookPath;
    private final ObjectMapper objectMapper;

    public BrandCardWebhookController(
            BrandMemberProperties properties,
            @Value("${brand-crm.webhook-path:/api/crm/brand-card}") String webhookPath,
            ObjectMapper objectMapper) {
        this.properties = properties;
        this.webhookPath = webhookPath;
        this.objectMapper = objectMapper;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> receive(HttpServletRequest request) throws IOException {
        if (!properties.isActive()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Collections.singletonMap("ok", false));
        }

        String keyId = request.getHeader("x-fy-key");
        String timestamp = request.getHeader("x-fy-timestamp");
        String nonce = request.getHeader("x-fy-nonce");
        String signature = request.getHeader("x-fy-signature");
        if (keyId == null || !keyId.equals(properties.getKeyId())
                || isEmpty(timestamp) || isEmpty(nonce) || isEmpty(signature)) {
            return unauthorized();
        }

        long seconds;
        try {
            seconds = Long.parseLong(timestamp);
        } catch (NumberFormatException e) {
            return unauthorized();
        }
        long now = System.currentTimeMillis() / 1000L;
        if (Math.abs(now - seconds) > MAX_SKEW_SECONDS) {
            return unauthorized();
        }

        byte[] body = request.getInputStream().readAllBytes();
        String expected = sign(properties.getSecret(), timestamp, nonce, webhookPath, body);
        if (!MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                signature.getBytes(StandardCharsets.UTF_8))) {
            return unauthorized();
        }

        String topic = "";
        String cardId = "";
        String memberNo = "";
        try {
            JsonNode payload = objectMapper.readTree(body);
            topic = payload.path("topic").asText("");
            cardId = payload.path("cardId").asText("");
            memberNo = payload.path("memberNo").asText("");
        } catch (IOException e) {
            // 签名通过但内容不是合法 JSON：仍然确认收到，payload 结构由 CRM 侧保证。
        }
        log.info("收到 CRM 品牌卡事件 {} {} {}", topic, cardId, memberNo);
        return ResponseEntity.ok(Collections.singletonMap("ok", true));
    }

    private static ResponseEntity<Map<String, Object>> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Collections.singletonMap("ok", false));
    }

    private static boolean isEmpty(String value) {
        return value == null || value.trim().isEmpty();
    }

    static String sign(String secret, String timestamp, String nonce, String path, byte[] body)
            throws IOException {
        String bodyHash = sha256Hex(body);
        String content = timestamp + "\n" + nonce + "\nPOST\n" + path + "\n" + bodyHash;
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM));
            return toHex(mac.doFinal(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IOException("签名失败", e);
        }
    }

    private static String sha256Hex(byte[] body) throws IOException {
        try {
            return toHex(MessageDigest.getInstance("SHA-256").digest(body));
        } catch (Exception e) {
            throw new IOException("摘要失败", e);
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(Character.forDigit((value >> 4) & 0xF, 16));
            builder.append(Character.forDigit(value & 0xF, 16));
        }
        return builder.toString();
    }
}
