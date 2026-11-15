package com.macro.mall.utils;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 默认昵称生成规则：不拼手机号、格式固定为「中文词+4位数字」，
 * 且词库与历史数据迁移脚本保持一致。
 */
class NicknameGeneratorTest {

    private static final Path MIGRATION_SQL =
            Paths.get("..", "sql", "2026-11-12-customer-nickname-anonymize.sql");

    @Test
    void nicknameIsChineseWordPlusFourDigits() {
        Pattern format = Pattern.compile("^[\\u4e00-\\u9fa5]{2}\\d{4}$");
        for (int i = 0; i < 2000; i++) {
            String nickname = NicknameGenerator.randomNickname();
            assertTrue(format.matcher(nickname).matches(), "unexpected nickname: " + nickname);
        }
    }

    @Test
    void nicknameNeverEmbedsPhoneNumber() {
        for (int i = 0; i < 2000; i++) {
            String nickname = NicknameGenerator.randomNickname();
            assertFalse(nickname.matches(".*\\d{7,}.*"), "nickname keeps a long number: " + nickname);
            assertFalse(nickname.startsWith("用户"));
        }
    }

    @Test
    void nicknameIsRandomEnough() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 500; i++) {
            seen.add(NicknameGenerator.randomNickname());
        }
        // 500 次采样落在 48*10000 的空间里，重复应该极少；低于 400 说明随机源有问题
        assertTrue(seen.size() > 400, "too many duplicates: " + seen.size());
    }

    @Test
    void wordPoolMatchesMigrationSql() throws Exception {
        assertTrue(Files.exists(MIGRATION_SQL), "missing migration sql: " + MIGRATION_SQL.toAbsolutePath());
        String sql = new String(Files.readAllBytes(MIGRATION_SQL), StandardCharsets.UTF_8);
        int elt = sql.indexOf("ELT(");
        int lpad = sql.indexOf("LPAD(", elt);
        assertTrue(elt > 0 && lpad > elt, "迁移脚本里找不到 ELT 词库");
        Matcher matcher = Pattern.compile("'([\\u4e00-\\u9fa5]{2})'").matcher(sql.substring(elt, lpad));
        List<String> wordsInSql = new ArrayList<>();
        while (matcher.find()) {
            wordsInSql.add(matcher.group(1));
        }
        assertEquals(Arrays.asList(NicknameGenerator.WORDS), wordsInSql,
                "NicknameGenerator.WORDS 与迁移脚本 ELT 词库顺序不一致，改词库请两边同步");
    }
}