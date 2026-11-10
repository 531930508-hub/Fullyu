package com.macro.mall.crm.brand;

import com.macro.mall.common.exception.BusinessException;

/**
 * 品牌会员 CRM 调用失败，带 CRM 错误码，供调用方区分「无需处理」「需退避」「服务不可用」。
 *
 * <p>继承 BusinessException，原有全局异常处理与 HTTP 状态码不变；
 * 顾客看到的 message 仍是可理解的中文，code 只给服务端逻辑判断用。</p>
 */
public class BrandMemberException extends BusinessException {
    public static final String UNAVAILABLE = "UNAVAILABLE";

    private final String code;

    public BrandMemberException(String code, String message, int status) {
        super(message, status);
        this.code = code == null || code.isEmpty() ? UNAVAILABLE : code;
    }

    public String getCode() {
        return code;
    }

    public boolean is(String expected) {
        return code.equals(expected);
    }
}
