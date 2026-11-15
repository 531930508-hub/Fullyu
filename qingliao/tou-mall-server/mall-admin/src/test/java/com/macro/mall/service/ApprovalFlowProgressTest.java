package com.macro.mall.service;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.github.pagehelper.PageHelper;
import com.macro.mall.entity.Approval;
import com.macro.mall.entity.ApprovalDetail;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;

/**
 * 「我提交的」列表要能直接看到提交→各审批节点的流转进度，而不是只有最终状态。
 */
class ApprovalFlowProgressTest {

    ApprovalDetailService service;

    @BeforeEach
    void setup() {
        service = spy(new ApprovalDetailService());
        service.approvalService = mock(ApprovalService.class);
    }

    @Test
    void submittedListCarriesEveryNodeInSubmitOrder() {
        Approval approval = new Approval();
        approval.setId(100L);
        approval.setState(2);
        approval.setCreateUser(9L);
        doReturn(Collections.singletonList(approval)).when(service.approvalService).list(any(Wrapper.class));

        ApprovalDetail create = ApprovalDetail.builder().approvalId(100L).targetUserId(9L)
                .flowUserType(1).state(3).build();
        create.setId(1L);
        ApprovalDetail firstApproval = ApprovalDetail.builder().approvalId(100L).targetUserId(11L)
                .flowUserType(2).state(3).nodeName("内训师审批").build();
        firstApproval.setId(2L);
        ApprovalDetail secondApproval = ApprovalDetail.builder().approvalId(100L).targetUserId(12L)
                .flowUserType(2).state(2).nodeName("店长审批").build();
        secondApproval.setId(3L);
        ApprovalDetail cc = ApprovalDetail.builder().approvalId(100L).targetUserId(13L)
                .flowUserType(3).state(2).build();
        cc.setId(4L);
        doReturn(Arrays.asList(create, firstApproval, secondApproval, cc)).when(service)
                .list(any(Wrapper.class));

        try {
            service.pageSubmitted(9L, new HashMap<>());
        } finally {
            PageHelper.clearPage();
        }

        List<com.macro.mall.dto.ApprovalFlowNodeBrief> nodes = approval.getFlowNodes();
        assertEquals(3, nodes.size(), "抄送人不属于审批流转节点");
        assertEquals(Integer.valueOf(1), nodes.get(0).getFlowUserType(), "发起人节点排在最前");
        assertEquals("内训师审批", nodes.get(1).getNodeName());
        assertEquals("店长审批", nodes.get(2).getNodeName());
        assertEquals(Integer.valueOf(2), nodes.get(2).getState(), "当前卡在店长审批");
    }

    @Test
    void approvalWithoutDetailsFallsBackToEmptyProgress() {
        Approval approval = new Approval();
        approval.setId(200L);
        doReturn(Collections.singletonList(approval)).when(service.approvalService).list(any(Wrapper.class));
        doReturn(Collections.emptyList()).when(service).list(any(Wrapper.class));

        try {
            service.pageSubmitted(9L, new HashMap<>());
        } finally {
            PageHelper.clearPage();
        }

        assertEquals(0, approval.getFlowNodes().size(), "没有流转记录时返回空列表，前端提示「暂无流转记录」");
    }
}