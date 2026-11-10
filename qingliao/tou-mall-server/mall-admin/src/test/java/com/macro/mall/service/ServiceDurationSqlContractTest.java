package com.macro.mall.service;

import com.alibaba.fastjson2.JSON;
import com.macro.mall.mapper.ServiceDurationPageMapper;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

/** Parses the actual MyBatis annotations; emits synthetic bound SQL for an isolated MySQL contract. */
class ServiceDurationSqlContractTest {
    @Test void actualDynamicSqlBindsEveryFilterAndSelectedPeriod() throws Exception {
        Configuration configuration=new Configuration();configuration.addMapper(ServiceDurationPageMapper.class);
        List<Map<String,Object>> output=new ArrayList<>();
        for(int status:new int[]{1,0,-1,2}) {
            Map<String,Object> params=parameters(status);
            output.add(query(configuration,"count-"+status,"countPeriods",params));
            output.add(query(configuration,"keys-"+status,"periodKeys",params));
        }
        Map<String,Object> next=parameters(1);next.put("offset",1);
        output.add(query(configuration,"next-page","periodKeys",next));
        Map<String,Object> selected=parameters(1);
        Map<String,Object> key=new HashMap<>();key.put("massagistId",7L);key.put("periodCode","2026-11");
        selected.put("keys",Collections.singletonList(key));
        Map<String,Object> detail=query(configuration,"selected-details","detailsForPeriods",selected);
        assertTrue(((List<?>)detail.get("values")).contains("2026-11"));output.add(detail);
        selected.put("keys",Collections.emptyList());
        Map<String,Object> empty=query(configuration,"empty-details","detailsForPeriods",selected);
        assertTrue(empty.get("sql").toString().contains("1=0"));output.add(empty);
        Map<String,Object> self=parameters(-1);self.put("shopId",null);self.put("massagistId",7L);self.put("size",100);
        Map<String,Object> selfQuery=query(configuration,"self-across-shops","periodKeys",self);
        assertFalse(selfQuery.get("sql").toString().contains("d.shop_id="));
        assertTrue(selfQuery.get("sql").toString().contains("d.massagist_id="));output.add(selfQuery);
        Files.write(Paths.get("target","service-duration-sql.json"),JSON.toJSONString(output).getBytes(StandardCharsets.UTF_8));
        assertEquals(12,output.size());
    }
    Map<String,Object> parameters(int status) {
        Map<String,Object> params=new HashMap<>();params.put("shopId",5L);params.put("massagistId",null);
        params.put("startTime","2026-11-01 00:00:00");params.put("endTime","2026-11-30 23:59:59");
        params.put("status",status);params.put("offset",0);params.put("size",1);return params;
    }
    Map<String,Object> query(Configuration configuration,String name,String method,Map<String,Object> params) {
        BoundSql bound=configuration.getMappedStatement(ServiceDurationPageMapper.class.getName()+"."+method).getBoundSql(params);
        String sql=bound.getSql().replaceAll("\\s+"," ").trim();
        assertFalse(sql.contains("${"));assertFalse(sql.contains("<if"));
        List<Object> values=new ArrayList<>();
        for(ParameterMapping mapping:bound.getParameterMappings()) {
            String property=mapping.getProperty();values.add(bound.hasAdditionalParameter(property)?bound.getAdditionalParameter(property):configuration.newMetaObject(params).getValue(property));
        }
        assertEquals(values.size(),sql.chars().filter(c->c=='?').count());
        Map<String,Object> result=new LinkedHashMap<>();result.put("name",name);result.put("sql",sql);result.put("values",values);return result;
    }
}
