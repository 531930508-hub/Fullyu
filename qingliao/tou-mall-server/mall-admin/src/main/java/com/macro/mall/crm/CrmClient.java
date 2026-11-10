package com.macro.mall.crm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.macro.mall.common.exception.BusinessException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.List;

/**
 * 会员中心（CRM）对外签名接口客户端。
 *
 * <p>签名串：{@code timestamp\nMETHOD\n/api/...\nsha256hex(body)}，HMAC-SHA256 后取小写十六进制。
 * 业务身份由密钥决定，请求体只传本地用户 id。</p>
 *
 * <p>CRM 不可达时抛业务异常，绝不回退成本地积分，避免“显示 0 分”被误认为真实余额。</p>
 */
@Component
@Slf4j
public class CrmClient {
    private static final String PREFIX = "/api/external";

    @Autowired
    private CrmProperties properties;

    private final ObjectMapper objectMapper = new ObjectMapper();

    public boolean isActive() {
        return properties.isActive();
    }

    /** 解析（必要时创建）会员身份，并返回 CRM 余额。 */
    public CrmMember resolve(CrmIdentity identity) {
        if (!isActive()) {
            throw new IllegalStateException("CRM 未开启");
        }
        String body = toJson(identity);
        JsonNode node = call("POST", PREFIX + "/members/resolve", body, false);
        CrmMember member = readMember(node);
        if (member == null) {
            throw unavailable();
        }
        return member;
    }

    /** 按本地用户 id 查询会员；尚未同步时返回 null。 */
    public CrmMember getByLocalUser(String localUserId) {
        if (!isActive()) {
            throw new IllegalStateException("CRM 未开启");
        }
        JsonNode node = call("GET", PREFIX + "/members/" + encode(localUserId), null, true);
        return readMember(node);
    }

    /** 积分入账（新建身份后的欢迎积分、历史余额迁移都走这里，按 ref 幂等）。 */
    public CrmMember earn(String localUserId, long points, String reason, String ref) {
        if (!isActive()) {
            throw new IllegalStateException("CRM 未开启");
        }
        JsonNode node = call("POST", PREFIX + "/points/earn", pointsBody(localUserId, points, reason, ref), false);
        CrmMember member = new CrmMember();
        member.setMemberNo(node == null ? null : node.path("memberNo").asText(null));
        member.setBalance(node == null ? 0L : node.path("balance").asLong(0L));
        return member;
    }

    /** 积分扣减，ref 相同的重复请求由 CRM 幂等处理；余额不足时抛业务异常。 */
    public CrmMember consume(String localUserId, long points, String reason, String ref) {
        if (!isActive()) {
            throw new IllegalStateException("CRM 未开启");
        }
        JsonNode node = call("POST", PREFIX + "/points/consume", pointsBody(localUserId, points, reason, ref), false);
        CrmMember member = new CrmMember();
        member.setMemberNo(node == null ? null : node.path("memberNo").asText(null));
        member.setBalance(node == null ? 0L : node.path("balance").asLong(0L));
        return member;
    }

    private String pointsBody(String localUserId, long points, String reason, String ref) {
        java.util.Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("localUserId", localUserId);
        payload.put("points", points);
        payload.put("reason", reason);
        payload.put("ref", ref);
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (IOException e) {
            throw new IllegalArgumentException("积分请求序列化失败", e);
        }
    }

    /** 批量导入会员身份，单次最多 500 条。 */
    public CrmImportResult importMembers(List<CrmIdentity> members) {
        if (!isActive()) {
            throw new IllegalStateException("CRM 未开启");
        }
        if (members == null || members.isEmpty()) {
            CrmImportResult empty = new CrmImportResult();
            return empty;
        }
        if (members.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条");
        }
        String body;
        try {
            body = objectMapper.writeValueAsString(Collections.singletonMap("members", members));
        } catch (IOException e) {
            throw new IllegalArgumentException("导入数据序列化失败", e);
        }
        JsonNode node = call("POST", PREFIX + "/members/import", body, false);
        CrmImportResult result = new CrmImportResult();
        result.setSubmitted(members.size());
        if (node == null) {
            return result;
        }
        result.setCreated(node.path("created").asInt(0));
        result.setBound(node.path("bound").asInt(0));
        result.setUnchanged(node.path("unchanged").asInt(0));
        JsonNode failed = node.path("failed");
        if (failed.isArray()) {
            for (JsonNode item : failed) {
                CrmImportResult.Failure failure = new CrmImportResult.Failure();
                failure.setLocalUserId(item.path("localUserId").asText(""));
                failure.setReason(item.path("reason").asText(""));
                result.getFailed().add(failure);
            }
        }
        return result;
    }

