package com.macro.mall.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

import java.util.ArrayList;
import java.util.List;

/**
 * 疗愈师身份编码。一个疗愈师可以同时拥有多个身份，供审批流“指定岗位”使用。
 *
 * @author Full愈
 * @date 2026/11/09
 */
@Getter
@AllArgsConstructor
public enum MassagistIdentityCode {
    SHOP_MANAGER("SHOP_MANAGER", "店长"),
    TRAINER("TRAINER", "内训师"),
    ;

    private final String code;
    private final String label;

    public static MassagistIdentityCode of(String code) {
        if (code == null) return null;
        for (MassagistIdentityCode value : values()) {
            if (value.code.equalsIgnoreCase(code.trim())) return value;
        }
        return null;
    }

    public static List<String> allCodes() {
        List<String> codes = new ArrayList<>();
        for (MassagistIdentityCode value : values()) codes.add(value.code);
        return codes;
    }
}
