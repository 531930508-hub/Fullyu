package com.macro.mall.service;

import cn.hutool.core.util.ObjUtil;
import cn.hutool.core.util.StrUtil;
import com.alibaba.fastjson2.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.macro.mall.common.exception.BusinessException;
import com.macro.mall.dto.ApprovalFlowTarget;
import com.macro.mall.dto.ApprovalResolvedNode;
import com.macro.mall.entity.ApprovalFlowNode;
import com.macro.mall.enums.MassagistIdentityCode;
import com.macro.mall.enums.approval.ApprovalNodeMode;
import com.macro.mall.enums.approval.ApprovalTargetScope;
import com.macro.mall.mapper.ApprovalFlowNodeMapper;
import com.macro.mall.model.UmsAdmin;
import com.macro.mall.service.base.BaseService;
import com.macro.mall.service.impl.UmsAdminServiceImpl;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 审批流程节点配置与解析。
 *
 * <p>节点按 sort_order 依次推进；每个节点可混合“指定人”和“岗位”，并选择或签/会签。
 * 提交审批时会把节点解析成具体审批人并快照到 f_approval_detail，之后改配置不影响在途审批。</p>
 *
 * @author Full愈
 * @date 2026/11/09
 */
@Service
public class ApprovalFlowNodeService extends BaseService<ApprovalFlowNodeMapper, ApprovalFlowNode> {

    @Autowired
    MassagistIdentityService massagistIdentityService;

    @Autowired
    @Lazy
    UmsAdminServiceImpl umsAdminService;

    /** 当天请假的二级审批人（总部CEO）后台账号 id；0/空表示未配置。 */
    @Value("${approval.leave.second-approver-admin-id:0}")
    Long leaveSecondApproverAdminId;

    public List<ApprovalFlowNode> listByCategoryId(Long categoryId) {
        if (ObjUtil.isEmpty(categoryId)) return Collections.emptyList();
        List<ApprovalFlowNode> nodes = list(new LambdaQueryWrapper<ApprovalFlowNode>()
                .eq(ApprovalFlowNode::getCategoryId, categoryId)
                .orderByAsc(ApprovalFlowNode::getSortOrder)
                .orderByAsc(ApprovalFlowNode::getId));
        nodes.forEach(this::parseTargets);
        return nodes;
    }

    public Map<Long, List<ApprovalFlowNode>> byCategoryIds(Collection<Long> categoryIds) {
        Map<Long, List<ApprovalFlowNode>> result = new HashMap<>();
        if (CollectionUtils.isEmpty(categoryIds)) return result;
        for (ApprovalFlowNode node : list(new LambdaQueryWrapper<ApprovalFlowNode>()
                .in(ApprovalFlowNode::getCategoryId, categoryIds)
                .orderByAsc(ApprovalFlowNode::getSortOrder)
                .orderByAsc(ApprovalFlowNode::getId))) {
            parseTargets(node);
            result.computeIfAbsent(node.getCategoryId(), k -> new ArrayList<>()).add(node);
        }
        return result;
    }

    /**
     * 全量替换某个审批类型的节点。传空列表表示回到旧版“直接选审批人”模式。
     */
    @Transactional(rollbackFor = Exception.class)
    public void replaceNodes(Long categoryId, List<ApprovalFlowNode> nodes) {
        if (ObjUtil.isEmpty(categoryId)) throw new BusinessException("审批配置不存在");
        remove(new LambdaQueryWrapper<ApprovalFlowNode>().eq(ApprovalFlowNode::getCategoryId, categoryId));
        if (CollectionUtils.isEmpty(nodes)) return;
        int sort = 0;
        for (ApprovalFlowNode input : nodes) {
            if (input == null) continue;
            ApprovalNodeMode mode = ApprovalNodeMode.of(input.getApproveMode());
            if (mode == null) throw new BusinessException("审批方式只能选择或签或会签");
            List<ApprovalFlowTarget> targets = normalizeTargets(input.getTargets());
            ApprovalFlowNode node = new ApprovalFlowNode();
            node.setCategoryId(categoryId);
            node.setNodeName(StrUtil.isBlank(input.getNodeName()) ? "审批节点" + (sort + 1) : input.getNodeName().trim());
            node.setApproveMode(mode.getCode());
            node.setTargetsJson(JSON.toJSONString(targets));
            node.setSortOrder(sort++);
            node.setTargets(targets);
            if (!save(node)) throw new BusinessException("审批节点保存失败");
        }
        if (sort == 0) throw new BusinessException("请至少配置一个审批节点");
    }

