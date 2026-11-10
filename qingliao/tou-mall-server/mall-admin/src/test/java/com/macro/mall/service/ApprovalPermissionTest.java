package com.macro.mall.service;

import com.macro.mall.bo.AdminUserDetails;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.*;
import com.macro.mall.model.UmsAdmin;
import com.github.pagehelper.PageInfo;
import org.junit.jupiter.api.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import java.time.LocalDateTime;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class ApprovalPermissionTest {
    ApprovalDetailService service;
    ApprovalDetail node;
    Approval approval;
    @BeforeEach void setup() {
        service=spy(new ApprovalDetailService());
        service.approvalService=mock(ApprovalService.class);
        service.approvalCategoryService=mock(ApprovalCategoryService.class);
        UmsAdmin admin=new UmsAdmin();admin.setId(10L);admin.setShopId(1L);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
            new AdminUserDetails(admin,Collections.emptyList()),null,Collections.emptyList()));
        node=ApprovalDetail.builder().approvalId(100L).targetUserId(10L).flowUserType(2).level(1).state(2)
            .startTime(LocalDateTime.now().minusMinutes(1)).build();node.setId(5L);
        approval=new Approval();approval.setId(100L);approval.setCreateUser(9L);approval.setState(2);
        doReturn(node).when(service).getById(5L);
        doReturn(true).when(service).updateById(any());
        when(service.approvalService.getById(100L)).thenReturn(approval);
        when(service.approvalService.rejected(anyLong(),anyLong(),any(),anyString())).thenReturn(approval);
        ApprovalDetail next=ApprovalDetail.builder().level(2).state(1).targetUserId(11L).build();
        doReturn(Arrays.asList(node,next)).when(service).findByApprovalIdAndUserType(anyLong(),any());
        doReturn(new PageInfo<>(Collections.emptyList())).when(service).page(anyMap());
        doReturn(Collections.emptyList()).when(service).list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class));
        doReturn(0L).when(service).count(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class));
    }
    @AfterEach void clear(){SecurityContextHolder.clearContext();}
    @Test void queryCannotImpersonateAnotherPersonOrHideOtherStores() {
        Map<String,Object> query=new HashMap<>();query.put("targetUserId",99L);query.put("shopId",8L);
        service.pageInfo(query);
        verify(service).page(argThat((Map<String,Object> p)->Long.valueOf(10).equals(p.get("targetUserId")) && !p.containsKey("shopId")));
    }
    @Test void doneStatesDoNotAddContradictoryScalarEquality() {
        Map<String,Object> params=new HashMap<>();params.put("state","3,0");params.put("target_user_id",10L);
        com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<ApprovalDetail> wrapper=
            service.buildWrapper(params,new com.baomidou.mybatisplus.core.conditions.query.QueryWrapper<>());
        wrapper.getSqlSegment();
        assertFalse(wrapper.getParamNameValuePairs().containsValue("3,0"),"完成状态不能同时增加 state = '3,0'");
    }
    @Test void anonymousQueryFailsClosed() {
        SecurityContextHolder.clearContext();
        assertThrows(BusinessException.class,()->service.pageInfo(new HashMap<>()));
    }
    @Test void anotherPersonCannotPassEvenAlreadyPassedNode() {
        node.setTargetUserId(99L);node.setState(3);
        assertThrows(BusinessException.class,()->service.pass(5L));
        verify(service,never()).updateById(any());
    }
    @Test void futureNodeCannotBeApprovedEarly() {
        node.setState(1);
        assertThrows(BusinessException.class,()->service.pass(5L));
        verify(service,never()).updateById(any());
    }
    @Test void ccPersonCannotReject() {
        node.setFlowUserType(3);
        assertThrows(BusinessException.class,()->service.reject(5L,"测试原因"));
        verify(service,never()).updateById(any());
    }
    @Test void actualAssignedPersonCanAdvanceCurrentNode() {
        assertEquals(5L,service.pass(5L));
        assertEquals(3,node.getState());
        verify(service,times(2)).updateById(any());
    }
    @Test void onlyOriginalCreatorCanResubmit() {
        approval.setState(0);
        assertThrows(BusinessException.class,()->service.reSubmit(100L));
        verify(service.approvalService,never()).updateById(any());
    }
    @Test void unrelatedPersonCannotReadLinkedBusinessData() {
        assertThrows(BusinessException.class,()->service.detail(100L));
    }
    @Test void nextApproverIsCapturedOnlyAfterSuccessfulAdvance() {
        AdminApprovalNoticeService notices=mock(AdminApprovalNoticeService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"noticeService",notices);
        service.pass(5L);verify(notices).capture(100L);
    }
    @Test void failedNodeUpdateCannotCaptureNextApprover() {
        AdminApprovalNoticeService notices=mock(AdminApprovalNoticeService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"noticeService",notices);
        doReturn(false).when(service).updateById(any());
        assertThrows(BusinessException.class,()->service.pass(5L));verifyNoInteractions(notices);
    }
    @Test void rejectionCapturesResultOnlyAfterSuccessfulBusinessUpdate() {
        AdminApprovalNoticeService notices=mock(AdminApprovalNoticeService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"noticeService",notices);
        service.reject(5L,"需要补充反馈");
        org.mockito.InOrder order=inOrder(service.approvalService,notices);
        order.verify(service.approvalService).rejected(10L,100L,com.macro.mall.enums.FlowState.REJECTED,"需要补充反馈");
        order.verify(notices).capture(100L);
    }
    private AdminApprovalNoticeService resubmitFixture() {
        AdminApprovalNoticeService notices=mock(AdminApprovalNoticeService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"noticeService",notices);
        approval.setCreateUser(10L);approval.setState(0);
        doReturn(true).when(service.approvalService).updateById(any());
        doReturn(Arrays.asList(node)).when(service).list(any(com.baomidou.mybatisplus.core.conditions.Wrapper.class));
        doReturn(true).when(service).updateBatchById(anyCollection());
        return notices;
    }
    @Test void failedResubmitMainWriteDoesNotQueueReminder() {
        AdminApprovalNoticeService notices=resubmitFixture();
        doReturn(false).when(service.approvalService).updateById(any());
        assertThrows(BusinessException.class,()->service.reSubmit(100L));
        verify(service,never()).updateBatchById(anyCollection());verifyNoInteractions(notices);
    }
    @Test void failedResubmitNodesDoNotQueueReminder() {
        AdminApprovalNoticeService notices=resubmitFixture();
        doReturn(false).when(service).updateBatchById(anyCollection());
        assertThrows(BusinessException.class,()->service.reSubmit(100L));verifyNoInteractions(notices);
    }
    @Test void resubmitWithoutFirstApproverFailsClosed() {
        AdminApprovalNoticeService notices=resubmitFixture();node.setLevel(2);
        assertThrows(BusinessException.class,()->service.reSubmit(100L));verifyNoInteractions(notices);
    }
    @Test void successfulResubmitCreatesNewNoticeGenerationBeforeCapture() throws Exception {
        AdminApprovalNoticeService notices=resubmitFixture();
        service.reSubmit(100L);
        assertEquals(2,node.getState());assertNull(node.getFinishTime());
        java.lang.reflect.Method generation=notices.getClass().getMethod("advanceGeneration",Long.class);
        generation.invoke(verify(notices),100L);
        verify(notices).capture(100L);
    }
    @Test void failedCcWriteCannotQueueCompletionResult() {
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(new org.apache.ibatis.builder.MapperBuilderAssistant(new com.baomidou.mybatisplus.core.MybatisConfiguration(), "test"),ApprovalDetail.class);
        AdminApprovalNoticeService notices=mock(AdminApprovalNoticeService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"noticeService",notices);
        doReturn(Arrays.asList(node)).when(service).findByApprovalIdAndUserType(100L,com.macro.mall.enums.FlowUserType.APPROVAL);
        ApprovalDetail cc=ApprovalDetail.builder().approvalId(100L).targetUserId(11L).flowUserType(3).build();cc.setId(6L);
        doReturn(Arrays.asList(cc)).when(service).findByApprovalIdAndUserType(100L,com.macro.mall.enums.FlowUserType.CC);
        doReturn(false).when(service).updateById(cc);
        assertThrows(BusinessException.class,()->service.pass(5L));verifyNoInteractions(notices);
    }
    @Test void repeatedPassCannotQueueDuplicateNotification() {
        AdminApprovalNoticeService notices=mock(AdminApprovalNoticeService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"noticeService",notices);
        node.setState(3);service.pass(5L);verifyNoInteractions(notices);
    }
}
