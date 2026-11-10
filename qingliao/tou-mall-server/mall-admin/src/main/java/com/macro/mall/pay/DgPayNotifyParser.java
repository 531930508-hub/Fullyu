package com.macro.mall.pay;

import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.huifu.bspay.sdk.opps.core.utils.RsaUtils;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 汇付斗拱异步通知解析（v2 通知格式）。
 *
 * <p>通知体是 application/x-www-form-urlencoded：
 * {@code resp_code=...&resp_desc=...&sign=...&resp_data=<JSON>}，
 * {@code sign} 为平台私钥对 {@code resp_data} 原文的 SHA256WithRSA 签名，
 * 需用汇付平台公钥验签。旧的 MD5(JSON + signSecret) 校验只适用于历史回调格式。</p>
 */
public final class DgPayNotifyParser {

    private DgPayNotifyParser() {
    }

    /**
     * 解析并验证 form 格式通知。验签失败、格式不对或不是 form 通知时返回 null。
     *
     * @param body      原始请求体
     * @param publicKeys 可接受的汇付平台公钥（可传多个，命中任一即通过）
     */
    public static JSONObject verifyAndParse(String body, String... publicKeys) {
        if (body == null || body.trim().isEmpty() || body.trim().startsWith("{")) {
            return null;
        }
        Map<String, String> form = parseForm(body.trim());
        String respData = form.get("resp_data");
        String sign = form.get("sign");
        if (!hasText(respData) || !hasText(sign) || publicKeys == null) {
            return null;
        }
        for (String key : publicKeys) {
            if (!hasText(key)) {
                continue;
            }
            try {
                if (RsaUtils.verify(respData, key, sign)) {
                    try {
                        return JSON.parseObject(respData);
                    } catch (RuntimeException e) {
                        return null;
                    }
                }
            } catch (Exception ignored) {
                // 尝试下一个公钥
            }
        }
        return null;
    }

    static Map<String, String> parseForm(String body) {
        Map<String, String> form = new LinkedHashMap<>();
        for (String pair : body.split("&")) {
            int index = pair.indexOf('=');
            if (index <= 0) {
                continue;
            }
            try {
                String name = URLDecoder.decode(pair.substring(0, index), StandardCharsets.UTF_8.name());
                String value = URLDecoder.decode(pair.substring(index + 1), StandardCharsets.UTF_8.name());
                form.put(name, value);
            } catch (Exception ignored) {
                // 跳过无法解码的字段
            }
        }
        return form;
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }
}
