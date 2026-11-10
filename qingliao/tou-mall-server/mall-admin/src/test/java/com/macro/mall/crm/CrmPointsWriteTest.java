package com.macro.mall.crm;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Customer;
import com.macro.mall.entity.Integration;
import com.macro.mall.service.CustomerService;
import com.macro.mall.service.IntegrationService;
import com.macro.mall.service.PointsBalanceChangedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collection;
import java.util.Collections;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 会员中心开启后，积分写入必须以 CRM 为账本：本地影子行只做留痕与幂等锚点。
 */
class CrmPointsWriteTest {
    IntegrationService service;
    CustomerService customers;
    CrmSyncService crm;
    Customer customer;

    @BeforeEach void setup() {
        service = mock(IntegrationService.class, CALLS_REAL_METHODS);
        customers = mock(CustomerService.class);
        crm = mock(CrmSyncService.class);
        ReflectionTestUtils.setField(service, "customerService", customers);
        ReflectionTestUtils.setField(service, "crmSyncService", crm);
        customer = new Customer();
        customer.setId(10L);
        customer.setPhone("13800000001");
        when(customers.getById(10L)).thenReturn(customer);
        when(crm.isActive()).thenReturn(true);
        doReturn(true).when(service).removeById(anyLong());
        doReturn(true).when(service).removeByIds(anyCollection());
        doReturn(true).when(service).updateById(any(Integration.class));
    }

    private void saveAssignsId(long id) {
        doAnswer(inv -> { ((Integration) inv.getArgument(0)).setId(id); return true; })
                .when(service).save(any(Integration.class));
    }

    @Test void deductionCapsAtCrmBalanceAndUsesShadowIdAsRef() {
        when(crm.balanceOf(customer)).thenReturn(30L);
        when(crm.consume(customer, 30L, "积分抵扣", "ql-deduct:700")).thenReturn(0L);
        saveAssignsId(700L);

        Integration row = service.useIntegration(100L, 10L, "积分抵扣");

        assertNotNull(row);
        assertEquals(30L, row.getScore());
        assertEquals(0, row.getType());
        verify(crm).consume(customer, 30L, "积分抵扣", "ql-deduct:700");
    }

    @Test void zeroBalanceReturnsNullWithoutCallingCrm() {
        when(crm.balanceOf(customer)).thenReturn(0L);
        assertNull(service.useIntegration(10L, 10L, "积分抵扣"));
        verify(crm, never()).consume(any(), anyLong(), anyString(), anyString());
        verify(service, never()).save(any(Integration.class));
    }

    @Test void crmRejectsInsufficientBalanceAsConcurrentChangeAndRemovesShadow() {
        when(crm.balanceOf(customer)).thenReturn(30L);
        when(crm.consume(customer, 10L, "积分抵扣", "ql-deduct:701"))
                .thenThrow(new BusinessException("积分余额不足", 422));
        saveAssignsId(701L);

        PointsBalanceChangedException e = assertThrows(PointsBalanceChangedException.class,
                () -> service.useIntegration(10L, 10L, "积分抵扣"));
        assertTrue(e.getMessage().contains("余额已变化"), e.getMessage());
        verify(service).removeById(701L);
    }

    @Test void deductedRowIsRefundedWithRefBasedOnShadowId() {
        Integration row = new Integration();
        row.setId(800L);
        row.setScore(25L);
        row.setCustomerId(10L);
        row.setType(0);
        row.setState(1);
        doReturn(row).when(service).getOnlyOne(any(LambdaQueryWrapper.class));
        when(crm.earn(customer, 25L, "订单取消或退款返还", "ql-revoke:800")).thenReturn(50L);

        service.revocationIntegration(900L, 10L);

        verify(crm).earn(customer, 25L, "订单取消或退款返还", "ql-revoke:800");
        assertEquals(0, row.getState());
        assertEquals("订单已取消或退款", row.getComment());
        verify(service).updateById(row);
    }

    @Test void repeatedRevocationWithoutEffectiveRowDoesNothing() {
        doReturn(null).when(service).getOnlyOne(any(LambdaQueryWrapper.class));
        service.revocationIntegration(900L, 10L);
        verify(crm, never()).earn(any(), anyLong(), anyString(), anyString());
    }

    @SuppressWarnings("unchecked")
    @Test void addIntegrationWritesLocalShadowThenCrmWithRowIdRef() {
        doAnswer(inv -> {
            Collection<Integration> rows = inv.getArgument(0);
            long id = 900L;
            for (Integration row : rows) row.setId(id++);
            return true;
        }).when(service).saveBatch(anyCollection());
        when(crm.earn(customer, 12L, "活动补发", "ql-add:900")).thenReturn(100L);

        service.addIntegration(12L, null, 10L, "活动补发");

        verify(crm).earn(customer, 12L, "活动补发", "ql-add:900");
    }

    @Test void explicitBusinessRefIsPreferredOverRowId() {
        doAnswer(inv -> {
            Collection<Integration> rows = inv.getArgument(0);
            for (Integration row : rows) row.setId(901L);
            return true;
        }).when(service).saveBatch(anyCollection());
        when(crm.earn(customer, 6L, "评价抽奖", "ql-draw:77")).thenReturn(106L);

        service.addIntegration(6L, 77L, 10L, "评价抽奖", "ql-draw:77");

        verify(crm).earn(customer, 6L, "评价抽奖", "ql-draw:77");
    }

    @Test void failedCrmEarnRemovesShadowRow() {
        doAnswer(inv -> {
            Collection<Integration> rows = inv.getArgument(0);
            for (Integration row : rows) row.setId(902L);
            return true;
        }).when(service).saveBatch(anyCollection());
        when(crm.earn(customer, 12L, "活动补发", "ql-add:902"))
                .thenThrow(new BusinessException("会员服务暂时不可用，请稍后重试", 503));

        assertThrows(BusinessException.class, () -> service.addIntegration(12L, null, 10L, "活动补发"));
        verify(service).removeByIds(anyCollection());
    }

    @Test void balanceReadsComeFromCrmWhenActive() {
        when(crm.balanceOf(customer)).thenReturn(88L);
        assertEquals(88L, service.getIntegrationByCustomerId(10L));
        assertEquals(Collections.singletonMap(10L, 88L), service.getIntegrationByCustomerList(Collections.singletonList(10L)));
        verify(service, never()).getLocalIntegrationByCustomerList(anyList());
    }

    @Test void localLedgerStaysAvailableForMigration() {
        when(crm.isActive()).thenReturn(false);
        IntegrationService local = mock(IntegrationService.class, CALLS_REAL_METHODS);
        ReflectionTestUtils.setField(local, "customerService", customers);
        ReflectionTestUtils.setField(local, "crmSyncService", crm);
        doReturn(Collections.singletonMap(10L, 55L)).when(local).getLocalIntegrationByCustomerList(anyList());

        // 关闭状态下余额读取走本地账本
        assertEquals(55L, local.getIntegrationByCustomerId(10L));
        verify(crm, never()).balanceOf(any());
    }
}
