package com.macro.mall.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.macro.mall.entity.MassagistRate;
import com.macro.mall.enums.FlowState;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LowRatingFollowupTest {
    MassagistRateService ratings;
    @BeforeEach void setup() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), MassagistRate.class);
        ratings = mock(MassagistRateService.class);
        when(ratings.update(any(Wrapper.class))).thenReturn(true);
    }
    Object instance(String name) throws Exception {
        Class<?> type;
        try { type = Class.forName(name); } catch (ClassNotFoundException e) { type = null; }
        assertNotNull(type, "缺少低星反馈业务处理适配器");
        Object object = type.getDeclaredConstructor().newInstance();
        ReflectionTestUtils.setField(object, "massagistRateService", ratings);
        return object;
    }
    ApprovalRelation relation() throws Exception {
        return (ApprovalRelation) instance("com.macro.mall.service.approval.LowRatingApprovalRelationService");
    }
    @Test void rejectionOnlyUpdatesFollowupStateNeverDeletesRating() throws Exception {
        relation().changeRelateRecordState(90L, FlowState.REJECTED);
        verify(ratings).update(argThat((Wrapper<MassagistRate> query) -> query.getSqlSegment().contains("approval_id")));
        verify(ratings, never()).remove(any(Wrapper.class));
    }
    @Test void withdrawalPreservesOriginalFeedback() throws Exception {
        relation().deleteByApprovalId(90L);
        verify(ratings).update(any(Wrapper.class)); verify(ratings, never()).remove(any(Wrapper.class));
    }
    @Test void detailIncludesOriginalRatingAndStableBusinessType() throws Exception {
        MassagistRate rate = new MassagistRate(); rate.setOrderId(100L); rate.setRating(new BigDecimal("4"));
        rate.setComment("原始反馈");
        when(ratings.list(any(Wrapper.class))).thenReturn(Collections.singletonList(rate));
        Map<?, ?> data = (Map<?, ?>) relation().detail(90L);
        assertEquals("lowRating", data.get("businessType"));
        assertEquals(100L, data.get("orderId"));
        assertSame(rate, ((java.util.List<?>) data.get("ratings")).get(0));
    }
    @Test void detailLoadsTherapistNamesOnceWithoutExposingPrivateProfiles() throws Exception {
        MassagistRate a = new MassagistRate(); a.setMassagistId(7L);
        MassagistRate b = new MassagistRate(); b.setMassagistId(7L);
        when(ratings.list(any(Wrapper.class))).thenReturn(Arrays.asList(a, b));
        MassagistService people = mock(MassagistService.class);
        com.macro.mall.entity.Massagist person = new com.macro.mall.entity.Massagist();
        person.setId(7L); person.setName("合成疗愈师"); person.setPhone("PRIVATE_TEST_VALUE");
        when(people.list(any(Wrapper.class))).thenReturn(Collections.singletonList(person));
        ApprovalRelation relation = relation();
        assertDoesNotThrow(() -> ReflectionTestUtils.setField(relation, "massagistService", people));
        Map<?, ?> data = (Map<?, ?>) relation.detail(90L);
        assertEquals("合成疗愈师", a.getMassagistName());
        assertEquals("合成疗愈师", b.getMassagistName());
        verify(people, times(1)).list(argThat((Wrapper<com.macro.mall.entity.Massagist> query) ->
                query.getSqlSelect().equals("id,name") && query.getSqlSegment().contains("id IN")));
        assertFalse(data.containsKey("people"));
    }
    @Test void missingTherapistKeepsStableIdFallback() throws Exception {
        MassagistRate rate = new MassagistRate(); rate.setMassagistId(99L);
        when(ratings.list(any(Wrapper.class))).thenReturn(Collections.singletonList(rate));
        MassagistService people = mock(MassagistService.class);
        when(people.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        ApprovalRelation relation = relation();
        assertDoesNotThrow(() -> ReflectionTestUtils.setField(relation, "massagistService", people));
        relation.detail(90L);
        assertEquals(99L, rate.getMassagistId()); assertNull(rate.getMassagistName());
    }
    @Test void retryProcessesEachSourceOrderOnlyOnce() throws Exception {
        MassagistRate a = new MassagistRate(); a.setOrderId(100L);
        MassagistRate b = new MassagistRate(); b.setOrderId(100L);
        MassagistRate c = new MassagistRate(); c.setOrderId(200L);
        when(ratings.list(any(Wrapper.class))).thenReturn(Arrays.asList(a,b,c));
        Object job = instance("com.macro.mall.service.job.LowRatingApprovalScheduled");
        job.getClass().getMethod("retryPending").invoke(job);
        verify(ratings).enqueueLowRatings(100L); verify(ratings).enqueueLowRatings(200L);
        verify(ratings).list(argThat((Wrapper<MassagistRate> query) -> query.getSqlSegment().contains("LIMIT 100")));
    }
    @Test void oneFailedRetryDoesNotBlockOtherOrders() throws Exception {
        MassagistRate a = new MassagistRate(); a.setOrderId(100L);
        MassagistRate b = new MassagistRate(); b.setOrderId(200L);
        when(ratings.list(any(Wrapper.class))).thenReturn(Arrays.asList(a,b));
        doThrow(new IllegalStateException("test failure")).when(ratings).enqueueLowRatings(100L);
        Object job = instance("com.macro.mall.service.job.LowRatingApprovalScheduled");
        job.getClass().getMethod("retryPending").invoke(job);
        verify(ratings).enqueueLowRatings(200L);
    }
}