    /**
     * 解析节点：指定人直接取后台账号；岗位按本店/全部门店解析为疗愈师的后台账号。
     * 解析后会排除发起人（避免自己批自己），空节点直接跳过。
     */
    public List<ApprovalResolvedNode> resolveNodes(List<ApprovalFlowNode> nodes, Long shopId, Long requesterAdminId) {
        List<ApprovalResolvedNode> result = new ArrayList<>();
        if (CollectionUtils.isEmpty(nodes)) return result;
        for (ApprovalFlowNode node : nodes) {
            if (node.getTargets() == null || node.getTargets().isEmpty()) parseTargets(node);
            LinkedHashSet<Long> adminIds = new LinkedHashSet<>();
            List<Long> directUserIds = new ArrayList<>();
            for (ApprovalFlowTarget target : node.getTargets()) {
                if (target == null) continue;
                if (target.isUser()) {
                    if (!ObjUtil.isEmpty(target.getAdminId()) && target.getAdminId() > 0) directUserIds.add(target.getAdminId());
                } else if (target.isIdentity()) {
                    MassagistIdentityCode code = MassagistIdentityCode.of(target.getCode());
                    ApprovalTargetScope scope = ApprovalTargetScope.of(target.getScope());
                    if (code == null || scope == null) continue;
                    adminIds.addAll(massagistIdentityService.resolveAdminIds(code, scope, shopId, requesterAdminId));
                }
            }
            if (!directUserIds.isEmpty()) {
                Set<Long> active = umsAdminService.listByIds(directUserIds).stream()
                        .filter(admin -> admin != null && Integer.valueOf(1).equals(admin.getStatus()))
                        .map(UmsAdmin::getId)
                        .collect(Collectors.toSet());
                for (Long id : directUserIds) if (active.contains(id)) adminIds.add(id);
            }
            if (requesterAdminId != null) adminIds.remove(requesterAdminId);
            if (adminIds.isEmpty()) continue;
            ApprovalResolvedNode resolved = new ApprovalResolvedNode();
            resolved.setNodeName(StrUtil.isBlank(node.getNodeName()) ? "审批节点" : node.getNodeName().trim());
            ApprovalNodeMode mode = ApprovalNodeMode.of(node.getApproveMode());
            resolved.setApproveMode((mode == null ? ApprovalNodeMode.ANY : mode).getCode());
            resolved.setAdminIds(new ArrayList<>(adminIds));
            result.add(resolved);
        }
        return result;
    }

    /**
     * 请假流程的内置规则（审批设置里没给请假分类配节点时生效）：
     * <ul>
     *     <li>提前请假：本店店长审批（或签，一级结束）；</li>
     *     <li>当天请假：店长审批 → 二级审批人（总部CEO，配置项 approval.leave.second-approver-admin-id 指定账号）。</li>
     * </ul>
     *
     * <p>店长取的是疗愈师身份里的“店长”，只算本店在职且后台账号启用的；取不到直接拦下，
     * 免得请假落不到人、单据自动完成。</p>
     */
    public List<ApprovalResolvedNode> resolveLeaveChain(Long shopId, Long requesterAdminId, boolean sameDayLeave) {
        List<Long> shopManagers = massagistIdentityService.resolveAdminIds(MassagistIdentityCode.SHOP_MANAGER,
                ApprovalTargetScope.SHOP, shopId, null);
        if (CollectionUtils.isEmpty(shopManagers)) {
            throw new BusinessException("本店还没有在岗店长（未在「疗愈师管理」里配置店长身份），请假无法提交，请联系管理员配置");
        }
        List<ApprovalResolvedNode> chain = new ArrayList<>();
        // 店长本人请假：本店没有更高层级，直接交总部CEO
        if (shopManagers.contains(requesterAdminId)) {
            Long ceoId = requireSecondApprover(requesterAdminId);
            chain.add(buildNode("总部CEO审批", Collections.singletonList(ceoId)));
            return chain;
        }
        List<Long> managerIds = shopManagers.stream()
                .filter(id -> !id.equals(requesterAdminId))
                .collect(Collectors.toList());
        chain.add(buildNode("店长审批", managerIds));
        if (!sameDayLeave) return chain;
        Long ceoId = requireSecondApprover(requesterAdminId);
        // 二级审批人兼任本店店长、或就是请假人本人时，不再重复挂一级
        if (managerIds.contains(ceoId)) return chain;
        chain.add(buildNode("总部CEO审批", Collections.singletonList(ceoId)));
        return chain;
    }

