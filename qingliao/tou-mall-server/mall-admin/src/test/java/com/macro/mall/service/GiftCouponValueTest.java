package com.macro.mall.service;

import com.alibaba.excel.EasyExcel;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import com.macro.mall.enums.CustomerCouponType;
import com.macro.mall.enums.FlowState;
import com.macro.mall.service.approval.GiftCustomerCouponService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GiftCouponValueTest {
    GiftCustomerCouponService service;
    CustomerCouponService coupons;
    CustomerService customers;
    ApprovalDetailService approvals;
    GiftCustomerCoupon request;

    @BeforeEach void setup() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "gift-test"), GiftCustomerCoupon.class);
        service = mock(GiftCustomerCouponService.class, CALLS_REAL_METHODS);
        coupons = mock(CustomerCouponService.class);
        customers = mock(CustomerService.class);
        approvals = mock(ApprovalDetailService.class);
        ReflectionTestUtils.setField(service, "customerCouponService", coupons);
        ReflectionTestUtils.setField(service, "customerService", customers);
        ReflectionTestUtils.setField(service, "approvalDetailService", approvals);
        request = request();
        Customer customer = new Customer(); customer.setId(10L);
        when(customers.getByPhone(anyString())).thenReturn(customer);
        when(approvals.addRelationCustomerId(anyLong(), anyLong(), any(), anyLong())).thenReturn(77L);
        doReturn(true).when(service).save(any(GiftCustomerCoupon.class));
        doReturn(true).when(service).updateById(any(GiftCustomerCoupon.class));
        doReturn(request).when(service).getOnlyOne(any(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class));
        doReturn(request).when(service).getOne(any(Wrapper.class));
    }

    private GiftCustomerCoupon request() {
        GiftCustomerCoupon r = new GiftCustomerCoupon();
        r.setPhone("13800000001"); r.setCouponNumber(2); r.setCustomerId(10L);
        r.setShopId(5L); r.setCreateUser(9L); r.setApprovalId(77L);
        r.setState(FlowState.APPROVING.getValue());
        r.setStartTime(LocalDate.of(2026, 11, 8)); r.setEndTime(LocalDate.of(2026, 12, 8));
        return r;
    }
    private void amount(GiftCustomerCoupon r, String value) {
        try {
            Method setter = GiftCustomerCoupon.class.getMethod("setCouponAmount", BigDecimal.class);
            setter.invoke(r, value == null ? null : new BigDecimal(value));
        } catch (ReflectiveOperationException e) { fail("赠券申请尚未支持单券价值", e); }
    }
    private BigDecimal amount(GiftCustomerCoupon r) {
        try { return (BigDecimal) GiftCustomerCoupon.class.getMethod("getCouponAmount").invoke(r); }
        catch (ReflectiveOperationException e) { return fail("赠券申请尚未支持单券价值", e); }
    }
    private MockMultipartFile file(String[]... rows) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        List<List<String>> head = new ArrayList<>();
        for (String label : new String[]{"客户手机号", "赠送数量", "券有效期起", "券有效期止", "使用限制", "单券价值（元）"})
            head.add(Collections.singletonList(label));
        List<List<String>> data = new ArrayList<>();
        for (String[] row : rows) data.add(Arrays.asList(row));
        EasyExcel.write(out).head(head).sheet("赠券申请").doWrite(data);
        return new MockMultipartFile("file", "gift.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", out.toByteArray());
    }

    @Test void newRequestDefaultsToZeroValue() { assertEquals(0, amount(request).compareTo(BigDecimal.ZERO)); }
    @Test void negativeValueIsRejectedBeforeApprovalOrWrites() {
        amount(request, "-0.01");
        assertThrows(BusinessException.class, () -> service.add(request));
        verifyNoInteractions(approvals, customers, coupons); verify(service, never()).save(any(GiftCustomerCoupon.class));
    }
    @Test void valueRequiresCentPrecision() {
        amount(request, "1.001"); assertThrows(BusinessException.class, () -> service.add(request));
        verifyNoInteractions(approvals, customers);
    }
    @Test void amountCannotOverflowDatabaseColumn() {
        amount(request, "100000000"); assertThrows(BusinessException.class, () -> service.add(request));
    }
    @Test void nullValueIsNormalizedToZeroForOldClients() {
        amount(request, null); service.add(request); assertEquals(0, amount(request).compareTo(BigDecimal.ZERO));
    }
    @Test void explicitUnitValueIsSavedWithoutMultiplyingQuantity() {
        amount(request, "97.50"); service.add(request);
        verify(service).save(request); assertEquals(new BigDecimal("97.50"), amount(request));
    }
    @Test void invalidQuantityAndDateCannotStartApproval() {
        request.setCouponNumber(0); assertThrows(BusinessException.class, () -> service.add(request));
        request.setCouponNumber(2); request.setEndTime(request.getStartTime().minusDays(1));
        assertThrows(BusinessException.class, () -> service.add(request)); verifyNoInteractions(approvals, customers);
    }
    @Test void approvedGiftAlreadyDeliveredCannotBeDeliveredAgain() {
        request.setState(FlowState.PASSED.getValue()); service.changeRelateRecordState(77L, FlowState.PASSED);
        verifyNoInteractions(coupons); verify(service, never()).updateById(any(GiftCustomerCoupon.class));
    }
    @Test void failedGiftStateSaveCannotReportSuccessfulApproval() {
        doReturn(false).when(service).updateById(any(GiftCustomerCoupon.class));
        assertThrows(BusinessException.class, () -> service.changeRelateRecordState(77L, FlowState.REJECTED));
        verifyNoInteractions(coupons);
    }
    @Test void failedApplicationSaveCannotReturnSuccess() {
        doReturn(false).when(service).save(any(GiftCustomerCoupon.class));
        assertThrows(BusinessException.class, () -> service.add(request));
    }
    @Test void validImportKeepsEachRowsUnitValueAndDefaultZero() {
        service.importAdd(file(new String[]{"13800000001", "2", "2026-11-08", "2026-12-08", "", "12.30"},
            new String[]{"13800000002", "3", "2026-11-08", "2026-12-08", "", ""}), 5L, 9L);
        org.mockito.ArgumentCaptor<GiftCustomerCoupon> captor = org.mockito.ArgumentCaptor.forClass(GiftCustomerCoupon.class);
        verify(service, times(2)).save(captor.capture());
        assertEquals(new BigDecimal("12.30"), amount(captor.getAllValues().get(0)));
        assertEquals(0, amount(captor.getAllValues().get(1)).compareTo(BigDecimal.ZERO));
    }
    @Test void badSecondImportRowRejectsEntireFileBeforeAnyApproval() {
        assertThrows(BusinessException.class, () -> service.importAdd(file(
            new String[]{"13800000001", "2", "2026-11-08", "2026-12-08", "", "12.30"},
            new String[]{"13800000002", "3", "2026-11-08", "2026-12-08", "", "-1"}), 5L, 9L));
        verifyNoInteractions(approvals, customers); verify(service, never()).save(any(GiftCustomerCoupon.class));
    }
    @Test void malformedAmountAndIncompleteRowAreNotSilentlySkipped() {
        assertThrows(BusinessException.class, () -> service.importAdd(file(
            new String[]{"13800000001", "2", "2026-11-08", "2026-12-08", "", "abc"}), 5L, 9L));
        assertThrows(BusinessException.class, () -> service.importAdd(file(
            new String[]{"13800000001", "", "2026-11-08", "2026-12-08", "", ""}), 5L, 9L));
        verifyNoInteractions(approvals, customers);
    }
    @Test void legacyGiveCouponCannotSilentlyIgnoreFailedWrite() {
        CustomerCouponService target = spy(new CustomerCouponService());
        doReturn(Collections.singletonList(new CustomerCoupon())).when(target).buildBatch(anyInt(), anyLong(), anyLong(), any(), isNull(), isNull(), any(), eq(false));
        doReturn(false).when(target).saveBatch(anyCollection());
        assertThrows(BusinessException.class, () -> target.giveCoupon(2, 10L, CustomerCouponType.NORMAL, 7L, 99L, request.getStartTime(), request.getEndTime()));
    }
    @Test void approvedApplicationPassesTheUnitValueToDelivery() {
        request.setId(99L); amount(request, "97.50");
        service.changeRelateRecordState(77L, FlowState.PASSED);
        verify(coupons).giveCoupon(2, 10L, CustomerCouponType.NORMAL, request.getCouponId(), 99L,
                request.getStartTime(), request.getEndTime(), new BigDecimal("97.50"));
        assertEquals(FlowState.PASSED.getValue(), request.getState());
    }
    @Test void realCouponBuilderKeepsUnitValueOnEveryCouponWithoutLoadingNullOrder() {
        CustomerCouponService target = spy(new CustomerCouponService());
        CouponService catalog = mock(CouponService.class); OrderService orders = mock(OrderService.class);
        Coupon coupon = new Coupon(); coupon.setId(7L); coupon.setUseType(0); coupon.setMinutes(60);
        when(catalog.getById(7L)).thenReturn(coupon);
        ReflectionTestUtils.setField(target, "couponService", catalog);
        ReflectionTestUtils.setField(target, "orderService", orders);
        doReturn(true).when(target).saveBatch(anyCollection());
        target.giveCoupon(3, 10L, CustomerCouponType.NORMAL, 7L, 99L,
                request.getStartTime(), request.getEndTime(), new BigDecimal("97.50"));
        org.mockito.ArgumentCaptor<Collection> capture = org.mockito.ArgumentCaptor.forClass(Collection.class);
        verify(target).saveBatch(capture.capture());
        assertEquals(3, capture.getValue().size());
        for (Object item : capture.getValue()) {
            CustomerCoupon issued = (CustomerCoupon) item;
            assertEquals(new BigDecimal("97.50"), issued.getAmount());
            assertEquals(99L, issued.getGiftCustomerCouponId());
            assertEquals(request.getEndTime(), issued.getEndTime());
            assertNull(issued.getOrderId(), "赠券不是新增购买订单");
        }
        verifyNoInteractions(orders);
    }
    @Test void missingCouponIsExplicitlyRejectedBeforeWriting() {
        CustomerCouponService target = spy(new CustomerCouponService());
        ReflectionTestUtils.setField(target, "couponService", mock(CouponService.class));
        ReflectionTestUtils.setField(target, "orderService", mock(OrderService.class));
        assertThrows(BusinessException.class, () -> target.giveCoupon(1, 10L, CustomerCouponType.NORMAL,
                7L, 99L, request.getStartTime(), request.getEndTime(), BigDecimal.ZERO));
        verify(target, never()).saveBatch(anyCollection());
    }
    @Test void legacyGiftEntryAlsoStartsABusinessTransaction() throws Exception {
        assertNotNull(CustomerCouponService.class.getMethod("giveCoupon", Integer.class, Long.class,
                CustomerCouponType.class, Long.class, Long.class, LocalDate.class, LocalDate.class)
                .getAnnotation(org.springframework.transaction.annotation.Transactional.class));
    }
    @Test void legacyExcelWithoutValueColumnDefaultsToZero() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        List<List<String>> head = new ArrayList<>();
        for (String label : new String[]{"客户手机号", "赠送数量", "券有效期起", "券有效期止", "使用限制"})
            head.add(Collections.singletonList(label));
        EasyExcel.write(out).head(head).sheet("赠券申请").doWrite(Collections.singletonList(
                Arrays.asList("13800000001", "2", "2026-11-08", "2026-12-08", "")));
        service.importAdd(new MockMultipartFile("file", "old.xlsx", "application/octet-stream", out.toByteArray()), 5L, 9L);
        org.mockito.ArgumentCaptor<GiftCustomerCoupon> capture = org.mockito.ArgumentCaptor.forClass(GiftCustomerCoupon.class);
        verify(service).save(capture.capture()); assertEquals(new BigDecimal("0.00"), amount(capture.getValue()));
    }
    @Test void giftValueDeliveryIsTransactional() throws Exception {
        org.springframework.transaction.annotation.Transactional tx = GiftCustomerCouponService.class
            .getMethod("changeRelateRecordState", Long.class, FlowState.class)
            .getAnnotation(org.springframework.transaction.annotation.Transactional.class);
        assertNotNull(tx, "审批赠券和状态必须同事务保存");
    }
}
