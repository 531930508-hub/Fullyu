package com.macro.mall.crm;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.net.URI;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 会员中心（CRM）对接配置。
 *
 * <p>默认关闭：仅在显式开启或配置了 base-url 时才启用；填 0 / false / off 可强制关闭。
 * 启用后配置不完整时启动失败，避免“以为接上了、实际仍在用本地积分”的静默回退。</p>
 */
@Component
public class CrmProperties {
    private static final Pattern KEY_ID = Pattern.compile("^[A-Za-z0-9._:-]{1,64}$");

    @Value("${crm.enabled:}")
    private String enabled;

    @Value("${crm.base-url:}")
    private String baseUrl;

    @Value("${crm.key-id:}")
    private String keyId;

    @Value("${crm.secret:}")
    private String secret;

    @Value("${crm.timeout-ms:3000}")
    private int timeoutMs;

    private boolean active;

    @PostConstruct
    void init() {
        active = resolveActive(enabled, baseUrl);
        if (!active) {
            baseUrl = null;
            return;
        }
        String url = trim(baseUrl);
        if (url == null) {
            throw new IllegalStateException("CRM 已开启但缺少 crm.base-url");
        }
        requireHttps(url);
        if (trim(keyId) == null || !KEY_ID.matcher(trim(keyId)).matches()) {
            throw new IllegalStateException("crm.key-id 不合法（1-64 位字母、数字或 . _ : -）");
        }
        if (trim(secret) == null || trim(secret).length() < 16) {
            throw new IllegalStateException("crm.secret 长度至少 16 位");
        }
        baseUrl = url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
        if (timeoutMs < 300) {
            timeoutMs = 300;
        } else if (timeoutMs > 15000) {
            timeoutMs = 15000;
        }
    }

    static boolean resolveActive(String enabled, String baseUrl) {
        String flag = trim(enabled);
        if (flag != null) {
            String lower = flag.toLowerCase(Locale.ROOT);
            if ("0".equals(lower) || "false".equals(lower) || "off".equals(lower) || "no".equals(lower)) {
                return false;
            }
            if ("1".equals(lower) || "true".equals(lower) || "on".equals(lower) || "yes".equals(lower)) {
                return true;
            }
        }
        return trim(baseUrl) != null;
    }

    private void requireHttps(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("crm.base-url 不是合法地址");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new IllegalStateException("crm.base-url 必须以 http:// 或 https:// 开头");
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        boolean local = "localhost".equals(host) || "127.0.0.1".equals(host) || "::1".equals(host);
        if (!"https".equals(scheme) && !local) {
            throw new IllegalStateException("非本机地址的 crm.base-url 必须使用 https");
        }
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String text = value.trim();
        return text.isEmpty() ? null : text;
    }

    public boolean isActive() {
        return active;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getKeyId() {
        return keyId == null ? null : keyId.trim();
    }

    public String getSecret() {
        return secret == null ? null : secret.trim();
    }

    public int getTimeoutMs() {
        return timeoutMs;
    }
}