    /** 当天请假/店长请假的二级审批人（总部CEO）：必须已配置且账号启用。 */
    private Long requireSecondApprover(Long requesterAdminId) {
        Long ceoId = leaveSecondApproverAdminId;
        if (ObjUtil.isEmpty(ceoId) || ceoId <= 0) {
            throw new BusinessException("请假需要二级审批人（总部CEO）审批，但系统还没配置该二级审批人，请联系管理员设置 approval.leave.second-approver-admin-id");
        }
        UmsAdmin ceo = umsAdminService.getById(ceoId);
        if (ceo == null || !Integer.valueOf(1).equals(ceo.getStatus())) {
            throw new BusinessException("请假的二级审批人（总部CEO）账号不存在或已停用，请联系管理员调整");
        }
        if (ceoId.equals(requesterAdminId)) {
            throw new BusinessException("二级审批人（总部CEO）就是请假人本人，请假需要更高层级审批，请联系管理员调整");
        }
        return ceoId;
    }

    private ApprovalResolvedNode buildNode(String nodeName, Collection<Long> adminIds) {
        ApprovalResolvedNode node = new ApprovalResolvedNode();
        node.setNodeName(nodeName);
        node.setApproveMode(ApprovalNodeMode.ANY.getCode());
        node.setAdminIds(new ArrayList<>(adminIds));
        return node;
    }

    private void parseTargets(ApprovalFlowNode node) {
        if (node == null) return;
        List<ApprovalFlowTarget> targets = new ArrayList<>();
        if (!ObjUtil.isEmpty(node.getTargetsJson())) {
            try {
                List<ApprovalFlowTarget> parsed = JSON.parseArray(node.getTargetsJson(), ApprovalFlowTarget.class);
                if (parsed != null) targets = parsed;
            } catch (Exception e) {
                throw new BusinessException("审批节点配置格式有误，请重新配置");
            }
        }
        node.setTargets(targets);
    }

    private List<ApprovalFlowTarget> normalizeTargets(List<ApprovalFlowTarget> targets) {
        if (CollectionUtils.isEmpty(targets)) throw new BusinessException("每个审批节点至少需要一位审批人或一个岗位");
        LinkedHashSet<ApprovalFlowTarget> distinct = new LinkedHashSet<>();
        for (ApprovalFlowTarget target : targets) {
            if (target == null) continue;
            if (target.isUser()) {
                if (ObjUtil.isEmpty(target.getAdminId()) || target.getAdminId() <= 0)
                    throw new BusinessException("指定审批人无效，请重新选择");
                ApprovalFlowTarget normalized = new ApprovalFlowTarget();
                normalized.setType(ApprovalFlowTarget.TYPE_USER);
                normalized.setAdminId(target.getAdminId());
                distinct.add(normalized);
            } else if (target.isIdentity()) {
                MassagistIdentityCode code = MassagistIdentityCode.of(target.getCode());
                if (code == null) throw new BusinessException("不支持的岗位：" + target.getCode());
                ApprovalTargetScope scope = ApprovalTargetScope.of(target.getScope());
                if (scope == null) throw new BusinessException("岗位范围只能选择本店或全部门店");
                ApprovalFlowTarget normalized = new ApprovalFlowTarget();
                normalized.setType(ApprovalFlowTarget.TYPE_IDENTITY);
                normalized.setCode(code.getCode());
                normalized.setScope(scope.getCode());
                distinct.add(normalized);
            } else {
                throw new BusinessException("审批对象类型无效，请重新配置");
            }
        }
        if (distinct.isEmpty()) throw new BusinessException("每个审批节点至少需要一位审批人或一个岗位");
        return new ArrayList<>(distinct);
    }
}
