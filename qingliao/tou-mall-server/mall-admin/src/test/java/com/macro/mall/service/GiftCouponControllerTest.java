package com.macro.mall.service;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.controller.approval.GiftCustomerCouponController;
import com.macro.mall.entity.GiftCustomerCoupon;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.approval.GiftCustomerCouponService;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import java.io.ByteArrayInputStream;
import java.util.Collections;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GiftCouponControllerTest {
    GiftCustomerCouponController controller;
    GiftCustomerCouponService service;
    @BeforeEach void setup() {
        controller = new GiftCustomerCouponController(); service = mock(GiftCustomerCouponService.class);
        ReflectionTestUtils.setField(controller, "giftCustomerCouponService", service);
        login(1);
    }
    void login(int status) {
        UmsAdmin admin = new UmsAdmin(); admin.setId(7L); admin.setStatus(status);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
            new AdminUserDetails(admin, Collections.emptyList()), null, Collections.emptyList()));
    }
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    @Test void bodyCannotImpersonateAnotherApplicant() {
        GiftCustomerCoupon body = new GiftCustomerCoupon(); body.setCreateUser(99L);
        controller.add(body); assertEquals(7L, body.getCreateUser()); verify(service).add(body);
    }
    @Test void batchCannotImpersonateAnotherApplicant() {
        MockMultipartFile file = new MockMultipartFile("file", new byte[]{1});
        controller.importAdd(file, 5L, 99L); verify(service).importAdd(file, 5L, 7L);
    }
    @Test void anonymousRequestCannotWrite() {
        SecurityContextHolder.clearContext();
        assertThrows(BusinessException.class, () -> controller.add(new GiftCustomerCoupon())); verifyNoInteractions(service);
    }
    @Test void disabledAccountCannotWrite() {
        login(0); assertThrows(BusinessException.class, () -> controller.add(new GiftCustomerCoupon())); verifyNoInteractions(service);
    }
    @Test void actualExcelTemplateIncludesOptionalUnitValueWithoutPersonalData() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        new GiftCustomerCouponService().template(response);
        assertTrue(response.getContentType().contains("spreadsheetml"));
        java.nio.file.Files.write(java.nio.file.Paths.get("target", "gift-coupon-template.xlsx"), response.getContentAsByteArray());
        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(response.getContentAsByteArray()))) {
            assertEquals(6, workbook.getSheetAt(0).getRow(0).getLastCellNum());
            assertEquals("单券价值（元）", workbook.getSheetAt(0).getRow(0).getCell(5).getStringCellValue());
            assertEquals(0, workbook.getSheetAt(0).getLastRowNum());
        }
    }
}
