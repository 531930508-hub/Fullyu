package com.macro.mall.service;

import com.macro.mall.mapper.PrepaidMemberRewardMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.Arrays;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PrepaidRewardScheduledTest {
    Object job;PrepaidMemberRewardService rewards;PrepaidMemberRewardMapper mapper;
    void setup()throws Exception {
        Class<?> type=null;try{type=Class.forName("com.macro.mall.service.job.PrepaidMemberRewardScheduled");}catch(ClassNotFoundException ignored){}
        assertNotNull(type,"缺少提交后赠月任务调度");job=type.getDeclaredConstructor().newInstance();
        rewards=mock(PrepaidMemberRewardService.class);mapper=mock(PrepaidMemberRewardMapper.class);
        ReflectionTestUtils.setField(job,"rewards",rewards);ReflectionTestUtils.setField(job,"mapper",mapper);
    }
    @Test void disabledDoesNotReadTables()throws Exception {
        setup();job.getClass().getMethod("poll").invoke(job);verifyNoInteractions(mapper);
    }
    @Test void failureIsDeferredAndDoesNotBlockFollowingSource()throws Exception {
        setup();when(rewards.isEnabled()).thenReturn(true);when(mapper.due()).thenReturn(Arrays.asList(100L,101L));
        doThrow(new RuntimeException("synthetic failure")).when(rewards).process(100L);
        when(mapper.defer(100L)).thenReturn(1);
        job.getClass().getMethod("poll").invoke(job);verify(mapper).defer(100L);verify(rewards).process(101L);
    }
    @Test void failedDeferralDoesNotBlockFollowingSource()throws Exception {
        setup();when(rewards.isEnabled()).thenReturn(true);when(mapper.due()).thenReturn(Arrays.asList(100L,101L));
        doThrow(new RuntimeException("synthetic failure")).when(rewards).process(100L);
        doThrow(new RuntimeException("synthetic retry failure")).when(mapper).defer(100L);
        job.getClass().getMethod("poll").invoke(job);verify(rewards).process(101L);
    }
}
