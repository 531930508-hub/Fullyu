package com.macro.mall.service;

import com.github.pagehelper.PageInfo;
import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.GlobalExceptionHandler;
import com.macro.mall.controller.SalaryRecordController;
import com.macro.mall.entity.Massagist;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.model.UmsRole;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Standalone Spring MVC routing/serialization; no live app, database, security filter or external service.
class SalaryRecordHttpContractTest {
    MockMvc mvc;
    SalaryRecordService records;
    UmsAdminService admins;
    MassagistService people;
    UmsAdmin admin;

    @BeforeEach void setup() {
        SalaryRecordController controller = new SalaryRecordController();
        records = mock(SalaryRecordService.class); admins = mock(UmsAdminService.class); people = mock(MassagistService.class);
        ReflectionTestUtils.setField(controller, "salaryRecordService", records);
        ReflectionTestUtils.setField(controller, "adminService", admins);
        ReflectionTestUtils.setField(controller, "massagistService", people);
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).build();
        admin = new UmsAdmin(); admin.setId(9L); admin.setStatus(1); admin.setMassagistId(7L);
        when(admins.getItem(9L)).thenReturn(admin);
        UmsRole role = new UmsRole(); role.setName("财务"); role.setStatus(1);
        when(admins.getRoleList(9L)).thenReturn(Collections.singletonList(role));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
            new AdminUserDetails(admin, Collections.emptyList()), null, Collections.emptyList()));
        Massagist person = new Massagist(); person.setId(7L); person.setName("合成疗愈师"); person.setStatus(1); person.setUmsAdminId(9L);
        person.setPhone("合成字段不应出现"); person.setUmsAdminUsername("合成字段不应出现");
        when(people.getById(7L)).thenReturn(person);
        PageInfo<Massagist> page = new PageInfo<>(Collections.singletonList(person)); page.setTotal(55);
        when(people.pageInfo(anyMap())).thenReturn(page);
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void defaultPeopleRouteBindsAndSerializesOnlyMinimalFields() throws Exception {
        mvc.perform(get("/salaryRecord/people")).andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200))
            .andExpect(jsonPath("$.data.total").value(55)).andExpect(jsonPath("$.data.pageNum").value(1))
            .andExpect(jsonPath("$.data.pageSize").value(20)).andExpect(jsonPath("$.data.list[0].id").value(7))
            .andExpect(jsonPath("$.data.list[0].phone").doesNotExist())
            .andExpect(jsonPath("$.data.list[0].umsAdminId").doesNotExist())
            .andExpect(jsonPath("$.data.list[0].umsAdminUsername").doesNotExist());
        verify(people).pageInfo(argThat(p -> Integer.valueOf(1).equals(p.get("status")) && Integer.valueOf(20).equals(p.get("size"))));
    }
    @Test void explicitPagingAcceptsAllStateButNeverClientSortOrStoreScope() throws Exception {
        mvc.perform(get("/salaryRecord/people").param("page", "2").param("size", "50").param("status", "-1")
            .param("name", " 合成 ").param("order", "phone").param("shopId", "99"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200)).andExpect(jsonPath("$.data.pageNum").value(2));
        verify(people).pageInfo(argThat(p -> "name,id".equals(p.get("order")) && !p.containsKey("shopId")
            && !p.containsKey("status") && "合成".equals(p.get("name")) && Integer.valueOf(50).equals(p.get("size"))));
    }
    @Test void invalidSizeProducesExistingBusinessErrorEnvelopeWithoutQuery() throws Exception {
        mvc.perform(get("/salaryRecord/people").param("size", "101"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(500))
            .andExpect(jsonPath("$.message").value("分页参数超出范围"));
        verifyNoInteractions(people, records);
    }
    @Test void anonymousAndDisabledReadsAreRejectedThroughMvc() throws Exception {
        SecurityContextHolder.clearContext();
        mvc.perform(get("/salaryRecord/info").param("massagistId", "7").param("monthCode", "2026-10"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(500));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
            new AdminUserDetails(admin, Collections.emptyList()), null, Collections.emptyList())); admin.setStatus(0);
        mvc.perform(get("/salaryRecord/findMassagistAllMonthCode").param("massagistId", "7"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(500));
        verifyNoInteractions(records);
    }
    @Test void selfReadUsesBoundPersonWhileForgedIdAndResetAreRejected() throws Exception {
        when(admins.getRoleList(9L)).thenReturn(Collections.emptyList());
        when(records.findMassagistAllMonthCode(7L)).thenReturn(Collections.singletonList("2026-10"));
        mvc.perform(get("/salaryRecord/findMassagistAllMonthCode").param("massagistId", "7"))
            .andExpect(jsonPath("$.code").value(200)).andExpect(jsonPath("$.data[0]").value("2026-10"));
        mvc.perform(get("/salaryRecord/info").param("massagistId", "8").param("monthCode", "2026-10"))
            .andExpect(jsonPath("$.code").value(500));
        mvc.perform(post("/salaryRecord/reset").param("massagistId", "7").param("monthCode", "2026-10"))
            .andExpect(jsonPath("$.code").value(500));
        verify(records).findMassagistAllMonthCode(7L); verifyNoMoreInteractions(records);
    }
    @Test void resetRequiresPostAndMandatoryParamsBeforeRecalculation() throws Exception {
        mvc.perform(get("/salaryRecord/reset").param("massagistId", "7").param("monthCode", "2026-10"))
            .andExpect(status().isMethodNotAllowed());
        mvc.perform(post("/salaryRecord/reset").param("massagistId", "7")).andExpect(status().isBadRequest());
        verifyNoInteractions(records);
        mvc.perform(post("/salaryRecord/reset").param("massagistId", "7").param("monthCode", "2026-10"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200));
        verify(records).resetMassagistSalaryRecords(7L, "2026-10");
    }
}
