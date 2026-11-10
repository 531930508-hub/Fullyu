package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.MassagistRateDto;
import com.macro.mall.entity.ApprovalCategory;
import com.macro.mall.entity.MassagistRate;
import com.macro.mall.entity.Order;
import com.macro.mall.entity.OrderDetail;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LowRatingApprovalTest {
    MassagistRateService service;
    OrderService orders;
    OrderDetailService details;
    ApprovalDetailService approvals;
    ApprovalCategoryService categories;
    Order order;
    MassagistRateDto dto;
    boolean forgedIdReachedWrite;

    @BeforeEach void setup() {
        service = spy(new MassagistRateService());
        orders = mock(OrderService.class);
        details = mock(OrderDetailService.class);
        approvals = mock(ApprovalDetailService.class);
        categories = mock(ApprovalCategoryService.class);
        service.orderService = orders;
        injectIfPresent("orderDetailService", details);
        injectIfPresent("approvalDetailService", approvals);
        injectIfPresent("approvalCategoryService", categories);
        order = new Order(); order.setId(100L); order.setCustomerId(10L);
        order.setShopId(1L); order.setState(1); order.setAppointmentState(2);
        when(orders.getOne(any(LambdaQueryWrapper.class))).thenReturn(order);
        when(orders.getById(100L)).thenReturn(order);
        when(orders.updateById(any())).thenReturn(true);
        OrderDetail detail = new OrderDetail(); detail.setMassagistId(7L); detail.setOrderId(100L);
        when(details.listByOrderId(100L)).thenReturn(Collections.singletonList(detail));
        ApprovalCategory category = new ApprovalCategory(); category.setId(3L);
        category.setApprovalIds("[11]"); category.setCcIds("[]");
        when(categories.findByCode(any(), any())).thenReturn(category);
        when(approvals.add(eq(100L), eq(10L), isNull(), any(), eq(0L))).thenReturn(90L);
        doReturn(Collections.emptyList()).when(service).list(any(Wrapper.class));
        doReturn(true).when(service).updateBatchById(anyCollection());
        doAnswer(invocation -> {
            List<MassagistRate> saved = invocation.getArgument(0);
            forgedIdReachedWrite = saved.stream().anyMatch(value -> Long.valueOf(999L).equals(value.getId()));
            for (int i = 0; i < saved.size(); i++) saved.get(i).setId(20L + i);
            doReturn(saved).when(service).list(any(Wrapper.class));
            return true;
        }).when(service).saveBatch(anyCollection());
        dto = new MassagistRateDto(); dto.setOrderId(100L); dto.setComment("需要跟进服务反馈");
        dto.setTherapistRatings(Collections.singletonList(rate("4")));
    }

    // 缺实现时仍能运行至业务断言，避免以测试夹具错误代替 RED。
    void injectIfPresent(String field, Object value) {
        try { ReflectionTestUtils.setField(service, field, value); }
        catch (IllegalArgumentException ignored) { }
    }
    MassagistRate rate(String score) {
        MassagistRate rate = new MassagistRate(); rate.setMassagistId(7L);
        rate.setRating(new BigDecimal(score)); return rate;
    }
    void neverSaved() { verify(service, never()).saveBatch(anyCollection()); }

    @Test void customerCannotRateAnotherCustomersOrder() {
        order.setCustomerId(99L);
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L)); neverSaved();
    }
    @Test void unfinishedOrderCannotBeRated() {
        order.setAppointmentState(1);
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L)); neverSaved();
    }
    @Test void refundedOrderCannotBeRated() {
        order.setState(6);
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L)); neverSaved();
    }
    @Test void alreadyRatedOrderCannotCreateAnotherApproval() {
        order.setState(2);
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L)); neverSaved();
        verifyNoInteractions(approvals);
    }
    @Test void unassignedTherapistCannotBeRated() {
        dto.getTherapistRatings().get(0).setMassagistId(99L);
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L)); neverSaved();
    }
    @Test void duplicateTherapistIsRejectedBeforeWriting() {
        dto.setTherapistRatings(Arrays.asList(rate("4"), rate("3")));
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L)); neverSaved();
    }
    @Test void invalidScoreIsRejectedBeforeWriting() {
        dto.getTherapistRatings().get(0).setRating(BigDecimal.ZERO);
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L)); neverSaved();
    }
    @Test void nullScoreIsRejectedBeforeWriting() {
        dto.getTherapistRatings().get(0).setRating(null);
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L)); neverSaved();
    }
    @Test void scoreAboveFiveIsRejectedBeforeWriting() {
        dto.getTherapistRatings().get(0).setRating(new BigDecimal("6"));
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L)); neverSaved();
    }
    @Test void failedRatingWriteDoesNotUpdateOrderOrCreateApproval() {
        doReturn(false).when(service).saveBatch(anyCollection());
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L));
        verify(orders, never()).updateById(any()); verifyNoInteractions(approvals);
    }
    @Test void failedOrderWriteDoesNotReportSuccess() {
        when(orders.updateById(any())).thenReturn(false);
        assertThrows(BusinessException.class, () -> service.createRateList(dto, 10L));
    }
    @Test void fourStarsCreatesGlobalSystemApprovalNotCustomerAdminIdentity() {
        service.createRateList(dto, 10L);
        verify(approvals).add(eq(100L), eq(10L), isNull(),
                argThat(code -> "lowRating".equals(code.getCode())), eq(0L));
    }
    @Test void fiveStarsNeverCreatesApproval() {
        dto.setTherapistRatings(Collections.singletonList(rate("5")));
        service.createRateList(dto, 10L); verifyNoInteractions(approvals);
    }
    @Test void missingConfigurationDoesNotDiscardCustomerFeedback() {
        when(categories.findByCode(any(), any())).thenReturn(null);
        service.createRateList(dto, 10L);
        verify(service).saveBatch(anyCollection()); verifyNoInteractions(approvals);
    }
    @Test void forgedExistingRatingIdCannotOverwriteHistory() {
        dto.getTherapistRatings().get(0).setId(999L);
        service.createRateList(dto, 10L);
        assertFalse(forgedIdReachedWrite, "请求中的记录ID不可直接落库");
    }
}
