package com.macro.mall.service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * 审批提醒深链签名：把 approval/detail/admin/过期时间绑定在一起，
 * 微信里点开即可凭链接处理本人待办，无需再登录后台。
 * 只做 HMAC，不放明文密钥；校验时审批服务仍会再校验节点归属与状态。
 */
public final class AdminNoticeLinkSigner {
    private static final String ALGORITHM = "HmacSHA256";

    public static String sign(String secret, long approvalId, long detailId, long adminId, long expiresAtSeconds) {
        if (secret == null || secret.trim().isEmpty()) throw new IllegalArgumentException("link secret missing");
        String raw = approvalId + ":" + detailId + ":" + adminId + ":" + expiresAtSeconds;
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), ALGORITHM));
            byte[] digest = mac.doFinal(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format(Locale.ROOT, "%02x", b));
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException("sign failed", e);
        }
    }

    public static boolean verify(String secret, long approvalId, long detailId, long adminId,
                                 long expiresAtSeconds, String signature, long nowSeconds) {
        if (secret == null || secret.trim().isEmpty() || signature == null || signature.isEmpty()) return false;
        if (expiresAtSeconds <= nowSeconds) return false;
        String expected = sign(secret, approvalId, detailId, adminId, expiresAtSeconds);
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), signature.toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8));
    }

    private AdminNoticeLinkSigner() {
    }
}