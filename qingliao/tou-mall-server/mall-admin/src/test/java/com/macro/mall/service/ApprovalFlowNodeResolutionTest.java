package com.macro.mall.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.ApprovalFlowTarget;
import com.macro.mall.dto.ApprovalResolvedNode;
import com.macro.mall.entity.ApprovalFlowNode;
import com.macro.mall.enums.MassagistIdentityCode;
import com.macro.mall.enums.approval.ApprovalNodeMode;
import com.macro.mall.enums.approval.ApprovalTargetScope;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 审批节点解析与保存的边界用例。
 *
 * <p>解析结果会被快照进 f_approval_detail，因此这里重点保证：
 * 岗位解析走身份表、停用账号被剔除、发起人不会被派给自己、空节点被跳过、配置非法时给出可读错误。</p>
 *
 * @author Full愈
 * @date 2026/11/09
 */
class ApprovalFlowNodeResolutionTest {

    ApprovalFlowNodeService service;

    @BeforeEach void setup() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "test"), ApprovalFlowNode.class);
        service = spy(new ApprovalFlowNodeService());
        service.massagistIdentityService = mock(MassagistIdentityService.class);
        service.umsAdminService = mock(UmsAdminServiceImpl.class);
        doReturn(true).when(service).remove(any(Wrapper.class));
        doReturn(true).when(service).save(any(ApprovalFlowNode.class));
    }

    private ApprovalFlowNode node(String name, String mode, ApprovalFlowTarget... targets) {
        ApprovalFlowNode node = new ApprovalFlowNode();
        node.setNodeName(name);
        node.setApproveMode(mode);
        node.setTargets(new ArrayList<>(Arrays.asList(targets)));
        return node;
    }

    private ApprovalFlowTarget identityTarget(String code, String scope) {
        ApprovalFlowTarget target = new ApprovalFlowTarget();
        target.setType(ApprovalFlowTarget.TYPE_IDENTITY);
        target.setCode(code);
        target.setScope(scope);
        return target;
    }

    private ApprovalFlowTarget userTarget(Long adminId) {
        ApprovalFlowTarget target = new ApprovalFlowTarget();
        target.setType(ApprovalFlowTarget.TYPE_USER);
        target.setAdminId(adminId);
        return target;
    }

    private UmsAdmin admin(Long id, Integer status) {
        UmsAdmin admin = new UmsAdmin();
        admin.setId(id);
        admin.setStatus(status);
        return admin;
    }

    private List<String> adminIds(ApprovalResolvedNode node) {
        return node.getAdminIds().stream().map(String::valueOf).collect(Collectors.toList());
    }

    @Test void shopManagerIdentityResolvesToStoreAdmins() {
        when(service.massagistIdentityService.resolveAdminIds(
                MassagistIdentityCode.SHOP_MANAGER, ApprovalTargetScope.SHOP, 9L, 5L))
                .thenReturn(Arrays.asList(7L, 8L));
        List<ApprovalResolvedNode> resolved = service.resolveNodes(
                Collections.singletonList(node("店长审批", ApprovalNodeMode.ANY.getCode(),
                        identityTarget(MassagistIdentityCode.SHOP_MANAGER.getCode(), ApprovalTargetScope.SHOP.getCode()))),
                9L, 5L);
        assertEquals(1, resolved.size());
        assertEquals("店长审批", resolved.get(0).getNodeName());
        assertEquals(ApprovalNodeMode.ANY.getCode(), resolved.get(0).getApproveMode());
        assertEquals(Arrays.asList("7", "8"), adminIds(resolved.get(0)));
    }

    @Test void trainerIdentityWithoutShopUsesAllStoreScope() {
        when(service.massagistIdentityService.resolveAdminIds(
                MassagistIdentityCode.TRAINER, ApprovalTargetScope.ALL, null, null))
                .thenReturn(Collections.singletonList(12L));
        List<ApprovalResolvedNode> resolved = service.resolveNodes(
                Collections.singletonList(node("内训师复核", ApprovalNodeMode.ALL.getCode(),
                        identityTarget(MassagistIdentityCode.TRAINER.getCode(), ApprovalTargetScope.ALL.getCode()))),
                null, null);
        assertEquals(1, resolved.size());
        assertEquals(ApprovalNodeMode.ALL.getCode(), resolved.get(0).getApproveMode());
        assertEquals(Collections.singletonList("12"), adminIds(resolved.get(0)));
    }

    @Test void inactiveAccountIsDroppedAndRequesterIsNeverAssignedToSelf() {
        when(service.umsAdminService.listByIds(argThat(ids -> ids != null && ids.size() == 3)))
                .thenReturn(Arrays.asList(admin(5L, 1), admin(6L, 1), admin(11L, 0)));
        List<ApprovalResolvedNode> resolved = service.resolveNodes(
                Collections.singletonList(node("直属主管", ApprovalNodeMode.ANY.getCode(),
                        userTarget(5L), userTarget(6L), userTarget(11L))),
                9L, 5L);
        assertEquals(1, resolved.size());
        assertEquals(Collections.singletonList("6"), adminIds(resolved.get(0)));
    }

    @Test void nodeWithoutAnyApproverIsSkipped() {
        when(service.umsAdminService.listByIds(anyCollection())).thenAnswer(call -> {
            List<Long> ids = new ArrayList<>(call.getArgument(0));
            List<UmsAdmin> admins = new ArrayList<>();
            for (Long id : ids) admins.add(admin(id, Long.valueOf(11L).equals(id) ? 0 : 1));
            return admins;
        });
        List<ApprovalResolvedNode> resolved = service.resolveNodes(Arrays.asList(
                node("空节点", ApprovalNodeMode.ANY.getCode(), userTarget(11L)),
                node("有效节点", ApprovalNodeMode.ANY.getCode(), userTarget(6L))), 9L, null);
        assertEquals(1, resolved.size());
        assertEquals("有效节点", resolved.get(0).getNodeName());
    }

    @Test void unknownIdentityIsIgnoredInsteadOfBlankingWholeFlow() {
        when(service.massagistIdentityService.resolveAdminIds(
                MassagistIdentityCode.SHOP_MANAGER, ApprovalTargetScope.SHOP, 9L, null))
                .thenReturn(Collections.singletonList(7L));
        List<ApprovalResolvedNode> resolved = service.resolveNodes(Arrays.asList(
                node("退场岗位", ApprovalNodeMode.ANY.getCode(), identityTarget("EX_EMPLOYEE", ApprovalTargetScope.SHOP.getCode())),
                node("保留节点", ApprovalNodeMode.ANY.getCode(), identityTarget(MassagistIdentityCode.SHOP_MANAGER.getCode(), null))),
                9L, null);
        assertEquals(1, resolved.size());
        assertEquals("保留节点", resolved.get(0).getNodeName());
        assertEquals(Collections.singletonList("7"), adminIds(resolved.get(0)));
        verify(service.massagistIdentityService, times(1))
                .resolveAdminIds(MassagistIdentityCode.SHOP_MANAGER, ApprovalTargetScope.SHOP, 9L, null);
    }

    @Test void blankApproveModeFallsBackToAnyWhileUnknownModeIsRejectedOnSave() {
        when(service.umsAdminService.listByIds(anyCollection())).thenReturn(Collections.singletonList(admin(6L, 1)));
        List<ApprovalResolvedNode> resolved = service.resolveNodes(
                Collections.singletonList(node("历史节点", null, userTarget(6L))), 9L, null);
        assertEquals(ApprovalNodeMode.ANY.getCode(), resolved.get(0).getApproveMode());
        assertThrows(BusinessException.class, () -> service.replaceNodes(3L,
                Collections.singletonList(node("异常节点", "HALF", userTarget(6L)))));
    }

    @Test void duplicateTargetsAreStoredOnce() {
        service.replaceNodes(3L, Collections.singletonList(node("去重", ApprovalNodeMode.ANY.getCode(),
                userTarget(6L), userTarget(6L),
                identityTarget(MassagistIdentityCode.SHOP_MANAGER.getCode(), ApprovalTargetScope.SHOP.getCode()),
                identityTarget(MassagistIdentityCode.SHOP_MANAGER.getCode(), ApprovalTargetScope.SHOP.getCode()))));
        verify(service, times(1)).save(argThat(saved -> {
            List<ApprovalFlowTarget> targets = saved.getTargets();
            return targets.size() == 2 && saved.getSortOrder() == 0 && "3".equals(String.valueOf(saved.getCategoryId()));
        }));
    }

    @Test void emptyTargetNodeCannotBeSaved() {
        assertThrows(BusinessException.class,
                () -> service.replaceNodes(3L, Collections.singletonList(node("空", ApprovalNodeMode.ANY.getCode()))));
        assertThrows(BusinessException.class,
                () -> service.replaceNodes(3L, Collections.singletonList(
                        node("非法范围", ApprovalNodeMode.ANY.getCode(),
                                identityTarget(MassagistIdentityCode.TRAINER.getCode(), "REGION")))));
        assertThrows(BusinessException.class, () -> service.replaceNodes(null,
                Collections.singletonList(node("无归属", ApprovalNodeMode.ANY.getCode(), userTarget(6L)))));
        verify(service, never()).save(any(ApprovalFlowNode.class));
    }

    @Test void clearingNodesFallsBackToLegacyApprovers() {
        service.replaceNodes(3L, Collections.emptyList());
        verify(service, never()).save(any(ApprovalFlowNode.class));
    }
}