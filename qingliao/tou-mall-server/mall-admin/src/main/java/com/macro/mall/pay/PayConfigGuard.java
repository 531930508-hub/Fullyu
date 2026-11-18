package com.macro.mall.pay;

import com.macro.mall.common.utils.Env;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * 汇付商户配置自检。
 *
 * <p>为什么需要：{@link PayCert} 用 {@link Env#get(String)} 读密钥，变量缺失时返回空串，
 * doInit 不做校验也能"成功"，直到 createPayOrder 签名阶段才抛
 * {@code Sign error. Please check your privateKey.}，被上层包装成"支付平台异常"。
 * 2026-11-19 生产因此把一次环境变量遗漏误判成汇付故障，排查花了近 2 小时。</p>
 */
public final class PayConfigGuard {

    /** 与 doInit/doInit1/doInit2/doInit3 一一对应的必需键 */
    public static final List<String> REQUIRED_KEYS = Collections.unmodifiableList(Arrays.asList(
            "PAY_SYS_ID", "PAY_SECRET",
            "PAY_SYS_ID_1", "PAY_SECRET_1",
            "PAY_SYS_ID_2", "PAY_SECRET_2",
            "PAY_SYS_ID_3", "PAY_SECRET_3",
            "PAY_SIGN_SECRET"));

    private PayConfigGuard() {
    }

    /** 返回缺失（未注入或为空）的键名，供启动审计打印 */
    public static List<String> missingKeys() {
        List<String> missing = new ArrayList<>();
        for (String key : REQUIRED_KEYS) {
            if (Env.get(key).isEmpty()) {
                missing.add(key);
            }
        }
        return missing;
    }

    /**
     * 发起支付前校验某套商户配置，缺失时直接点名环境变量，而不是把空私钥交给 SDK。
     *
     * @param merchant  商户中文名，用于日志定位（来福士/世纪汇/总公司/兜底）
     * @param sysId     商户号
     * @param sysIdKey  商户号对应的环境变量名
     * @param secret    商户私钥
     * @param secretKey 私钥对应的环境变量名
     */
    public static void require(String merchant, String sysId, String sysIdKey, String secret, String secretKey) {
        if (sysId == null || sysId.isEmpty()) {
            throw new IllegalStateException("汇付商户配置缺失：" + merchant + " 未注入环境变量 " + sysIdKey);
        }
        if (secret == null || secret.isEmpty()) {
            throw new IllegalStateException("汇付商户配置缺失：" + merchant + " 未注入环境变量 " + secretKey);
        }
    }
}
