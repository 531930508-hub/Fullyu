package com.macro.mall.utils;

import java.util.concurrent.ThreadLocalRandom;

/**
 * 客户默认昵称生成器。
 *
 * <p>默认昵称 = 「会员」+ 手机号后四位（如 会员7229），三端（轻疗 / 时叙 / CRM 主档）
 * 同一口径。昵称出现在客户列表、订单、排班、导出里，随机中文词店员看不出是谁，
 * 业务侧要求用号码后四位当默认称呼。</p>
 *
 * <p><b>取舍</b>：后四位属于可识别信息，2026-11-12 曾为「去手机号化」改成随机词，
 * 2026-11-21 按业务要求改回带后四位，2026-11-22 前缀统一为「会员」（CRM 主档同口径）。
 * 默认昵称不保证唯一（手机号后四位只有 1 万种，
 * 一万多位客户必然大量重名），客户检索仍以手机号为准。</p>
 *
 * <p>手机号末尾串不足四位数字的脏数据（如「朱」「852」）退回随机词昵称，保证昵称非空。</p>
 */
public final class NicknameGenerator {

    /** 默认昵称前缀，与 CRM {@code common/member-name.ts}、
     * {@code sql/2026-11-22-customer-nickname-member-tail.sql} 保持一致。 */
    public static final String DEFAULT_PREFIX = "会员";

    /**
     * 退化词库：只有手机号取不到后四位时才用「中文词+4位数字」。
     */
    public static final String[] WORDS = {
            "青竹", "小鹿", "山茶", "听雨", "清风", "暖阳", "星河", "云舒",
            "竹影", "白露", "南风", "微光", "远山", "清溪", "素衣", "知夏",
            "朝颜", "望舒", "扶摇", "云杉", "青禾", "木棉", "晚舟", "月白",
            "归羽", "拾光", "初雪", "轻岚", "溪午", "春信", "秋野", "松间",
            "兰屿", "竹溪", "小满", "惊蛰", "谷雨", "白霜", "星野", "云栖",
            "沐阳", "浅溪", "青柠", "半山", "长夏", "静水", "浮生", "疏影"
    };

    private NicknameGenerator() {
    }

    /**
     * 新建客户的默认昵称：「会员」+ 手机号后四位；取不到后四位时退回随机昵称。
     *
     * @param phone 已校验过的手机号（大陆 11 位或「+」开头的国际号码），不能为空
     */
    public static String defaultNickname(String phone) {
        String tail = phoneTail(phone);
        return tail == null ? randomNickname() : DEFAULT_PREFIX + tail;
    }

    /**
     * 取手机号末尾四位数字；末尾不足四位数字（含 null、空串、脏数据）返回 null。
     */
    public static String phoneTail(String phone) {
        if (phone == null) {
            return null;
        }
        String value = phone.trim();
        int end = value.length();
        int start = end;
        while (start > 0 && end - start < 4 && isAsciiDigit(value.charAt(start - 1))) {
            start--;
        }
        if (end - start < 4) {
            return null;
        }
        return value.substring(start, end);
    }

    /**
     * 生成随机昵称：词库随机取一词 + 4位数字（0000~9999）。
     */
    public static String randomNickname() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        String word = WORDS[random.nextInt(WORDS.length)];
        return word + String.format("%04d", random.nextInt(10000));
    }

    private static boolean isAsciiDigit(char c) {
        return c >= '0' && c <= '9';
    }
}