package com.macro.mall.aspect;

import com.macro.mall.annotation.ExportLog;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.entity.ExportRecord;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.ExportRecordService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.nio.charset.StandardCharsets;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 导出台账切面：成功导出后落一条可追溯记录，且不能影响导出本身。 */
class ExportLogAspectTest {

    private final ExportRecordService exportRecordService = mock(ExportRecordService.class);
    private final ExportLogAspect aspect = new ExportLogAspect();

    @AfterEach
    void clean() {
        RequestContextHolder.resetRequestAttributes();
        SecurityContextHolder.clearContext();
    }

    @ExportLog(module = "order", value = "订单列表")
    public void sampleExport() {
    }

    @Test
    void recordsOperatorFiltersAndDecodedFileName() throws Exception {
        ReflectionTestUtils.setField(aspect, "exportRecordService", exportRecordService);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/order/export");
        request.setParameter("type", "1");
        request.setParameter("shopIdArrNew", "2,3");
        request.setParameter("startTime", "2026-11-01 00:00:00");
        request.setParameter("page", "2");
        request.setParameter("size", "10");
        request.setParameter("token", "secret");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setHeader("Content-Disposition", "attachment;filename="
                + java.net.URLEncoder.encode("订单列表.xlsx", StandardCharsets.UTF_8.name()));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request, response));

        UmsAdmin admin = new UmsAdmin();
        admin.setId(7L);
        admin.setUsername("finance01");
        admin.setNickName("财务小王");
        AdminUserDetails principal = new AdminUserDetails(admin, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, Collections.emptyList()));

        ExportLog annotation = getClass().getMethod("sampleExport").getAnnotation(ExportLog.class);
        aspect.afterReturning(annotation);

        ArgumentCaptor<ExportRecord> captor = ArgumentCaptor.forClass(ExportRecord.class);
        verify(exportRecordService).save(captor.capture());
        ExportRecord record = captor.getValue();
        assertEquals("order", record.getModule());
        assertEquals("订单列表", record.getModuleName());
        assertEquals(7L, record.getOperatorId());
        assertEquals("财务小王", record.getOperatorName());
        assertEquals("finance01", record.getOperatorAccount());
        assertEquals("订单列表.xlsx", record.getFileName());
        assertNotNull(record.getExportTime());
        assertTrue(record.getFilterCondition().contains("\"type\":\"1\""), record.getFilterCondition());
        assertTrue(record.getFilterCondition().contains("\"shopIdArrNew\":\"2,3\""), record.getFilterCondition());
        assertFalse(record.getFilterCondition().contains("page"), "分页参数不是筛选条件");
        assertFalse(record.getFilterCondition().contains("secret"), "令牌不能落库");
    }

    @Test
    void supportsUtf8StarFileNameAndCsvContentType() throws Exception {
        ReflectionTestUtils.setField(aspect, "exportRecordService", exportRecordService);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/incentive/export");
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''"
                + java.net.URLEncoder.encode("接单奖励明细-2026-11.csv", StandardCharsets.UTF_8.name())
                .replace("+", "%20"));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request, response));

        ExportLog annotation = getClass().getMethod("sampleExport").getAnnotation(ExportLog.class);
        aspect.afterReturning(annotation);

        ArgumentCaptor<ExportRecord> captor = ArgumentCaptor.forClass(ExportRecord.class);
        verify(exportRecordService).save(captor.capture());
        assertEquals("接单奖励明细-2026-11.csv", captor.getValue().getFileName());
        assertNull(captor.getValue().getFilterCondition(), "没有筛选条件时保持为空");
        assertEquals("未识别", captor.getValue().getOperatorName());
    }

    @Test
    void recordingFailureNeverBreaksExport() throws Exception {
        ReflectionTestUtils.setField(aspect, "exportRecordService", exportRecordService);
        doThrow(new RuntimeException("db down")).when(exportRecordService).save(any(ExportRecord.class));
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/order/export");
        MockHttpServletResponse response = new MockHttpServletResponse();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request, response));

        ExportLog annotation = getClass().getMethod("sampleExport").getAnnotation(ExportLog.class);
        assertDoesNotThrow(() -> aspect.afterReturning(annotation));
    }
}