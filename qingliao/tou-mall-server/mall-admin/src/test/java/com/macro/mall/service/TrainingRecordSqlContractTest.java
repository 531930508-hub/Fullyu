package com.macro.mall.service;

import com.alibaba.fastjson2.JSON;
import com.macro.mall.incentive.mapper.IncentiveQueryMapper;
import com.macro.mall.incentive.mapper.TrainingRecordPageMapper;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Actual annotation/XML SQL and bound values for the isolated temporary-table contract. */
class TrainingRecordSqlContractTest {
    @Test void emitsActualPeopleAndPageOrderSql() throws Exception {
        Configuration config = new Configuration();
        config.addMapper(TrainingRecordPageMapper.class);
        String resource = "com/macro/mall/incentive/mapper/IncentiveQueryMapper.xml";
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(resource)) {
            assertNotNull(in); new XMLMapperBuilder(in, config, resource, config.getSqlFragments()).parse();
        }
        List<Map<String, Object>> output = new ArrayList<>();
        for (Integer status : Arrays.asList(1, 0, 2, null)) {
            Map<String, Object> params = people(status, null);
            output.add(query(config, "count-" + status, TrainingRecordPageMapper.class, "countPeople", params));
            output.add(query(config, "people-" + status, TrainingRecordPageMapper.class, "selectPeople", params));
        }
        for (String keyword : Arrays.asList("甲", "%_")) {
            Map<String, Object> params = people(1, keyword);
            output.add(query(config, "count-" + keyword, TrainingRecordPageMapper.class, "countPeople", params));
            output.add(query(config, "people-" + keyword, TrainingRecordPageMapper.class, "selectPeople", params));
        }
        Map<String, Object> next = people(1, null); next.put("offset", 1);
        output.add(query(config, "next-page", TrainingRecordPageMapper.class, "selectPeople", next));
        next.put("offset", 0); next.put("shopId", null); next.put("size", 100);
        output.add(query(config, "all-shops", TrainingRecordPageMapper.class, "selectPeople", next));
        Map<String, Object> orders = new HashMap<>();
        orders.put("start", "2026-01-02 00:00:00"); orders.put("end", "2026-02-01 00:00:00");
        orders.put("shopIds", Collections.singletonList(5L)); orders.put("massagistIds", Arrays.asList(7L, 8L));
        output.add(query(config, "page-orders", IncentiveQueryMapper.class, "selectServiceDetailsForMassagists", orders));
        orders.put("shopIds", null);
        output.add(query(config, "all-shop-orders", IncentiveQueryMapper.class, "selectServiceDetailsForMassagists", orders));
        orders.put("massagistIds", Collections.emptyList());
        output.add(query(config, "empty-ids", IncentiveQueryMapper.class, "selectServiceDetailsForMassagists", orders));
        orders.put("massagistIds", Arrays.asList(7L, 8L)); orders.put("shopIds", Collections.emptyList());
        output.add(query(config, "empty-shops", IncentiveQueryMapper.class, "selectServiceDetailsForMassagists", orders));
        assertEquals(18, output.size());
        Files.write(Paths.get("target", "training-record-sql.json"), JSON.toJSONString(output).getBytes(StandardCharsets.UTF_8));
    }
    Map<String, Object> people(Integer status, String keyword) {
        Map<String, Object> params = new HashMap<>();
        params.put("shopId", 5L); params.put("status", status); params.put("keyword", keyword);
        params.put("offset", 0); params.put("size", 1); return params;
    }
    Map<String, Object> query(Configuration config, String name, Class<?> mapper, String method, Map<String, Object> params) {
        BoundSql bound = config.getMappedStatement(mapper.getName() + "." + method).getBoundSql(params);
        String sql = bound.getSql().replaceAll("\\s+", " ").trim();
        assertFalse(sql.contains("${")); assertFalse(sql.contains("<if"));
        List<Object> values = new ArrayList<>();
        for (ParameterMapping mapping : bound.getParameterMappings()) {
            String property = mapping.getProperty();
            values.add(bound.hasAdditionalParameter(property) ? bound.getAdditionalParameter(property)
                    : config.newMetaObject(params).getValue(property));
        }
        assertEquals(values.size(), sql.chars().filter(c -> c == '?').count());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("name", name); result.put("sql", sql); result.put("values", values); return result;
    }
}
