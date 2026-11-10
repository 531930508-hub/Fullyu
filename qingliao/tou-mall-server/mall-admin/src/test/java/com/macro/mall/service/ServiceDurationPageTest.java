package com.macro.mall.service;

import com.alibaba.fastjson2.JSONObject;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import com.macro.mall.service.serviceStatistics.StatisticsService;
import com.macro.mall.service.shop.ShopService;
import org.apache.ibatis.annotations.Select;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.lang.reflect.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ServiceDurationPageTest {
    StatisticsService service; Object mapper; OrderDetailService details; MassagistService people;
    List<Map<String,Object>> keys; List<OrderDetail> rows; List<Massagist> persons;
    @BeforeEach void setup() throws Exception {
        service=spy(new StatisticsService());details=mock(OrderDetailService.class);people=mock(MassagistService.class);
        ReflectionTestUtils.setField(service,"orderDetailService",details);ReflectionTestUtils.setField(service,"massagistService",people);
        ReflectionTestUtils.setField(service,"adjustService",mock(AdjustService.class));
        ReflectionTestUtils.setField(service,"shopService",mock(ShopService.class));
        ReflectionTestUtils.setField(service,"massagistSchedulesService",mock(MassagistSchedulesService.class));
        keys=Collections.singletonList(new HashMap<String,Object>(){{put("massagistId",7L);put("periodCode","2026-11");}});
        Massagist person=new Massagist();person.setId(7L);person.setShopId(5L);person.setStatus(1);persons=Collections.singletonList(person);
        OrderDetail d=new OrderDetail();d.setId(21L);d.setMassagistId(7L);d.setShopId(5L);d.setType(0);d.setDuration(60);d.setCoefficient(BigDecimal.ONE);
        d.setStartTime(LocalDateTime.of(2026,11,8,10,0));d.setEndTime(d.getStartTime().plusHours(1));rows=Collections.singletonList(d);
        when(people.listByIds(anyCollection())).thenReturn(persons);
    }
    Class<?> mapperType() {try{return Class.forName("com.macro.mall.mapper.ServiceDurationPageMapper");}catch(ClassNotFoundException e){return fail("服务时长缺少数据库分页查询",e);}}
    void install(long total) {
        mapper=mock(mapperType(),call->{switch(call.getMethod().getName()){case "countPeriods":return total;case "periodKeys":return keys;case "detailsForPeriods":return rows;default:return org.mockito.Answers.RETURNS_DEFAULTS.answer(call);}});
        ReflectionTestUtils.setField(service,"durationPageMapper",mapper);
    }
    Map<String,Object> page(Integer status,int page,int size) throws Throwable {
        Method method=null;try{method=StatisticsService.class.getMethod("serviceDurationPage",Long.class,String.class,String.class,Long.class,Integer.class,int.class,int.class);}catch(NoSuchMethodException ignored){}
        assertNotNull(method,"缺少分页服务接口");
        try{return (Map<String,Object>)method.invoke(service,5L,"2026-11-01 00:00:00","2026-11-30 23:59:59",null,status,page,size);}catch(InvocationTargetException e){throw e.getCause();}
    }
    @Test void emptyPageDoesNotLoadAnyFullDetail() throws Throwable {install(0);Map<String,Object> result=page(1,1,10);assertEquals(0L,result.get("total"));assertTrue(((List<?>)result.get("list")).isEmpty());verifyNoInteractions(details,people);}
    @Test void onlyTheSelectedPeriodTherapistsAreAggregated() throws Throwable {install(31);Map<String,Object> result=page(1,2,10);assertEquals(31L,result.get("total"));List<JSONObject> list=(List<JSONObject>)result.get("list");assertEquals(1,list.size());assertEquals(7L,list.get(0).getLong("massagistId"));assertEquals(60,list.get(0).getIntValue("serviceDuration"));verify(people).listByIds(Collections.singletonList(7L));verify(details,never()).timeList(any(),anyString(),anyString(),anyList());}
    @Test void invalidPageRejectedBeforeDatabaseLookup() throws Throwable {assertThrows(BusinessException.class,()->page(1,0,10));assertThrows(BusinessException.class,()->page(1,1,101));}
    @Test void unsupportedStatusRejectedBeforeDatabaseLookup() throws Throwable {assertThrows(BusinessException.class,()->page(99,1,10));}
    void export(Integer status) throws Throwable {
        Method method=null;
        try { method=StatisticsService.class.getMethod("serviceDurationExport",Long.class,String.class,String.class,Long.class,Integer.class); } catch(NoSuchMethodException ignored) {}
        assertNotNull(method,"导出缺少合作状态筛选");
        try { method.invoke(service,5L,"2026-11-01 00:00:00","2026-11-30 23:59:59",null,status); }
        catch(InvocationTargetException e) { throw e.getCause(); }
    }
    @Test void filteredExportIncludesAllPagesAndWritesRealWorkbook() throws Throwable {
        install(101);
        persons.get(0).setName("合成疗愈师");
        Shop shop=new Shop();shop.setId(5L);shop.setName("合成门店");
        ShopService shops=mock(ShopService.class);when(shops.listByIds(anyCollection())).thenReturn(Collections.singletonList(shop));
        ReflectionTestUtils.setField(service,"shopService",shops);
        org.springframework.mock.web.MockHttpServletResponse response=new org.springframework.mock.web.MockHttpServletResponse();
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(new org.springframework.mock.web.MockHttpServletRequest(),response));
        try {
            export(0);
            List<org.mockito.invocation.Invocation> calls=new ArrayList<>(mockingDetails(mapper).getInvocations());
            List<org.mockito.invocation.Invocation> pages=new ArrayList<>();
            for(org.mockito.invocation.Invocation call:calls)if(call.getMethod().getName().equals("periodKeys"))pages.add(call);
            assertEquals(2,pages.size());assertEquals(Integer.valueOf(0),(Integer)pages.get(0).getArgument(5));
            assertEquals(Integer.valueOf(100),(Integer)pages.get(1).getArgument(5));
            for(org.mockito.invocation.Invocation call:pages){assertEquals(Integer.valueOf(0),(Integer)call.getArgument(4));assertEquals(Integer.valueOf(100),(Integer)call.getArgument(6));}
            try(org.apache.poi.ss.usermodel.Workbook workbook=org.apache.poi.ss.usermodel.WorkbookFactory.create(new java.io.ByteArrayInputStream(response.getContentAsByteArray()))){
                assertEquals(2,workbook.getSheetAt(0).getLastRowNum());
            }
        } finally { org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes(); }
    }
    @Test void emptyFilteredExportIsExplicitlyRejected() throws Throwable {install(0);assertThrows(BusinessException.class,()->export(1));}
    @Test void impossibleCalendarDateIsRejectedBeforeLookup() throws Throwable {
        Method method=Arrays.stream(StatisticsService.class.getMethods()).filter(m->m.getName().equals("serviceDurationPage")).findFirst().orElse(null);
        assertNotNull(method);
        assertThrows(BusinessException.class,()->{try{method.invoke(service,5L,"2026-02-30 00:00:00","2026-03-01 23:59:59",null,1,1,10);}catch(InvocationTargetException e){throw e.getCause();}});
    }
    @Test void sqlUsesFinishedRowsStatusAndBoundPagination() throws Exception {
        String sql=String.join(" ",mapperType().getMethod("periodKeys",Long.class,String.class,String.class,Long.class,Integer.class,int.class,int.class).getAnnotation(Select.class).value());
        assertTrue(sql.contains("d.state=2"));assertTrue(sql.contains("m.status=#{status}"));assertTrue(sql.contains("LIMIT #{offset},#{size}"));assertTrue(sql.contains("ORDER BY periodCode DESC,massagistId ASC"));assertFalse(sql.contains("${"));
    }
    @Test void detailQueryOnlyLoadsSelectedPeriodKeys() throws Exception {
        String sql=String.join(" ",mapperType().getMethod("detailsForPeriods",Long.class,String.class,String.class,Long.class,Integer.class,List.class).getAnnotation(Select.class).value());
        assertTrue(sql.contains("collection=\"keys\""));assertTrue(sql.contains("#{key.massagistId}"));assertTrue(sql.contains("#{key.periodCode}"));assertTrue(sql.contains("d.state=2"));assertFalse(sql.contains("${"));
    }
}
