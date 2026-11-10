package com.macro.mall.service;

import com.macro.mall.mapper.AdminApprovalNoticeMapper;
import com.macro.mall.mapper.AdminNoticeBindingMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminNoticeScheduledTest {
    Object job;AdminApprovalNoticeService notices;AdminApprovalNoticeMapper mapper;AdminNoticeBindingMapper bindings;
    void setup()throws Exception{Class<?> type=null;try{type=Class.forName("com.macro.mall.service.job.AdminNoticeScheduled");}catch(ClassNotFoundException ignored){}assertNotNull(type,"缺少已提交审批outbox调度");job=type.getDeclaredConstructor().newInstance();notices=mock(AdminApprovalNoticeService.class);mapper=mock(AdminApprovalNoticeMapper.class);ReflectionTestUtils.setField(job,"notices",notices);ReflectionTestUtils.setField(job,"mapper",mapper);bindings=mock(AdminNoticeBindingMapper.class);ReflectionTestUtils.setField(job,"bindings",bindings);}
    @Test void disabledSchedulerNeverReadsTables()throws Exception{setup();job.getClass().getMethod("poll").invoke(job);verifyNoInteractions(mapper);verifyNoInteractions(bindings);}
    @Test void oneFailureDoesNotBlockFollowingPersons()throws Exception{setup();when(notices.isEnabled()).thenReturn(true);when(mapper.due()).thenReturn(Arrays.asList(1L,2L));doThrow(new RuntimeException("synthetic failure")).when(notices).process(1L);job.getClass().getMethod("poll").invoke(job);verify(notices).process(2L);}
    // 过期绑定凭证只保留一天用于排查，之后分批清除，避免候选openid长期滞留。
    @Test void enabledPollPurgesExpiredChallengesInBoundedBatch()throws Exception{setup();when(notices.isEnabled()).thenReturn(true);when(mapper.due()).thenReturn(Collections.emptyList());job.getClass().getMethod("poll").invoke(job);verify(bindings).purgeExpiredChallenges();}
    @Test void cleanupFailureDoesNotStopApprovalNotices()throws Exception{setup();when(notices.isEnabled()).thenReturn(true);when(bindings.purgeExpiredChallenges()).thenThrow(new RuntimeException("synthetic"));when(mapper.due()).thenReturn(Arrays.asList(3L));job.getClass().getMethod("poll").invoke(job);verify(notices).process(3L);}
}
