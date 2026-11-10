package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.Shop;
import com.macro.mall.incentive.dto.*;
import com.macro.mall.incentive.entity.*;
import com.macro.mall.incentive.mapper.*;
import com.macro.mall.incentive.model.*;
import com.macro.mall.incentive.service.*;
import com.macro.mall.service.shop.ShopService;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.InputStream;
import java.lang.reflect.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class TrainingRecordPageTest {
    IncentiveDataService service;
    IncentiveAccessService access;
    IncentiveQueryMapper orders;
    MassagistTrainingCertMapper certs;
    MassagistService people;
    List<Massagist> selected;
    List<org.mockito.invocation.Invocation> calls;
    Object pageMapper;

    @BeforeEach void setup() {
        service = new IncentiveDataService(); access = mock(IncentiveAccessService.class);
        orders = mock(IncentiveQueryMapper.class, invocation -> {
            if (invocation.getMethod().getName().equals("selectServiceDetailsForMassagists")) {
                assertEquals(Arrays.asList(7L, 8L), invocation.getArgument(1));
                List<ServiceDetailRow> rows = new ArrayList<>();
                for (long id = 1; id <= 2; id++) {
                    ServiceDetailRow row = new ServiceDetailRow(); row.setOrderId(id); row.setMassagistId(7L);
                    row.setShopId(5L); row.setProjectId(101L); row.setDuration(60);
                    row.setServiceDate(LocalDate.of(2026, 1, (int) id + 1)); rows.add(row);
                }
                return rows;
            }
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation);
        });
        certs = mock(MassagistTrainingCertMapper.class); people = mock(MassagistService.class);
        MassagistTrainingAssessmentMapper assessments = mock(MassagistTrainingAssessmentMapper.class);
        when(assessments.selectList(any(LambdaQueryWrapper.class))).thenReturn(new ArrayList<>());
        ReflectionTestUtils.setField(service, "assessmentMapper", assessments);
        ReflectionTestUtils.setField(service, "teamCertProperties", mock(TrainingTeamCertProperties.class));
        ReflectionTestUtils.setField(service, "accessService", access);
        ReflectionTestUtils.setField(service, "queryMapper", orders);
        ReflectionTestUtils.setField(service, "certMapper", certs);
        ReflectionTestUtils.setField(service, "massagistService", people);
        when(access.resolveShopId(5L)).thenReturn(5L);
        selected = new ArrayList<>();
        for (long id : Arrays.asList(7L, 8L)) {
            Massagist person = new Massagist(); person.setId(id); person.setName("合成疗愈师" + id);
            person.setShopId(5L); person.setStatus(1); selected.add(person);
        }
        Shop shop = new Shop(); shop.setId(5L); shop.setName("合成门店");
        ShopService shops = mock(ShopService.class);
        when(shops.listByIds(anyCollection())).thenReturn(Collections.singletonList(shop));
        ReflectionTestUtils.setField(service, "shopService", shops);
        TrainingProjectConfig config = new TrainingProjectConfig(); config.setProjectKey("head60");
        config.setProjectName("合成项目"); config.setProjectId(101L); config.setDurationMinutes(60);
        TrainingProjectRule rule = new TrainingProjectRule(); rule.setProjectKey("head60");
        rule.setProjectName("合成项目"); rule.setProjectId(101L); rule.setTargetCount(2);
        rule.setAmount(new BigDecimal("100")); rule.setDurationMinutes(60);
        IncentiveConfigBundle bundle = new IncentiveConfigBundle(); bundle.setRule(new IncentiveRule());
        bundle.setTrainingProjects(Collections.singletonList(config));
        bundle.getRule().setTrainingProjects(Collections.singletonList(rule));
        IncentiveConfigService configService = mock(IncentiveConfigService.class);
        when(configService.bundleForMonth(anyString())).thenReturn(bundle);
        ReflectionTestUtils.setField(service, "configService", configService);
        MassagistTrainingCert cert = new MassagistTrainingCert(); cert.setId(21L);
        cert.setMassagistId(7L); cert.setProjectKey("head60"); cert.setPassedAt(LocalDate.of(2026, 1, 1));
        when(certs.selectList(any(LambdaQueryWrapper.class))).thenReturn(Collections.singletonList(cert));
    }

    Class<?> mapperType() {
        try { return Class.forName("com.macro.mall.incentive.mapper.TrainingRecordPageMapper"); }
        catch (ClassNotFoundException e) { return fail("培训页缺少数据库分页查询", e); }
    }
    void install(long total) {
        pageMapper = mock(mapperType(), invocation -> {
            if (invocation.getMethod().getName().equals("countPeople")) return total;
            if (invocation.getMethod().getName().equals("selectPeople")) return selected;
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation);
        });
        ReflectionTestUtils.setField(service, "trainingPageMapper", pageMapper);
    }
    Map<String, Object> page(Integer status, int page, int size, String keyword) throws Throwable {
        Method method = null;
        try { method = IncentiveDataService.class.getMethod("trainingRecordsPage", String.class, Long.class, Integer.class, int.class, int.class, String.class); }
        catch (NoSuchMethodException ignored) { }
        assertNotNull(method, "培训页必须服务端分页并接受姓名筛选");
        try { return (Map<String, Object>) method.invoke(service, "2026-01", 5L, status, page, size, keyword); }
        catch (InvocationTargetException e) { throw e.getCause(); }
    }

    @Test void emptyPageSkipsCertAndOrderLookup() throws Throwable {
        install(0); Map<String, Object> response = page(null, 1, 20, null);
        assertEquals(0L, response.get("total")); assertTrue(((List<?>) response.get("list")).isEmpty());
        verifyNoInteractions(certs, orders, people);
    }
    @Test void pageLoadsOnlySelectedPeopleAndCalculatesTheirTraining() throws Throwable {
        install(51); Map<String, Object> response = page(1, 2, 20, " 合成 ");
        assertEquals(51L, response.get("total")); assertEquals(2, response.get("pageNum"));
        assertEquals(LocalDate.of(2026, 1, 31), response.get("cutoff"));
        List<TrainingRecordView> rows = (List<TrainingRecordView>) response.get("list");
        assertEquals(2, rows.size()); assertEquals(Long.valueOf(7), rows.get(0).getMassagistId());
        assertEquals(Integer.valueOf(1), rows.get(0).getCertifiedCount());
        Method getter = TrainingRecordView.class.getMethod("getProgress");
        List<TrainingProgress> progress = (List<TrainingProgress>) getter.invoke(rows.get(0));
        assertEquals("completed-this-month", progress.get(0).getStatus());
        assertEquals(new BigDecimal("100.00"), progress.get(0).getEarnedAmount());
        List<TrainingProgress> other = (List<TrainingProgress>) getter.invoke(rows.get(1));
        assertEquals("uncertified", other.get(0).getStatus());
        verifyNoInteractions(people);
        verify(orders, never()).selectServiceDetails(any(), any(), any(), any());
        calls = new ArrayList<>(mockingDetails(pageMapper).getInvocations());
        org.mockito.invocation.Invocation query = calls.stream().filter(i -> i.getMethod().getName().equals("selectPeople")).findFirst().get();
        assertEquals("合成", query.getArgument(2)); assertEquals(Integer.valueOf(20), (Integer) query.getArgument(3));
        assertEquals(Integer.valueOf(20), (Integer) query.getArgument(4));
    }
    @Test void pageBeyondTotalDoesNotLoadPeopleOrOrders() throws Throwable {
        install(3); Map<String, Object> response = page(0, 2, 20, null);
        assertEquals(3L, response.get("total")); assertTrue(((List<?>) response.get("list")).isEmpty());
        verifyNoInteractions(certs, orders, people);
        assertEquals(1, mockingDetails(pageMapper).getInvocations().size());
    }
    @Test void invalidPaginationStatusAndKeywordAreRejected() throws Throwable {
        assertThrows(BusinessException.class, () -> page(1, 0, 20, null));
        assertThrows(BusinessException.class, () -> page(1, 1, 101, null));
        assertThrows(BusinessException.class, () -> page(99, 1, 20, null));
        assertThrows(BusinessException.class, () -> page(1, 1, 20, String.join("", Collections.nCopies(101, "a"))));
        verifyNoInteractions(certs, orders, people);
    }
    @Test void unauthorizedShopIsRejectedBeforeLookup() throws Throwable {
        doThrow(new BusinessException("无权查看该门店")).when(access).resolveShopId(5L);
        assertThrows(BusinessException.class, () -> page(1, 1, 20, null));
        verifyNoInteractions(certs, orders, people);
    }
    @Test void databasePeoplePageUsesBoundFiltersAndStableSort() throws Exception {
        Method method = mapperType().getMethod("selectPeople", Long.class, Integer.class, String.class, int.class, int.class);
        String sql = String.join(" ", method.getAnnotation(Select.class).value());
        assertTrue(sql.contains("m.status=#{status}")); assertTrue(sql.contains("m.shop_id=#{shopId}"));
        assertTrue(sql.contains("#{keyword}")); assertTrue(sql.contains("LIMIT #{offset},#{size}"));
        assertTrue(sql.contains("m.id")); assertFalse(sql.contains("${"));
    }
    @Test void actualOrderXmlContainsOnlyPageIdsAndFailsClosedForEmptyIds() throws Exception {
        Configuration config = new Configuration();
        String resource = "com/macro/mall/incentive/mapper/IncentiveQueryMapper.xml";
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(resource)) {
            assertNotNull(in); new XMLMapperBuilder(in, config, resource, config.getSqlFragments()).parse();
        }
        String id = IncentiveQueryMapper.class.getName() + ".selectServiceDetailsForMassagists";
        assertTrue(config.hasStatement(id), "缺少仅当前页疗愈师服务订单查询");
        Map<String, Object> params = new HashMap<>(); params.put("shopIds", Collections.singletonList(5L));
        params.put("massagistIds", Arrays.asList(7L, 8L));
        params.put("start", LocalDate.of(2026, 1, 2).atStartOfDay()); params.put("end", LocalDate.of(2026, 2, 1).atStartOfDay());
        BoundSql bound = config.getMappedStatement(id).getBoundSql(params); String sql = bound.getSql().replaceAll("\\s+", " ");
        assertTrue(sql.contains("od.massagist_id IN")); assertTrue(sql.contains("od.state = 2"));
        assertTrue(sql.contains("o.pay_time IS NOT NULL")); assertTrue(sql.contains("NOT EXISTS"));
        assertFalse(sql.contains("TRIM(c.phone) AS phone"), "培训页不返回客户手机号");
        params.put("massagistIds", Collections.emptyList());
        assertTrue(config.getMappedStatement(id).getBoundSql(params).getSql().contains("AND 1=0"));
        params.put("massagistIds", Arrays.asList(7L, 8L)); params.put("shopIds", Collections.emptyList());
        assertTrue(config.getMappedStatement(id).getBoundSql(params).getSql().contains("AND 1=0"));
    }
}
