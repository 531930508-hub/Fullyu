package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.entity.Approval;
import com.macro.mall.entity.ApprovalCategory;
import com.macro.mall.entity.ApprovalDetail;
import com.macro.mall.enums.approval.FlowCategoryCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.ArrayList;
import java.util.Collection;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ApprovalWorkflowCreationTest {
    ApprovalDetailService service;
    ApprovalCategory category;
    @BeforeEach void setup() {
        service = spy(new ApprovalDetailService());
        service.approvalCategoryService = mock(ApprovalCategoryService.class);
        service.approvalService = mock(ApprovalService.class);
        // 这里验证的是没有节点配置时的旧 approvalIds 回退链路，节点服务必须返回空配置。
        service.approvalFlowNodeService = mock(ApprovalFlowNodeService.class);
        when(service.approvalFlowNodeService.listByCategoryId(any())).thenReturn(new ArrayList<>());
        when(service.approvalFlowNodeService.resolveNodes(anyList(), any(), any())).thenReturn(new ArrayList<>());
        category = new ApprovalCategory(); category.setId(3L); category.setTitle("低星服务反馈");
        category.setApprovalIds("[11]"); category.setCcIds("[]");
        when(service.approvalCategoryService.findByCode(any(), any())).thenReturn(category);
        when(service.approvalService.save(any())).thenAnswer(call -> {
            ((Approval) call.getArgument(0)).setId(55L); return true;
        });
        doReturn(true).when(service).saveBatch(anyCollection());
    }
    Long create() { return service.add(100L, 10L, null, FlowCategoryCode.LOW_RATING, 0L); }
    @Test void systemFlowHasSeparateCustomerAndSystemIdentities() {
        assertEquals(55L, create());
        verify(service.approvalService).save(argThat(value -> Long.valueOf(10L).equals(value.getCustomerId())
                && Long.valueOf(0L).equals(value.getCreateUser())));
    }
    @Test void emptyApproversFailsWithReadableBusinessError() {
        category.setApprovalIds("[]"); assertThrows(BusinessException.class, this::create);
        verify(service.approvalService, never()).save(any());
    }
    @Test void duplicateApproversOnlyCreateOneNode() {
        category.setApprovalIds("[11,11]"); create();
        verify(service).saveBatch(argThat((Collection<ApprovalDetail> rows) -> rows.size() == 2));
    }
    @Test void invalidApproverCannotCreateUnreachableTask() {
        category.setApprovalIds("[0]"); assertThrows(BusinessException.class, this::create);
    }
    @Test void nullCcListIsAllowed() {
        category.setCcIds(null); assertEquals(55L, assertDoesNotThrow(this::create));
    }
    @Test void failedMainWriteStopsBeforeNodes() {
        doReturn(false).when(service.approvalService).save(any());
        assertThrows(BusinessException.class, this::create);
        verify(service, never()).saveBatch(anyCollection());
    }
    @Test void failedNodeWriteFailsWholeCreation() {
        doReturn(false).when(service).saveBatch(anyCollection());
        assertThrows(BusinessException.class, this::create);
    }
    @Test void invalidConfigurationIsNotSilentlyAccepted() {
        category.setApprovalIds("bad json"); assertThrows(BusinessException.class, this::create);
    }
    @Test void successfulCreationCapturesNotificationAfterNodeWrite() {
        AdminApprovalNoticeService notices=mock(AdminApprovalNoticeService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"noticeService",notices);
        create();org.mockito.InOrder order=inOrder(service,notices);order.verify(service).saveBatch(anyCollection());order.verify(notices).capture(55L);
    }
    @Test void failedNodeWriteCannotQueueNotification() {
        AdminApprovalNoticeService notices=mock(AdminApprovalNoticeService.class);
        org.springframework.test.util.ReflectionTestUtils.setField(service,"noticeService",notices);
        doReturn(false).when(service).saveBatch(anyCollection());assertThrows(BusinessException.class,this::create);verifyNoInteractions(notices);
    }
    @Test void failedBatchMainWriteMustAbortBeforeCreatingTasks() {
        doReturn(false).when(service.approvalService).saveBatch(anyCollection());
        assertThrows(BusinessException.class,()->service.addBatch(java.util.Arrays.asList(10L,11L),null,FlowCategoryCode.LOW_RATING,0L));
        verify(service,never()).saveBatch(anyCollection());
    }
    @Test void batchNodesKeepCategoryIdAndRejectWriteFailure() {
        doAnswer(call->{for(Object value:(Collection<?>)call.getArgument(0))((Approval)value).setId(((Approval)value).getCustomerId()+100);return true;}).when(service.approvalService).saveBatch(anyCollection());
        doAnswer(call->{for(Object value:(Collection<?>)call.getArgument(0))assertEquals(3L,((ApprovalDetail)value).getCategoryId());return false;}).when(service).saveBatch(anyCollection());
        assertThrows(BusinessException.class,()->service.addBatch(java.util.Arrays.asList(10L,11L),null,FlowCategoryCode.LOW_RATING,0L));
    }

    private com.macro.mall.dto.ApprovalResolvedNode resolvedNode(String name, Long... adminIds) {
        com.macro.mall.dto.ApprovalResolvedNode node = new com.macro.mall.dto.ApprovalResolvedNode();
        node.setNodeName(name);
        node.setApproveMode(com.macro.mall.enums.approval.ApprovalNodeMode.ANY.getCode());
        node.setAdminIds(new ArrayList<>(java.util.Arrays.asList(adminIds)));
        return node;
    }

    @Test void earlyLeaveOnlyCreatesShopManagerNodeAndIgnoresLegacyApprovers() {
        category.setCode(FlowCategoryCode.ASK_FOR_LEAVE.getCode());
        category.setApprovalIds("[20]");
        when(service.approvalFlowNodeService.resolveLeaveChain(8L, 1L, false))
                .thenReturn(new ArrayList<>(java.util.Collections.singletonList(resolvedNode("店长审批", 7L))));
        service.addLeave(null, null, 8L, FlowCategoryCode.ASK_FOR_LEAVE, 1L, 1);
        verify(service).saveBatch(argThat((Collection<ApprovalDetail> rows) -> {
            // 发起人 + 店长审批（审批中），旧版审批人 20 不再参与
            if (rows.size() != 2) return false;
            ApprovalDetail manager = rows.stream()
                    .filter(r -> Long.valueOf(7L).equals(r.getTargetUserId())).findFirst().orElse(null);
            return manager != null && "店长审批".equals(manager.getNodeName())
                    && Integer.valueOf(1).equals(manager.getLevel())
                    && rows.stream().noneMatch(r -> Long.valueOf(20L).equals(r.getTargetUserId()));
        }));
    }

    @Test void sameDayLeaveAddsHqCeoAsSecondLevel() {
        category.setCode(FlowCategoryCode.ASK_FOR_LEAVE.getCode());
        category.setApprovalIds("[20]");
        when(service.approvalFlowNodeService.resolveLeaveChain(8L, 1L, true))
                .thenReturn(new ArrayList<>(java.util.Arrays.asList(
                        resolvedNode("店长审批", 7L), resolvedNode("总部CEO审批", 20L))));
        service.addLeave(null, null, 8L, FlowCategoryCode.ASK_FOR_LEAVE, 1L, 2);
        verify(service).saveBatch(argThat((Collection<ApprovalDetail> rows) -> {
            if (rows.size() != 3) return false;
            ApprovalDetail manager = rows.stream()
                    .filter(r -> Long.valueOf(7L).equals(r.getTargetUserId())).findFirst().orElse(null);
            ApprovalDetail ceo = rows.stream()
                    .filter(r -> Long.valueOf(20L).equals(r.getTargetUserId())).findFirst().orElse(null);
            return manager != null && Integer.valueOf(1).equals(manager.getLevel())
                    && ceo != null && "总部CEO审批".equals(ceo.getNodeName())
                    && Integer.valueOf(2).equals(ceo.getLevel());
        }));
    }

    @Test void leaveIsRejectedAndNothingSavedWhenShopHasNoManager() {
        category.setCode(FlowCategoryCode.ASK_FOR_LEAVE.getCode());
        when(service.approvalFlowNodeService.resolveLeaveChain(8L, 1L, false))
                .thenThrow(new BusinessException("本店还没有可用店长"));
        assertThrows(BusinessException.class,
                () -> service.addLeave(null, null, 8L, FlowCategoryCode.ASK_FOR_LEAVE, 1L, 1));
        verify(service.approvalService, never()).save(any());
        verify(service, never()).saveBatch(anyCollection());
    }
}