    private CrmMember readMember(JsonNode node) {
        if (node == null || node.isNull() || !node.hasNonNull("balance")) {
            return null;
        }
        CrmMember member = new CrmMember();
        member.setMemberId(node.path("memberId").asText(null));
        member.setMemberNo(node.path("memberNo").asText(null));
        member.setName(node.path("name").asText(null));
        member.setStatus(node.path("status").asText(null));
        member.setBalance(node.path("balance").asLong(0L));
        member.setCreated(node.path("created").asBoolean(false));
        member.setBound(node.path("bound").asBoolean(false));
        return member;
    }

    /**
     * 网络异常或读超时重试一次：请求可能已在 CRM 落账，所有写接口都按 ref / localUserId 幂等，
     * 用同一请求体重试不会重复扣增。
     */
    private JsonNode call(String method, String path, String body, boolean allowNotFound) {
        IOException last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                return callOnce(method, path, body, allowNotFound);
            } catch (IOException e) {
                last = e;
                log.warn("会员中心调用异常，{}重试，method={} path={} error={}",
                        attempt == 0 ? "准备" : "重试后仍失败，", method, path, e.getClass().getSimpleName());
            }
        }
        log.error("会员中心调用失败，method={} path={} error={}", method, path,
                last == null ? "unknown" : last.getClass().getSimpleName());
        throw unavailable();
    }

    private JsonNode callOnce(String method, String path, String body, boolean allowNotFound) throws IOException {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(properties.getBaseUrl() + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(properties.getTimeoutMs());
            connection.setReadTimeout(properties.getTimeoutMs());
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("x-crm-key", properties.getKeyId());
            String timestamp = String.valueOf(System.currentTimeMillis() / 1000L);
            String rawBody = body == null ? "" : body;
            connection.setRequestProperty("x-crm-timestamp", timestamp);
            connection.setRequestProperty("x-crm-signature", sign(timestamp, method, path, rawBody));
            if (body != null) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(bytes);
                }
            }
            int status = connection.getResponseCode();
            String response = readAll(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            if (status >= 200 && status < 300) {
                return response == null || response.isEmpty() ? null : objectMapper.readTree(response);
            }
            if (status == 404 && allowNotFound) {
                return null;
            }
            if (status == 409) {
                throw new BusinessException("该账号在会员中心存在需要人工合并的档案，请联系客服处理", 409);
            }
            if (status == 422) {
                throw new BusinessException(messageOf(response, "积分余额不足"), 422);
            }
            if (status == 400) {
                throw new BusinessException(messageOf(response, "积分请求未被会员中心接受"), 400);
            }
            log.error("会员中心调用失败，method={} path={} status={}", method, path, status);
            throw unavailable();
        } catch (BusinessException e) {
            throw e;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private BusinessException unavailable() {
        return new BusinessException("会员服务暂时不可用，请稍后重试", 503);
    }

    /** 取 CRM 统一错误体 {error, message} 中的 message，解析失败时用兜底文案。 */
    private String messageOf(String response, String fallback) {
        if (response == null || response.isEmpty()) {
            return fallback;
        }
        try {
            String message = objectMapper.readTree(response).path("message").asText("");
            return message.isEmpty() ? fallback : message;
        } catch (IOException e) {
            return fallback;
        }
    }

    private String toJson(CrmIdentity identity) {
        try {
            return objectMapper.writeValueAsString(identity);
        } catch (IOException e) {
            throw new IllegalArgumentException("会员身份序列化失败", e);
        }
    }

    private String encode(String value) {
        try {
            return java.net.URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 与 CRM 完全一致的签名算法；body 必须是实际发送的原始字节。 */
    static String sign(String secret, String timestamp, String method, String path, String body) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bodyHash = digest.digest(body.getBytes(StandardCharsets.UTF_8));
            String signing = timestamp + "\n" + method.toUpperCase() + "\n" + path + "\n" + hex(bodyHash);
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return hex(mac.doFinal(signing.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("会员中心签名失败", e);
        }
    }

    private String sign(String timestamp, String method, String path, String body) {
        return sign(properties.getSecret(), timestamp, method, path, body);
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
