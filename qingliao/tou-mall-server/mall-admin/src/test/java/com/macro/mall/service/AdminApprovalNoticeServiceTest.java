package com.macro.mall.service;

import com.macro.mall.bo.AdminNoticeJob;
import com.macro.mall.mapper.AdminApprovalNoticeMapper;
import com.macro.mall.mapper.AdminNoticeBindingMapper;
import me.chanjar.weixin.common.error.WxError;
import me.chanjar.weixin.common.error.WxErrorException;
import me.chanjar.weixin.mp.bean.template.WxMpTemplateMessage;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AdminApprovalNoticeServiceTest {
    static final String CONTENT="{{thing1.DATA}} {{phrase2.DATA}} {{character_string3.DATA}} {{name4.DATA}} {{time5.DATA}}";
    AdminApprovalNoticeService service;
    AdminApprovalNoticeMapper mapper;
    AdminNoticeDeliveryService delivery;
    AdminNoticeWxSender sender;
    AdminNoticeBindingMapper bindings;

    void setup() throws Exception {
        service=new AdminApprovalNoticeService();
        mapper=mock(AdminApprovalNoticeMapper.class);
        delivery=mock(AdminNoticeDeliveryService.class);
        sender=mock(AdminNoticeWxSender.class);
        bindings=mock(AdminNoticeBindingMapper.class);
        ReflectionTestUtils.setField(service,"mapper",mapper);
        ReflectionTestUtils.setField(service,"delivery",delivery);
        ReflectionTestUtils.setField(service,"sender",sender);
        ReflectionTestUtils.setField(service,"bindings",bindings);
        ReflectionTestUtils.setField(service,"enabled",true);
        ReflectionTestUtils.setField(service,"appId","synthetic-app");
        ReflectionTestUtils.setField(service,"templateId","synthetic-template");
        ReflectionTestUtils.setField(service,"adminWebUrl","https://test-cityretreat.fullyu.cn/");
        ReflectionTestUtils.setField(service,"clock",Clock.fixed(
            LocalDateTime.of(2026,11,12,9,30).atZone(ZoneId.of("Asia/Shanghai")).toInstant(),ZoneId.of("Asia/Shanghai")));
    }

    AdminNoticeJob job(){
        AdminNoticeJob job=new AdminNoticeJob();
        job.setNoticeId(1L);job.setAdminId(7L);job.setApprovalId(100L);job.setKind("PENDING");job.setApprovalState(2);
        job.setAttemptNo(1);job.setOpenId("synthetic-open-id");job.setTemplateId("synthetic-template");
        Map<String,String> ctx=new LinkedHashMap<>();
        ctx.put("title","出差审批");ctx.put("status","待审批");ctx.put("code","100");
        ctx.put("person","张三");ctx.put("time","2026-11-12 09:00");ctx.put("remark","点击查看详情");
        job.setContext(ctx);
        return job;
    }

    @SuppressWarnings("unchecked")
    WxMpTemplateMessage sent() throws Exception {
        ArgumentCaptor<WxMpTemplateMessage> captor=ArgumentCaptor.forClass(WxMpTemplateMessage.class);
        verify(sender).send(eq("synthetic-app"),captor.capture());
        return captor.getValue();
    }

    @Test void disabledFeatureSendsAndStoresNothing() throws Exception {
        setup();ReflectionTestUtils.setField(service,"enabled",false);
        service.process(1L);
        service.capture(100L);
        verifyNoInteractions(sender,delivery,mapper);
    }

    @Test void captureOutsideBusinessTransactionFailsClosed() throws Exception {
        setup();
        assertThrows(RuntimeException.class,()->service.capture(100L));
        verifyNoInteractions(mapper);
    }

    @Test void captureQueuesInsideBusinessTransactionOnly() throws Exception {
        setup();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try{
            service.capture(100L);
            service.advanceGeneration(100L);
        }finally{TransactionSynchronizationManager.setActualTransactionActive(false);}
        verify(mapper).capture(100L);
        verify(mapper).advanceGeneration(100L);
        verifyNoInteractions(sender,delivery);
    }

    @Test void advanceGenerationRequiresTransaction() throws Exception {
        setup();
        assertThrows(RuntimeException.class,()->service.advanceGeneration(100L));
        verifyNoInteractions(mapper);
    }

    @Test void successSendsRealTemplateMessageAndRecordsDelivery() throws Exception {
        setup();
        when(sender.templateContent("synthetic-app","synthetic-template")).thenReturn(CONTENT);
        when(delivery.claim(1L,CONTENT)).thenReturn(job());
        when(sender.send(eq("synthetic-app"),any(WxMpTemplateMessage.class))).thenReturn("msg-1");
        service.process(1L);
        WxMpTemplateMessage message=sent();
        assertEquals("synthetic-open-id",message.getToUser());
        assertEquals("synthetic-template",message.getTemplateId());
        assertEquals("https://test-cityretreat.fullyu.cn/#/todo/index",message.getUrl());
        assertEquals(5,message.getData().size());
        assertEquals("待审批",message.getData().get(1).getValue());
        verify(delivery).delivered(job(),"msg-1");
    }

    @Test void pendingNoticeLinksToMobileApprovalPage() throws Exception {
        setup();
        AdminNoticeLinkService links=new AdminNoticeLinkService();
        ReflectionTestUtils.setField(links,"adminWebUrl","https://test-cityretreat.fullyu.cn/");
        ReflectionTestUtils.setField(links,"linkSecret","synthetic-link-secret");
        ReflectionTestUtils.setField(links,"linkTtlHours",168L);
        ReflectionTestUtils.setField(service,"linkService",links);
        AdminNoticeJob job=job();job.setDetailId(200L);
        when(sender.templateContent("synthetic-app","synthetic-template")).thenReturn(CONTENT);
        when(delivery.claim(1L,CONTENT)).thenReturn(job);
        when(sender.send(eq("synthetic-app"),any(WxMpTemplateMessage.class))).thenReturn("msg-2");
        service.process(1L);
        String url=sent().getUrl();
        assertTrue(url.startsWith("https://test-cityretreat.fullyu.cn/static/notice-approval.html?"));
        assertTrue(url.contains("approvalId=100"));
        assertTrue(url.contains("detailId=200"));
        assertTrue(url.contains("adminId=7"));
        assertTrue(url.contains("sig="));
    }

    @Test void templateReadFailureStillDefersWithoutSending() throws Exception {
        setup();
        when(sender.templateContent(anyString(),anyString())).thenThrow(new WxErrorException(new WxError(40164,"invalid ip")));
        when(delivery.claim(1L,null)).thenReturn(null);
        service.process(1L);
        verify(sender,never()).send(anyString(),any(WxMpTemplateMessage.class));
        verify(delivery,never()).failed(any(),anyString(),anyString());
        verify(delivery,never()).delivered(any(),any());
    }

    @Test void unfollowedUserIsRecordedAsNotBound() throws Exception {
        setup();
        when(sender.templateContent(anyString(),anyString())).thenReturn(CONTENT);
        when(delivery.claim(1L,CONTENT)).thenReturn(job());
        when(sender.send(anyString(),any(WxMpTemplateMessage.class))).thenThrow(new WxErrorException(new WxError(43004,"require subscribe")));
        service.process(1L);
        verify(delivery).failed(job(),"NOT_BOUND","NOT_FOLLOWED");
        verify(delivery,never()).delivered(any(),any());
    }

    @Test void templateErrorIsNotTreatedAsSendFailure() throws Exception {
        setup();
        when(sender.templateContent(anyString(),anyString())).thenReturn(CONTENT);
        when(delivery.claim(1L,CONTENT)).thenReturn(job());
        when(sender.send(anyString(),any(WxMpTemplateMessage.class))).thenThrow(new WxErrorException(new WxError(40037,"invalid template_id")));
        service.process(1L);
        verify(delivery).failed(job(),"NOT_CONFIGURED","TEMPLATE_INVALID");
    }

    @Test void unknownWechatErrorRetriesAsSendFailed() throws Exception {
        setup();
        when(sender.templateContent(anyString(),anyString())).thenReturn(CONTENT);
        when(delivery.claim(1L,CONTENT)).thenReturn(job());
        when(sender.send(anyString(),any(WxMpTemplateMessage.class))).thenThrow(new WxErrorException(new WxError(-1,"system error")));
        service.process(1L);
        verify(delivery).failed(job(),"SEND_FAILED","WECHAT_-1");
    }

    @Test void transportExceptionRetriesWithoutSwallowingClaim() throws Exception {
        setup();
        when(sender.templateContent(anyString(),anyString())).thenReturn(CONTENT);
        when(delivery.claim(1L,CONTENT)).thenReturn(job());
        when(sender.send(anyString(),any(WxMpTemplateMessage.class))).thenThrow(new IllegalStateException("network"));
        service.process(1L);
        verify(delivery).failed(job(),"SEND_FAILED","SEND_ERROR");
    }

    @Test void deliveryWriteFailureAfterSendIsNotTreatedAsSendFailure() throws Exception {
        setup();
        when(sender.templateContent(anyString(),anyString())).thenReturn(CONTENT);
        when(delivery.claim(1L,CONTENT)).thenReturn(job());
        when(sender.send(anyString(),any(WxMpTemplateMessage.class))).thenReturn("msg-2");
        doThrow(new RuntimeException("state changed")).when(delivery).delivered(any(),anyString());
        service.process(1L);
        verify(delivery,never()).failed(any(),anyString(),anyString());
    }

    @Test void errorClassificationMatchesWechatCodes() {
        assertArrayEquals(new String[]{"NOT_BOUND","NOT_FOLLOWED"},AdminApprovalNoticeService.classify(43004));
        assertArrayEquals(new String[]{"NOT_BOUND","INVALID_OPENID"},AdminApprovalNoticeService.classify(40003));
        assertArrayEquals(new String[]{"NOT_CONFIGURED","TEMPLATE_INVALID"},AdminApprovalNoticeService.classify(47003));
        assertArrayEquals(new String[]{"NOT_CONFIGURED","AUTH_INVALID"},AdminApprovalNoticeService.classify(40125));
        assertArrayEquals(new String[]{"SEND_FAILED","WECHAT_45009"},AdminApprovalNoticeService.classify(45009));
    }

    @Test void testSendRequiresLiveModeTemplateAndBinding() throws Exception {
        setup();
        assertThrows(RuntimeException.class,()->service.sendTest(7L));
        when(delivery.isLive()).thenReturn(true);
        when(sender.templateContent("synthetic-app","synthetic-template")).thenReturn(CONTENT);
        Map<String,Object> binding=new HashMap<>();
        binding.put("openId","synthetic-open-id");binding.put("following",1);
        when(bindings.binding(7L,"synthetic-app")).thenReturn(binding);
        when(bindings.recentTestSends(7L)).thenReturn(Collections.emptyMap());
        when(bindings.adminName(7L)).thenReturn("测试员工");
        when(bindings.audit(7L,"TEST_SENT")).thenReturn(1);
        when(sender.send(eq("synthetic-app"),any(WxMpTemplateMessage.class))).thenReturn("test-msg");
        Map<String,Object> result=service.sendTest(7L);
        assertEquals("test-msg",result.get("messageId"));
        assertEquals("测试员工",sent().getData().get(3).getValue());
        verify(bindings).audit(7L,"TEST_SENT");
    }

    @Test void testSendRateLimitAndUnfollowAreRejected() throws Exception {
        setup();
        when(delivery.isLive()).thenReturn(true);
        when(sender.templateContent("synthetic-app","synthetic-template")).thenReturn(CONTENT);
        Map<String,Object> binding=new HashMap<>();
        binding.put("openId","synthetic-open-id");binding.put("following",0);
        when(bindings.binding(7L,"synthetic-app")).thenReturn(binding);
        assertThrows(RuntimeException.class,()->service.sendTest(7L));
        binding.put("following",1);
        when(bindings.recentTestSends(7L)).thenReturn(Collections.singletonMap("lastMinute",1));
        assertThrows(RuntimeException.class,()->service.sendTest(7L));
        verify(sender,never()).send(anyString(),any(WxMpTemplateMessage.class));
    }

    @Test void stoppedAdminCannotReadPersonalLogsWithStaleToken() throws Exception {
        setup();
        when(mapper.activeAdmin(7L)).thenReturn(0);
        assertThrows(RuntimeException.class,()->service.logs(7L,1,10));
        verify(mapper,never()).logs(anyLong(),anyInt(),anyInt());
    }

    @Test void ownerLogPaginationRejectsAnonymousAndOversizedRequests() throws Exception {
        setup();
        when(mapper.activeAdmin(7L)).thenReturn(1);
        assertThrows(RuntimeException.class,()->service.logs(null,1,10));
        assertThrows(RuntimeException.class,()->service.logs(7L,1,101));
    }

    @Test void logsExposeLastResultWithoutOpenId() throws Exception {
        setup();
        when(mapper.activeAdmin(7L)).thenReturn(1);
        Map<String,Object> row=new HashMap<>();
        row.put("id",1L);row.put("approvalId",100L);row.put("kind","PENDING");row.put("state","SENT");
        row.put("lastResult","WECHAT_OK");row.put("createTime",LocalDateTime.of(2026,11,12,9,0));
        when(mapper.logs(7L,0,10)).thenReturn(Collections.singletonList(row));
        when(mapper.count(7L)).thenReturn(1L);
        Map<String,Object> result=service.logs(7L,1,10);
        assertEquals(1L,result.get("total"));
        assertFalse(result.toString().contains("open"));
        assertTrue(result.toString().contains("WECHAT_OK"));
    }

    // SQL契约：幂等、只取到期任务、退避使用旧次数。
    @Test void mapperContractKeepsIdempotencyAndBackoff() throws Exception {
        Class<?> type=Class.forName("com.macro.mall.mapper.AdminApprovalNoticeMapper");
        String capture=sql(type,"capture",org.apache.ibatis.annotations.Insert.class,Long.class);
        assertTrue(capture.contains("ON DUPLICATE KEY UPDATE"));
        String due=sql(type,"due",org.apache.ibatis.annotations.Select.class);
        assertTrue(due.contains("'SENDING'")&&due.contains("next_attempt_at<=NOW()"));
        String lock=sql(type,"lock",org.apache.ibatis.annotations.Select.class,Long.class);
        assertTrue(lock.contains("next_attempt_at<=NOW()")&&lock.contains("FOR UPDATE"));
        String defer=sql(type,"defer",org.apache.ibatis.annotations.Update.class,Long.class,String.class,String.class);
        assertTrue(defer.contains("LEAST(6,POW(2,attempts))"));
        assertTrue(defer.indexOf("next_attempt_at=")<defer.indexOf("attempts=attempts+1"),defer);
        String claim=sql(type,"claim",org.apache.ibatis.annotations.Update.class,Long.class);
        assertTrue(claim.contains("state='SENDING'")&&claim.contains("state IN('PENDING','SENDING','SEND_FAILED')"));
        // 抄送不允许按门店过滤，只按处理人id。
        assertTrue(capture.contains("d.target_user_id>0"));
        assertFalse(capture.toLowerCase(Locale.ROOT).contains("shop"));
    }

    static String sql(Class<?> type,String method,Class<? extends java.lang.annotation.Annotation> kind,Class<?>...types) throws Exception {
        java.lang.annotation.Annotation a=type.getMethod(method,types).getAnnotation(kind);
        return String.join("",(String[])a.annotationType().getMethod("value").invoke(a));
    }

}