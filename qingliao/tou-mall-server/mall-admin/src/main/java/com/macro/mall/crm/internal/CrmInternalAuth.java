package com.macro.mall.crm.internal;

import com.macro.mall.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * CRM → 轻疗内部支付接口的签名校验。
 *
 * <p>签名串：{@code timestamp\nnonce\nMETHOD\nrequestURI(+?query)\nsha256hex(body)}，
 * HMAC-SHA256 后取小写十六进制。时间戳允许 ±maxSkewSeconds，nonce 在窗口内不可重复，
 * 防止请求被截获后重放（退款是资金操作，必须防重放）。</p>
 *
 * <p>校验失败统一返回 401，不回显任何密钥或期望签名；失败原因只写日志。</p>
 */
@Component
@Slf4j
public class CrmInternalAuth {
    private static final Pattern NONCE = Pattern.compile("^[A-Za-z0-9._:-]{8,64}$");
    private static final Pattern SIGNATURE = Pattern.compile("^[0-9a-f]{64}$");
    private static final int MAX_NONCE_ENTRIES = 4096;

    @Autowired
    private CrmInternalProperties properties;

    private final Map<String, Long> seenNonces = new ConcurrentHashMap<>();

    /**
     * 校验请求签名。body 必须是实际收到的原始字节（JSON 反序列化前）。
     *
     * @throws BusinessException 401，调用方应映射为 HTTP 401
     */
    public void verify(HttpServletRequest request, String rawBody) {
        if (!properties.isActive()) {
            throw new BusinessException("接口未启用", 404);
        }
        String key = header(request, "x-crm-key");
        String timestamp = header(request, "x-crm-timestamp");
        String nonce = header(request, "x-crm-nonce");
        String signature = header(request, "x-crm-signature");
        if (key == null || timestamp == null || nonce == null || signature == null) {
            throw deny("缺少签名头", null);
        }
        if (!constantEquals(properties.getKeyId(), key)) {
            throw deny("key 不匹配", null);
        }
        long seconds;
        try {
            seconds = Long.parseLong(timestamp);
        } catch (NumberFormatException e) {
            throw deny("时间戳格式错误", null);
        }
        long now = System.currentTimeMillis() / 1000L;
        if (Math.abs(now - seconds) > properties.getMaxSkewSeconds()) {
            throw deny("时间戳超出允许范围", null);
        }
        if (!NONCE.matcher(nonce).matches()) {
            throw deny("nonce 格式错误", null);
        }
        if (!SIGNATURE.matcher(signature).matches()) {
            throw deny("签名格式错误", null);
        }
        String path = request.getRequestURI();
        String query = request.getQueryString();
        if (query != null && !query.isEmpty()) {
            path = path + "?" + query;
        }
        String expected = sign(properties.getSecret(), timestamp, nonce,
                request.getMethod(), path, rawBody == null ? "" : rawBody);
        if (!constantEquals(expected, signature)) {
            throw deny("签名校验失败", path);
        }
        remember(nonce, now);
    }

    private void remember(String nonce, long now) {
        long expireAt = now + Math.max(60, properties.getMaxSkewSeconds() * 2L);
        if (seenNonces.size() > MAX_NONCE_ENTRIES) {
            seenNonces.entrySet().removeIf(entry -> entry.getValue() < now);
        }
        Long previous = seenNonces.putIfAbsent(nonce, expireAt);
        if (previous != null && previous >= now) {
            throw deny("nonce 重复", null);
        }
        if (previous != null) {
            seenNonces.put(nonce, expireAt);
        }
    }

    private BusinessException deny(String reason, String path) {
        log.warn("CRM 内部接口校验失败, reason={}, path={}", reason, path);
        return new BusinessException("签名校验失败", 401);
    }

    private static String header(HttpServletRequest request, String name) {
        String value = request.getHeader(name);
        if (value == null) {
            return null;
        }
        String text = value.trim();
        return text.isEmpty() ? null : text;
    }

    /** 与 CRM 端完全一致的签名算法。 */
    static String sign(String secret, String timestamp, String nonce, String method,
                       String path, String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bodyHash = digest.digest(body.getBytes(StandardCharsets.UTF_8));
            String signing = timestamp + "\n" + nonce + "\n" + method.toUpperCase() + "\n"
                    + path + "\n" + hex(bodyHash);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return hex(mac.doFinal(signing.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("内部接口签名失败", e);
        }
    }

    private static boolean constantEquals(String expected, String actual) {
        if (expected == null || actual == null) {
            return false;
        }
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }

    private static String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            builder.append(Character.forDigit((b >> 4) & 0xF, 16));
            builder.append(Character.forDigit(b & 0xF, 16));
        }
        return builder.toString();
    }
}
