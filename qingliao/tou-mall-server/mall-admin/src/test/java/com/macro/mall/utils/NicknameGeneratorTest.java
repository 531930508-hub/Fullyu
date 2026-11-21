package com.macro.mall.utils;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 默认昵称规则：「会员+手机号后四位」，手机号取不到后四位时退回「中文词+4位数字」。
 *
 * <p>后四位是业务确认过的取舍（店员靠它认人）；这里守住两件事：昵称只带四位数字、
 * 不出现完整号码，且与历史数据迁移脚本的规则一致。</p>
 */
class NicknameGeneratorTest {

    private static final Path MIGRATION_SQL =
            Paths.get("..", "sql", "2026-11-22-customer-nickname-member-tail.sql");

    private static final Pattern MEMBER_TAIL = Pattern.compile("^会员\\d{4}$");
    private static final Pattern RANDOM_WORD = Pattern.compile("^[\\u4e00-\\u9fa5]{2}\\d{4}$");

    @Test
    void defaultNicknameIsMemberPlusPhoneTail() {
        assertEquals("会员8000", NicknameGenerator.defaultNickname("13800138000"));
        assertEquals("会员7996", NicknameGenerator.defaultNickname("+33688507996"));
        assertEquals("会员2184", NicknameGenerator.defaultNickname("0031622462184"));
        assertEquals("会员0000", NicknameGenerator.defaultNickname(" 13800130000 "));
        assertTrue(MEMBER_TAIL.matcher(NicknameGenerator.defaultNickname("13800138000")).matches());
    }

    @Test
    void dirtyPhoneFallsBackToRandomNickname() {
        // 脏手机号末尾不足四位数字：退回随机昵称，绝不生成「会员朱」「会员11」这种怪名字
        assertNull(NicknameGenerator.phoneTail("朱"));
        assertNull(NicknameGenerator.phoneTail("11"));
        assertNull(NicknameGenerator.phoneTail("852"));
        assertNull(NicknameGenerator.phoneTail(null));
        // 末尾夹了汉字（「18962990981朱」）：末尾四位不全是数字，同样走兜底，
        // 与迁移脚本 phone REGEXP '[0-9]{4}$' 的口径保持一致
        assertNull(NicknameGenerator.phoneTail("18962990981朱"));
        assertTrue(RANDOM_WORD.matcher(NicknameGenerator.defaultNickname("朱")).matches());
        assertTrue(RANDOM_WORD.matcher(NicknameGenerator.defaultNickname("11")).matches());
        assertTrue(RANDOM_WORD.matcher(NicknameGenerator.defaultNickname("18962990981朱")).matches());
    }

    @Test
    void phoneTailOnlyTakesTrailingDigits() {
        assertEquals("8000", NicknameGenerator.phoneTail("13800138000"));
        assertEquals("7996", NicknameGenerator.phoneTail("+33688507996"));
        assertEquals("2184", NicknameGenerator.phoneTail("0031622462184"));
        // 全角数字不算
        assertNull(NicknameGenerator.phoneTail("１３８"));
    }

    @Test
    void nicknameNeverKeepsWholePhoneNumber() {
        String[] phones = {"13800138000", "+33688507996", "0031622462184"};
        for (String phone : phones) {
            String nickname = NicknameGenerator.defaultNickname(phone);
            assertFalse(nickname.matches(".*\\d{7,}.*"), "nickname keeps a long number: " + nickname);
            assertFalse(nickname.contains(phone), "nickname keeps the whole phone: " + nickname);
        }
    }

    @Test
    void randomNicknameStaysChineseWordPlusFourDigits() {
        for (int i = 0; i < 2000; i++) {
            String nickname = NicknameGenerator.randomNickname();
            assertTrue(RANDOM_WORD.matcher(nickname).matches(), "unexpected nickname: " + nickname);
            assertFalse(nickname.startsWith("会员"), "fallback must not look like a default nickname");
            assertFalse(nickname.startsWith("用户"), "fallback must not look like an old default nickname");
        }
    }

    @Test
    void randomNicknameIsRandomEnough() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 500; i++) {
            seen.add(NicknameGenerator.randomNickname());
        }
        // 500 次采样落在 48*10000 的空间里，重复应该极少；低于 400 说明随机源有问题
        assertTrue(seen.size() > 400, "too many duplicates: " + seen.size());
    }

    @Test
    void migrationSqlKeepsSameRule() throws Exception {
        assertTrue(Files.exists(MIGRATION_SQL), "missing migration sql: " + MIGRATION_SQL.toAbsolutePath());
        String sql = new String(Files.readAllBytes(MIGRATION_SQL), StandardCharsets.UTF_8);
        // 脚本必须用同一个前缀、同一个后四位口径，且把「用户xxxx」等旧占位名一并收进来
        assertTrue(sql.contains(NicknameGenerator.DEFAULT_PREFIX), "迁移脚本前缀与代码不一致");
        assertTrue(sql.contains("RIGHT(`phone`, 4)") || sql.contains("RIGHT(`phone`,4)"),
                "迁移脚本不是按手机号后四位生成");
        assertTrue(sql.contains("用户"), "迁移脚本没有处理旧「用户xxxx」昵称");
        assertTrue(sql.contains("CONCAT('会员', RIGHT(`phone`, 4))"),
                "迁移脚本缺少「已是会员xxxx 就跳过」的幂等条件");
    }
}