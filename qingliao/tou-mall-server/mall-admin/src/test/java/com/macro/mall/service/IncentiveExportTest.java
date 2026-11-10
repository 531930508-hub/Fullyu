package com.macro.mall.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Massagist;
import com.macro.mall.entity.Shop;
import com.macro.mall.incentive.controller.IncentiveController;
import com.macro.mall.incentive.dto.IncentiveConfigBundle;
import com.macro.mall.incentive.dto.IncentiveDashboard;
import com.macro.mall.incentive.entity.ShopIncentiveTarget;
import com.macro.mall.incentive.mapper.*;
import com.macro.mall.incentive.model.IncentiveRule;
import com.macro.mall.incentive.service.*;
import com.macro.mall.service.shop.ShopService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.bind.annotation.RequestParam;

import java.lang.reflect.*;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

/** Real board calculation and CSV output; only data sources are synthetic. */
class IncentiveExportTest {
    IncentiveDataService service;
    IncentiveAccessService access;
    MassagistService people;
    IncentiveQueryMapper query;
    List<Massagist> persons;

    @BeforeEach void setup() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "export-test"), Massagist.class);
        service = new IncentiveDataService();
        access = mock(IncentiveAccessService.class);
        people = mock(MassagistService.class);
        query = mock(IncentiveQueryMapper.class);
        ReflectionTestUtils.setField(service, "accessService", access);
        ReflectionTestUtils.setField(service, "massagistService", people);
        ReflectionTestUtils.setField(service, "queryMapper", query);
        ReflectionTestUtils.setField(service, "certMapper", mock(MassagistTrainingCertMapper.class));
        ReflectionTestUtils.setField(service, "targetMapper", mock(ShopIncentiveTargetMapper.class));
        ReflectionTestUtils.setField(service, "adjustService", mock(AdjustService.class));
        ReflectionTestUtils.setField(service, "salaryOtherAmountService", mock(SalaryOtherAmountService.class));
        ReflectionTestUtils.setField(service, "salaryRecordService", mock(SalaryRecordService.class));
        IncentiveConfigBundle bundle = new IncentiveConfigBundle();
        bundle.setRule(new IncentiveRule());
        IncentiveConfigService config = mock(IncentiveConfigService.class);
        when(config.bundleForMonth(anyString())).thenReturn(bundle);
        ReflectionTestUtils.setField(service, "configService", config);
        Shop shop = new Shop(); shop.setId(5L); shop.setName("合成门店甲");
        Shop other = new Shop(); other.setId(6L); other.setName("合成门店乙");
        ShopService shops = mock(ShopService.class);
        when(shops.listByIds(anyCollection())).thenReturn(Arrays.asList(shop, other));
        ReflectionTestUtils.setField(service, "shopService", shops);
        persons = new ArrayList<>();
        for (long id = 1; id <= 501; id++) {
            Massagist person = new Massagist();
            person.setId(id); person.setName("合成人员" + id);
            person.setShopId(id == 501 ? 6L : 5L); person.setStatus(1);
            person.setEntryDay(LocalDate.of(2020, 1, 1));
            persons.add(person);
        }
        when(people.list(any(LambdaQueryWrapper.class))).thenAnswer(inv -> {
            LambdaQueryWrapper<Massagist> wrapper = inv.getArgument(0);
            wrapper.getSqlSegment();
            Object status = wrapper.getParamNameValuePairs().values().stream().findFirst().orElse(null);
            List<Massagist> result = new ArrayList<>();
            for (Massagist person : persons) {
                if (status == null || status.equals(person.getStatus())) result.add(person);
            }
            return result;
        });
    }

    String export(Integer status) throws Throwable {
        Method method = null;
        try { method = IncentiveDataService.class.getMethod("exportCsv", String.class, Long.class, Integer.class); }
        catch (NoSuchMethodException ignored) { }
        assertNotNull(method, "CSV 必须保留合作状态筛选");
        try { return (String) method.invoke(service, "2026-01", null, status); }
        catch (InvocationTargetException e) { throw e.getCause(); }
    }

    @Test void legacyExportDoesNotSilentlyTruncateAfterFiveHundred() {
        String csv = service.exportCsv("2026-01", null);
        assertEquals(503, csv.split("\n").length);
        assertTrue(csv.contains("合成人员501"));
        verify(query, times(1)).selectServiceDetails(any(), any(), any(), any());
    }

    @Test void allShopExportUsesEachPersonsRealShop() {
        String csv = service.exportCsv("2026-01", null);
        assertTrue(csv.contains("\"合成门店甲\",\"合成人员1\""));
        assertTrue(csv.contains("\"合成门店乙\",\"合成人员501\""));
        assertFalse(csv.contains("\"全部门店\",\"合成人员"));
    }

    @Test void exportKeepsEndedCooperationFilter() throws Throwable {
        persons.get(500).setStatus(0);
        String csv = export(0);
        assertEquals(3, csv.split("\n").length);
        assertTrue(csv.contains("合成人员501"));
        assertFalse(csv.contains("\"合成人员1\""));
        verify(access).requireGlobal();
    }

    @Test void unsupportedStatusIsRejectedBeforeQueries() throws Throwable {
        assertThrows(BusinessException.class, () -> export(99));
        verifyNoInteractions(people, query);
    }

    @Test void unauthorizedExportDoesNotQueryBusinessData() {
        doThrow(new BusinessException("无权导出")).when(access).requireGlobal();
        assertThrows(BusinessException.class, () -> service.exportCsv("2026-01", null));
        verifyNoInteractions(people, query);
    }

    @Test void dashboardStillReturnsOnlyRequestedPageButWholeScopeTotals() {
        IncentiveDashboard dashboard = service.dashboard("2026-01", null, 1, 2, 20);
        assertEquals(501, dashboard.getTherapistCount());
        assertEquals(20, dashboard.getTherapists().size());
        assertEquals(Long.valueOf(21), dashboard.getTherapists().get(0).getMassagistId());
    }

    @Test void targetShopNamesAreLoadedInOneBatchNotPerShop() {
        ShopIncentiveTargetMapper targets = mock(ShopIncentiveTargetMapper.class);
        List<ShopIncentiveTarget> rows = new ArrayList<>();
        for (long shopId = 7; shopId <= 36; shopId++) {
            ShopIncentiveTarget target = new ShopIncentiveTarget();
            target.setShopId(shopId); target.setMonthCode("2026-01");
            target.setManagerMassagistId(shopId - 6);
            rows.add(target);
        }
        when(targets.selectList(any())).thenReturn(rows);
        ReflectionTestUtils.setField(service, "targetMapper", targets);
        ShopService shops = (ShopService) ReflectionTestUtils.getField(service, "shopService");
        IncentiveDashboard dashboard = service.dashboard("2026-01", null, 1, 1, 20);
        assertEquals(501, dashboard.getTherapistCount());
        verify(shops, never()).getById(any());
        verify(shops, atMost(2)).listByIds(anyCollection());
    }

    @Test void excessivePageNumberCannotOverflowIndex() {
        assertThrows(BusinessException.class, () -> service.dashboard("2026-01", null, 1, Integer.MAX_VALUE, 100));
        verifyNoInteractions(people, query);
    }

    @Test void httpExportForwardsStatusAndReturnsCsv() throws Throwable {
        Method endpoint = Arrays.stream(IncentiveController.class.getMethods())
                .filter(m -> m.getName().equals("export") && Arrays.asList(m.getParameterTypes()).contains(Integer.class))
                .findFirst().orElse(null);
        assertNotNull(endpoint, "HTTP 导出必须接收合作状态");
        IncentiveDataService data = mock(IncentiveDataService.class);
        when(data.exportCsv(anyString(), any())).thenReturn("wrong");
        // Reflection permits a correct RED before the new service overload exists.
        List<Object> observed = new ArrayList<>();
        data = mock(IncentiveDataService.class, invocation -> {
            if (invocation.getMethod().getName().equals("exportCsv")) {
                observed.addAll(Arrays.asList(invocation.getArguments())); return "合成 CSV";
            }
            return org.mockito.Answers.RETURNS_DEFAULTS.answer(invocation);
        });
        IncentiveController controller = new IncentiveController();
        ReflectionTestUtils.setField(controller, "dataService", data);
        MockHttpServletResponse response = new MockHttpServletResponse();
        endpoint.invoke(controller, "2026-01", 5L, 0, response);
        assertEquals(Arrays.asList("2026-01", 5L, 0), observed);
        assertEquals("合成 CSV", response.getContentAsString());
        assertEquals("text/csv;charset=UTF-8", response.getContentType());
        RequestParam parameter = endpoint.getParameters()[2].getAnnotation(RequestParam.class);
        assertNotNull(parameter);
        assertEquals("1", parameter.defaultValue());
    }
}
