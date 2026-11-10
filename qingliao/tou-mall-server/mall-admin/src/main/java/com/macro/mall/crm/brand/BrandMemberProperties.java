package com.macro.mall.crm.brand;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.net.URI;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 品牌会员（CRM X-Fy 契约）对接配置。
 *
 * <p>默认关闭：仅在显式开启或配置了 base-url 时才启用；填 0 / false / off 可强制关闭。
 * 启用后配置不完整时启动失败，避免“以为接上了、实际仍在用本地数据”的静默回退。</p>
 *
 * <p>密钥按业务绑定（本端为 retreat），与旧 CRM 的 ql 密钥不同，不能混用。</p>
 */
@Component
public class BrandMemberProperties {
    private static final Pattern KEY_ID = Pattern.compile("^[A-Za-z0-9._:-]{1,64}$");

    private final String enabled;
    private final String baseUrl;
    private final String keyId;
    private final String secret;
    private int timeoutMs;

    private boolean active;

    public BrandMemberProperties(
            @Value("${brand-crm.enabled:}") String enabled,
            @Value("${brand-crm.base-url:}") String baseUrl,
            @Value("${brand-crm.key-id:}") String keyId,
            @Value("${brand-crm.secret:}") String secret,
            @Value("${brand-crm.timeout-ms:3000}") int timeoutMs) {
        this.enabled = enabled;
        this.baseUrl = baseUrl;
        this.keyId = keyId;
        this.secret = secret;
        this.timeoutMs = timeoutMs;
    }

    @PostConstruct
    public void init() {
        active = resolveActive(enabled, baseUrl);
        if (!active) {
            return;
        }
        String url = trim(baseUrl);
        if (url == null) {
            throw new IllegalStateException("品牌会员已开启但缺少 brand-crm.base-url");
        }
        requireHttps(url);
        if (trim(keyId) == null || !KEY_ID.matcher(trim(keyId)).matches()) {
            throw new IllegalStateException("brand-crm.key-id 不合法（1-64 位字母、数字或 . _ : -）");
        }
        if (trim(secret) == null || trim(secret).length() < 16) {
            throw new IllegalStateException("brand-crm.secret 长度至少 16 位");
        }
        this.normalizedBaseUrl = url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
        if (timeoutMs < 300) {
            timeoutMs = 300;
        } else if (timeoutMs > 15000) {
            timeoutMs = 15000;
        }
    }

    private String normalizedBaseUrl;

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
            throw new IllegalStateException("brand-crm.base-url 不是合法地址");
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            throw new IllegalStateException("brand-crm.base-url 必须以 http:// 或 https:// 开头");
        }
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        boolean local = "localhost".equals(host) || "127.0.0.1".equals(host) || "::1".equals(host);
        if (!"https".equals(scheme) && !local) {
            throw new IllegalStateException("非本机地址的 brand-crm.base-url 必须使用 https");
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
        return normalizedBaseUrl != null ? normalizedBaseUrl : trim(baseUrl);
    }

    public String getKeyId() {
        return trim(keyId);
    }

    public String getSecret() {
        return trim(secret);
    }

    public int getTimeoutMs() {
        return timeoutMs;
    }
}
