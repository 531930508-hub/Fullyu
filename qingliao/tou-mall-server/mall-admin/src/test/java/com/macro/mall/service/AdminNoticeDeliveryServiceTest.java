package com.macro.mall.service;

import com.macro.mall.bo.AdminNoticeJob;
import com.macro.mall.mapper.AdminApprovalNoticeMapper;
import com.macro.mall.mapper.AdminNoticeBindingMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdminNoticeDeliveryServiceTest {
    static final String CONTENT="{{thing1.DATA}}{{phrase2.DATA}}";
    AdminNoticeDeliveryService service;
    AdminApprovalNoticeMapper mapper;
    AdminNoticeBindingMapper bindings;
    final LocalDateTime now=LocalDateTime.of(2026,11,12,9,30);

    void setup(){
        service=new AdminNoticeDeliveryService();
        mapper=mock(AdminApprovalNoticeMapper.class);
        bindings=mock(AdminNoticeBindingMapper.class);
        ReflectionTestUtils.setField(service,"mapper",mapper);
        ReflectionTestUtils.setField(service,"bindings",bindings);
        ReflectionTestUtils.setField(service,"enabled",true);
        ReflectionTestUtils.setField(service,"mode","live");
        ReflectionTestUtils.setField(service,"appId","synthetic-app");
        ReflectionTestUtils.setField(service,"templateId","synthetic-template");
        ReflectionTestUtils.setField(service,"clock",Clock.fixed(now.atZone(ZoneId.of("Asia/Shanghai")).toInstant(),ZoneId.of("Asia/Shanghai")));
        when(mapper.lock(1L)).thenReturn(row());
        when(mapper.current(1L)).thenReturn(1);
        when(mapper.activeAdmin(7L)).thenReturn(1);
        when(mapper.followingOpenId(7L,"synthetic-app")).thenReturn("synthetic-open-id");
        when(mapper.claim(1L)).thenReturn(1);
        when(mapper.defer(eq(1L),anyString(),anyString())).thenReturn(1);
        when(mapper.finish(eq(1L),anyString(),anyString())).thenReturn(1);
    }

    Map<String,Object> row(){
        Map<String,Object> row=new HashMap<>();
        row.put("id",1L);row.put("adminId",7L);row.put("approvalId",100L);
        row.put("kind","PENDING");row.put("approvalState",2);row.put("attempts",2);
        row.put("state","PENDING");row.put("createTime",now.minusHours(2));
        row.put("categoryTitle","出差审批");row.put("approvalCreateTime",now.minusDays(1));row.put("applicant","张三");
        return row;
    }

    @Test void liveModeNeedsSwitchModeAndAppId(){
        setup();
        assertTrue(service.isLive());
        ReflectionTestUtils.setField(service,"mode","mock");
        assertFalse(service.isLive());
        ReflectionTestUtils.setField(service,"mode","live");
        ReflectionTestUtils.setField(service,"enabled",false);
        assertFalse(service.isLive());
    }

    @Test void mockModeRetiresTaskWithoutTouchingBinding(){
        setup();ReflectionTestUtils.setField(service,"mode","mock");
        assertNull(service.claim(1L,CONTENT));
        verify(mapper).finish(1L,"LIVE_BLOCKED","LIVE_DISABLED");
        verify(mapper,never()).followingOpenId(anyLong(),anyString());
        verify(mapper,never()).claim(anyLong());
    }

    @Test void expiredTaskIsClosedInsteadOfRetriedForever(){
        setup();
        Map<String,Object> row=row();row.put("createTime",now.minusDays(31));
        when(mapper.lock(1L)).thenReturn(row);
        assertNull(service.claim(1L,CONTENT));
        verify(mapper).finish(1L,"EXPIRED","EXPIRED");
    }

    @Test void staleBacklogIsClosedWithoutPush(){
        setup();
        Map<String,Object> row=row();row.put("createTime",now.minusHours(25));
        when(mapper.lock(1L)).thenReturn(row);
        assertNull(service.claim(1L,CONTENT));
        verify(mapper).finish(1L,"SUPERSEDED","STALE");
        verify(mapper,never()).claim(anyLong());
    }

    @Test void supersededTaskNeverReachesFormerApprover(){
        setup();when(mapper.current(1L)).thenReturn(0);
        assertNull(service.claim(1L,CONTENT));
        verify(mapper).finish(1L,"SUPERSEDED","SUPERSEDED");
        verify(mapper,never()).activeAdmin(anyLong());
    }

    @Test void disabledAdminIsClosedImmediately(){
        setup();when(mapper.activeAdmin(7L)).thenReturn(0);
        assertNull(service.claim(1L,CONTENT));
        verify(mapper).finish(1L,"INACTIVE","ADMIN_DISABLED");
        verify(mapper,never()).claim(anyLong());
    }

    @Test void missingTemplateOrInvalidContentDefersAsConfigIssue(){
        setup();
        ReflectionTestUtils.setField(service,"templateId","");
        assertNull(service.claim(1L,CONTENT));
        verify(mapper).defer(1L,"NOT_CONFIGURED","TEMPLATE_MISSING");
        ReflectionTestUtils.setField(service,"templateId","synthetic-template");
        assertNull(service.claim(1L,null));
        verify(mapper).defer(1L,"NOT_CONFIGURED","TEMPLATE_INVALID");
        assertNull(service.claim(1L,"模板没有字段"));
        verify(mapper,never()).claim(anyLong());
    }

    @Test void unfollowedAdminDefersAndRecordsAttempt(){
        setup();when(mapper.followingOpenId(7L,"synthetic-app")).thenReturn(null);
        assertNull(service.claim(1L,CONTENT));
        verify(mapper).defer(1L,"NOT_BOUND","NOT_FOLLOWED");
        verify(mapper).attempt(1L,3,"NOT_BOUND","NOT_FOLLOWED","synthetic-template");
        verify(mapper,never()).claim(anyLong());
    }

    @Test void lostRaceDoesNotAttemptDelivery(){
        setup();when(mapper.claim(1L)).thenReturn(0);
        assertNull(service.claim(1L,CONTENT));
        verify(mapper,never()).attempt(anyLong(),anyInt(),anyString(),anyString(),anyString());
    }

    @Test void claimBuildsJobWithOwnOpenIdAndReadableContext(){
        setup();
        AdminNoticeJob job=service.claim(1L,CONTENT);
        assertNotNull(job);
        assertEquals("synthetic-open-id",job.getOpenId());
        assertEquals(3,job.getAttemptNo());
        assertEquals("出差审批",job.getContext().get("title"));
        assertEquals("待审批",job.getContext().get("status"));
        assertEquals("100",job.getContext().get("code"));
        assertEquals("张三",job.getContext().get("person"));
        assertEquals("2026-11-11 09:30",job.getContext().get("time"));
    }

    @Test void resultKindsUseChineseStatusWords(){
        assertEquals("已通过",AdminNoticeDeliveryService.statusText("RESULT",3));
        assertEquals("已退回",AdminNoticeDeliveryService.statusText("RESULT",4));
        assertEquals("已撤回",AdminNoticeDeliveryService.statusText("RESULT",0));
        assertEquals("抄送",AdminNoticeDeliveryService.statusText("CC",2));
    }

    @Test void settleFailureIsReportedNotSwallowed(){
        setup();when(mapper.finish(eq(1L),anyString(),anyString())).thenReturn(0);
        ReflectionTestUtils.setField(service,"mode","mock");
        assertThrows(RuntimeException.class,()->service.claim(1L,CONTENT));
    }

    @Test void deliveredNeedsSendingStateTransition(){
        setup();
        AdminNoticeJob job=service.claim(1L,CONTENT);
        when(mapper.finish(1L,"SENT","WECHAT_OK")).thenReturn(1);
        service.delivered(job,"msg-1");
        verify(mapper).attempt(1L,3,"SENT","WECHAT_OK","synthetic-template");
        when(mapper.finish(1L,"SENT","WECHAT_OK")).thenReturn(0);
        assertThrows(RuntimeException.class,()->service.delivered(job,"msg-2"));
    }

    @Test void failedUnfollowClearsBindingOnlyForSubscribeErrors(){
        setup();
        AdminNoticeJob job=service.claim(1L,CONTENT);
        service.failed(job,"NOT_BOUND","NOT_FOLLOWED");
        verify(bindings).markUnfollowed("synthetic-app","synthetic-open-id");
        verify(mapper).defer(1L,"NOT_BOUND","NOT_FOLLOWED");
        reset(bindings);
        service.failed(job,"SEND_FAILED","WECHAT_-1");
        verifyNoInteractions(bindings);
        verify(mapper).defer(1L,"SEND_FAILED","WECHAT_-1");
    }
}