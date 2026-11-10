package com.macro.mall.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.ApprovalCategory;
import com.macro.mall.enums.approval.FlowCategoryCode;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ApprovalGlobalConfigTest {
    ApprovalCategoryService service;
    ApprovalCategory config;
    @BeforeEach void setup() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), ApprovalCategory.class);
        service = spy(new ApprovalCategoryService());
        config = new ApprovalCategory(); config.setCode("lowRating"); config.setTitle("低星服务反馈");
        config.setApprovalIdList(Collections.singletonList(11L)); config.setCcIdList(Collections.emptyList());
        doReturn(null).when(service).getOnlyOne(any(LambdaQueryWrapper.class));
        doReturn(true).when(service).save(any());
        doReturn(true).when(service).updateById(any());
        // 列表装配会顺带查询流程节点，单测里没有节点配置，返回空映射即可。
        service.approvalFlowNodeService = mock(ApprovalFlowNodeService.class);
        when(service.approvalFlowNodeService.byCategoryIds(anyList())).thenReturn(new HashMap<>());
    }
    @Test void allowsPersonLevelConfigurationWithoutStore() {
        assertDoesNotThrow(() -> service.add(config));
        verify(service).save(argThat(value -> value.getShopId() == null
                && "lowRatingApprovalRelationService".equals(value.getBeanId())));
    }
    @Test void globalLookupNeverSelectsAnUnrelatedStore() {
        service.findByCode(FlowCategoryCode.LOW_RATING, null);
        verify(service).getOnlyOne(argThat((LambdaQueryWrapper<ApprovalCategory> query) ->
                query.getSqlSegment().contains("shop_id IS NULL")));
    }
    @Test void globalConfigurationIsPreferredBeforeLegacyStoreConfiguration() {
        doReturn(config).when(service).getOnlyOne(any(LambdaQueryWrapper.class));
        assertSame(config, service.findByCode(FlowCategoryCode.LOW_RATING, 2L));
        verify(service).getOnlyOne(argThat((LambdaQueryWrapper<ApprovalCategory> query) ->
                query.getSqlSegment().contains("shop_id IS NULL")));
    }
    @Test void duplicateGlobalConfigurationIsRejected() {
        doReturn(config).when(service).getOnlyOne(any(LambdaQueryWrapper.class));
        assertThrows(BusinessException.class, () -> service.add(config));
        verify(service, never()).save(any());
    }
    @Test void emptyApproversCannotBeSaved() {
        config.setShopId(1L); config.setApprovalIdList(Collections.emptyList());
        assertThrows(BusinessException.class, () -> service.add(config));
    }
    @Test void unknownCategoryCannotInjectArbitraryBean() {
        config.setShopId(1L); config.setCode("fake"); config.setBeanId("orderService");
        assertThrows(BusinessException.class, () -> service.add(config));
    }
    @Test void updateCannotChangeBusinessBindingOrScope() {
        ApprovalCategory existing = new ApprovalCategory(); existing.setId(3L); existing.setCode("giftCoupon");
        existing.setBeanId("giftCustomerCouponService"); existing.setShopId(1L);
        doReturn(existing).when(service).getById(3L);
        config.setId(3L); config.setBeanId("orderService"); config.setShopId(99L);
        service.update(config);
        verify(service).updateById(argThat(value -> "giftCustomerCouponService".equals(value.getBeanId())
                && "giftCoupon".equals(value.getCode()) && Long.valueOf(1L).equals(value.getShopId())));
    }
    @Test void writeFailureIsReported() {
        config.setShopId(1L); doReturn(false).when(service).save(any());
        assertThrows(BusinessException.class, () -> service.add(config));
    }
    @Test void storeQueryIncludesGlobalAndOnlySelectedLegacyStore() {
        HashMap<String, Object> params = new HashMap<>(); params.put("shop_id", 2L);
        com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ApprovalCategory> query =
                service.buildWrapper(params, new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>());
        String sql = query.getSqlSegment();
        assertTrue(sql.contains("shop_id IS NULL"), "门店筛选不能隐藏全局审批配置");
        assertTrue(sql.contains(" OR ") && sql.contains("shop_id ="));
        assertTrue(query.getParamNameValuePairs().containsValue("2")
                || query.getParamNameValuePairs().containsValue(2L));
    }
    @Test void blankStoreQueryDoesNotLimitGlobalConfigurations() {
        HashMap<String, Object> params = new HashMap<>(); params.put("shop_id", " ");
        assertEquals("", service.buildWrapper(params,
                new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>()).getSqlSegment());
    }
    @Test void globalConfigurationRemainsVisibleWithStoreFilter() {
        ApprovalCategory legacy = new ApprovalCategory(); legacy.setShopId(2L);
        doReturn(Arrays.asList(config, legacy)).when(service).listNoPage(anyMap());
        java.util.List<?> result = (java.util.List<?>) assertDoesNotThrow(() -> service.listNoPageNew(new HashMap<>(), "[2]"));
        assertEquals(2, result.size());
    }
}
