package com.macro.mall.crm.internal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * CRM → 轻疗内部支付服务对接配置（仅服务端调用，不暴露给小程序）。
 *
 * <p>默认关闭：显式开启或同时配置了 key-id 与 secret 才启用；启用后配置不完整时启动失败，
 * 避免“以为接上了、实际调用全部 401”的静默问题。密钥只通过环境变量注入。</p>
 */
@Component
public class CrmInternalProperties {
    private static final Pattern KEY_ID = Pattern.compile("^[A-Za-z0-9._:-]{1,64}$");

    private final String enabled;
    private final String keyId;
    private final String secret;
    private final int maxSkewSeconds;

    private boolean active;

    public CrmInternalProperties(
            @Value("${crm-internal.enabled:}") String enabled,
            @Value("${crm-internal.key-id:}") String keyId,
            @Value("${crm-internal.secret:}") String secret,
            @Value("${crm-internal.max-skew-seconds:300}") int maxSkewSeconds) {
        this.enabled = enabled;
        this.keyId = keyId;
        this.secret = secret;
        this.maxSkewSeconds = maxSkewSeconds;
    }

    @PostConstruct
    public void init() {
        String flag = trim(enabled);
        boolean configured = trim(keyId) != null && trim(secret) != null;
        if (flag != null) {
            String lower = flag.toLowerCase(Locale.ROOT);
            if ("0".equals(lower) || "false".equals(lower) || "off".equals(lower) || "no".equals(lower)) {
                active = false;
                return;
            }
        }
        active = configured || ("1".equals(flag) || "true".equalsIgnoreCase(flag)
                || "on".equalsIgnoreCase(flag) || "yes".equalsIgnoreCase(flag));
        if (!active) {
            return;
        }
        if (!configured) {
            throw new IllegalStateException("CRM 内部接口已开启但缺少 crm-internal.key-id / secret");
        }
        if (!KEY_ID.matcher(trim(keyId)).matches()) {
            throw new IllegalStateException("crm-internal.key-id 不合法（1-64 位字母、数字或 . _ : -）");
        }
        if (trim(secret).length() < 16) {
            throw new IllegalStateException("crm-internal.secret 长度至少 16 位");
        }
    }

    public boolean isActive() {
        return active;
    }

    public String getKeyId() {
        return trim(keyId);
    }

    public String getSecret() {
        return trim(secret);
    }

    public int getMaxSkewSeconds() {
        return maxSkewSeconds > 0 ? maxSkewSeconds : 300;
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String out = value.trim();
        return out.isEmpty() ? null : out;
    }
}
