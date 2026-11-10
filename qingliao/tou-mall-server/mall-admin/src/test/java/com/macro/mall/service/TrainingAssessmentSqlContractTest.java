package com.macro.mall.service;

import com.macro.mall.incentive.mapper.TrainingAssessmentQueryMapper;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 考核记录筛选拼 SQL 的回归用例。
 * 动态片段之间少一个空格就会拼出 0AND，线上表现为 500，必须在单测里拦住。
 */
class TrainingAssessmentSqlContractTest {

    @Test void filtersAreSeparatedByWhitespace() {
        Configuration config = new Configuration();
        config.addMapper(TrainingAssessmentQueryMapper.class);

        Map<String, Object> active = params(0, LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 30));
        String sql = sql(config, "page", active);
        assertTrue(sql.contains("a.voided=? AND a.assess_date >= ? AND a.assess_date <= ?"), sql);
        assertFalse(sql.matches(".*[0-9?](AND|OR)\\b.*"), sql);

        String voided = sql(config, "page", params(1, null, LocalDate.of(2026, 11, 30)));
        assertTrue(voided.contains("a.voided=? AND a.assess_date <= ?"), voided);

        String defaultScope = sql(config, "page", params(null, null, null));
        assertTrue(defaultScope.contains("WHERE a.voided=0 ORDER BY"), defaultScope);
    }

    @Test void everyPlaceholderIsBound() {
        Configuration config = new Configuration();
        config.addMapper(TrainingAssessmentQueryMapper.class);
        Map<String, Object> params = params(0, LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 30));
        params.put("shopIds", java.util.Arrays.asList(1L, 2L));
        params.put("result", 0);
        params.put("projectKey", "sujin_head");
        BoundSql bound = config.getMappedStatement(
                TrainingAssessmentQueryMapper.class.getName() + ".page").getBoundSql(params);
        long placeholders = bound.getSql().chars().filter(c -> c == '?').count();
        assertEquals(bound.getParameterMappings().size(), placeholders, bound.getSql());
    }

    private String sql(Configuration config, String method, Map<String, Object> params) {
        BoundSql bound = config.getMappedStatement(
                TrainingAssessmentQueryMapper.class.getName() + "." + method).getBoundSql(params);
        return bound.getSql().replaceAll("\\s+", " ").trim();
    }

    private Map<String, Object> params(Integer voided, LocalDate start, LocalDate end) {
        Map<String, Object> params = new HashMap<>();
        params.put("voided", voided);
        params.put("start", start);
        params.put("end", end);
        params.put("offset", 0);
        params.put("size", 20);
        return params;
    }
}
