package com.macro.mall.common.utils;

/**
 * 敏感配置读取工具：优先读环境变量，其次 JVM 系统属性。
 * 仓库中不保留任何真实密钥，部署时通过环境变量注入。
 */
public final class Env {

    private Env() {
    }

    public static String get(String key, String fallback) {
        String value = System.getenv(key);
        if (value == null || value.isEmpty()) {
            value = System.getProperty(key);
        }
        return (value == null || value.isEmpty()) ? fallback : value;
    }

    public static String get(String key) {
        return get(key, "");
    }
}