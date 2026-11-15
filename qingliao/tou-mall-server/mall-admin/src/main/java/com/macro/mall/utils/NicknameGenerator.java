package com.macro.mall.utils;

import java.util.concurrent.ThreadLocalRandom;

/**
 * 客户默认昵称生成器。
 *
 * <p>历史默认昵称是「用户+手机号」，等于把手机号展示在客户列表、订单、排班里，
 * 属于变相保留手机号。新建客户改用「中文词+4位数字」（如 青竹4821），与手机号无关。</p>
 *
 * <p>词库与 {@code sql/2026-11-12-customer-nickname-anonymize.sql} 的 ELT 列表保持一致，
 * 调整词库时两边要同步修改（历史数据迁移按同一套词生成）。</p>
 */
public final class NicknameGenerator {

    /**
     * 词库：两位中文词。顺序即 SQL 脚本里 ELT 的下标顺序，改动请同步脚本。
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
     * 生成随机昵称：词库随机取一词 + 4位数字（0000~9999）。
     */
    public static String randomNickname() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        String word = WORDS[random.nextInt(WORDS.length)];
        return word + String.format("%04d", random.nextInt(10000));
    }
}